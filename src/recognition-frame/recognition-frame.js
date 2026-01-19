// Recognition frame - runs speech recognition in an iframe context
// This allows PTT to work without the sidepanel being open

const statusText = document.getElementById('status-text');
const interimEl = document.getElementById('interim');
const pulseEl = document.getElementById('pulse');
const frequencyCanvas = document.getElementById('frequency-canvas');
const canvasCtx = frequencyCanvas.getContext('2d');

let recognition = null;
let micStream = null;
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let animationId = null;
let mediaStreamSource = null;
let frequencyDataArray = null;
let settings = {
  audioDevicePriority: [], // Array of { deviceId, label, lastSeen }
  soundFeedbackEnabled: true,
  audioVolume: 0.5
};
let lastInterimTranscript = '';

// Voice frequency range: sample roughly 0-3kHz (human voice fundamental + formants)
// at typical 48kHz sample rate with FFT size 256
const VOICE_FREQUENCY_RATIO = 0.25;

// Initialize
init();

async function init() {
  try {
    await loadSettings();
    await startRecognition();
  } catch (err) {
    showError(err.message);
  }
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      'audioDevicePriority',
      'soundFeedbackEnabled',
      'audioVolume'
    ]);
    settings.audioDevicePriority = result.audioDevicePriority || [];
    settings.soundFeedbackEnabled = result.soundFeedbackEnabled !== false;
    settings.audioVolume = result.audioVolume !== undefined ? result.audioVolume : 0.5;
  } catch (err) {
    console.error('Utter Recognition Frame: Error loading settings:', err);
  }
}

function playSound(filename) {
  if (!settings.soundFeedbackEnabled) return;
  try {
    const audioUrl = chrome.runtime.getURL(`audio/${filename}`);
    const audio = new Audio(audioUrl);
    audio.volume = settings.audioVolume;
    audio.play().catch(() => {});
  } catch {}
}

async function getMicrophoneAccess() {
  // Get currently connected audio input devices
  const devices = await navigator.mediaDevices.enumerateDevices();
  const connectedDeviceIds = new Set(
    devices.filter(d => d.kind === 'audioinput').map(d => d.deviceId)
  );

  // Try devices in priority order
  for (const priorityDevice of settings.audioDevicePriority) {
    if (connectedDeviceIds.has(priorityDevice.deviceId)) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: priorityDevice.deviceId } }
        });
        console.log('Utter Recognition Frame: Using device:', priorityDevice.label);
        return stream;
      } catch (err) {
        if (err.name !== 'OverconstrainedError') {
          throw err;
        }
        // Device not available, try next in priority list
        console.warn('Utter Recognition Frame: Device unavailable, trying next:', priorityDevice.label);
      }
    }
  }

  // Fall back to system default
  console.log('Utter Recognition Frame: Using system default microphone');
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function setupFrequencyAnalyzer(stream) {
  try {
    // Create audio context and analyser
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('Utter Recognition Frame: Web Audio API not supported');
      return;
    }

    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    // Allocate frequency data array once (reused in animation loop)
    frequencyDataArray = new Uint8Array(analyser.frequencyBinCount);

    // Connect microphone stream to analyser
    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    mediaStreamSource.connect(analyser);

    // Start visualization loop
    drawFrequencyBars();
  } catch (err) {
    console.error('Utter Recognition Frame: Failed to setup frequency analyzer:', err);
  }
}

function drawFrequencyBars() {
  if (!analyser || !frequencyDataArray) return;

  // Reuse pre-allocated array - no GC pressure
  analyser.getByteFrequencyData(frequencyDataArray);

  const width = frequencyCanvas.width;
  const height = frequencyCanvas.height;
  const barCount = 12; // Fewer bars for compact inline display
  const barWidth = width / barCount;
  const barSpacing = 2;

  // Clear canvas
  canvasCtx.clearRect(0, 0, width, height);

  // Draw bars
  for (let i = 0; i < barCount; i++) {
    // Sample voice frequency range (0-3kHz contains fundamental + formants)
    const dataIndex = Math.floor(i * frequencyDataArray.length / barCount * VOICE_FREQUENCY_RATIO);
    const value = frequencyDataArray[dataIndex];
    const barHeight = (value / 255) * height;

    const x = i * barWidth;
    const y = height - barHeight;

    // Draw bar with white color and some transparency
    canvasCtx.fillStyle = `rgba(255, 255, 255, ${0.7 + (value / 255) * 0.3})`;
    canvasCtx.fillRect(
      x + barSpacing / 2,
      y,
      barWidth - barSpacing,
      barHeight
    );
  }

  // Continue animation loop
  animationId = requestAnimationFrame(drawFrequencyBars);
}

function stopFrequencyAnalyzer() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Disconnect audio nodes to prevent resource leaks
  if (mediaStreamSource) {
    mediaStreamSource.disconnect();
    mediaStreamSource = null;
  }

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  analyser = null;
  frequencyDataArray = null;

  // Clear canvas
  if (canvasCtx) {
    canvasCtx.clearRect(0, 0, frequencyCanvas.width, frequencyCanvas.height);
  }
}

async function startRecognition() {
  // Get microphone access
  micStream = await getMicrophoneAccess();

  // Start audio recording
  startAudioRecording();
  // Setup frequency analyzer for voice visualization
  setupFrequencyAnalyzer(micStream);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error('Speech Recognition not supported');
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  recognition.onstart = () => {
    statusText.textContent = 'Listening...';
    playSound('beep.wav');
    sendToParent({ type: 'recognition-started' });
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (interimTranscript) {
      lastInterimTranscript = interimTranscript;
      interimEl.textContent = interimTranscript;
    }
    if (finalTranscript) {
      lastInterimTranscript = '';
      interimEl.textContent = '';
    }

    sendToParent({
      type: 'recognition-result',
      finalTranscript,
      interimTranscript
    });
  };

  recognition.onerror = (event) => {
    console.warn('Utter Recognition Frame: Error:', event.error);

    if (event.error === 'no-speech' || event.error === 'aborted') {
      sendToParent({ type: 'recognition-error', error: event.error, recoverable: true });
      return;
    }

    sendToParent({ type: 'recognition-error', error: event.error, recoverable: false });
    showError(event.error);
  };

  recognition.onend = () => {
    // Restart if still active
    if (recognition) {
      try {
        recognition.start();
      } catch (err) {
        sendToParent({ type: 'recognition-ended' });
        cleanup();
      }
    }
  };

  recognition.start();
}

function startAudioRecording() {
  if (!micStream) return;

  try {
    audioChunks = [];
    mediaRecorder = new MediaRecorder(micStream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start();
  } catch (err) {
    console.error('Utter Recognition Frame: Failed to start audio recording:', err);
  }
}

async function stopAudioRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return null;

  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });

      // Convert blob to base64 data URL for storage
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result);
      };
      reader.readAsDataURL(audioBlob);
    };

    try {
      mediaRecorder.stop();
    } catch (err) {
      console.error('Utter Recognition Frame: Failed to stop audio recording:', err);
      resolve(null);
    }
  });
}

async function stopRecognition() {
  // Send any pending interim text as final
  if (lastInterimTranscript) {
    sendToParent({
      type: 'recognition-result',
      finalTranscript: lastInterimTranscript,
      interimTranscript: ''
    });
    lastInterimTranscript = '';
  }

  if (recognition) {
    const rec = recognition;
    recognition = null;
    try {
      rec.stop();
    } catch {}
  }

  // Stop audio recording and get the audio data
  const audioDataUrl = await stopAudioRecording();

  playSound('boop.wav');
  sendToParent({
    type: 'recognition-ended',
    audioDataUrl
  });
  cleanup();
}

function cleanup() {
  stopFrequencyAnalyzer();
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch {}
  }
  mediaRecorder = null;
  audioChunks = [];
  recognition = null;
}

function showError(message) {
  statusText.textContent = `Error: ${message}`;
  document.body.classList.add('error');
  pulseEl.style.display = 'none';
}

function sendToParent(message) {
  // Send to parent window (content script)
  window.parent.postMessage({ source: 'utter-recognition-frame', ...message }, '*');
}

// Listen for messages from parent (content script)
window.addEventListener('message', (event) => {
  if (event.data?.target !== 'utter-recognition-frame') return;

  switch (event.data.type) {
    case 'stop':
      stopRecognition();
      break;
  }
});

// Also listen for unload to clean up
window.addEventListener('beforeunload', () => {
  cleanup();
});

console.log('Utter Recognition Frame: Loaded');
