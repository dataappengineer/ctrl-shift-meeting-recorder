#!/bin/bash
# Check transcription server status

cd "$(dirname "$0")"

if [ ! -f server.pid ]; then
    echo "❌ Server is not running"
    exit 1
fi

PID=$(cat server.pid)
if ps -p $PID > /dev/null 2>&1; then
    echo "✅ Server is running (PID: $PID)"
    echo "📋 Log: backend/server.log"
    echo "🌐 URL: http://localhost:5000"
    exit 0
else
    echo "❌ Server is not running (stale PID file)"
    rm server.pid
    exit 1
fi
