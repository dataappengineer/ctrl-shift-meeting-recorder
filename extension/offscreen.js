// Offscreen document for mixing microphone + tab audio
// Runs in a hidden document context with USER_MEDIA access

console.log('Offscreen document loaded');

let audioContext = null;
let micSource = null;
let tabSource = null;
let destination = null;
let mediaRecorder = null;
let audioChunks = [];
let micStream = null;
let tabStream = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only handle messages meant for offscreen
  if (request.target !== 'offscreen') {
    return;
  }
  
  console.log('Offscreen received message:', request.action);
  
  if (request.action === 'startMixedRecording') {
    startMixedRecording(request.hasTabAudio)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Start recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'stopMixedRecording') {
    stopMixedRecording()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Stop recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function startMixedRecording(hasTabAudio) {
  try {
    console.log('Starting mixed recording, hasTabAudio:', hasTabAudio);
    
    // Get microphone stream
    console.log('Requesting microphone access...');
    micStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 44100
      } 
    });
    console.log('Microphone access granted');
    
    // Try to get tab audio stream
    // In Google Meet, tab audio is what comes OUT of the page (other participants)
    if (hasTabAudio) {
      try {
        console.log('Attempting to get tab audio...');
        // Get display media (tab audio) - this may require user gesture
        // For now, we'll just record microphone and note that tab audio needs special handling
        tabStream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false,
          preferCurrentTab: true
        });
        console.log('Tab audio stream obtained');
      } catch (tabError) {
        console.warn('Could not get tab audio (expected in offscreen):', tabError.message);
        console.log('Recording microphone only');
        tabStream = null;
      }
    }
    
    // Create audio context for mixing
    audioContext = new AudioContext({ sampleRate: 44100 });
    
    // Create destination (output)
    destination = audioContext.createMediaStreamDestination();
    
    // Connect microphone
    micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(destination);
    console.log('Microphone connected to mixer');
    
    // Connect tab audio if available
    if (tabStream) {
      tabSource = audioContext.createMediaStreamSource(tabStream);
      tabSource.connect(destination);
      console.log('Tab audio connected to mixer');
    }
    
    // Create MediaRecorder with mixed stream
    mediaRecorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm' });
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
        console.log('Audio chunk received:', e.data.size, 'bytes');
      }
    };
    
    mediaRecorder.onerror = (e) => {
      console.error('MediaRecorder error:', e);
    };
    
    mediaRecorder.start(1000); // Collect data every second
    console.log('Mixed recording started');
    
    const sources = tabStream ? 'Microphone + Tab Audio' : 'Microphone only';
    return { 
      success: true, 
      message: `Recording ${sources}`,
      hasTabAudio: !!tabStream
    };
    
  } catch (error) {
    console.error('Recording error:', error);
    cleanup();
    throw error;
  }
}

async function stopMixedRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      cleanup();
      resolve({ success: false, error: 'No active recording' });
      return;
    }
    
    console.log('Stopping media recorder...');
    
    mediaRecorder.onstop = () => {
      console.log('Recording stopped, chunks:', audioChunks.length);
      
      // Create blob from chunks
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      console.log('Audio blob created, size:', audioBlob.size);
      
      // Convert to base64 for message passing
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = {
          success: true,
          audioData: reader.result,
          size: audioBlob.size
        };
        
        cleanup();
        console.log('Sending audio data back, size:', audioBlob.size);
        resolve(result);
      };
      
      reader.onerror = (error) => {
        console.error('FileReader error:', error);
        cleanup();
        resolve({ success: false, error: 'Failed to read audio data' });
      };
      
      reader.readAsDataURL(audioBlob);
    };
    
    mediaRecorder.stop();
  });
}

function cleanup() {
  console.log('Cleaning up audio resources...');
  
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  
  if (tabStream) {
    tabStream.getTracks().forEach(track => track.stop());
    tabStream = null;
  }
  
  if (micSource) {
    micSource.disconnect();
    micSource = null;
  }
  
  if (tabSource) {
    tabSource.disconnect();
    tabSource = null;
  }
  
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  
  destination = null;
  audioContext = null;
  audioChunks = [];
  mediaRecorder = null;
  
  console.log('Cleanup complete');
}

