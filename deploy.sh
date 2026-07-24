#!/bin/bash

set -e

echo "🚀 Deploying we.pablogfx.com..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root${NC}"
    exit 1
fi

# Update system
echo -e "${YELLOW}Updating system...${NC}"
apt update && apt upgrade -y

# Install Node.js 20.x
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Install Bun
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}Installing Bun...${NC}"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Install Nginx
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}Installing Nginx...${NC}"
    apt install -y nginx
fi

# Install Certbot
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing Certbot...${NC}"
    apt install -y certbot python3-certbot-nginx
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2...${NC}"
    npm install -g pm2
fi

# Clone or update repository
if [ ! -d "/var/www/we" ]; then
    echo -e "${YELLOW}Cloning repository...${NC}"
    cd /var/www
    git clone https://github.com/lazniak/we.git
    cd we
else
    echo -e "${YELLOW}Updating repository...${NC}"
    cd /var/www/we
    git pull
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install
cd frontend && npm install && npm run build && cd ..
cd backend && bun install && cd ..

# Create directories. These paths are handed to the backend explicitly via
# UPLOADS_DIR / DATA_DIR below, so payloads never depend on the working
# directory the process happens to start in.
mkdir -p /var/www/we/uploads
mkdir -p /var/www/we/data
mkdir -p /var/www/we/logs
chmod 700 /var/www/we/uploads
chmod 700 /var/www/we/data

# Create .env if not exists
if [ ! -f "/var/www/we/.env" ]; then
    cat > /var/www/we/.env << EOF
NODE_ENV=production
PORT=3001
DOMAIN=we.pablogfx.com
UPLOADS_DIR=/var/www/we/uploads
DATA_DIR=/var/www/we/data
ALLOWED_ORIGINS=https://we.pablogfx.com
EOF
fi

# Configure Nginx
#
# Only written when the site does not exist yet. A live deployment has an
# HTTPS config with the certbot directives in it, and blindly overwriting that
# with this plain-HTTP template takes the site down until certbot runs again.
if [ -f /etc/nginx/sites-available/we.pablogfx.com ]; then
    echo -e "${YELLOW}Nginx config already exists, leaving it untouched.${NC}"
    echo -e "${YELLOW}Delete it first if you really want it regenerated.${NC}"
else
echo -e "${YELLOW}Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/we.pablogfx.com << 'EOF'
server {
    listen 80;
    server_name we.pablogfx.com;

    # Uploads arrive as 5MB chunks, never as one huge body.
    client_max_body_size 32M;

    # Frontend
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        client_max_body_size 32M;

        # Downloads are produced as a stream (a multi gigabyte ZIP is never
        # materialised on disk). Buffering here would make nginx spool the
        # whole archive before the first byte reaches the browser.
        proxy_buffering off;
        proxy_request_buffering off;

        # A 5GB transfer over a slow line takes a while in both directions.
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        send_timeout 3600s;

        gzip off;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Progress sockets stay open for the whole upload.
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

fi

# Enable site
ln -sf /etc/nginx/sites-available/we.pablogfx.com /etc/nginx/sites-enabled/

# Test Nginx
nginx -t

# Reload Nginx
systemctl reload nginx

# Setup SSL
echo -e "${YELLOW}Setting up SSL...${NC}"
if [ ! -f "/etc/letsencrypt/live/we.pablogfx.com/fullchain.pem" ]; then
    read -p "Enter your email for Let's Encrypt: " email
    certbot --nginx -d we.pablogfx.com --non-interactive --agree-tos --email "$email" --redirect
else
    certbot renew --dry-run
fi

# Create PM2 ecosystem file
BUN_PATH=$(which bun || echo "/root/.bun/bin/bun")
cat > /var/www/we/ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'we-backend',
      cwd: '/var/www/we/backend',
      script: '${BUN_PATH}',
      args: 'run start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        UPLOADS_DIR: '/var/www/we/uploads',
        DATA_DIR: '/var/www/we/data',
        ALLOWED_ORIGINS: 'https://we.pablogfx.com',
        PATH: '/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      },
      error_file: '/var/www/we/logs/backend-error.log',
      out_file: '/var/www/we/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M',
    },
    {
      name: 'we-frontend',
      cwd: '/var/www/we/frontend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      },
      error_file: '/var/www/we/logs/frontend-error.log',
      out_file: '/var/www/we/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '300M',
    },
  ],
};
EOF

# Start/restart PM2
cd /var/www/we
# Only delete our apps, not all apps!
pm2 delete we-backend we-frontend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
# Don't run pm2 startup if already configured

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}Check status: pm2 status${NC}"
echo -e "${GREEN}View logs: pm2 logs${NC}"
