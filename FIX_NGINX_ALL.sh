#!/bin/bash

# Fix Nginx configuration for all services
# Run this on VPS

echo "🔍 Checking Nginx configuration..."

# Test Nginx config
nginx -t

echo ""
echo "📋 Current Nginx sites:"
ls -la /etc/nginx/sites-enabled/

echo ""
echo "📋 Current Nginx sites-available:"
ls -la /etc/nginx/sites-available/

echo ""
echo "🔍 Checking Nginx error log:"
tail -50 /var/log/nginx/error.log

echo ""
echo "💡 To fix:"
echo "1. Check what sites were disabled"
echo "2. Re-enable them: ln -sf /etc/nginx/sites-available/<site> /etc/nginx/sites-enabled/<site>"
echo "3. Test: nginx -t"
echo "4. Reload: systemctl reload nginx"
