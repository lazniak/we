# Deployment Guide - we.pablogfx.com

## Server Setup (Ubuntu 25.04)

### 1. Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Bun
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

# Install Nginx
apt install -y nginx

# Install Certbot
apt install -y certbot python3-certbot-nginx

# Install PM2 for process management
npm install -g pm2
```

### 2. Clone Repository

```bash
cd /var/www
git clone https://github.com/lazniak/we.git
cd we
```

### 3. Install Project Dependencies

```bash
# Root dependencies
npm install

# Frontend dependencies
cd frontend
npm install
npm run build
cd ..

# Backend dependencies
cd backend
bun install
cd ..
```

### 4. Create Environment File

```bash
cd /var/www/we
cat > .env << EOF
NODE_ENV=production
PORT=3001
DOMAIN=we.pablogfx.com
EOF
```

### 5. Create Uploads Directory

```bash
mkdir -p /var/www/we/backend/uploads
mkdir -p /var/www/we/backend/data
chmod 755 /var/www/we/backend/uploads
chmod 755 /var/www/we/backend/data
```

### 6. Configure Nginx

```bash
cat > /etc/nginx/sites-available/we.pablogfx.com << 'EOF'
server {
    listen 80;
    server_name we.pablogfx.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
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
        client_max_body_size 5G;
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
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/we.pablogfx.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t
systemctl reload nginx
```

### 7. Setup SSL with Certbot

```bash
certbot --nginx -d we.pablogfx.com --non-interactive --agree-tos --email your-email@example.com --redirect
```

### 8. Create PM2 Ecosystem File

```bash
cd /var/www/we
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'we-backend',
      cwd: '/var/www/we/backend',
      script: 'bun',
      args: 'run start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
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
        PORT: 3000,
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

mkdir -p /var/www/we/logs
```

### 9. Start Applications with PM2

```bash
cd /var/www/we
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 10. Setup Auto-cleanup Cron (Optional - already in code)

The cleanup job runs automatically every hour in the backend code.

### 11. Firewall (if needed)

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Update Deployment

```bash
cd /var/www/we
git pull
cd frontend
npm install
npm run build
cd ../backend
bun install
pm2 restart all
```

## Useful Commands

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs

# Restart services
pm2 restart all

# Stop services
pm2 stop all

# Check Nginx status
systemctl status nginx

# Check SSL certificate
certbot certificates
```
