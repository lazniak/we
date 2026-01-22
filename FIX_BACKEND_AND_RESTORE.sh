#!/bin/bash

# Fix we-backend crashes and restore other services
# Run this on VPS

echo "🔍 Checking we-backend logs..."
pm2 logs we-backend --lines 30 --nostream

echo ""
echo "🔍 Checking port 3001..."
lsof -i :3001 || echo "Port 3001 is free"

echo ""
echo "🛑 Stopping we-backend to fix..."
pm2 stop we-backend
pm2 delete we-backend

echo ""
echo "🔍 Looking for other services in /var/www..."
find /var/www -maxdepth 2 -name "ecosystem.config.js" -o -name "package.json" | grep -v node_modules | head -20

echo ""
echo "📋 Current PM2 status:"
pm2 status

echo ""
echo "💡 Next steps:"
echo "1. Check we-backend logs above to see the error"
echo "2. Fix the issue (probably port conflict or Bun path)"
echo "3. Restart we-backend with correct config"
echo "4. Find and restore other services from their ecosystem.config.js files"
