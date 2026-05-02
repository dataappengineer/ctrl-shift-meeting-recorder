# Ctrl+Shift Meeting Recorder

A Chrome extension that records Google Meet audio, transcribes it with **free local Whisper**, and automatically commits transcripts to GitHub.

## Features

- 🎙️ **One-click recording** of Google Meet audio
- 🤖 **Automatic transcription** using free local Whisper (no API costs!)
- 💰 **100% Free** - no OpenAI API subscription needed
- 🔒 **Privacy-first** - all processing happens locally on your machine
- 📝 **Auto-commit to GitHub** - transcripts saved to [`ctrl-shift-call-transcripts`](https://github.com/dataappengineer/ctrl-shift-call-transcripts)
- 🔔 **Desktop notifications** when transcripts are ready
- 💪 **Offline-capable** - works with local Flask backend

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
   ```bash
   python transcription_server.py
   ```

   You should see:
   ```
   Loading Whisper model (this may take a minute on first run)...
   Whisper model loaded successfully
   Starting Transcription Server on http://localhost:5000
   ```

   **Keep this terminal window open while using the extension.**

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

## Usage

### Recording a Meeting

1. **Join a Google Meet call**
   
2. **Click the extension icon** in your Chrome toolbar

3. **Enter meeting title** (optional but recommended)
   - Example: "Q1 Strategy Review" or "Client Discovery Call"

4. **Click "Start Recording"**
   - You'll see a "Recording..." status
   - The extension captures audio from the active tab only

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
