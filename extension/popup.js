let recordingStartTime;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const forceStopBtn = document.getElementById('forceStopBtn');
const forceStopContainer = document.getElementById('forceStopContainer');
const statusDiv = document.getElementById('status');
const meetingTitleInput = document.getElementById('meetingTitle');

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
forceStopBtn.addEventListener('click', forceStop);

// Check recording state when popup opens
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (state) => {
  if (state && state.isRecording) {
    // Recording is active, show stop button
    startBtn.disabled = true;
    stopBtn.disabled = false;
    forceStopContainer.style.display = 'block';
    recordingStartTime = state.startTime;
    const duration = Math.floor((Date.now() - state.startTime) / 1000);
    updateStatus(`🔴 Recording in progress (${duration}s)... Click Stop when done`, 'recording');
  }
});

async function forceStop() {
  try {
    if (!confirm('Force stop will clear the recording without saving. Continue?')) {
      return;
    }
    
    updateStatus('🔧 Force stopping...', 'processing');
    
    let response;
    try {
      response = await chrome.runtime.sendMessage({ action: 'forceStopRecording' });
    } catch (msgError) {
      console.error('Message error:', msgError);
      // Even if messaging fails, try to reset UI
      response = { success: true, message: 'Reset (messaging failed)' };
    }
    
    if (response && response.success) {
      updateStatus('✅ ' + (response.message || 'Cleanup complete'), 'success');
      startBtn.disabled = false;
      stopBtn.disabled = true;
      forceStopContainer.style.display = 'none';
      
      // Also clear local storage just in case
      try {
        await chrome.storage.local.remove('recordingState');
      } catch (e) {
        console.warn('Could not clear storage:', e);
      }
      
      setTimeout(() => {
        updateStatus('Ready to record', 'idle');
      }, 2000);
    } else {
      throw new Error(response?.error || 'Force stop failed');
    }
  } catch (error) {
    console.error('Force stop error:', error);
    updateStatus('⚠️ ' + error.message + ' - Try reloading extension', 'warning');
    // Force reset UI anyway
    startBtn.disabled = false;
    stopBtn.disabled = true;
    forceStopContainer.style.display = 'none';
  }
}

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
      forceStopContainer.style.display = 'block';
      
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
    forceStopContainer.style.display = 'none';
  }
}

async function stopRecording() {
  try {
    const meetingTitle = meetingTitleInput.value.trim() || 'Meeting';
    const recordingDuration = Math.round((Date.now() - recordingStartTime) / 1000);
    
    console.log('========================================');
    console.log('🛑 STOP RECORDING INITIATED');
    console.log('Title:', meetingTitle);
    console.log('Duration:', recordingDuration + 's');
    console.log('Timestamp:', new Date().toISOString());
    console.log('========================================');
    
    updateStatus('⏳ Stopping and uploading...', 'processing');
    
    // Send message to background to stop recording and upload directly
    // (title and duration are passed to offscreen for direct upload)
    console.log('📤 Sending stopRecording message to background...');
    const response = await chrome.runtime.sendMessage({ 
      action: 'stopRecording',
      title: meetingTitle,
      duration: recordingDuration
    });
    
    console.log('📥 Response from background:', response);
    
    if (!response || !response.success) {
      console.error('❌ Stop recording failed:', response?.error);
      throw new Error(response?.error || 'Failed to stop recording');
    }
    
    const audioSizeMB = (response.size / 1024 / 1024).toFixed(2);
    console.log('========================================');
    console.log('✅ RECORDING COMPLETE');
    console.log('Duration:', recordingDuration + 's');
    console.log('Size:', audioSizeMB + 'MB');
    console.log('File:', response.filename);
    console.log('========================================');
    
    updateStatus(`✅ Done! Committed as ${response.filename}`, 'success');
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Transcript Committed',
      message: `✅ ${response.filename} uploaded to GitHub`,
      priority: 2
    });
    
    // Reset after 3 seconds
    setTimeout(resetUI, 3000);
    
  } catch (error) {
    console.error('Error stopping recording:', error);
    updateStatus('❌ Error: ' + error.message, 'error');
    resetUI();
  }
}

// uploadRecording function removed - now handled directly in offscreen.js
// This avoids Chrome's message size limits (~64MB) for large recordings

function updateStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}

function resetUI() {
  startBtn.disabled = false;
  stopBtn.disabled = true;
  forceStopContainer.style.display = 'none';
  meetingTitleInput.value = '';
  updateStatus('Ready to record', 'idle');
}

// Initialize
resetUI();
