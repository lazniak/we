#!/bin/bash

# Quick fix for 502 Bad Gateway
# Run this on the VPS

cd /var/www/we

# Find Bun path
BUN_PATH=$(which bun 2>/dev/null || echo "/root/.bun/bin/bun")
echo "Using Bun at: $BUN_PATH"

# Update ecosystem.config.js with full path
cat > ecosystem.config.js << EOF
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

# Restart PM2
pm2 delete we-backend we-frontend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo "✅ Fixed! Check status:"
pm2 status
echo ""
echo "Check logs:"
pm2 logs --lines 10
