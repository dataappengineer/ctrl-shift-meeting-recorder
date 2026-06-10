from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
from github import Github
import os
from datetime import datetime
import logging
import tempfile
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

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
            # Check file size
            file_size = os.path.getsize(temp_path)
            logger.info(f"Audio file saved: {file_size} bytes")
            
            if file_size < 1000:
                logger.warning(f"Audio file is very small ({file_size} bytes) - may be empty or corrupt")
            
            # Transcribe using local Whisper model
            logger.info("Starting Whisper transcription...")
            result = whisper_model.transcribe(temp_path, fp16=False)
            transcript_text = result["text"].strip()
            
            # Log detailed result info
            logger.info(f"Whisper result - Language: {result.get('language', 'unknown')}")
            logger.info(f"Whisper detected {len(result.get('segments', []))} segments")
            
            if not transcript_text:
                logger.warning("⚠️ Transcription is EMPTY - no speech detected in audio")
                logger.warning("This usually means: 1) Audio was silent, 2) Wrong audio source, or 3) Audio format issue")
                
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        
        logger.info(f"Transcription complete. Length: {len(transcript_text)} chars")
        
        # Check if transcript is empty
        if not transcript_text:
            return jsonify({
                "success": False,
                "error": "Transcription is empty. No speech was detected in the audio. Make sure you're speaking during the recording and that your microphone/audio is working."
            }), 400
        
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

@app.route('/transcribe-and-commit-separate', methods=['POST'])
def transcribe_and_commit_separate():
    """
    Receives TWO audio files (mic + tab), transcribes separately, 
    formats with "You:" and "Them:" labels like Granola
    """
    try:
        meeting_title = request.form.get('title', 'Meeting')
        duration = request.form.get('duration', 'unknown')
        
        logger.info(f"Processing SEPARATE recording: {meeting_title} ({duration}s)")
        logger.info("Mode: Mic (You) + Tab (Them) - separate transcription")
        
        # Get both audio files
        mic_file = request.files.get('mic_audio')
        tab_file = request.files.get('tab_audio')
        
        if not mic_file and not tab_file:
            return jsonify({"success": False, "error": "No audio files provided"}), 400
        
        transcripts = []
        
        # Transcribe microphone (You)
        if mic_file:
            logger.info("Transcribing MICROPHONE (You)...")
            with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_mic:
                mic_file.save(temp_mic.name)
                temp_mic_path = temp_mic.name
            
            try:
                mic_size = os.path.getsize(temp_mic_path)
                logger.info(f"Mic audio: {mic_size} bytes ({mic_size / 1024 / 1024:.2f} MB)")
                
                mic_result = whisper_model.transcribe(temp_mic_path, fp16=False)
                mic_text = mic_result["text"].strip()
                mic_segments = mic_result.get('segments', [])
                
                logger.info(f"Mic transcription: {len(mic_segments)} segments, {len(mic_text)} chars")
                
                if mic_text:
                    # Format with timestamps and "You:" labels
                    for segment in mic_segments:
                        start_time = int(segment['start'])
                        text = segment['text'].strip()
                        if text:
                            transcripts.append({
                                'time': start_time,
                                'speaker': 'You',
                                'text': text
                            })
            finally:
                if os.path.exists(temp_mic_path):
                    os.unlink(temp_mic_path)
        
        # Transcribe tab audio (Them)
        if tab_file:
            logger.info("Transcribing TAB AUDIO (Them)...")
            with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_tab:
                tab_file.save(temp_tab.name)
                temp_tab_path = temp_tab.name
            
            try:
                tab_size = os.path.getsize(temp_tab_path)
                logger.info(f"Tab audio: {tab_size} bytes ({tab_size / 1024 / 1024:.2f} MB)")
                
                tab_result = whisper_model.transcribe(temp_tab_path, fp16=False)
                tab_text = tab_result["text"].strip()
                tab_segments = tab_result.get('segments', [])
                
                logger.info(f"Tab transcription: {len(tab_segments)} segments, {len(tab_text)} chars")
                
                if tab_text:
                    # Format with timestamps and "Them:" labels
                    for segment in tab_segments:
                        start_time = int(segment['start'])
                        text = segment['text'].strip()
                        if text:
                            transcripts.append({
                                'time': start_time,
                                'speaker': 'Them',
                                'text': text
                            })
            finally:
                if os.path.exists(temp_tab_path):
                    os.unlink(temp_tab_path)
        
        if not transcripts:
            logger.warning("⚠️ Both transcriptions are empty - no speech detected")
            return jsonify({
                "success": False,
                "error": "No speech detected in either audio source"
            }), 400
        
        # Sort by time to interleave the speakers
        transcripts.sort(key=lambda x: x['time'])
        
        # Format transcript with speaker labels
        formatted_lines = []
        for item in transcripts:
            formatted_lines.append(f"{item['speaker']}: {item['text']}")
        
        transcript_text = '\n'.join(formatted_lines)
        
        logger.info(f"Combined transcript: {len(transcripts)} segments, {len(transcript_text)} chars")
        
        # Format markdown content
        content = f"""# {meeting_title}

**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  
**Duration:** {duration} seconds  
**Transcription:** Local Whisper (free, separate mic/tab)  
**Format:** Speaker-attributed (You / Them)

---

## Transcript

{transcript_text}

---

*This transcript was automatically generated with separate mic/tab transcription. "You" = your microphone, "Them" = other participants from tab audio.*
"""
        
        # Commit to GitHub
        logger.info("Committing to GitHub...")
        g = Github(GITHUB_TOKEN)
        repo = g.get_repo(GITHUB_REPO)
        
        timestamp = datetime.now().strftime('%Y-%m-%d-%H%M')
        safe_title = meeting_title.lower().replace(' ', '-').replace('/', '-')[:50]
        filename = f"{timestamp}-{safe_title}.md"
        
        repo.create_file(
            path=f"transcripts/{filename}",
            message=f"Add transcript (speaker-attributed): {meeting_title}",
            content=content
        )
        
        github_url = f"https://github.com/{GITHUB_REPO}/blob/main/transcripts/{filename}"
        logger.info(f"✅ Committed: {filename} (with speaker attribution)")
        
        return jsonify({
            "success": True,
            "filename": filename,
            "url": github_url,
            "transcript_length": len(transcript_text),
            "segments": len(transcripts),
            "mode": "separate"
        })
    
    except Exception as e:
        logger.error(f"Error processing separate recording: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    logger.info("Starting Transcription Server on http://localhost:5000")
    logger.info(f"Target GitHub repo: {GITHUB_REPO}")
    app.run(host='0.0.0.0', port=5000, debug=True)
    logger.info(f"Target GitHub repo: {GITHUB_REPO}")
    app.run(host='0.0.0.0', port=5000, debug=True)
