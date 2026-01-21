// Side panel script - handles speech recognition and displays history

(function() {

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id
 * @property {string} text
 * @property {string} [refinedText]
 * @property {number} timestamp
 * @property {string} url
 * @property {string} [audioDataUrl]
 */

/**
 * @typedef {Object} KeyCombo
 * @property {boolean} ctrlKey
 * @property {boolean} shiftKey
 * @property {boolean} altKey
 * @property {boolean} metaKey
 * @property {string} key
 * @property {string} code
 */

/**
 * @typedef {Object} CustomRefinementPrompt
 * @property {string} id
 * @property {string} name
 * @property {string} prompt
 * @property {KeyCombo} [hotkey]
 */

// DOM elements
const historyList = document.getElementById('history-list');
const clearAllBtn = document.getElementById('clear-all');
const settingsBtn = document.getElementById('settings');
const recordingSection = document.getElementById('recording-section');
const interimTextEl = document.getElementById('interim-text');
const stopRecordingBtn = document.getElementById('stop-recording');

/** @type {HistoryEntry[]} */
let history = [];

// Shortcuts info
/** @type {string | null} */
let toggleShortcut = null;
/** @type {KeyCombo | null} */
let pttKeyCombo = null;
let refinementEnabled = false;
/** @type {Object<string, KeyCombo>} */
let refinementHotkeys = {};
/** @type {CustomRefinementPrompt[]} */
let customRefinementPrompts = [];

// Preset prompt names for display
const PRESET_NAMES = {
  'basic-cleanup': 'Basic Cleanup',
  'remove-filler': 'Remove Filler',
  'formal': 'Formal',
  'friendly': 'Friendly',
  'concise': 'Concise'
};

// Speech recognition state
/** @type {any} */
let recognition = null;
/** @type {MediaStream | null} */
let micStream = null;
/** @type {MediaRecorder | null} */
let mediaRecorder = null;
/** @type {Blob[]} */
let audioChunks = [];
let sessionText = ''; // Accumulate all final text from this session
/** @type {string | null} */
let currentSessionId = null;
let lastInterimTranscript = ''; // Track last interim text for when recognition stops

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
  await loadShortcuts();
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
    settings.selectedMicrophone = typeof result.selectedMicrophone === 'string' ? result.selectedMicrophone : '';
    settings.soundFeedbackEnabled = result.soundFeedbackEnabled !== false;
    settings.audioVolume = typeof result.audioVolume === 'number' ? result.audioVolume : 0.5;
  } catch (err) {
    console.error('Utter Sidepanel: Error loading settings:', err);
  }
}

async function loadShortcuts() {
  try {
    // Get the toggle shortcut from Chrome commands API
    const commands = await chrome.commands.getAll();
    const toggleCommand = commands.find(cmd => cmd.name === 'toggle-voice-input');
    if (toggleCommand?.shortcut) {
      toggleShortcut = toggleCommand.shortcut;
    }

    // Get push-to-talk and refinement settings from storage
    const result = await chrome.storage.local.get([
      'pttKeyCombo',
      'refinementEnabled',
      'refinementHotkeys',
      'customRefinementPrompts'
    ]);
    if (result.pttKeyCombo) {
      pttKeyCombo = /** @type {KeyCombo} */ (result.pttKeyCombo);
    }
    refinementEnabled = result.refinementEnabled === true;
    const hotkeys = result.refinementHotkeys;
    refinementHotkeys = (hotkeys && typeof hotkeys === 'object' && !Array.isArray(hotkeys))
      ? /** @type {Object<string, KeyCombo>} */ (hotkeys)
      : {};
    customRefinementPrompts = Array.isArray(result.customRefinementPrompts)
      ? /** @type {CustomRefinementPrompt[]} */ (result.customRefinementPrompts)
      : [];
  } catch (err) {
    console.error('Utter Sidepanel: Error loading shortcuts:', err);
  }
}

function setupStorageListeners() {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.utterHistory) {
      history = Array.isArray(changes.utterHistory.newValue)
        ? /** @type {HistoryEntry[]} */ (changes.utterHistory.newValue)
        : [];
      renderHistory();
    }
    if (changes.selectedMicrophone) {
      settings.selectedMicrophone = typeof changes.selectedMicrophone.newValue === 'string'
        ? changes.selectedMicrophone.newValue
        : '';
    }
    if (changes.soundFeedbackEnabled) {
      settings.soundFeedbackEnabled = changes.soundFeedbackEnabled.newValue !== false;
    }
    if (changes.audioVolume) {
      settings.audioVolume = typeof changes.audioVolume.newValue === 'number'
        ? changes.audioVolume.newValue
        : 0.5;
    }
    if (changes.pttKeyCombo) {
      pttKeyCombo = changes.pttKeyCombo.newValue
        ? /** @type {KeyCombo} */ (changes.pttKeyCombo.newValue)
        : null;
      // Re-render if showing empty state to update shortcuts display
      if (history.length === 0) {
        renderHistory();
      }
    }
    if (changes.refinementEnabled) {
      refinementEnabled = changes.refinementEnabled.newValue === true;
      // Re-render if showing empty state to update shortcuts display
      if (history.length === 0) {
        renderHistory();
      }
    }
    if (changes.refinementHotkeys) {
      const newHotkeys = changes.refinementHotkeys.newValue;
      refinementHotkeys = (newHotkeys && typeof newHotkeys === 'object' && !Array.isArray(newHotkeys))
        ? /** @type {Object<string, KeyCombo>} */ (newHotkeys)
        : {};
      // Re-render if showing empty state to update shortcuts display
      if (history.length === 0) {
        renderHistory();
      }
    }
    if (changes.customRefinementPrompts) {
      customRefinementPrompts = Array.isArray(changes.customRefinementPrompts.newValue)
        ? /** @type {CustomRefinementPrompt[]} */ (changes.customRefinementPrompts.newValue)
        : [];
      // Re-render if showing empty state to update shortcuts display
      if (history.length === 0) {
        renderHistory();
      }
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
  lastInterimTranscript = ''; // Clear any stale interim text from previous session
  sessionText = ''; // Clear accumulated text from previous session

  try {
    // Get microphone access first
    micStream = await getMicrophoneAccess();

    // Start audio recording
    startAudioRecording();

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

      // Track last interim text for when recognition stops
      if (interimTranscript) {
        lastInterimTranscript = interimTranscript;
      }
      // Clear interim tracking and accumulate final text
      if (finalTranscript) {
        lastInterimTranscript = '';
        sessionText += finalTranscript;
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
    console.log('Utter Sidepanel: Audio recording started');
  } catch (err) {
    console.error('Utter Sidepanel: Failed to start audio recording:', err);
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
      console.log('Utter Sidepanel: Audio recording stopped');
    } catch (err) {
      console.error('Utter Sidepanel: Failed to stop audio recording:', err);
      resolve(null);
    }
  });
}

// Stop speech recognition
async function stopRecognition(sessionId) {
  console.log('Utter Sidepanel: Stopping recognition for session:', sessionId);

  if (currentSessionId !== sessionId) {
    console.log('Utter Sidepanel: Session mismatch, ignoring stop request');
    return;
  }

  // If there's pending interim text, add it to session text
  if (lastInterimTranscript) {
    console.log('Utter Sidepanel: Adding pending interim text as final:', lastInterimTranscript);
    sessionText += lastInterimTranscript;
    lastInterimTranscript = '';
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

  // Stop audio recording and get audio data
  const audioDataUrl = await stopAudioRecording();

  // Save to history if we have any text
  if (sessionText) {
    await saveTranscriptionToHistory(sessionText, audioDataUrl);
  }

  playSound('boop.wav');
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
  currentSessionId = null;
  lastInterimTranscript = '';
  sessionText = '';
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
    history = Array.isArray(result.utterHistory)
      ? /** @type {HistoryEntry[]} */ (result.utterHistory)
      : [];
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
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.id = 'empty-state';

    const title = document.createElement('p');
    title.className = 'empty-state-title';
    title.textContent = 'No voice inputs yet';
    emptyState.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'empty-state-subtitle';
    subtitle.textContent = 'Use a keyboard shortcut to start dictating';
    emptyState.appendChild(subtitle);

    const shortcuts = document.createElement('div');
    shortcuts.className = 'shortcuts-container';
    shortcuts.id = 'shortcuts-container';
    renderShortcuts(shortcuts);
    emptyState.appendChild(shortcuts);

    historyList.appendChild(emptyState);
    return;
  }

  const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

  sortedHistory.forEach((item) => {
    const itemEl = createHistoryItem(item);
    historyList.appendChild(itemEl);
  });
}

function renderShortcuts(container) {
  // Toggle shortcut
  if (toggleShortcut) {
    const toggleItem = createShortcutItem('Toggle', toggleShortcut);
    container.appendChild(toggleItem);
  }

  // Push-to-talk shortcut
  if (pttKeyCombo) {
    const pttDisplay = formatKeyCombo(pttKeyCombo);
    const pttItem = createShortcutItem('Push-to-Talk', pttDisplay);
    container.appendChild(pttItem);
  }

  // Refinement shortcuts (only show if refinement is enabled)
  if (refinementEnabled) {
    let hasAnyRefinementHotkey = false;

    // Show preset refinement hotkeys
    for (const [promptId, combo] of Object.entries(refinementHotkeys)) {
      if (combo) {
        const displayName = PRESET_NAMES[promptId] || promptId;
        const hotkeyDisplay = formatKeyCombo(combo);
        const hotkeyItem = createShortcutItem(`Refine: ${displayName}`, hotkeyDisplay);
        container.appendChild(hotkeyItem);
        hasAnyRefinementHotkey = true;
      }
    }

    // Show custom prompt hotkeys
    for (const customPrompt of customRefinementPrompts) {
      if (customPrompt.hotkey) {
        const hotkeyDisplay = formatKeyCombo(customPrompt.hotkey);
        const hotkeyItem = createShortcutItem(`Refine: ${customPrompt.name}`, hotkeyDisplay);
        container.appendChild(hotkeyItem);
        hasAnyRefinementHotkey = true;
      }
    }

    // If refinement is enabled but no hotkeys are set, show hint
    if (!hasAnyRefinementHotkey) {
      const hint = document.createElement('p');
      hint.className = 'shortcut-not-set';
      hint.textContent = 'Configure refinement hotkeys in Settings';
      container.appendChild(hint);
    }
  }

  // If no shortcuts are set at all, show a hint
  if (!toggleShortcut && !pttKeyCombo && !refinementEnabled) {
    const hint = document.createElement('p');
    hint.className = 'shortcut-not-set';
    hint.textContent = 'Configure shortcuts in Settings';
    container.appendChild(hint);
  }
}

function createShortcutItem(label, shortcutString) {
  const item = document.createElement('div');
  item.className = 'shortcut-item';

  const labelEl = document.createElement('span');
  labelEl.className = 'shortcut-label';
  labelEl.textContent = label;
  item.appendChild(labelEl);

  const keysContainer = document.createElement('div');
  keysContainer.className = 'shortcut-keys';

  // Parse the shortcut string and create key elements
  // Chrome uses formats like "Ctrl+Shift+U" or "⌘+Shift+U"
  const keys = shortcutString.split('+');
  keys.forEach((key, index) => {
    if (index > 0) {
      const separator = document.createElement('span');
      separator.className = 'key-separator';
      separator.textContent = '+';
      keysContainer.appendChild(separator);
    }

    const keyEl = document.createElement('span');
    keyEl.className = 'key';
    keyEl.textContent = key.trim();
    keysContainer.appendChild(keyEl);
  });

  item.appendChild(keysContainer);
  return item;
}

function formatKeyCombo(combo) {
  const parts = [];
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (combo.ctrlKey) parts.push('Ctrl');
  if (combo.altKey) parts.push(isMac ? 'Option' : 'Alt');
  if (combo.shiftKey) parts.push('Shift');
  if (combo.metaKey) parts.push(isMac ? 'Cmd' : 'Win');

  // Format the key nicely
  let keyDisplay = combo.key;
  if (combo.key === ' ') keyDisplay = 'Space';
  else if (combo.key === '.') keyDisplay = '.';
  else if (combo.key.length === 1) keyDisplay = combo.key.toUpperCase();

  parts.push(keyDisplay);

  return parts.join('+');
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

function createDownloadTextIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  // Document outline
  const doc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  doc.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
  svg.appendChild(doc);

  // Fold corner
  const fold = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  fold.setAttribute('points', '14 2 14 8 20 8');
  svg.appendChild(fold);

  // Text lines
  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '8');
  line1.setAttribute('y1', '13');
  line1.setAttribute('x2', '16');
  line1.setAttribute('y2', '13');
  svg.appendChild(line1);

  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '8');
  line2.setAttribute('y1', '17');
  line2.setAttribute('x2', '14');
  line2.setAttribute('y2', '17');
  svg.appendChild(line2);

  return svg;
}

function createDownloadAudioIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  // Music note
  const note = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  note.setAttribute('d', 'M9 18V5l12-2v13');
  svg.appendChild(note);

  // First circle (bottom left)
  const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle1.setAttribute('cx', '6');
  circle1.setAttribute('cy', '18');
  circle1.setAttribute('r', '3');
  svg.appendChild(circle1);

  // Second circle (bottom right)
  const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle2.setAttribute('cx', '18');
  circle2.setAttribute('cy', '16');
  circle2.setAttribute('r', '3');
  svg.appendChild(circle2);

  return svg;
}

function createAudioPlayer(audioDataUrl, itemId) {
  const container = document.createElement('div');
  container.className = 'audio-player';
  container.dataset.itemId = itemId;

  const audio = new Audio(audioDataUrl);

  // Control bar
  const controls = document.createElement('div');
  controls.className = 'audio-controls';

  // Play/pause button
  const playBtn = document.createElement('button');
  playBtn.className = 'audio-play-btn';
  playBtn.innerHTML = '▶'; // Play icon
  playBtn.title = 'Play';

  let isPlaying = false;
  playBtn.addEventListener('click', () => {
    if (isPlaying) {
      audio.pause();
      playBtn.innerHTML = '▶';
      playBtn.title = 'Play';
      isPlaying = false;
    } else {
      audio.play();
      playBtn.innerHTML = '⏸'; // Pause icon
      playBtn.title = 'Pause';
      isPlaying = true;
    }
  });

  audio.addEventListener('ended', () => {
    playBtn.innerHTML = '▶';
    playBtn.title = 'Play';
    isPlaying = false;
  });

  controls.appendChild(playBtn);

  // Time display
  const timeDisplay = document.createElement('span');
  timeDisplay.className = 'audio-time';
  timeDisplay.textContent = '0:00 / 0:00';
  controls.appendChild(timeDisplay);

  // Visualizer canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'audio-visualizer';
  canvas.width = 400;
  canvas.height = 60;

  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'audio-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'audio-progress-fill';
  progressBar.appendChild(progressFill);

  // Update progress
  audio.addEventListener('loadedmetadata', () => {
    const duration = formatDuration(audio.duration);
    timeDisplay.textContent = `0:00 / ${duration}`;
  });

  audio.addEventListener('timeupdate', () => {
    const current = formatDuration(audio.currentTime);
    const duration = formatDuration(audio.duration);
    timeDisplay.textContent = `${current} / ${duration}`;

    const progress = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = `${progress}%`;
  });

  // Click on progress bar to seek
  progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    audio.currentTime = percent * audio.duration;
  });

  // Create visualizer
  const ctx = canvas.getContext('2d');
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function drawVisualizer() {
    if (!isPlaying) {
      requestAnimationFrame(drawVisualizer);
      return;
    }

    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = 'rgb(245, 245, 245)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      barHeight = (dataArray[i] / 255) * canvas.height;

      // Gradient color
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#6366f1');
      gradient.addColorStop(1, '#8b5cf6');
      ctx.fillStyle = gradient;

      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

      x += barWidth + 1;
    }

    requestAnimationFrame(drawVisualizer);
  }

  drawVisualizer();

  container.appendChild(controls);
  container.appendChild(canvas);
  container.appendChild(progressBar);

  return container;
}

function formatDuration(seconds) {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function downloadText(item) {
  // If refined text exists, create a file with both versions
  let content;
  let filename;

  if (item.refinedText) {
    content = `ORIGINAL:\n${item.text}\n\n---\n\nREFINED:\n${item.refinedText}`;
    filename = `transcription-refined-${item.id}.txt`;
  } else {
    content = item.text;
    filename = `transcription-${item.id}.txt`;
  }

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAudio(item) {
  if (!item.audioDataUrl) return;

  const a = document.createElement('a');
  a.href = item.audioDataUrl;
  a.download = `recording-${item.id}.webm`;
  a.click();
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

  // If refined text exists, show both original and refined
  if (item.refinedText) {
    const textContainer = document.createElement('div');
    textContainer.className = 'history-item-text-container';

    const originalSection = document.createElement('div');
    originalSection.className = 'history-item-text-section';

    const originalLabel = document.createElement('div');
    originalLabel.className = 'history-item-text-label';
    originalLabel.textContent = 'Original';
    originalSection.appendChild(originalLabel);

    const originalText = document.createElement('p');
    originalText.className = 'history-item-text original';
    originalText.textContent = item.text;
    originalSection.appendChild(originalText);

    const refinedSection = document.createElement('div');
    refinedSection.className = 'history-item-text-section';

    const refinedLabel = document.createElement('div');
    refinedLabel.className = 'history-item-text-label refined';
    refinedLabel.textContent = 'Refined';
    refinedSection.appendChild(refinedLabel);

    const refinedText = document.createElement('p');
    refinedText.className = 'history-item-text refined';
    refinedText.textContent = item.refinedText;
    refinedSection.appendChild(refinedText);

    textContainer.appendChild(originalSection);
    textContainer.appendChild(refinedSection);
    div.appendChild(textContainer);
  } else {
    // Show only original text
    const text = document.createElement('p');
    text.className = 'history-item-text';
    text.textContent = item.text;
    div.appendChild(text);
  }

  // Add audio player if audio data exists
  if (item.audioDataUrl) {
    const audioPlayer = createAudioPlayer(item.audioDataUrl, item.id);
    div.appendChild(audioPlayer);
  }

  // Add action buttons
  const actions = document.createElement('div');
  actions.className = 'history-item-actions';

  // Download text button
  const downloadTextBtn = document.createElement('button');
  downloadTextBtn.className = 'icon-button';
  downloadTextBtn.title = 'Download text';
  downloadTextBtn.appendChild(createDownloadTextIcon());
  downloadTextBtn.addEventListener('click', () => downloadText(item));
  actions.appendChild(downloadTextBtn);

  // Download audio button (if audio exists)
  if (item.audioDataUrl) {
    const downloadAudioBtn = document.createElement('button');
    downloadAudioBtn.className = 'icon-button';
    downloadAudioBtn.title = 'Download audio';
    downloadAudioBtn.appendChild(createDownloadAudioIcon());
    downloadAudioBtn.addEventListener('click', () => downloadAudio(item));
    actions.appendChild(downloadAudioBtn);
  }

  div.appendChild(actions);

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

async function saveTranscriptionToHistory(text, audioDataUrl = null) {
  try {
    const entry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      text: text,
      timestamp: Date.now(),
      url: 'Sidepanel Recording' // Mark as sidepanel recording
    };

    // Add audio data if available
    if (audioDataUrl) {
      entry.audioDataUrl = audioDataUrl;
    }

    history.push(entry);
    const trimmedHistory = history.slice(-500); // Keep last 500 entries
    history = trimmedHistory;

    await chrome.storage.local.set({ utterHistory: trimmedHistory });
    console.log('Utter Sidepanel: Saved to history with audio:', !!audioDataUrl);

    // Refresh the UI
    renderHistory();
  } catch (err) {
    console.error('Utter Sidepanel: Error saving to history:', err);
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

})();
