// Content script injected into Google Meet pages
// Handles audio recording with microphone access

console.log('Ctrl+Shift Meeting Recorder: Content script loaded');

let mediaRecorder;
let audioChunks = [];
let micStream = null;
let tabStream = null;
let audioContext = null;

function extractMeetingTitle() {
  // Try to get meeting name from Google Meet UI
  const titleElement = document.querySelector('[data-meeting-title]') || 
                       document.querySelector('h1');
  return titleElement ? titleElement.textContent.trim() : null;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request.action);
  
  if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
    return true;
  }
  
  if (request.action === 'getMeetingInfo') {
    sendResponse({
      title: extractMeetingTitle(),
      url: window.location.href
    });
    return true;
  }
  
  if (request.action === 'startRecording') {
    startRecording().then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'stopRecording') {
    stopRecording().then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

async function startRecording() {
  try {
    console.log('Starting recording - requesting microphone...');
    
    // Get microphone stream
    micStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 44100
      } 
    });
    
    console.log('Microphone access granted, creating recorder...');
    
    // Record microphone
    mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm' });
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
        console.log('Audio chunk received:', e.data.size, 'bytes');
      }
    };
    
    mediaRecorder.start();
    console.log('Recording started successfully (Microphone)');
    
    return { success: true, message: 'Recording started (Microphone)' };
  } catch (error) {
    console.error('Recording error:', error);
    
    // Clean up on error
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    
    return { success: false, error: error.message };
  }
}

async function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve({ success: false, error: 'No active recording' });
      return;
    }
    
    console.log('Stopping recording...');
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      console.log('Recording stopped, audio size:', audioBlob.size, 'bytes');
      
      // Convert Blob to base64 for message passing
      const reader = new FileReader();
      reader.onloadend = () => {
        // Clean up streams
        if (micStream) {
          micStream.getTracks().forEach(track => track.stop());
          micStream = null;
        }
        
        console.log('Sending audio data to popup...');
        resolve({ 
          success: true, 
          audioData: reader.result, // base64 data URL
          size: audioBlob.size 
        });
      };
      reader.readAsDataURL(audioBlob);
    };
    
    mediaRecorder.stop();
  });
}
