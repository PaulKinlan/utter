// Recognition frame - runs speech recognition in an iframe context
// This allows PTT to work without the sidepanel being open

const statusText = document.getElementById('status-text');
const interimEl = document.getElementById('interim');
const pulseEl = document.getElementById('pulse');

let recognition = null;
let micStream = null;
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

async function startRecognition() {
  // Get microphone access
  micStream = await getMicrophoneAccess();

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
