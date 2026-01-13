// Options page script

const microphoneSelect = document.getElementById('microphone-select');
const requestPermissionBtn = document.getElementById('request-permission');
const permissionStatus = document.getElementById('permission-status');
const saveStatus = document.getElementById('save-status');
const shortcutsLink = document.getElementById('shortcuts-link');

// Activation mode elements
const activationModeRadios = document.querySelectorAll('input[name="activation-mode"]');
const toggleSettings = document.getElementById('toggle-settings');
const pttSettings = document.getElementById('ptt-settings');

// Push-to-talk elements
const pttComboInput = document.getElementById('ptt-combo');
const recordComboBtn = document.getElementById('record-combo');
const clearComboBtn = document.getElementById('clear-combo');
const pttStatus = document.getElementById('ptt-status');

let isRecording = false;

// Chrome doesn't allow direct links to chrome:// URLs, so we handle it
shortcutsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// Load saved settings and populate devices
init();

async function init() {
  await loadDevices();
  await loadSavedSettings();

  // Re-enumerate devices when permission changes
  navigator.mediaDevices.addEventListener('devicechange', loadDevices);
}

async function loadDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');

    // Clear existing options
    while (microphoneSelect.firstChild) {
      microphoneSelect.removeChild(microphoneSelect.firstChild);
    }

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'System Default';
    microphoneSelect.appendChild(defaultOption);

    if (audioInputs.length === 0) {
      showPermissionStatus('No microphones found. Click "Request Microphone Permission" to grant access.', 'error');
      return;
    }

    // Check if we have labels (indicates permission was granted)
    const hasLabels = audioInputs.some(d => d.label);

    if (!hasLabels) {
      showPermissionStatus('Grant microphone permission to see device names.', 'error');
    } else {
      permissionStatus.textContent = '';
      permissionStatus.className = 'status';
    }

    audioInputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      microphoneSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Error enumerating devices:', err);
    showPermissionStatus('Error loading devices: ' + err.message, 'error');
  }
}

async function loadSavedSettings() {
  try {
    const result = await chrome.storage.local.get([
      'selectedMicrophone',
      'activationMode',
      'pttKeyCombo'
    ]);

    if (result.selectedMicrophone) {
      microphoneSelect.value = result.selectedMicrophone;
    }

    // Set activation mode
    const mode = result.activationMode || 'toggle';
    document.querySelector(`input[name="activation-mode"][value="${mode}"]`).checked = true;
    updateActivationModeUI(mode);

    // Set PTT key combo
    if (result.pttKeyCombo) {
      pttComboInput.value = formatKeyCombo(result.pttKeyCombo);
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// Request microphone permission
requestPermissionBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately - we just needed permission
    stream.getTracks().forEach(track => track.stop());

    showPermissionStatus('Permission granted!', 'success');
    await loadDevices();
    await loadSavedSettings();
  } catch (err) {
    console.error('Permission error:', err);
    showPermissionStatus('Permission denied: ' + err.message, 'error');
  }
});

// Save microphone selection when changed
microphoneSelect.addEventListener('change', async () => {
  try {
    await chrome.storage.local.set({
      selectedMicrophone: microphoneSelect.value
    });
    showSaveStatus();
  } catch (err) {
    console.error('Error saving settings:', err);
  }
});

// Activation mode change
activationModeRadios.forEach(radio => {
  radio.addEventListener('change', async (e) => {
    const mode = e.target.value;
    updateActivationModeUI(mode);

    try {
      await chrome.storage.local.set({ activationMode: mode });
      showSaveStatus();
    } catch (err) {
      console.error('Error saving activation mode:', err);
    }
  });
});

function updateActivationModeUI(mode) {
  if (mode === 'push-to-talk') {
    toggleSettings.classList.add('hidden');
    pttSettings.classList.remove('hidden');
  } else {
    toggleSettings.classList.remove('hidden');
    pttSettings.classList.add('hidden');
  }
}

// Key combo recording
recordComboBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

clearComboBtn.addEventListener('click', async () => {
  pttComboInput.value = '';
  try {
    await chrome.storage.local.remove('pttKeyCombo');
    showSaveStatus();
    showPttStatus('Key combo cleared', 'success');
  } catch (err) {
    console.error('Error clearing key combo:', err);
  }
});

function startRecording() {
  isRecording = true;
  recordComboBtn.textContent = 'Press keys...';
  pttComboInput.classList.add('recording');
  pttComboInput.value = '';
  pttComboInput.placeholder = 'Press your key combination...';
  document.addEventListener('keydown', handleKeyDown);
}

function stopRecording() {
  isRecording = false;
  recordComboBtn.textContent = 'Record';
  pttComboInput.classList.remove('recording');
  pttComboInput.placeholder = 'Click Record to set';
  document.removeEventListener('keydown', handleKeyDown);
}

async function handleKeyDown(e) {
  e.preventDefault();
  e.stopPropagation();

  // Ignore lone modifier keys
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    return;
  }

  const combo = {
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    key: e.key,
    code: e.code
  };

  pttComboInput.value = formatKeyCombo(combo);
  stopRecording();

  try {
    await chrome.storage.local.set({ pttKeyCombo: combo });
    showSaveStatus();
    showPttStatus('Key combo saved!', 'success');
  } catch (err) {
    console.error('Error saving key combo:', err);
    showPttStatus('Error saving key combo', 'error');
  }
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

function showPermissionStatus(message, type) {
  permissionStatus.textContent = message;
  permissionStatus.className = `status ${type}`;
}

function showPttStatus(message, type) {
  pttStatus.textContent = message;
  pttStatus.className = `status ${type}`;
  setTimeout(() => {
    pttStatus.textContent = '';
    pttStatus.className = 'status';
  }, 3000);
}

function showSaveStatus() {
  saveStatus.textContent = 'Settings saved';
  saveStatus.classList.add('visible');
  setTimeout(() => {
    saveStatus.classList.remove('visible');
  }, 2000);
}
