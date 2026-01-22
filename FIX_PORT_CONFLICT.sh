#!/bin/bash

# Fix port conflicts and restore services
# Run this on VPS

echo "🔍 Checking port usage..."
echo "Port 3000:"
lsof -i :3000 || echo "Free"
echo ""
echo "Port 3001:"
lsof -i :3001 || echo "Free"
echo ""
echo "Port 3002:"
lsof -i :3002 || echo "Free"

echo ""
echo "🛑 Stopping we-frontend..."
pm2 stop we-frontend 2>/dev/null || true
pm2 delete we-frontend 2>/dev/null || true

echo ""
echo "✅ Changing we-frontend to port 3002..."

cd /var/www/we

# Update ecosystem.config.js - change frontend port to 3002
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'we-backend',
      cwd: '/var/www/we/backend',
      script: '/root/.bun/bin/bun',
      args: 'run start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
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
      script: 'node',
      args: '.next/standalone/server.js',
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

echo ""
echo "🔧 Updating Nginx config for we.pablogfx.com..."

# Update Nginx to use port 3002
sed -i 's/proxy_pass http:\/\/localhost:3000/proxy_pass http:\/\/localhost:3002/g' /etc/nginx/sites-available/we.pablogfx.com

# Test Nginx
nginx -t

# Reload Nginx
systemctl reload nginx

echo ""
echo "🚀 Starting we-frontend on port 3002..."
pm2 start ecosystem.config.js --only we-frontend
pm2 save

echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "💡 Now restore other services:"
echo "  find /var/www -name ecosystem.config.js"
echo "  cd /path/to/service && pm2 start ecosystem.config.js"
