# Ctrl+Shift Meeting Recorder

A Chrome extension that records Google Meet audio, transcribes it with **free local Whisper**, and automatically commits transcripts to GitHub.

## Features

- 🎙️ **One-click recording** of Google Meet audio (both sides of conversation!)
- 🎤 **Captures your microphone** + 🔊 **tab audio** (other participants)
- 🤖 **Automatic transcription** using free local Whisper (no API costs!)
- 💰 **100% Free** - $0/hour vs OpenAI API $0.36/hour
- 🔒 **Privacy-first** - all processing happens locally on your machine
- 📝 **Auto-commit to GitHub** - transcripts saved to [`ctrl-shift-call-transcripts`](https://github.com/dataappengineer/ctrl-shift-call-transcripts)
- 🔔 **Desktop notifications** when transcripts are ready
- 💪 **Offline-capable** - works with local Flask backend
- ⚡ **Offscreen audio mixing** - combines both audio sources seamlessly

## System Architecture

This is **System 1** of a two-part workflow:

1. **System 1 (this repo):** Record → Transcribe → Commit raw transcript
2. **System 2 (VS Code Copilot):** Fetch transcript → Summarize → Commit summary

## Installation

### Prerequisites

- Google Chrome browser
- Python 3.8+ installed
- **ffmpeg** installed (required by Whisper)
  - **Mac:** `brew install ffmpeg`
  - **Ubuntu/Debian:** `sudo apt install ffmpeg`
  - **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- GitHub Personal Access Token with `repo` scope ([create here](https://github.com/settings/tokens))

### Backend Setup

1. **Clone this repository:**
   ```bash
   git clone https://github.com/dataappengineer/ctrl-shift-meeting-recorder.git
   cd ctrl-shift-meeting-recorder/backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install ffmpeg** (if not already installed):
   ```bash
   # Mac
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt install ffmpeg
   
   # Windows: Download from https://ffmpeg.org/download.html
   ```

4. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
   
   **Note:** First run will download the Whisper model (~140MB). This is a one-time download.

5. **Configure environment variables:**
   ```bash
   cp .env.example .env
   nano .env  # Edit with your GitHub token
   ```

   Add your GitHub token:
   ```
   GITHUB_TOKEN=ghp_...
   ```

6. **Start the server:**
   
   **Option A - Simple script (recommended):**
   ```bash
   ./start.sh    # Starts server in background
   ./status.sh   # Check if running
   ./stop.sh     # Stop server
   ```
   
   **Option B - Manual:**
   ```bash
   python transcription_server.py
   ```

   You should see:
   ```
   Loading Whisper model (this may take a minute on first run)...
   Whisper model loaded successfully
   Starting Transcription Server on http://localhost:5000
   ```

7. **Optional - Add bash aliases for easy access:**
   ```bash
   # Add to ~/.bashrc or ~/.zshrc
   alias server-start='cd ~/ctrl-shift-meeting-recorder/backend && ./start.sh && cd -'
   alias server-stop='cd ~/ctrl-shift-meeting-recorder/backend && ./stop.sh && cd -'
   alias server-status='cd ~/ctrl-shift-meeting-recorder/backend && ./status.sh && cd -'
   ```
   
   Then reload: `source ~/.bashrc`
   
   Now you can control the server from anywhere:
   - `server-start` - Start the backend
   - `server-stop` - Stop the backend
   - `server-status` - Check if running

### Chrome Extension Setup

1. **Open Chrome Extensions page:**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)

2. **Load the extension:**
   - Click "Load unpacked"
   - Select the `extension/` folder from this repo
   - The extension icon should appear in your Chrome toolbar

3. **Pin the extension** (optional):
   - Click the puzzle piece icon in Chrome toolbar
   - Click the pin icon next to "Ctrl+Shift Meeting Recorder"

4. **Grant microphone permission** (one-time setup):
   
   Because the extension uses an offscreen document for audio mixing, Chrome won't show the standard permission prompt. You need to manually grant microphone access:
   
   a. Copy and paste this URL in Chrome (replace with your extension ID if different):
   ```
   chrome://settings/content/siteDetails?site=chrome-extension://laplcnlmpfmfafnggekdhafcchhollcf
   ```
   
   b. Find **"Microphone"** in the permissions list
   
   c. Change it from "Ask (default)" to **"Allow"**
   
   d. Reload any open Google Meet tabs
   
   **Note:** This is a Chrome limitation with offscreen documents - all extensions using this pattern require manual permission grant.

## Usage

### Recording a Meeting

1. **Join a Google Meet call**
   
2. **Click the extension icon** in your Chrome toolbar

3. **Enter meeting title** (optional but recommended)
   - Example: "Q1 Strategy Review" or "Client Discovery Call"

4. **Click "Start Recording"**
   - Status message will show what's being recorded:
     - ✅ **"Recording: Your voice + Tab audio ✅"** - Both microphone and tab audio working (ideal!)
     - ⚠️ **"Recording: Your voice only"** - Only mic captured (tab audio failed)
     - ⚠️ **"Recording: Tab audio only"** - Only tab audio captured (microphone permission denied)
   - The extension captures:
     - **Your voice** (microphone) - what you say
     - **Other participants** (tab audio) - what they say from Google Meet
   - Both audio sources are mixed together seamlessly using Web Audio API

5. **When the meeting ends, click "Stop & Upload"**
   - The extension will:
     - Stop recording
     - Upload audio to the backend
     - Transcribe with local Whisper (this takes 5-10 minutes for a 1-hour meeting)
     - Commit transcript to GitHub
   - You'll get a desktop notification when complete

6. **View your transcript:**
   - Go to https://github.com/dataappengineer/ctrl-shift-call-transcripts
   - Navigate to `transcripts/` folder
   - Your transcript will be named `YYYY-MM-DD-HHMM-meeting-title.md`

### Getting a Summary (System 2)

After the transcript is committed, use VS Code Copilot to summarize it:

1. Open VS Code
2. Open Copilot Chat
3. Ask: "Fetch the latest transcript from ctrl-shift-call-transcripts and summarize it"
4. Copilot will fetch, summarize, and optionally commit the summary back to GitHub

## Cost Estimate

| Component | Cost per 1-hour meeting |
|-----------|-------------------------|
| Whisper (local) | **$0.00** (100% free!) |
| GitHub API | Free |
| Backend hosting | Free (local) |
| **Total** | **$0.00** |

**Processing time:** ~5-10 minutes for a 1-hour meeting (depending on your CPU)

## Troubleshooting

### "Recording: Tab audio only (mic blocked!)"
This means the microphone permission wasn't granted:
1. Go to `chrome://settings/content/siteDetails?site=chrome-extension://[YOUR-EXTENSION-ID]`
2. Find the extension ID at `chrome://extensions/`
3. Set Microphone to "Allow"
4. Reload the Meet page and try again

### "Failed to capture audio"
- Ensure you're on a Google Meet tab (URL starts with `meet.google.com`)
- Try reloading the Meet tab
- Check Chrome permissions: `chrome://extensions/` → extension details → "Site access"

### "Upload failed"
- Make sure the backend server is running (`python transcription_server.py`)
- Check that `.env` file has your GitHub token
- Look at terminal logs for error messages

### "Server error: 500"
- Check backend terminal for error details
- Verify GitHub token has `repo` scope
- Check if ffmpeg is installed: `ffmpeg -version`
- Ensure you have enough disk space and RAM (Whisper needs ~2GB RAM)

### "ffmpeg not found" or transcription errors
- Install ffmpeg using the commands in Prerequisites section
- Restart the backend server after installing ffmpeg
- On Windows, ensure ffmpeg is in your PATH

### Audio quality issues
- Use headphones to prevent echo/feedback
- Speak clearly and minimize background noise
- Chrome captures system audio, so quality depends on your audio setup
- Check the offscreen console logs at `chrome://extensions/` → "offscreen.html" to see audio levels

## Server Management

The backend includes simple scripts for starting/stopping the server:

```bash
cd backend

./start.sh    # Start server in background
./stop.sh     # Stop server
./status.sh   # Check if running
./restart.sh  # Restart server
```

### Server runs in background
When using `./start.sh`, the server runs in the background and logs to `backend/server.log`:

```bash
# View logs in real-time
tail -f backend/server.log

# Check recent logs
tail -n 50 backend/server.log
```

### Optional: Bash aliases
For quick access from anywhere, add to `~/.bashrc`:

```bash
alias server-start='cd ~/ctrl-shift-meeting-recorder/backend && ./start.sh && cd -'
alias server-stop='cd ~/ctrl-shift-meeting-recorder/backend && ./stop.sh && cd -'
alias server-status='cd ~/ctrl-shift-meeting-recorder/backend && ./status.sh && cd -'
alias server-logs='tail -f ~/ctrl-shift-meeting-recorder/backend/server.log'
```

Then reload: `source ~/.bashrc`

### Auto-start on boot (optional)
To automatically start the server when your system boots, add to `~/.bashrc`:

```bash
# Auto-start transcription server
if ! pgrep -f "transcription_server.py" > /dev/null; then
    ~/ctrl-shift-meeting-recorder/backend/start.sh
fi
```

## Technical Details

### Chrome Extension Architecture (Manifest V3)

The extension uses Chrome's **Manifest V3** with an **offscreen document** pattern for audio capture:

1. **Background Service Worker** (`background.js`):
   - Coordinates the recording process
   - Calls `chrome.tabCapture.getMediaStreamId()` to get tab audio stream ID
   - Creates and manages offscreen document
   - Passes streamId to offscreen document via message passing

2. **Offscreen Document** (`offscreen.js`):
   - Has `USER_MEDIA` access for microphone capture
   - Receives streamId from background
   - Captures tab audio: `getUserMedia({ chromeMediaSource: 'tab', chromeMediaSourceId: streamId })`
   - Captures microphone: `getUserMedia({ audio: true })`
   - Mixes both streams using **Web Audio API** (`AudioContext.createMediaStreamDestination()`)
   - Records mixed stream with `MediaRecorder` (WebM format)

3. **Popup** (`popup.js`):
   - User interface for starting/stopping recordings
   - Sends commands to background worker
   - Uploads recorded audio to Flask backend

### Why Offscreen Document?

Chrome Manifest V3 doesn't allow service workers to access `getUserMedia()` directly. The offscreen document pattern is the recommended MV3 approach for:
- Recording tab audio (requires `chrome.tabCapture.getMediaStreamId()`)
- Recording microphone (requires `getUserMedia()`)
- Mixing multiple audio sources (requires Web Audio API)

**Key limitation:** Offscreen documents can't show permission prompts, so microphone permission must be granted manually in Chrome settings.

### Backend Architecture

- **Flask Server** (`transcription_server.py`):
  - Receives WebM audio files from extension
  - Converts to format compatible with Whisper
  - Transcribes using local Whisper model (base model, ~140MB)
  - Formats transcript with timestamps
  - Commits to GitHub using PyGithub
  
- **Whisper Model:**
  - Runs locally (no API calls)
  - Uses CPU inference (no GPU required, but GPU makes it faster)
  - Base model provides good accuracy for meetings
  - Processing time: ~5-10 minutes for 1-hour meeting on modern CPU

### Data Flow

```
Chrome Extension → WebM Audio → Flask Server → Whisper → Transcript → GitHub
     (mixing)        (POST)        (local)      (text)    (PyGithub)
```

All processing happens locally - no data leaves your machine except the final transcript going to GitHub.

## Development

### Project Structure

```
ctrl-shift-meeting-recorder/
├── extension/           # Chrome extension frontend
├── backend/            # Python Flask transcription server
├── README.md
└── LICENSE
```

### Testing Locally

1. Start backend: `python backend/transcription_server.py`
2. Load extension in Chrome
3. Join a test Google Meet (or create a meeting with yourself)
4. Test recording flow

### Debugging

- Extension logs: Right-click extension icon → "Inspect popup"
- Backend logs: Check terminal where server is running
- GitHub commits: Check https://github.com/dataappengineer/ctrl-shift-call-transcripts/commits/main

## Roadmap

- [ ] Video recording support
- [ ] AWS Lambda deployment (serverless)
- [ ] Support for Zoom/Teams
- [ ] Real-time transcription preview
- [ ] Speaker diarization (identify different speakers)
- [ ] Custom webhook integrations

## Contributing

Pull requests welcome! Please:
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

## License

MIT License - see LICENSE file

## Support

Issues? Questions? Open a GitHub issue or reach out to the team.

---

**Built by the Ctrl+Shift team** | [Transcript Repo](https://github.com/dataappengineer/ctrl-shift-call-transcripts) | [Company Site](#)
