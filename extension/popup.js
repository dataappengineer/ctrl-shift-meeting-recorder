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
    
    console.log('Active tab:', tab.id, tab.url);
    
    // Check if on Google Meet
    if (!tab.url || !tab.url.includes('meet.google.com')) {
      updateStatus('⚠️ Please open a Google Meet tab first', 'warning');
      return;
    }
    
    updateStatus('🎤 Starting recording (Mic + Tab Audio)...', 'processing');
    
    // Send message to background to start recording
    const response = await chrome.runtime.sendMessage({ 
      action: 'startRecording',
      tabId: tab.id
    });
    
    if (response && response.success) {
      recordingStartTime = Date.now();
      startBtn.disabled = true;
      stopBtn.disabled = false;
      
      // Show what's being recorded
      let statusMsg = '🔴 Recording: ';
      if (response.hasMic && response.hasTabAudio) {
        statusMsg += 'Your voice + Tab audio ✅';
      } else if (response.hasMic) {
        statusMsg += 'Your voice only (no tab audio) ⚠️';
      } else if (response.hasTabAudio) {
        statusMsg += 'Tab audio only (mic blocked!) ⚠️';
      } else {
        statusMsg += 'Unknown sources';
      }
      
      updateStatus(statusMsg, 'recording');
    } else {
      throw new Error(response?.error || 'Failed to start recording');
    }
  } catch (error) {
    console.error('Error starting recording:', error);
    updateStatus('❌ ' + error.message, 'error');
  }
}

async function stopRecording() {
  try {
    updateStatus('⏳ Stopping recording...', 'processing');
    
    // Send message to background to stop recording
    const response = await chrome.runtime.sendMessage({ action: 'stopRecording' });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to stop recording');
    }
    
    const recordingDuration = Math.round((Date.now() - recordingStartTime) / 1000);
    const audioSizeMB = (response.size / 1024 / 1024).toFixed(2);
    
    console.log(`Recording stopped. Duration: ${recordingDuration}s, Size: ${audioSizeMB}MB`);
    
    updateStatus('⏳ Processing and uploading...', 'processing');
    
    // Convert base64 data URL back to Blob
    const base64Data = response.audioData.split(',')[1];
    const binaryData = atob(base64Data);
    const arrayBuffer = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      arrayBuffer[i] = binaryData.charCodeAt(i);
    }
    const audioBlob = new Blob([arrayBuffer], { type: 'audio/webm' });
    
    // Get meeting title
    const meetingTitle = meetingTitleInput.value.trim() || 'Meeting';
    
    // Upload to backend
    await uploadRecording(audioBlob, meetingTitle, recordingDuration);
    
  } catch (error) {
    console.error('Error stopping recording:', error);
    updateStatus('❌ Error: ' + error.message, 'error');
    resetUI();
  }
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
