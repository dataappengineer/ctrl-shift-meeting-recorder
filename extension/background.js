// Background service worker for the extension
// Manages offscreen document and tab audio capture

console.log('Background service worker started');

let offscreenDocumentReady = false;

// Create offscreen document on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Ctrl+Shift Meeting Recorder installed');
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
      .catch(error => {
        console.error('Start recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'stopRecording') {
    stopRecording()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Stop recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function startRecording(tabId) {
  try {
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

async function stopRecording() {
  try {
    console.log('=== BACKGROUND: Stopping recording ===');
    
    // Ask offscreen to stop and return audio
    console.log('Sending stopMixedRecording message to offscreen...');
    const response = await chrome.runtime.sendMessage({
      action: 'stopMixedRecording',
      target: 'offscreen'
    });
    
    console.log('Offscreen response:', response);
    
    cleanup();
    
    if (!response || !response.success) {
      console.error('❌ Offscreen returned error:', response?.error);
      throw new Error(response?.error || 'Failed to stop recording');
    }
    
    console.log('✅ Recording stopped successfully, audio size:', response.size);
    return response;
    
  } catch (error) {
    console.error('Stop recording error:', error);
    cleanup();
    throw error;
  }
}

function cleanup() {
  // No cleanup needed in background - streams are in offscreen document
  console.log('Background cleanup complete');
}

