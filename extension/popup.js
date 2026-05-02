let mediaRecorder;
let audioChunks = [];
let recordingStartTime;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const meetingTitleInput = document.getElementById('meetingTitle');

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

async function startRecording() {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    // Check if on Google Meet
    if (!tab.url.includes('meet.google.com')) {
      updateStatus('⚠️ Please open a Google Meet tab first', 'warning');
      return;
    }
    
    // Request tab audio capture
    chrome.tabCapture.capture({audio: true}, (stream) => {
      if (!stream) {
        updateStatus('❌ Failed to capture audio. Try reloading the Meet tab.', 'error');
        return;
      }
      
      mediaRecorder = new MediaRecorder(stream, {mimeType: 'audio/webm'});
      audioChunks = [];
      recordingStartTime = Date.now();
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };
      
      mediaRecorder.onstop = handleRecordingStop;
      
      mediaRecorder.start();
      
      // Update UI
      startBtn.disabled = true;
      stopBtn.disabled = false;
      updateStatus('🔴 Recording... (click Stop when done)', 'recording');
    });
  } catch (error) {
    console.error('Error starting recording:', error);
    updateStatus('❌ Error: ' + error.message, 'error');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    
    // Stop all tracks
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    
    updateStatus('⏳ Processing and uploading...', 'processing');
  }
}

async function handleRecordingStop() {
  const recordingDuration = Math.round((Date.now() - recordingStartTime) / 1000);
  
  // Create blob from chunks
  const audioBlob = new Blob(audioChunks, {type: 'audio/webm'});
  const audioSizeMB = (audioBlob.size / 1024 / 1024).toFixed(2);
  
  console.log(`Recording stopped. Duration: ${recordingDuration}s, Size: ${audioSizeMB}MB`);
  
  // Get meeting title
  const meetingTitle = meetingTitleInput.value.trim() || 'Meeting';
  
  // Upload to backend
  await uploadRecording(audioBlob, meetingTitle, recordingDuration);
}

async function uploadRecording(audioBlob, meetingTitle, duration) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  formData.append('title', meetingTitle);
  formData.append('duration', duration);
  
  try {
    updateStatus('📤 Uploading to server...', 'processing');
    
    const response = await fetch('http://localhost:5000/transcribe-and-commit', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      updateStatus(`✅ Done! Committed as ${data.filename}`, 'success');
      
      // Show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Transcript Committed',
        message: `✅ ${data.filename} uploaded to GitHub`,
        priority: 2
      });
      
      // Reset after 3 seconds
      setTimeout(resetUI, 3000);
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Upload error:', error);
    updateStatus('❌ Upload failed: ' + error.message, 'error');
    resetUI();
  }
}

function updateStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}

function resetUI() {
  startBtn.disabled = false;
  stopBtn.disabled = true;
  meetingTitleInput.value = '';
  updateStatus('Ready to record', 'idle');
}

// Initialize
resetUI();
