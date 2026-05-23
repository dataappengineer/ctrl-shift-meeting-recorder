// Background service worker for the extension
// Manages offscreen document and tab audio capture

console.log('Background service worker started');

let offscreenDocumentReady = false;
let currentTabStream = null;

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
  console.log('Background received message:', request.action);
  
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
    console.log('Starting recording for tab:', tabId);
    
    // Ensure offscreen document exists
    await ensureOffscreenDocument();
    
    // Capture tab audio
    console.log('Capturing tab audio...');
    const tabStream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture(
        { audio: true, video: false },
        (stream) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!stream) {
            reject(new Error('No stream returned from tabCapture'));
            return;
          }
          resolve(stream);
        }
      );
    });
    
    console.log('Tab audio captured, starting offscreen recording...');
    currentTabStream = tabStream;
    
    // Forward tab stream to offscreen document via message
    // Note: We can't pass MediaStream directly, so offscreen will handle both
    const response = await chrome.runtime.sendMessage({
      action: 'startMixedRecording',
      target: 'offscreen',
      hasTabAudio: true
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Offscreen recording failed');
    }
    
    console.log('Recording started successfully');
    return { success: true, message: 'Recording both mic + tab audio' };
    
  } catch (error) {
    console.error('Recording error:', error);
    cleanup();
    throw error;
  }
}

async function stopRecording() {
  try {
    console.log('Stopping recording...');
    
    // Ask offscreen to stop and return audio
    const response = await chrome.runtime.sendMessage({
      action: 'stopMixedRecording',
      target: 'offscreen'
    });
    
    cleanup();
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to stop recording');
    }
    
    console.log('Recording stopped, audio size:', response.size);
    return response;
    
  } catch (error) {
    console.error('Stop recording error:', error);
    cleanup();
    throw error;
  }
}

function cleanup() {
  if (currentTabStream) {
    currentTabStream.getTracks().forEach(track => track.stop());
    currentTabStream = null;
  }
}

