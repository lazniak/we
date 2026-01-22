#!/bin/bash

# Final fix for we-backend
# Run this on VPS

cd /var/www/we

echo "🛑 Stopping we-backend..."
pm2 stop we-backend 2>/dev/null || true
pm2 delete we-backend 2>/dev/null || true

echo "🔍 Killing any process on port 3001..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
sleep 2

echo "✅ Updating ecosystem.config.js..."
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
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 4000,
    },
    {
      name: 'we-frontend',
      cwd: '/var/www/we/frontend',
      script: 'node',
      args: '.next/standalone/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
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

echo "🚀 Starting we-backend..."
pm2 start ecosystem.config.js --only we-backend
pm2 save

echo ""
echo "⏳ Waiting 5 seconds..."
sleep 5

echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "📋 Recent logs:"
pm2 logs we-backend --lines 15 --nostream
