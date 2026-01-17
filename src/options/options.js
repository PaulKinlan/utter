// Options page script

import { PRESET_PROMPTS, checkAvailability, getAvailablePrompts, ensureModelReady } from '../refinement-service.js';

const microphoneSelect = document.getElementById('microphone-select');
const microphoneField = document.getElementById('microphone-field');
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

// Sound feedback element
const soundFeedbackCheckbox = document.getElementById('sound-feedback');

// Volume control elements
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const testSoundBtn = document.getElementById('test-sound');

// Refinement elements
const refinementEnabledCheckbox = document.getElementById('refinement-enabled');
const refinementDownloadStatus = document.getElementById('refinement-download-status');
const refinementSettings = document.getElementById('refinement-settings');
const customPromptsList = document.getElementById('custom-prompts-list');
const addCustomPromptBtn = document.getElementById('add-custom-prompt');
const refinementHotkeysList = document.getElementById('refinement-hotkeys-list');
const refinementHotkeyStatus = document.getElementById('refinement-hotkey-status');
const apiStatus = document.getElementById('api-status');


// Chrome commands for conflict detection
let chromeCommands = [];

// Modal elements
const customPromptModal = document.getElementById('custom-prompt-modal');
const customPromptName = document.getElementById('custom-prompt-name');
const customPromptDescription = document.getElementById('custom-prompt-description');
const customPromptText = document.getElementById('custom-prompt-text');
const saveCustomPromptBtn = document.getElementById('save-custom-prompt');
const cancelCustomPromptBtn = document.getElementById('cancel-custom-prompt');

let isRecording = false;
let activeRecordingPromptId = null; // Track which prompt hotkey is being recorded

// Chrome doesn't allow direct links to chrome:// URLs, so we handle it
shortcutsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// Load saved settings and populate devices
init();

async function init() {
  await loadDevices();
  await loadChromeCommands();
  await loadSavedSettings();
  await checkApiAvailability();
  await loadRefinementPrompts();
  await renderRefinementHotkeys();

  // Re-enumerate devices when permission changes
  navigator.mediaDevices.addEventListener('devicechange', loadDevices);
}

async function loadChromeCommands() {
  try {
    chromeCommands = await chrome.commands.getAll();
  } catch (err) {
    console.error('Error loading Chrome commands:', err);
    chromeCommands = [];
  }
}

function detectConflict(combo) {
  if (!combo) return null;

  // Format combo to match Chrome's format (e.g., "Ctrl+Shift+U")
  const parts = [];
  if (combo.ctrlKey) parts.push('Ctrl');
  if (combo.altKey) parts.push('Alt');
  if (combo.shiftKey) parts.push('Shift');
  if (combo.metaKey) parts.push('Command');

  let keyDisplay = combo.key.toUpperCase();
  if (combo.key === ' ') keyDisplay = 'Space';
  parts.push(keyDisplay);

  const formatted = parts.join('+');

  // Check against Chrome commands
  for (const cmd of chromeCommands) {
    if (cmd.shortcut && cmd.shortcut.toUpperCase() === formatted.toUpperCase()) {
      return cmd.description || cmd.name;
    }
  }

  return null;
}

async function loadDevices() {
  try {
    // First check if we have permission using the Permissions API
    let hasPermission = false;
    try {
      const permissionResult = await navigator.permissions.query({ name: 'microphone' });
      hasPermission = permissionResult.state === 'granted';
    } catch {
      // Permissions API not supported, fall back to checking device labels
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      hasPermission = audioInputs.some(d => d.label);
    }

    if (!hasPermission) {
      // Permission not granted - hide dropdown and show request button
      microphoneField.classList.add('hidden');
      requestPermissionBtn.classList.remove('hidden');
      showPermissionStatus('Microphone permission is required to select an audio input device.', 'error');
      return;
    }

    // Permission granted - show dropdown and hide request button
    microphoneField.classList.remove('hidden');
    requestPermissionBtn.classList.add('hidden');
    permissionStatus.textContent = '';
    permissionStatus.className = 'status';

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
      showPermissionStatus('No microphones found.', 'error');
      return;
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
      'pttKeyCombo',
      'soundFeedbackEnabled',
      'audioVolume',
      'refinementEnabled',
      'selectedRefinementPrompt'
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

    // Set sound feedback (default to true if not set)
    soundFeedbackCheckbox.checked = result.soundFeedbackEnabled !== false;

    // Set volume (default to 50% if not set)
    const volume = result.audioVolume !== undefined ? result.audioVolume : 0.5;
    volumeSlider.value = Math.round(volume * 100);
    volumeValue.textContent = `${Math.round(volume * 100)}%`;

    // Set refinement settings (default to false for new installs)
    const refinementEnabled = result.refinementEnabled === true;
    refinementEnabledCheckbox.checked = refinementEnabled;
    updateRefinementSettingsUI(refinementEnabled);

    // Refinement hotkeys are loaded separately in renderRefinementHotkeys()
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

    // Reload devices - this will show the dropdown and hide the button
    await loadDevices();
    await loadSavedSettings();
    showPermissionStatus('Permission granted! You can now select a microphone.', 'success');
  } catch (err) {
    console.error('Permission error:', err);
    if (err.name === 'NotAllowedError') {
      showPermissionStatus('Permission denied. Please allow microphone access in your browser settings.', 'error');
    } else {
      showPermissionStatus('Error: ' + err.message, 'error');
    }
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

// Sound feedback change
soundFeedbackCheckbox.addEventListener('change', async () => {
  try {
    await chrome.storage.local.set({
      soundFeedbackEnabled: soundFeedbackCheckbox.checked
    });
    showSaveStatus();
  } catch (err) {
    console.error('Error saving sound feedback setting:', err);
  }
});

// Volume slider change
volumeSlider.addEventListener('input', () => {
  volumeValue.textContent = `${volumeSlider.value}%`;
});

volumeSlider.addEventListener('change', async () => {
  try {
    const volume = parseInt(volumeSlider.value, 10) / 100;
    await chrome.storage.local.set({ audioVolume: volume });
    showSaveStatus();
  } catch (err) {
    console.error('Error saving volume setting:', err);
  }
});

// Test sound button
testSoundBtn.addEventListener('click', () => {
  const volume = parseInt(volumeSlider.value, 10) / 100;
  const audioUrl = chrome.runtime.getURL('audio/beep.wav');
  const audio = new Audio(audioUrl);
  audio.volume = volume;
  audio.play().catch(err => {
    console.warn('Could not play test sound:', err);
  });
});

// Refinement enabled change
refinementEnabledCheckbox.addEventListener('change', async () => {
  const enabled = refinementEnabledCheckbox.checked;

  if (enabled) {
    // Disable checkbox while checking/downloading
    refinementEnabledCheckbox.disabled = true;

    // Check availability and trigger download if needed
    const ready = await ensureModelReady((status) => {
      updateDownloadStatus(status);
    });

    refinementEnabledCheckbox.disabled = false;

    if (!ready) {
      // Model not available - uncheck and show error
      refinementEnabledCheckbox.checked = false;
      updateRefinementSettingsUI(false);
      return;
    }
  } else {
    // Clear download status when disabling
    updateDownloadStatus(null);
  }

  updateRefinementSettingsUI(enabled);

  try {
    await chrome.storage.local.set({ refinementEnabled: enabled });
    showSaveStatus();
  } catch (err) {
    console.error('Error saving refinement enabled setting:', err);
  }
});

function updateDownloadStatus(status) {
  // Clear existing content
  refinementDownloadStatus.textContent = '';
  refinementDownloadStatus.className = 'download-status';

  if (!status) {
    return;
  }

  refinementDownloadStatus.classList.add(status.status);

  if (status.status === 'downloading') {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    refinementDownloadStatus.appendChild(spinner);
    refinementDownloadStatus.appendChild(document.createTextNode(status.message));
  } else if (status.status === 'available') {
    refinementDownloadStatus.textContent = '✓ ' + status.message;
  } else if (status.status === 'error') {
    refinementDownloadStatus.textContent = '✗ ' + status.message;
  }
}

function updateRefinementSettingsUI(enabled) {
  if (enabled) {
    refinementSettings.classList.remove('disabled');
  } else {
    refinementSettings.classList.add('disabled');
  }
}

async function loadRefinementPrompts() {
  try {
    const prompts = await getAvailablePrompts();
    // Render custom prompts list
    renderCustomPrompts(prompts.custom);
  } catch (err) {
    console.error('Error loading refinement prompts:', err);
  }
}

function renderCustomPrompts(customPrompts) {
  customPromptsList.innerHTML = '';

  if (customPrompts.length === 0) {
    customPromptsList.innerHTML = '<p class="description">No custom prompts yet. Create one to get started!</p>';
    return;
  }

  customPrompts.forEach(prompt => {
    const item = document.createElement('div');
    item.className = 'custom-prompt-item';

    const info = document.createElement('div');
    info.className = 'custom-prompt-info';

    const name = document.createElement('div');
    name.className = 'custom-prompt-name';
    name.textContent = prompt.name;

    const description = document.createElement('div');
    description.className = 'custom-prompt-description';
    description.textContent = prompt.description;

    info.appendChild(name);
    info.appendChild(description);

    const actions = document.createElement('div');
    actions.className = 'custom-prompt-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'secondary';
    deleteBtn.addEventListener('click', () => deleteCustomPrompt(prompt.id));

    actions.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(actions);

    customPromptsList.appendChild(item);
  });
}

async function deleteCustomPrompt(promptId) {
  try {
    const result = await chrome.storage.local.get(['customRefinementPrompts', 'selectedRefinementPrompt']);
    const customPrompts = result.customRefinementPrompts || [];
    const updatedPrompts = customPrompts.filter(p => p.id !== promptId);

    await chrome.storage.local.set({ customRefinementPrompts: updatedPrompts });

    // If the deleted prompt was selected, switch to default
    if (result.selectedRefinementPrompt === promptId) {
      await chrome.storage.local.set({ selectedRefinementPrompt: 'basic-cleanup' });
    }

    showSaveStatus();
    await loadRefinementPrompts();
    await renderRefinementHotkeys();
  } catch (err) {
    console.error('Error deleting custom prompt:', err);
  }
}

// Add custom prompt button
addCustomPromptBtn.addEventListener('click', () => {
  customPromptName.value = '';
  customPromptDescription.value = '';
  customPromptText.value = '';
  customPromptModal.classList.remove('hidden');
});

// Save custom prompt
saveCustomPromptBtn.addEventListener('click', async () => {
  const name = customPromptName.value.trim();
  const description = customPromptDescription.value.trim();
  const promptText = customPromptText.value.trim();

  if (!name || !description || !promptText) {
    // Show inline error message instead of alert
    customPromptName.style.borderColor = !name ? '#ef4444' : '#d1d5db';
    customPromptDescription.style.borderColor = !description ? '#ef4444' : '#d1d5db';
    customPromptText.style.borderColor = !promptText ? '#ef4444' : '#d1d5db';
    return;
  }

  // Reset border colors
  customPromptName.style.borderColor = '#d1d5db';
  customPromptDescription.style.borderColor = '#d1d5db';
  customPromptText.style.borderColor = '#d1d5db';

  try {
    const result = await chrome.storage.local.get(['customRefinementPrompts']);
    const customPrompts = result.customRefinementPrompts || [];

    // Add random component to prevent duplicate IDs if created rapidly
    const newPrompt = {
      id: 'custom-' + Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      name,
      description,
      prompt: promptText
    };

    customPrompts.push(newPrompt);
    await chrome.storage.local.set({ customRefinementPrompts: customPrompts });

    customPromptModal.classList.add('hidden');
    showSaveStatus();
    await loadRefinementPrompts();
    await renderRefinementHotkeys();
  } catch (err) {
    console.error('Error saving custom prompt:', err);
  }
});

// Cancel custom prompt
cancelCustomPromptBtn.addEventListener('click', () => {
  customPromptModal.classList.add('hidden');
});

// Close modal on outside click
customPromptModal.addEventListener('click', (e) => {
  if (e.target === customPromptModal) {
    customPromptModal.classList.add('hidden');
  }
});

// Render per-style refinement hotkeys
async function renderRefinementHotkeys() {
  refinementHotkeysList.innerHTML = '';

  try {
    const result = await chrome.storage.local.get(['refinementHotkeys', 'customRefinementPrompts']);
    const refinementHotkeys = result.refinementHotkeys || {};
    const customPrompts = result.customRefinementPrompts || [];

    // Render preset hotkeys
    for (const [presetId, preset] of Object.entries(PRESET_PROMPTS)) {
      const combo = refinementHotkeys[presetId] || null;
      renderHotkeyItem(presetId, preset.name, preset.description, combo, false);
    }

    // Render custom prompt hotkeys
    for (const customPrompt of customPrompts) {
      const combo = customPrompt.hotkey || null;
      renderHotkeyItem(customPrompt.id, customPrompt.name, customPrompt.description, combo, true);
    }
  } catch (err) {
    console.error('Error loading refinement hotkeys:', err);
  }
}

function renderHotkeyItem(promptId, promptName, description, combo, isCustom) {
  const item = document.createElement('div');
  item.className = 'hotkey-item' + (isCustom ? ' custom' : '');
  item.dataset.promptId = promptId;

  const labelContainer = document.createElement('div');
  labelContainer.className = 'hotkey-label-container';

  const label = document.createElement('span');
  label.className = 'hotkey-label';
  label.textContent = promptName;
  labelContainer.appendChild(label);

  if (description) {
    const desc = document.createElement('span');
    desc.className = 'hotkey-description';
    desc.textContent = description;
    labelContainer.appendChild(desc);
  }

  const keyRecorder = document.createElement('div');
  keyRecorder.className = 'key-recorder';

  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  input.placeholder = 'Not set';
  input.value = combo ? formatKeyCombo(combo) : '';
  input.dataset.promptId = promptId;

  const recordBtn = document.createElement('button');
  recordBtn.textContent = 'Record';
  recordBtn.className = 'secondary';
  recordBtn.addEventListener('click', () => startRecordingHotkey(promptId, input, recordBtn));

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.className = 'secondary';
  clearBtn.addEventListener('click', () => clearHotkey(promptId, input, isCustom));

  keyRecorder.appendChild(input);
  keyRecorder.appendChild(recordBtn);
  keyRecorder.appendChild(clearBtn);

  const conflictIndicator = document.createElement('span');
  conflictIndicator.className = 'conflict-indicator';
  conflictIndicator.dataset.promptId = promptId;

  // Check for initial conflict
  if (combo) {
    const conflict = detectConflict(combo);
    if (conflict) {
      conflictIndicator.textContent = `⚠ Conflicts with: ${conflict}`;
      conflictIndicator.classList.add('visible');
    }
  }

  item.appendChild(labelContainer);
  item.appendChild(keyRecorder);
  item.appendChild(conflictIndicator);

  refinementHotkeysList.appendChild(item);
}

function startRecordingHotkey(promptId, inputElement, recordBtn) {
  // Stop any existing recording
  if (activeRecordingPromptId) {
    stopRecordingHotkey(activeRecordingPromptId);
  }

  activeRecordingPromptId = promptId;
  recordBtn.textContent = 'Press keys...';
  inputElement.classList.add('recording');
  inputElement.value = '';
  inputElement.placeholder = 'Press key combo...';

  const keyDownHandler = async (e) => {
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

    document.removeEventListener('keydown', keyDownHandler);
    activeRecordingPromptId = null;
    recordBtn.textContent = 'Record';
    inputElement.classList.remove('recording');
    inputElement.placeholder = 'Not set';
    inputElement.value = formatKeyCombo(combo);

    // Save the hotkey
    await saveHotkey(promptId, combo);

    // Check for conflict
    const conflictIndicator = document.querySelector(`.conflict-indicator[data-prompt-id="${promptId}"]`);
    const conflict = detectConflict(combo);
    if (conflict) {
      conflictIndicator.textContent = `⚠ Conflicts with: ${conflict}`;
      conflictIndicator.classList.add('visible');
    } else {
      conflictIndicator.textContent = '';
      conflictIndicator.classList.remove('visible');
    }

    showRefinementHotkeyStatus('Hotkey saved!', 'success');
  };

  document.addEventListener('keydown', keyDownHandler);

  // Store handler for potential cleanup
  inputElement._keyDownHandler = keyDownHandler;
}

function stopRecordingHotkey(promptId) {
  const input = document.querySelector(`.hotkey-item[data-prompt-id="${promptId}"] input`);
  const recordBtn = document.querySelector(`.hotkey-item[data-prompt-id="${promptId}"] button`);

  if (input && input._keyDownHandler) {
    document.removeEventListener('keydown', input._keyDownHandler);
    delete input._keyDownHandler;
  }

  if (recordBtn) {
    recordBtn.textContent = 'Record';
  }

  if (input) {
    input.classList.remove('recording');
    input.placeholder = 'Not set';
  }

  activeRecordingPromptId = null;
}

async function saveHotkey(promptId, combo) {
  try {
    // Check if it's a custom prompt
    if (promptId.startsWith('custom-')) {
      const result = await chrome.storage.local.get(['customRefinementPrompts']);
      const customPrompts = result.customRefinementPrompts || [];
      const promptIndex = customPrompts.findIndex(p => p.id === promptId);
      if (promptIndex >= 0) {
        customPrompts[promptIndex].hotkey = combo;
        await chrome.storage.local.set({ customRefinementPrompts: customPrompts });
      }
    } else {
      // It's a preset prompt
      const result = await chrome.storage.local.get(['refinementHotkeys']);
      const refinementHotkeys = result.refinementHotkeys || {};
      refinementHotkeys[promptId] = combo;
      await chrome.storage.local.set({ refinementHotkeys });
    }
    showSaveStatus();
  } catch (err) {
    console.error('Error saving hotkey:', err);
    showRefinementHotkeyStatus('Error saving hotkey', 'error');
  }
}

async function clearHotkey(promptId, inputElement, isCustom) {
  try {
    if (isCustom) {
      const result = await chrome.storage.local.get(['customRefinementPrompts']);
      const customPrompts = result.customRefinementPrompts || [];
      const promptIndex = customPrompts.findIndex(p => p.id === promptId);
      if (promptIndex >= 0) {
        delete customPrompts[promptIndex].hotkey;
        await chrome.storage.local.set({ customRefinementPrompts: customPrompts });
      }
    } else {
      const result = await chrome.storage.local.get(['refinementHotkeys']);
      const refinementHotkeys = result.refinementHotkeys || {};
      refinementHotkeys[promptId] = null;
      await chrome.storage.local.set({ refinementHotkeys });
    }

    inputElement.value = '';

    // Clear conflict indicator
    const conflictIndicator = document.querySelector(`.conflict-indicator[data-prompt-id="${promptId}"]`);
    if (conflictIndicator) {
      conflictIndicator.textContent = '';
      conflictIndicator.classList.remove('visible');
    }

    showSaveStatus();
    showRefinementHotkeyStatus('Hotkey cleared', 'success');
  } catch (err) {
    console.error('Error clearing hotkey:', err);
  }
}

function showRefinementHotkeyStatus(message, type) {
  refinementHotkeyStatus.textContent = message;
  refinementHotkeyStatus.className = `status ${type}`;
  setTimeout(() => {
    refinementHotkeyStatus.textContent = '';
    refinementHotkeyStatus.className = 'status';
  }, 3000);
}

async function checkApiAvailability() {
  try {
    apiStatus.textContent = 'Checking AI availability...';
    apiStatus.className = 'description';

    const availability = await checkAvailability();

    if (availability.available) {
      apiStatus.textContent = '✓ Chrome AI (Gemini Nano) is available and ready';
      apiStatus.style.color = '#059669';
      // Update download status if refinement is enabled
      if (refinementEnabledCheckbox.checked) {
        updateDownloadStatus({ status: 'available', message: 'Ready' });
      }
    } else if (availability.canDownload) {
      apiStatus.textContent = '⚠ Model is downloading - enable text refinement to see progress';
      apiStatus.style.color = '#d97706';
    } else {
      apiStatus.textContent = `✗ AI not available: ${availability.reason}`;
      apiStatus.style.color = '#dc2626';
      // Show error in download status if refinement was enabled
      if (refinementEnabledCheckbox.checked) {
        updateDownloadStatus({ status: 'error', message: availability.reason });
      }
    }
  } catch (err) {
    console.error('Error checking API availability:', err);
    apiStatus.textContent = `Error checking AI: ${err.message}`;
    apiStatus.style.color = '#dc2626';
  }
}

