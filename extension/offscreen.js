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
let analyser = null;

// Signal to background that we're ready
chrome.runtime.sendMessage({ type: 'offscreen-ready' }).catch(() => {
  // Background may not be listening yet, that's okay
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only handle messages meant for offscreen
  if (request.target !== 'offscreen') {
    return;
  }
  
  console.log('Offscreen received message:', request.action);
  
  if (request.action === 'startMixedRecording') {
    startMixedRecording(request.streamId)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Start recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'stopMixedRecording') {
    stopMixedRecording({
      title: request.title,
      duration: request.duration
    })
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Stop recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function startMixedRecording(streamId) {
  try {
    console.log('========================================');
    console.log('🎬 OFFSCREEN: Starting mixed recording');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Stream ID:', streamId);
    console.log('========================================');
    
    // 1. Get tab audio stream using the streamId from background
    console.log('Getting tab audio stream...');
    try {
      tabStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });
      console.log('✅ Tab audio stream obtained');
    } catch (tabError) {
      console.error('❌ Tab audio failed:', tabError);
      // Continue with mic only if tab audio fails
      tabStream = null;
    }
    
    // 2. Get microphone stream
    console.log('Requesting microphone access...');
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });
      console.log('✅ Microphone access granted');
    } catch (micError) {
      console.error('❌ Microphone access denied:', micError);
      console.warn('⚠️ IMPORTANT: You need to click "Allow" for microphone access to record your voice!');
      console.warn('⚠️ Continuing with tab audio only (will only capture other participants)');
      if (!tabStream) {
        throw new Error('Both mic and tab audio failed');
      }
      micStream = null;
    }
    
    // 3. Create audio context for mixing
    console.log('Creating audio context...');
    audioContext = new AudioContext({ sampleRate: 44100 });
    console.log('AudioContext created, state:', audioContext.state);
    await audioContext.resume();
    console.log('AudioContext resumed, state:', audioContext.state);
    
    // Create destination (output)
    destination = audioContext.createMediaStreamDestination();
    console.log('Destination created, stream tracks:', destination.stream.getTracks().length);
    
    // Create analyzer to monitor audio levels
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // Monitor audio levels periodically
    const levelCheckInterval = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      if (average > 5) {
        console.log('🎵 Audio detected, level:', Math.round(average));
      } else {
        console.log('🔇 Silent (level:', Math.round(average), ')');
      }
    }, 3000);
    
    // Store interval for cleanup
    window.levelCheckInterval = levelCheckInterval;
    
    // 4. Connect tab audio if available
    if (tabStream) {
      console.log('Creating tab audio source...');
      console.log('Tab stream tracks:', tabStream.getTracks().length);
      tabStream.getTracks().forEach((track, i) => {
        console.log(`  Tab track ${i}: kind=${track.kind}, enabled=${track.enabled}, readyState=${track.readyState}, muted=${track.muted}`);
      });
      
      tabSource = audioContext.createMediaStreamSource(tabStream);
      console.log('Tab source created');
      tabSource.connect(destination);
      tabSource.connect(analyser); // Connect to analyser for monitoring
      // Also play tab audio to speakers so user can hear other participants
      tabSource.connect(audioContext.destination);
      console.log('✅ Tab audio connected to mixer');
    }
    
    // 5. Connect microphone if available
    if (micStream) {
      console.log('Creating mic audio source...');
      console.log('Mic stream tracks:', micStream.getTracks().length);
      micStream.getTracks().forEach((track, i) => {
        console.log(`  Mic track ${i}: kind=${track.kind}, enabled=${track.enabled}, readyState=${track.readyState}, muted=${track.muted}`);
      });
      
      micSource = audioContext.createMediaStreamSource(micStream);
      console.log('Mic source created');
      micSource.connect(destination);
      micSource.connect(analyser); // Connect to analyser for monitoring
      console.log('✅ Microphone connected to mixer');
    }
    
    // 6. Create MediaRecorder with mixed stream
    console.log('Creating MediaRecorder...');
    console.log('Destination stream tracks:', destination.stream.getTracks().length);
    destination.stream.getTracks().forEach((track, i) => {
      console.log(`  Track ${i}: kind=${track.kind}, enabled=${track.enabled}, readyState=${track.readyState}`);
    });
    
    // Check if stream is actually producing audio
    if (destination.stream.getTracks().length === 0) {
      throw new Error('Destination stream has no tracks!');
    }
    
    const audioTracks = destination.stream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error('Destination stream has no audio tracks!');
    }
    
    console.log('Audio tracks ready:', audioTracks.length);
    
    mediaRecorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm' });
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
        console.log(`📼 Audio chunk ${audioChunks.length}:`, e.data.size, 'bytes (total:', audioChunks.reduce((sum, chunk) => sum + chunk.size, 0), 'bytes)');
      } else {
        console.warn('⚠️ Received empty audio chunk');
      }
    };
    
    mediaRecorder.onerror = (e) => {
      console.error('MediaRecorder error:', e);
    };
    
    mediaRecorder.start(1000); // Collect data every second
    console.log('✅ Mixed recording started');
    console.log('MediaRecorder state:', mediaRecorder.state);
    console.log('MediaRecorder mimeType:', mediaRecorder.mimeType);
    
    // Build status message
    const sources = [];
    if (micStream) sources.push('Microphone');
    if (tabStream) sources.push('Tab Audio');
    const message = sources.length > 0 
      ? `Recording ${sources.join(' + ')}` 
      : 'Recording started';
    
    return { 
      success: true, 
      message: message,
      hasTabAudio: !!tabStream,
      hasMic: !!micStream
    };
    
  } catch (error) {
    console.error('Recording error:', error);
    cleanup();
    throw error;
  }
}

async function stopMixedRecording(options = {}) {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      cleanup();
      resolve({ success: false, error: 'No active recording' });
      return;
    }
    
    console.log('Stopping media recorder...');
    
    mediaRecorder.onstop = async () => {
      console.log('=== OFFSCREEN: Recording stopped ===');
      console.log('Total chunks collected:', audioChunks.length);
      
      if (audioChunks.length === 0) {
        console.error('❌ No audio chunks were recorded!');
        cleanup();
        resolve({ success: false, error: 'No audio data recorded' });
        return;
      }
      
      // Create blob from chunks
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      console.log('Audio blob created, size:', audioBlob.size, 'bytes');
      
      if (audioBlob.size === 0) {
        console.error('❌ Audio blob is empty!');
        cleanup();
        resolve({ success: false, error: 'Audio blob is empty' });
        return;
      }
      
      // Upload directly to server instead of passing through messages
      // This avoids Chrome's message size limits (~64MB, often fails at 10-20MB)
      try {
        console.log('========================================');
        console.log('📤 UPLOAD STARTING');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Audio size:', audioBlob.size, 'bytes', '(' + (audioBlob.size / 1024 / 1024).toFixed(2) + ' MB)');
        console.log('Title:', options.title || 'Meeting');
        console.log('Duration:', options.duration || Math.floor(audioBlob.size / 16000), 'seconds');
        console.log('========================================');
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('title', options.title || 'Meeting');
        formData.append('duration', options.duration || Math.floor(audioBlob.size / 16000)); // Estimate
        
        console.log('🌐 Sending HTTP POST to localhost:5000...');
        const uploadStartTime = Date.now();
        
        const response = await fetch('http://localhost:5000/transcribe-and-commit', {
          method: 'POST',
          body: formData
        });
        
        const uploadDuration = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
        console.log(`📡 HTTP response received (${uploadDuration}s)`);
        console.log('Status:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'No error text');
          console.error('❌ Server returned error status:', response.status);
          console.error('Error body:', errorText);
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
        
        console.log('📥 Parsing JSON response...');
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
          console.log('========================================');
          console.log('✅ UPLOAD SUCCESSFUL');
          console.log('Filename:', data.filename);
          console.log('Total time:', uploadDuration + 's');
          console.log('========================================');
          cleanup();
          resolve({ 
            success: true, 
            filename: data.filename,
            size: audioBlob.size
          });
        } else {
          console.error('❌ Server returned success:false');
          console.error('Error:', data.error);
          throw new Error(data.error || 'Upload failed');
        }
      } catch (uploadError) {
        console.error('========================================');
        console.error('❌ UPLOAD FAILED');
        console.error('Error type:', uploadError.name);
        console.error('Error message:', uploadError.message);
        console.error('Error stack:', uploadError.stack);
        console.error('========================================');
        cleanup();
        resolve({ 
          success: false, 
          error: 'Upload failed: ' + uploadError.message 
        });
      }
    };
    
    mediaRecorder.stop();
  });
}

function cleanup() {
  console.log('Cleaning up audio resources...');
  
  // Clear audio level monitoring
  if (window.levelCheckInterval) {
    clearInterval(window.levelCheckInterval);
    window.levelCheckInterval = null;
  }
  
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
  
  if (analyser) {
    analyser.disconnect();
    analyser = null;
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

