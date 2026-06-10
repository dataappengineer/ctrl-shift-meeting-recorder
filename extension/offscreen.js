// Offscreen document for recording microphone + tab audio SEPARATELY
// This allows us to label them as "You:" (mic) and "Them:" (tab) like Granola
// Runs in a hidden document context with USER_MEDIA access

console.log('Offscreen document loaded (Separate Recording Mode)');

let audioContext = null;
let micRecorder = null;
let tabRecorder = null;
let micChunks = [];
let tabChunks = [];
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
    startSeparateRecording(request.streamId)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Start recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'stopMixedRecording') {
    stopSeparateRecording({
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

async function startSeparateRecording(streamId) {
  try {
    console.log('========================================');
    console.log('🎬 OFFSCREEN: Starting SEPARATE recording');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Stream ID:', streamId);
    console.log('Mode: Mic + Tab recorded separately for speaker attribution');
    console.log('========================================');
    
    // 1. Get tab audio stream
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
      console.warn('⚠️ Continuing with tab audio only (will only capture "Them")');
      if (!tabStream) {
        throw new Error('Both mic and tab audio failed');
      }
      micStream = null;
    }
    
    // 3. Create audio context for monitoring
    console.log('Creating audio context for monitoring...');
    audioContext = new AudioContext({ sampleRate: 44100 });
    await audioContext.resume();
    
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
    
    window.levelCheckInterval = levelCheckInterval;
    
    // 4. Create SEPARATE recorders for mic and tab
    if (micStream) {
      console.log('Creating MIC recorder...');
      micRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm' });
      micChunks = [];
      
      micRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          micChunks.push(e.data);
          console.log(`🎤 Mic chunk ${micChunks.length}:`, e.data.size, 'bytes');
        }
      };
      
      micRecorder.onerror = (e) => console.error('Mic recorder error:', e);
      micRecorder.start(1000);
      console.log('✅ Mic recording started');
    }
    
    if (tabStream) {
      console.log('Creating TAB recorder...');
      tabRecorder = new MediaRecorder(tabStream, { mimeType: 'audio/webm' });
      tabChunks = [];
      
      tabRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          tabChunks.push(e.data);
          console.log(`🔊 Tab chunk ${tabChunks.length}:`, e.data.size, 'bytes');
        }
      };
      
      tabRecorder.onerror = (e) => console.error('Tab recorder error:', e);
      tabRecorder.start(1000);
      console.log('✅ Tab recording started');
      
      // Play tab audio to speakers so user can hear other participants
      const tabSource = audioContext.createMediaStreamSource(tabStream);
      tabSource.connect(audioContext.destination);
      tabSource.connect(analyser);
    }
    
    // Build status message
    const sources = [];
    if (micStream) sources.push('Microphone (You)');
    if (tabStream) sources.push('Tab Audio (Them)');
    const message = sources.length > 0 
      ? `Recording ${sources.join(' + ')}` 
      : 'Recording started';
    
    console.log('========================================');
    console.log('✅ SEPARATE RECORDING ACTIVE');
    console.log('Mic:', micStream ? 'YES' : 'NO');
    console.log('Tab:', tabStream ? 'YES' : 'NO');
    console.log('========================================');
    
    return { 
      success: true, 
      message: message,
      hasTabAudio: !!tabStream,
      hasMic: !!micStream,
      mode: 'separate'
    };
    
  } catch (error) {
    console.error('Recording error:', error);
    cleanup();
    throw error;
  }
}

async function stopSeparateRecording(options = {}) {
  console.log('========================================');
  console.log('🛑 OFFSCREEN: Stopping SEPARATE recording');
  console.log('Timestamp:', new Date().toISOString());
  console.log('========================================');
  
  const promises = [];
  
  // Stop mic recorder
  if (micRecorder && micRecorder.state !== 'inactive') {
    console.log('Stopping MIC recorder...');
    const micPromise = new Promise((resolve) => {
      micRecorder.onstop = () => {
        console.log('Mic stopped, chunks:', micChunks.length);
        resolve();
      };
      micRecorder.stop();
    });
    promises.push(micPromise);
  }
  
  // Stop tab recorder
  if (tabRecorder && tabRecorder.state !== 'inactive') {
    console.log('Stopping TAB recorder...');
    const tabPromise = new Promise((resolve) => {
      tabRecorder.onstop = () => {
        console.log('Tab stopped, chunks:', tabChunks.length);
        resolve();
      };
      tabRecorder.stop();
    });
    promises.push(tabPromise);
  }
  
  // Wait for both to stop
  await Promise.all(promises);
  
  console.log('Both recorders stopped');
  console.log('Mic chunks:', micChunks.length, 'Tab chunks:', tabChunks.length);
  
  // Check if we have any audio
  if (micChunks.length === 0 && tabChunks.length === 0) {
    console.error('❌ No audio chunks recorded from either source!');
    cleanup();
    return { success: false, error: 'No audio data recorded' };
  }
  
  // Create blobs
  const micBlob = micChunks.length > 0 ? new Blob(micChunks, { type: 'audio/webm' }) : null;
  const tabBlob = tabChunks.length > 0 ? new Blob(tabChunks, { type: 'audio/webm' }) : null;
  
  console.log('Mic blob:', micBlob ? `${micBlob.size} bytes (${(micBlob.size / 1024 / 1024).toFixed(2)} MB)` : 'none');
  console.log('Tab blob:', tabBlob ? `${tabBlob.size} bytes (${(tabBlob.size / 1024 / 1024).toFixed(2)} MB)` : 'none');
  
  // Upload to server
  try {
    console.log('========================================');
    console.log('📤 UPLOAD STARTING (Separate files)');
    console.log('========================================');
    
    const formData = new FormData();
    if (micBlob) formData.append('mic_audio', micBlob, 'mic.webm');
    if (tabBlob) formData.append('tab_audio', tabBlob, 'tab.webm');
    formData.append('title', options.title || 'Meeting');
    formData.append('duration', options.duration || 0);
    formData.append('mode', 'separate'); // Tell server we're sending separate files
    
    console.log('🌐 Sending HTTP POST to localhost:5000/transcribe-and-commit-separate...');
    const uploadStartTime = Date.now();
    
    const response = await fetch('http://localhost:5000/transcribe-and-commit-separate', {
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
    
    const data = await response.json();
    console.log('Response data:', data);
    
    if (data.success) {
      console.log('========================================');
      console.log('✅ UPLOAD SUCCESSFUL');
      console.log('Filename:', data.filename);
      console.log('Mode: Separate transcription with speaker labels');
      console.log('Total time:', uploadDuration + 's');
      console.log('========================================');
      cleanup();
      return { 
        success: true, 
        filename: data.filename,
        micSize: micBlob ? micBlob.size : 0,
        tabSize: tabBlob ? tabBlob.size : 0
      };
    } else {
      console.error('❌ Server returned success:false');
      console.error('Error:', data.error);
      throw new Error(data.error || 'Upload failed');
    }
  } catch (uploadError) {
    console.error('========================================');
    console.error('❌ UPLOAD FAILED');
    console.error('Error:', uploadError.message);
    console.error('========================================');
    cleanup();
    return { 
      success: false, 
      error: 'Upload failed: ' + uploadError.message 
    };
  }
}

function cleanup() {
  console.log('Cleaning up audio resources...');
  
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
  
  if (analyser) {
    analyser.disconnect();
    analyser = null;
  }
  
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  
  audioContext = null;
  micChunks = [];
  tabChunks = [];
  micRecorder = null;
  tabRecorder = null;
  
  console.log('Cleanup complete');
}
