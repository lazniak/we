#!/bin/bash

# Fix port 3001 conflict
# Run this on VPS

echo "🔍 Finding what's using port 3001..."

# Find process on port 3001
PID=$(lsof -ti:3001)
if [ -z "$PID" ]; then
    echo "❌ No process found on port 3001 (strange, but let's continue)"
else
    echo "✅ Found process: $PID"
    ps aux | grep $PID | grep -v grep
    echo "🛑 Killing process $PID..."
    kill -9 $PID 2>/dev/null || true
    sleep 2
fi

# Also try fuser
fuser -k 3001/tcp 2>/dev/null || true
sleep 2

# Check again
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "⚠️  Port 3001 still in use, trying harder..."
    fuser -k 3001/tcp 2>/dev/null || true
    sleep 2
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Final check
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "❌ Port 3001 is still in use:"
    lsof -i:3001
    echo ""
    echo "Try manually:"
    echo "  lsof -i:3001"
    echo "  kill -9 <PID>"
else
    echo "✅ Port 3001 is now free!"
fi

echo ""
echo "🔄 Now restart we-backend:"
echo "  pm2 stop we-backend"
echo "  pm2 delete we-backend"
echo "  pm2 start ecosystem.config.js --only we-backend"
