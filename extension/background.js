// Background service worker for the extension
// Manages offscreen document and tab audio capture

console.log('Background service worker started');

let offscreenDocumentReady = false;

// Get recording state from storage (persists when service worker sleeps)
async function getRecordingState() {
  const result = await chrome.storage.local.get('recordingState');
  return result.recordingState || { isRecording: false, tabId: null, startTime: null };
}

// Save recording state to storage
async function setRecordingState(state) {
  await chrome.storage.local.set({ recordingState: state });
}

// Create offscreen document on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Ctrl+Shift Meeting Recorder installed');
  // Clear any stuck recording state
  await setRecordingState({ isRecording: false, tabId: null, startTime: null });
});

// Ensure offscreen document exists
async function ensureOffscreenDocument() {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });

  if (existingContexts.length > 0) {
    console.log('Offscreen document already exists');
    return true;
  }

  // Create offscreen document
  console.log('Creating offscreen document...');
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'], // For getUserMedia access
    justification: 'Record and mix microphone + tab audio'
  });
  
  console.log('Offscreen document created');
  return true;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action || request.type);
  
  // Handle offscreen-ready signal
  if (request.type === 'offscreen-ready') {
    offscreenDocumentReady = true;
    console.log('✅ Offscreen document is ready');
    return;
  }
  
  if (request.action === 'startRecording') {
    startRecording(request.tabId)
      .then(result => sendResponse(result))
      .catch(async error => {
        console.error('Start recording error:', error);
        await setRecordingState({ isRecording: false, tabId: null, startTime: null });
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'stopRecording') {
    stopRecording({
      title: request.title,
      duration: request.duration
    })
      .then(result => sendResponse(result))
      .catch(async error => {
        console.error('Stop recording error:', error);
        await setRecordingState({ isRecording: false, tabId: null, startTime: null });
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'getRecordingState') {
    getRecordingState()
      .then(state => sendResponse(state))
      .catch(error => {
        console.error('Get state error:', error);
        sendResponse({ isRecording: false, tabId: null, startTime: null });
      });
    return true;
  }
  
  if (request.action === 'forceStopRecording') {
    forceStopRecording()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Force stop error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function startRecording(tabId) {
  try {
    // Check if already recording (from persistent storage)
    const recordingState = await getRecordingState();
    if (recordingState.isRecording) {
      throw new Error(`Already recording on tab ${recordingState.tabId}. Stop that recording first or use Force Stop.`);
    }
    
    console.log('=== Starting recording for tab:', tabId);
    
    // Ensure offscreen document exists
    await ensureOffscreenDocument();
    
    // MV3 API: Get stream ID (not the actual stream)
    console.log('Getting media stream ID...');
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });
    
    console.log('✅ Got streamId:', streamId);
    
    // Send streamId to offscreen document for actual capture
    console.log('Sending streamId to offscreen document...');
    const response = await chrome.runtime.sendMessage({
      action: 'startMixedRecording',
      target: 'offscreen',
      streamId: streamId
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Offscreen recording failed');
    }
    
    // Update recording state in storage (persists when service worker sleeps)
    await setRecordingState({
      isRecording: true,
      tabId: tabId,
      startTime: Date.now()
    });
    
    console.log('✅ Recording started successfully:', response.message);
    return { 
      success: true, 
      message: response.message,
      hasTabAudio: response.hasTabAudio,
      hasMic: response.hasMic
    };
    
  } catch (error) {
    console.error('❌ Recording error:', error);
    cleanup();
    throw error;
  }
}

async function stopRecording(options = {}) {
  try {
    console.log('========================================');
    console.log('🛑 BACKGROUND: Stopping recording');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Options:', options);
    console.log('========================================');
    
    const recordingState = await getRecordingState();
    console.log('Current recording state:', recordingState);
    
    if (!recordingState.isRecording) {
      console.warn('⚠️ No active recording to stop');
      return { success: false, error: 'No active recording' };
    }
    
    // Ask offscreen to stop and upload directly (passing title/duration)
    console.log('📤 Sending stopMixedRecording message to offscreen...');
    const messageStartTime = Date.now();
    
    const response = await chrome.runtime.sendMessage({
      action: 'stopMixedRecording',
      target: 'offscreen',
      title: options.title,
      duration: options.duration
    });
    
    const messageTime = ((Date.now() - messageStartTime) / 1000).toFixed(2);
    console.log(`📥 Offscreen response received (${messageTime}s):`, response);
    
    // Clean up offscreen document to release tab capture
    await cleanup();
    
    // Clear recording state
    await setRecordingState({
      isRecording: false,
      tabId: null,
      startTime: null
    });
    
    if (!response || !response.success) {
      console.error('❌ Offscreen returned error:', response?.error);
      throw new Error(response?.error || 'Failed to stop recording');
    }
    
    console.log('✅ Recording stopped and uploaded, file:', response.filename);
    return response;
    
  } catch (error) {
    console.error('Stop recording error:', error);
    await setRecordingState({ isRecording: false, tabId: null, startTime: null });
    await cleanup();
    throw error;
  }
}

// Force stop - for when recording gets stuck
async function forceStopRecording() {
  console.log('=== FORCE STOPPING recording ===');
  
  const errors = [];
  
  // Try to stop offscreen recording (don't fail if this doesn't work)
  try {
    await chrome.runtime.sendMessage({
      action: 'stopMixedRecording',
      target: 'offscreen'
    });
    console.log('✓ Offscreen recording stopped');
  } catch (e) {
    console.warn('⚠️ Could not stop offscreen recording (expected if already stopped):', e.message);
    errors.push(`offscreen: ${e.message}`);
  }
  
  // Try to clean up (don't fail if this doesn't work)
  try {
    await cleanup();
    console.log('✓ Cleanup complete');
  } catch (e) {
    console.warn('⚠️ Cleanup had issues (non-fatal):', e.message);
    errors.push(`cleanup: ${e.message}`);
  }
  
  // Always clear recording state (this should never fail)
  try {
    await setRecordingState({
      isRecording: false,
      tabId: null,
      startTime: null
    });
    console.log('✓ Recording state cleared');
  } catch (e) {
    console.error('❌ Could not clear state:', e);
    errors.push(`state: ${e.message}`);
    // Try fallback
    try {
      await chrome.storage.local.remove('recordingState');
    } catch (e2) {
      console.error('❌ Fallback state clear failed:', e2);
    }
  }
  
  console.log('✅ Force stop complete');
  
  if (errors.length > 0) {
    console.log('Force stop completed with warnings:', errors);
  }
  
  return { 
    success: true, 
    message: 'Forced cleanup complete' + (errors.length > 0 ? ` (${errors.length} warnings)` : '')
  };
}

async function cleanup() {
  console.log('Background cleanup: closing offscreen document...');
  
  try {
    // Check if offscreen document exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')]
    });
    
    if (existingContexts.length > 0) {
      try {
        await chrome.offscreen.closeDocument();
        console.log('✅ Offscreen document closed');
      } catch (closeError) {
        console.warn('⚠️ Error closing offscreen document:', closeError.message);
        // Don't throw - this is non-fatal
      }
    } else {
      console.log('No offscreen document to close');
    }
  } catch (contextError) {
    console.warn('⚠️ Error checking for offscreen contexts:', contextError.message);
    // Try to close anyway
    try {
      await chrome.offscreen.closeDocument();
      console.log('✅ Offscreen document closed (fallback)');
    } catch (fallbackError) {
      console.warn('⚠️ Fallback close also failed:', fallbackError.message);
      // Non-fatal, continue
    }
  }
  
  console.log('Background cleanup complete');
}

