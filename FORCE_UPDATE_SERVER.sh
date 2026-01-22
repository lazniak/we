#!/bin/bash

# Force update and clear cache on server

set -e

echo "🔄 Force updating server code..."

cd /var/www/we

# Force pull (discard local changes if any)
echo "📥 Force pulling latest changes..."
git fetch origin
git reset --hard origin/main

# Check what file we have
echo "📄 Checking transfer.ts file..."
head -n 260 backend/src/routes/transfer.ts | tail -n 30

# Clear any Bun cache
echo "🧹 Clearing Bun cache..."
rm -rf backend/.bun
rm -rf backend/node_modules/.cache 2>/dev/null || true

# Reinstall dependencies
echo "📦 Reinstalling dependencies..."
cd backend
bun install

# Restart backend
echo "🔄 Restarting backend..."
pm2 restart we-backend

# Wait a moment
sleep 2

# Check status
echo "✅ Checking status..."
pm2 status we-backend

echo "✅ Done! Check logs: pm2 logs we-backend --lines 30"
