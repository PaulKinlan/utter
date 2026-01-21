// Offscreen document for speech recognition fallback
// Used when iframe-based recognition fails due to page CSP or Permissions-Policy

(function() {

/**
 * @typedef {Object} AudioDevicePriority
 * @property {string} deviceId
 * @property {string} label
 * @property {number} lastSeen
 */

/** @type {{audioDevicePriority: AudioDevicePriority[], soundFeedbackEnabled: boolean, audioVolume: number}} */
let settings = {
  audioDevicePriority: [],
  soundFeedbackEnabled: true,
  audioVolume: 0.5
};

/** @type {any} */
let recognition = null;
/** @type {MediaStream | null} */
let micStream = null;
/** @type {MediaRecorder | null} */
let mediaRecorder = null;
/** @type {Blob[]} */
let audioChunks = [];
let lastInterimTranscript = '';
let sessionId = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen-recognition') return false;

  switch (message.type) {
    case 'start':
      sessionId = message.sessionId;
      startRecognition()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Will respond asynchronously

    case 'stop':
      stopRecognition();
      sendResponse({ success: true });
      return false;

    default:
      return false;
  }
});

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      'audioDevicePriority',
      'selectedMicrophone',
      'soundFeedbackEnabled',
      'audioVolume'
    ]);
    settings.audioDevicePriority = Array.isArray(result.audioDevicePriority)
      ? result.audioDevicePriority
      : [];

    if (result.selectedMicrophone && settings.audioDevicePriority.length === 0) {
      settings.audioDevicePriority = [{
        deviceId: /** @type {string} */ (result.selectedMicrophone),
        label: 'Migrated Device',
        lastSeen: Date.now()
      }];
    }

    settings.soundFeedbackEnabled = result.soundFeedbackEnabled !== false;
    settings.audioVolume = typeof result.audioVolume === 'number' ? result.audioVolume : 0.5;
  } catch (err) {
    console.error('Utter Offscreen: Error loading settings:', err);
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
  const devices = await navigator.mediaDevices.enumerateDevices();
  const connectedDeviceIds = new Set(
    devices.filter(d => d.kind === 'audioinput').map(d => d.deviceId)
  );

  for (const priorityDevice of settings.audioDevicePriority) {
    if (connectedDeviceIds.has(priorityDevice.deviceId)) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: priorityDevice.deviceId } }
        });
        console.log('Utter Offscreen: Using device:', priorityDevice.label);
        return stream;
      } catch (err) {
        if (err.name !== 'OverconstrainedError') {
          throw err;
        }
        console.warn('Utter Offscreen: Device unavailable, trying next:', priorityDevice.label);
      }
    }
  }

  console.log('Utter Offscreen: Using system default microphone');
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

async function startRecognition() {
  await loadSettings();

  micStream = await getMicrophoneAccess();
  startAudioRecording();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error('Speech Recognition not supported');
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  recognition.onstart = () => {
    playSound('beep.wav');
    sendToBackground({ type: 'recognition-started', sessionId });
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
    }
    if (finalTranscript) {
      lastInterimTranscript = '';
    }

    sendToBackground({
      type: 'recognition-result',
      sessionId,
      finalTranscript,
      interimTranscript
    });
  };

  recognition.onerror = (event) => {
    console.warn('Utter Offscreen: Error:', event.error);

    if (event.error === 'no-speech' || event.error === 'aborted') {
      sendToBackground({ type: 'recognition-error', sessionId, error: event.error, recoverable: true });
      return;
    }

    sendToBackground({ type: 'recognition-error', sessionId, error: event.error, recoverable: false });
  };

  recognition.onend = () => {
    if (recognition) {
      try {
        recognition.start();
      } catch {
        sendToBackground({ type: 'recognition-ended', sessionId });
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
    console.error('Utter Offscreen: Failed to start audio recording:', err);
  }
}

async function stopAudioRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return null;

  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result);
      };
      reader.readAsDataURL(audioBlob);
    };

    try {
      mediaRecorder.stop();
    } catch (err) {
      console.error('Utter Offscreen: Failed to stop audio recording:', err);
      resolve(null);
    }
  });
}

async function stopRecognition() {
  // Send any pending interim text as final
  if (lastInterimTranscript) {
    sendToBackground({
      type: 'recognition-result',
      sessionId,
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

  const audioDataUrl = await stopAudioRecording();

  playSound('boop.wav');
  sendToBackground({
    type: 'recognition-ended',
    sessionId,
    audioDataUrl
  });
  cleanup();
}

function cleanup() {
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
  sessionId = null;
}

function sendToBackground(message) {
  chrome.runtime.sendMessage({
    source: 'offscreen-recognition',
    ...message
  }).catch(() => {
    // Background might not be listening, ignore
  });
}

console.log('Utter Offscreen: Loaded');

})();
