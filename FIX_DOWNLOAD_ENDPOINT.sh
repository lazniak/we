#!/bin/bash

# Fix download endpoint and update code on server

set -e

echo "🔧 Fixing download endpoint..."

cd /var/www/we

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Rebuild backend (Bun will recompile)
echo "🔨 Rebuilding backend..."
cd backend
bun install

# Restart backend
echo "🔄 Restarting backend..."
pm2 restart we-backend

# Check status
echo "✅ Checking status..."
pm2 status

echo "✅ Done! Check logs: pm2 logs we-backend"
