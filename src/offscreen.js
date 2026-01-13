// Offscreen document for speech recognition
// This runs in an extension context with stable permissions for getUserMedia and SpeechRecognition

let recognition = null;
let micStream = null;
let currentSessionId = null;

// Settings cache
let settings = {
  selectedMicrophone: '',
  soundFeedbackEnabled: true,
  audioVolume: 0.5
};

// Load settings on startup
loadSettings();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.selectedMicrophone) {
    settings.selectedMicrophone = changes.selectedMicrophone.newValue;
  }
  if (changes.soundFeedbackEnabled !== undefined) {
    settings.soundFeedbackEnabled = changes.soundFeedbackEnabled.newValue;
  }
  if (changes.audioVolume !== undefined) {
    settings.audioVolume = changes.audioVolume.newValue;
  }
});

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
    console.error('Utter Offscreen: Error loading settings:', err);
  }
}

// Play audio feedback
function playSound(filename) {
  if (!settings.soundFeedbackEnabled) return;

  try {
    const audioUrl = chrome.runtime.getURL(`audio/${filename}`);
    const audio = new Audio(audioUrl);
    audio.volume = settings.audioVolume;
    audio.play().catch(err => {
      console.warn('Utter Offscreen: Could not play sound:', err);
    });
  } catch (err) {
    console.warn('Utter Offscreen: Could not play sound:', err);
  }
}

// Prime the selected microphone
async function primeSelectedMicrophone() {
  try {
    const constraints = {
      audio: settings.selectedMicrophone
        ? { deviceId: { exact: settings.selectedMicrophone } }
        : true
    };

    console.log('Utter Offscreen: Requesting microphone with constraints:', constraints);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('Utter Offscreen: Microphone access granted');
    return stream;
  } catch (err) {
    console.error('Utter Offscreen: Could not get microphone:', err);
    throw err;
  }
}

// Start speech recognition
async function startRecognition(sessionId) {
  console.log('Utter Offscreen: Starting recognition for session:', sessionId);

  // Stop any existing recognition
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      // Ignore
    }
    recognition = null;
  }

  // Clean up any existing mic stream
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  currentSessionId = sessionId;

  try {
    // Get microphone access first
    micStream = await primeSelectedMicrophone();

    // Create speech recognition instance
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Speech Recognition API not supported');
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onstart = () => {
      console.log('Utter Offscreen: Speech recognition started');
      playSound('beep.wav');
      sendToBackground({
        type: 'recognition-started',
        sessionId: currentSessionId
      });
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

      sendToBackground({
        type: 'recognition-result',
        sessionId: currentSessionId,
        finalTranscript,
        interimTranscript
      });
    };

    recognition.onerror = (event) => {
      console.warn('Utter Offscreen: Speech recognition error:', event.error);

      // Recoverable errors - just notify but don't stop
      if (event.error === 'no-speech' || event.error === 'aborted') {
        sendToBackground({
          type: 'recognition-error',
          sessionId: currentSessionId,
          error: event.error,
          recoverable: true
        });
        return;
      }

      // Fatal errors
      sendToBackground({
        type: 'recognition-error',
        sessionId: currentSessionId,
        error: event.error,
        recoverable: false
      });

      cleanup();
    };

    recognition.onend = () => {
      console.log('Utter Offscreen: Speech recognition ended');

      // If we still have an active session, restart
      if (recognition && currentSessionId === sessionId) {
        console.log('Utter Offscreen: Restarting recognition');
        try {
          recognition.start();
        } catch (err) {
          console.error('Utter Offscreen: Failed to restart:', err);
          sendToBackground({
            type: 'recognition-ended',
            sessionId: currentSessionId
          });
          cleanup();
        }
        return;
      }

      sendToBackground({
        type: 'recognition-ended',
        sessionId: currentSessionId
      });
    };

    recognition.start();
    return { success: true };
  } catch (err) {
    console.error('Utter Offscreen: Failed to start recognition:', err);
    cleanup();
    return { success: false, error: err.message };
  }
}

// Stop speech recognition
function stopRecognition(sessionId) {
  console.log('Utter Offscreen: Stopping recognition for session:', sessionId);

  if (currentSessionId !== sessionId) {
    console.log('Utter Offscreen: Session mismatch, ignoring stop request');
    return;
  }

  if (recognition) {
    const rec = recognition;
    recognition = null;
    currentSessionId = null;
    try {
      rec.stop();
    } catch {
      // Ignore
    }
  }

  playSound('boop.wav');
  cleanup();
}

function cleanup() {
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  recognition = null;
  currentSessionId = null;
}

function sendToBackground(message) {
  chrome.runtime.sendMessage(message).catch(err => {
    console.warn('Utter Offscreen: Could not send message to background:', err);
  });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Utter Offscreen: Received message:', message);

  if (message.target !== 'offscreen') {
    return;
  }

  switch (message.type) {
    case 'start-recognition':
      startRecognition(message.sessionId).then(result => {
        sendResponse(result);
      });
      return true; // Will respond asynchronously

    case 'stop-recognition':
      stopRecognition(message.sessionId);
      sendResponse({ success: true });
      break;

    default:
      console.warn('Utter Offscreen: Unknown message type:', message.type);
  }
});

console.log('Utter Offscreen: Document loaded and ready');
