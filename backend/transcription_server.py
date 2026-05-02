from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
from github import Github
import os
from datetime import datetime
import logging
import tempfile

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Allow extension to call this API

# Load environment variables
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = "dataappengineer/ctrl-shift-call-transcripts"

if not GITHUB_TOKEN:
    logger.error("Missing required environment variables!")
    raise ValueError("GITHUB_TOKEN must be set")

# Load Whisper model at startup (using 'base' model for balance of speed and accuracy)
logger.info("Loading Whisper model (this may take a minute on first run)...")
whisper_model = whisper.load_model("base")
logger.info("Whisper model loaded successfully")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})

@app.route('/transcribe-and-commit', methods=['POST'])
def transcribe_and_commit():
    """
    Receives audio file, transcribes with Whisper, commits to GitHub
    """
    try:
        # 1. Validate request
        if 'audio' not in request.files:
            return jsonify({"success": False, "error": "No audio file provided"}), 400
        
        audio_file = request.files['audio']
        meeting_title = request.form.get('title', 'Meeting')
        duration = request.form.get('duration', 'unknown')
        
        logger.info(f"Processing recording: {meeting_title} ({duration}s)")
        
        # 2. Transcribe with local Whisper (free)
        logger.info("Transcribing with local Whisper (free)...")
        
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_audio:
            audio_file.save(temp_audio.name)
            temp_path = temp_audio.name
        
        try:
            # Transcribe using local Whisper model
            result = whisper_model.transcribe(temp_path)
            transcript_text = result["text"]
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        
        logger.info(f"Transcription complete. Length: {len(transcript_text)} chars")
        
        # 3. Format markdown content
        content = f"""# {meeting_title}

**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  
**Duration:** {duration} seconds  
**Transcription:** Local Whisper (free)

---

## Transcript

{transcript_text}

---

*This transcript was automatically generated and may contain errors.*
"""
        
        # 4. Commit to GitHub
        logger.info("Committing to GitHub...")
        g = Github(GITHUB_TOKEN)
        repo = g.get_repo(GITHUB_REPO)
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y-%m-%d-%H%M')
        safe_title = meeting_title.lower().replace(' ', '-').replace('/', '-')[:50]
        filename = f"{timestamp}-{safe_title}.md"
        
        repo.create_file(
            path=f"transcripts/{filename}",
            message=f"Add transcript: {meeting_title}",
            content=content
        )
        
        github_url = f"https://github.com/{GITHUB_REPO}/blob/main/transcripts/{filename}"
        logger.info(f"✅ Committed: {filename}")
        
        return jsonify({
            "success": True,
            "filename": filename,
            "url": github_url,
            "transcript_length": len(transcript_text)
        })
    
    except Exception as e:
        logger.error(f"Error processing recording: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    logger.info("Starting Transcription Server on http://localhost:5000")
    logger.info(f"Target GitHub repo: {GITHUB_REPO}")
    app.run(host='0.0.0.0', port=5000, debug=True)
