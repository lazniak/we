#!/bin/bash

# Script to restore PM2 services
# Run this on VPS

echo "🔍 Checking PM2 dump..."

# Check if dump exists
if [ -f "/root/.pm2/dump.pm2" ]; then
    echo "✅ Found PM2 dump, attempting to restore..."
    pm2 resurrect
    pm2 status
else
    echo "❌ No PM2 dump found"
    echo "You'll need to manually restore services"
fi

# Check for other ecosystem files
echo ""
echo "🔍 Looking for other ecosystem.config.js files..."

find /var/www -name "ecosystem.config.js" -type f 2>/dev/null | while read file; do
    echo "Found: $file"
done

echo ""
echo "📋 Current PM2 status:"
pm2 status

echo ""
echo "💡 If services are missing, you may need to:"
echo "   1. Find their ecosystem.config.js files"
echo "   2. Run: pm2 start <ecosystem-file>"
echo "   3. Run: pm2 save"
