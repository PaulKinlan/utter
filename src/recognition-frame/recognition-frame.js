// Recognition frame - runs speech recognition in an iframe context
// This allows PTT to work without the sidepanel being open

const statusText = document.getElementById('status-text');
const interimEl = document.getElementById('interim');
const pulseEl = document.getElementById('pulse');
const frequencyCanvas = document.getElementById('frequency-canvas');
const canvasCtx = frequencyCanvas.getContext('2d');

let recognition = null;
let micStream = null;
let audioContext = null;
let analyser = null;
let animationId = null;
let settings = {
  selectedMicrophone: '',
  soundFeedbackEnabled: true,
  audioVolume: 0.5
};
let lastInterimTranscript = '';

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
      'selectedMicrophone',
      'soundFeedbackEnabled',
      'audioVolume'
    ]);
    settings.selectedMicrophone = result.selectedMicrophone || '';
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
  if (settings.selectedMicrophone) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: settings.selectedMicrophone } }
      });
      return stream;
    } catch (err) {
      if (err.name !== 'OverconstrainedError') {
        throw err;
      }
      // Fall through to default microphone
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function setupFrequencyAnalyzer(stream) {
  // Create audio context and analyser
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;

  // Connect microphone stream to analyser
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  // Start visualization loop
  drawFrequencyBars();
}

function drawFrequencyBars() {
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const width = frequencyCanvas.width;
  const height = frequencyCanvas.height;
  const barCount = 24;
  const barWidth = width / barCount;
  const barSpacing = 2;

  // Clear canvas
  canvasCtx.clearRect(0, 0, width, height);

  // Draw bars
  for (let i = 0; i < barCount; i++) {
    // Sample frequency data (use lower frequencies for voice)
    const dataIndex = Math.floor(i * bufferLength / barCount / 4);
    const value = dataArray[dataIndex];
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
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyser = null;

  // Clear canvas
  if (canvasCtx) {
    canvasCtx.clearRect(0, 0, frequencyCanvas.width, frequencyCanvas.height);
  }
}

async function startRecognition() {
  // Get microphone access
  micStream = await getMicrophoneAccess();

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

function stopRecognition() {
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

  playSound('boop.wav');
  sendToParent({ type: 'recognition-ended' });
  cleanup();
}

function cleanup() {
  stopFrequencyAnalyzer();
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
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
