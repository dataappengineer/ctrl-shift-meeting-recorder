# Server Management Scripts

Simple scripts to start/stop the transcription backend server.

## Usage

```bash
cd backend

# Start server (runs in background)
./start.sh

# Check if running
./status.sh

# Stop server
./stop.sh

# Restart server
./restart.sh
```

## Logs

Server output is saved to `backend/server.log`. View it with:
```bash
tail -f backend/server.log
```

## Optional: Add Aliases

For even easier access, add to your `~/.bashrc`:

```bash
alias server-start='cd ~/ctrl-shift-meeting-recorder/backend && ./start.sh && cd -'
alias server-stop='cd ~/ctrl-shift-meeting-recorder/backend && ./stop.sh && cd -'
alias server-status='cd ~/ctrl-shift-meeting-recorder/backend && ./status.sh && cd -'
alias server-logs='tail -f ~/ctrl-shift-meeting-recorder/backend/server.log'
```

Then reload: `source ~/.bashrc`

Now from anywhere you can just type:
- `server-start`
- `server-stop`
- `server-status`
- `server-logs`

## Auto-start on boot (optional)

To start server automatically when Ubuntu starts, add to `~/.bashrc`:
```bash
# Auto-start transcription server
if ! pgrep -f "transcription_server.py" > /dev/null; then
    ~/ctrl-shift-meeting-recorder/backend/start.sh
fi
```
