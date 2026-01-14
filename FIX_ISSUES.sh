#!/bin/bash

# Fix deployment issues
# Run this on VPS

cd /var/www/we

echo "🔍 Checking for processes on ports 3000 and 3001..."

# Kill processes on ports 3000 and 3001
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Stop PM2 processes
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Wait a moment
sleep 2

# Check if ports are free
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 3001 still in use, trying to kill..."
    fuser -k 3001/tcp 2>/dev/null || true
    sleep 1
fi

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 3000 still in use, trying to kill..."
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 1
fi

# Update ecosystem.config.js for standalone Next.js
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

echo "✅ Configuration updated"
echo "🚀 Starting PM2..."

pm2 start ecosystem.config.js
pm2 save

echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "📋 Recent logs:"
pm2 logs --lines 10 --nostream
