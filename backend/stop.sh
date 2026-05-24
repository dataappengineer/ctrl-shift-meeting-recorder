#!/bin/bash
# Stop the transcription server

cd "$(dirname "$0")"

if [ ! -f server.pid ]; then
    echo "Server is not running (no PID file found)"
    exit 0
fi

PID=$(cat server.pid)
if ps -p $PID > /dev/null 2>&1; then
    echo "Stopping server (PID: $PID)..."
    kill $PID
    rm server.pid
    echo "✅ Server stopped"
else
    echo "Server is not running (stale PID file)"
    rm server.pid
fi
