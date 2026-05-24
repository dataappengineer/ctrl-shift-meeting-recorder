#!/bin/bash
# Restart the transcription server

cd "$(dirname "$0")"

echo "Restarting transcription server..."
./stop.sh
sleep 1
./start.sh
