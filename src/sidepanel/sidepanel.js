// Side panel script - handles speech recognition and displays history

// DOM elements
const historyList = document.getElementById('history-list');
const clearAllBtn = document.getElementById('clear-all');
const settingsBtn = document.getElementById('settings');
const recordingSection = document.getElementById('recording-section');
const interimTextEl = document.getElementById('interim-text');
const stopRecordingBtn = document.getElementById('stop-recording');

let history = [];

// Speech recognition state
let recognition = null;
let micStream = null;
let currentSessionId = null;

// Settings
let settings = {
  selectedMicrophone: '',
  soundFeedbackEnabled: true,
  audioVolume: 0.5
};

// Initialize
init();

async function init() {
  await loadSettings();
  await loadHistory();
  renderHistory();
  setupMessageListeners();
  setupStorageListeners();
  setupPortConnection();

  // Signal to background that sidepanel is ready
  chrome.runtime.sendMessage({ type: 'sidepanel-ready' }).catch(() => {
    // Background might not be listening yet, that's ok
  });
}

// Keep a port connection to background so it knows when we close
function setupPortConnection() {
  const port = chrome.runtime.connect({ name: 'sidepanel' });
  port.onDisconnect.addListener(() => {
    console.log('Utter Sidepanel: Disconnected from background');
  });
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
    console.error('Utter Sidepanel: Error loading settings:', err);
  }
}

function setupStorageListeners() {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.utterHistory) {
      history = changes.utterHistory.newValue || [];
      renderHistory();
    }
    if (changes.selectedMicrophone) {
      settings.selectedMicrophone = changes.selectedMicrophone.newValue || '';
    }
    if (changes.soundFeedbackEnabled) {
      settings.soundFeedbackEnabled = changes.soundFeedbackEnabled.newValue !== false;
    }
    if (changes.audioVolume) {
      settings.audioVolume = changes.audioVolume.newValue !== undefined ? changes.audioVolume.newValue : 0.5;
    }
  });

  // Reload history when sidepanel becomes visible
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await loadHistory();
      renderHistory();
    }
  });
}

function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Utter Sidepanel: Received message:', message);

    if (message.target !== 'sidepanel') {
      return;
    }

    switch (message.type) {
      case 'start-recognition':
        startRecognition(message.sessionId).then(result => {
          sendResponse(result);
        });
        return true; // Async response

      case 'stop-recognition':
        stopRecognition(message.sessionId);
        sendResponse({ success: true });
        break;

      default:
        console.warn('Utter Sidepanel: Unknown message type:', message.type);
    }
  });
}

// Audio feedback
function playSound(filename) {
  if (!settings.soundFeedbackEnabled) return;

  try {
    const audioUrl = chrome.runtime.getURL(`audio/${filename}`);
    const audio = new Audio(audioUrl);
    audio.volume = settings.audioVolume;
    audio.play().catch(err => {
      console.warn('Utter Sidepanel: Could not play sound:', err);
    });
  } catch (err) {
    console.warn('Utter Sidepanel: Could not play sound:', err);
  }
}

// Get microphone access
async function getMicrophoneAccess() {
  if (settings.selectedMicrophone) {
    try {
      const constraints = {
        audio: { deviceId: { exact: settings.selectedMicrophone } }
      };
      console.log('Utter Sidepanel: Requesting specific microphone:', settings.selectedMicrophone);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Utter Sidepanel: Microphone access granted');
      return stream;
    } catch (err) {
      if (err.name === 'OverconstrainedError') {
        console.warn('Utter Sidepanel: Selected microphone unavailable, falling back to default');
      } else {
        console.error('Utter Sidepanel: Could not get selected microphone:', err);
        throw err;
      }
    }
  }

  // Use default microphone
  console.log('Utter Sidepanel: Requesting default microphone');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  console.log('Utter Sidepanel: Default microphone access granted');
  return stream;
}

// Start speech recognition
async function startRecognition(sessionId) {
  console.log('Utter Sidepanel: Starting recognition for session:', sessionId);

  // Stop any existing recognition
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      // Ignore
    }
    recognition = null;
  }

  // Clean up existing mic stream
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  currentSessionId = sessionId;

  try {
    // Get microphone access first
    micStream = await getMicrophoneAccess();

    // Create speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Speech Recognition API not supported');
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onstart = () => {
      console.log('Utter Sidepanel: Speech recognition started');
      playSound('beep.wav');
      showRecordingUI();
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

      // Update interim text in UI
      if (interimTranscript) {
        interimTextEl.textContent = interimTranscript;
      }

      sendToBackground({
        type: 'recognition-result',
        sessionId: currentSessionId,
        finalTranscript,
        interimTranscript
      });
    };

    recognition.onerror = (event) => {
      console.warn('Utter Sidepanel: Speech recognition error:', event.error, 'message:', event.message);

      // Recoverable errors
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
      console.log('Utter Sidepanel: Speech recognition ended');

      // If we still have an active session, restart
      if (recognition && currentSessionId === sessionId) {
        console.log('Utter Sidepanel: Restarting recognition');
        try {
          recognition.start();
        } catch (err) {
          console.error('Utter Sidepanel: Failed to restart:', err);
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
      hideRecordingUI();
    };

    recognition.start();
    return { success: true };
  } catch (err) {
    console.error('Utter Sidepanel: Failed to start recognition:', err);
    cleanup();
    return { success: false, error: err.message };
  }
}

// Stop speech recognition
function stopRecognition(sessionId) {
  console.log('Utter Sidepanel: Stopping recognition for session:', sessionId);

  if (currentSessionId !== sessionId) {
    console.log('Utter Sidepanel: Session mismatch, ignoring stop request');
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
  hideRecordingUI();
}

function showRecordingUI() {
  recordingSection.classList.remove('hidden');
  interimTextEl.textContent = '';
}

function hideRecordingUI() {
  recordingSection.classList.add('hidden');
  interimTextEl.textContent = '';
}

function sendToBackground(message) {
  chrome.runtime.sendMessage(message).catch(err => {
    console.warn('Utter Sidepanel: Could not send message to background:', err);
  });
}

// Stop button handler
stopRecordingBtn.addEventListener('click', () => {
  if (currentSessionId) {
    sendToBackground({
      type: 'stop-recognition-request-from-sidepanel',
      sessionId: currentSessionId
    });
    stopRecognition(currentSessionId);
  }
});

// History functions
async function loadHistory() {
  try {
    const result = await chrome.storage.local.get(['utterHistory']);
    history = result.utterHistory || [];
  } catch (err) {
    console.error('Error loading history:', err);
    history = [];
  }
}

function renderHistory() {
  while (historyList.firstChild) {
    historyList.removeChild(historyList.firstChild);
  }

  if (history.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No voice inputs yet. Use the keyboard shortcut to start dictating.';
    historyList.appendChild(emptyState);
    return;
  }

  const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

  sortedHistory.forEach((item) => {
    const itemEl = createHistoryItem(item);
    historyList.appendChild(itemEl);
  });
}

function createDeleteIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M18 6L6 18M6 6l12 12');
  svg.appendChild(path);

  return svg;
}

function createHistoryItem(item) {
  const div = document.createElement('div');
  div.className = 'history-item';
  div.dataset.id = item.id;

  const header = document.createElement('div');
  header.className = 'history-item-header';

  const meta = document.createElement('div');
  meta.className = 'history-item-meta';

  const time = document.createElement('span');
  time.className = 'history-item-time';
  time.textContent = formatTime(item.timestamp);
  meta.appendChild(time);

  if (item.url) {
    const url = document.createElement('a');
    url.className = 'history-item-url';
    url.href = item.url;
    url.textContent = formatUrl(item.url);
    url.title = item.url;
    url.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: item.url });
    });
    meta.appendChild(url);
  }

  header.appendChild(meta);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-button danger history-item-delete';
  deleteBtn.title = 'Delete this entry';
  deleteBtn.appendChild(createDeleteIcon());
  deleteBtn.addEventListener('click', () => deleteItem(item.id));
  header.appendChild(deleteBtn);

  div.appendChild(header);

  const text = document.createElement('p');
  text.className = 'history-item-text';
  text.textContent = item.text;
  div.appendChild(text);

  return div;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });

  if (isToday) {
    return `Today at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });

  return `${dateStr} at ${timeStr}`;
}

function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '');
  } catch {
    return url;
  }
}

async function deleteItem(id) {
  history = history.filter(item => item.id !== id);
  await saveHistory();
  renderHistory();
}

async function clearAllHistory() {
  history = [];
  await saveHistory();
  renderHistory();
}

async function saveHistory() {
  try {
    await chrome.storage.local.set({ utterHistory: history });
  } catch (err) {
    console.error('Error saving history:', err);
  }
}

clearAllBtn.addEventListener('click', () => {
  if (history.length === 0) return;

  showConfirmDialog(
    'Clear All History',
    'Are you sure you want to delete all voice input history? This cannot be undone.',
    clearAllHistory
  );
});

function showConfirmDialog(title, message, onConfirm) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';

  const content = document.createElement('div');
  content.className = 'confirm-dialog-content';

  const h2 = document.createElement('h2');
  h2.textContent = title;
  content.appendChild(h2);

  const p = document.createElement('p');
  p.textContent = message;
  content.appendChild(p);

  const buttons = document.createElement('div');
  buttons.className = 'confirm-dialog-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.remove());
  buttons.appendChild(cancelBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-danger';
  confirmBtn.textContent = 'Delete';
  confirmBtn.addEventListener('click', () => {
    onConfirm();
    dialog.remove();
  });
  buttons.appendChild(confirmBtn);

  content.appendChild(buttons);
  dialog.appendChild(content);
  document.body.appendChild(dialog);

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.remove();
    }
  });
}

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

console.log('Utter Sidepanel: Loaded and ready');
