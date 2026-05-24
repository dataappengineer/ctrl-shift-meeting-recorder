#!/bin/bash
# Start the transcription server

cd "$(dirname "$0")"

# Check if already running
if [ -f server.pid ]; then
    PID=$(cat server.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "Server is already running (PID: $PID)"
        exit 0
    fi
fi

# Activate virtual environment and start server
source venv/bin/activate
echo "Starting transcription server..."
python transcription_server.py > server.log 2>&1 &
echo $! > server.pid
echo "✅ Server started (PID: $!)"
echo "📋 Log: backend/server.log"
echo "🛑 To stop: ./stop.sh"
