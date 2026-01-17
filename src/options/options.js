// Options page script

import { PRESET_PROMPTS, checkAvailability, getAvailablePrompts } from '../refinement-service.js';

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
const refinementSettings = document.getElementById('refinement-settings');
const refinementPromptSelect = document.getElementById('refinement-prompt');
const promptDescription = document.getElementById('prompt-description');
const customPromptsList = document.getElementById('custom-prompts-list');
const addCustomPromptBtn = document.getElementById('add-custom-prompt');
const refinementPttComboInput = document.getElementById('refinement-ptt-combo');
const recordRefinementComboBtn = document.getElementById('record-refinement-combo');
const clearRefinementComboBtn = document.getElementById('clear-refinement-combo');
const refinementPttStatus = document.getElementById('refinement-ptt-status');
const apiStatus = document.getElementById('api-status');

// Modal elements
const customPromptModal = document.getElementById('custom-prompt-modal');
const customPromptName = document.getElementById('custom-prompt-name');
const customPromptDescription = document.getElementById('custom-prompt-description');
const customPromptText = document.getElementById('custom-prompt-text');
const saveCustomPromptBtn = document.getElementById('save-custom-prompt');
const cancelCustomPromptBtn = document.getElementById('cancel-custom-prompt');

let isRecording = false;
let isRecordingRefinement = false;

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
  await checkApiAvailability();
  await loadRefinementPrompts();

  // Re-enumerate devices when permission changes
  navigator.mediaDevices.addEventListener('devicechange', loadDevices);
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
      'selectedRefinementPrompt',
      'refinementPttKeyCombo'
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

    // Set refinement settings
    refinementEnabledCheckbox.checked = result.refinementEnabled !== false;
    updateRefinementSettingsUI(result.refinementEnabled !== false);

    // Set refinement PTT key combo
    if (result.refinementPttKeyCombo) {
      refinementPttComboInput.value = formatKeyCombo(result.refinementPttKeyCombo);
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
  updateRefinementSettingsUI(enabled);

  try {
    await chrome.storage.local.set({ refinementEnabled: enabled });
    showSaveStatus();
  } catch (err) {
    console.error('Error saving refinement enabled setting:', err);
  }
});

function updateRefinementSettingsUI(enabled) {
  if (enabled) {
    refinementSettings.classList.remove('disabled');
  } else {
    refinementSettings.classList.add('disabled');
  }
}

// Refinement prompt selection change
refinementPromptSelect.addEventListener('change', async () => {
  const promptId = refinementPromptSelect.value;
  updatePromptDescription(promptId);

  try {
    await chrome.storage.local.set({ selectedRefinementPrompt: promptId });
    showSaveStatus();
  } catch (err) {
    console.error('Error saving refinement prompt:', err);
  }
});

async function updatePromptDescription(promptId) {
  const preset = PRESET_PROMPTS[promptId];
  if (preset) {
    promptDescription.textContent = preset.description;
  } else {
    // Check if it's a custom prompt
    try {
      const result = await chrome.storage.local.get(['customRefinementPrompts']);
      const customPrompts = result.customRefinementPrompts || [];
      const customPrompt = customPrompts.find(p => p.id === promptId);
      if (customPrompt) {
        promptDescription.textContent = customPrompt.description;
      } else {
        promptDescription.textContent = '';
      }
    } catch (err) {
      console.error('Error loading custom prompt description:', err);
      promptDescription.textContent = '';
    }
  }
}

async function loadRefinementPrompts() {
  try {
    const prompts = await getAvailablePrompts();
    const result = await chrome.storage.local.get(['selectedRefinementPrompt']);
    const selectedPrompt = result.selectedRefinementPrompt || 'basic-cleanup';

    // Clear existing options
    refinementPromptSelect.innerHTML = '';

    // Add preset prompts
    const presetsGroup = document.createElement('optgroup');
    presetsGroup.label = 'Preset Styles';
    prompts.presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      presetsGroup.appendChild(option);
    });
    refinementPromptSelect.appendChild(presetsGroup);

    // Add custom prompts if any
    if (prompts.custom.length > 0) {
      const customGroup = document.createElement('optgroup');
      customGroup.label = 'Custom Prompts';
      prompts.custom.forEach(prompt => {
        const option = document.createElement('option');
        option.value = prompt.id;
        option.textContent = prompt.name;
        customGroup.appendChild(option);
      });
      refinementPromptSelect.appendChild(customGroup);
    }

    // Set selected prompt
    refinementPromptSelect.value = selectedPrompt;
    updatePromptDescription(selectedPrompt);

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

// Refinement PTT key combo recording
recordRefinementComboBtn.addEventListener('click', () => {
  if (isRecordingRefinement) {
    stopRecordingRefinement();
  } else {
    startRecordingRefinement();
  }
});

clearRefinementComboBtn.addEventListener('click', async () => {
  refinementPttComboInput.value = '';
  try {
    await chrome.storage.local.remove('refinementPttKeyCombo');
    showSaveStatus();
    showRefinementPttStatus('Refinement hotkey cleared', 'success');
  } catch (err) {
    console.error('Error clearing refinement key combo:', err);
  }
});

function startRecordingRefinement() {
  isRecordingRefinement = true;
  recordRefinementComboBtn.textContent = 'Press keys...';
  refinementPttComboInput.classList.add('recording');
  refinementPttComboInput.value = '';
  refinementPttComboInput.placeholder = 'Press your key combination...';
  document.addEventListener('keydown', handleRefinementKeyDown);
}

function stopRecordingRefinement() {
  isRecordingRefinement = false;
  recordRefinementComboBtn.textContent = 'Record';
  refinementPttComboInput.classList.remove('recording');
  refinementPttComboInput.placeholder = 'Click Record to set';
  document.removeEventListener('keydown', handleRefinementKeyDown);
}

async function handleRefinementKeyDown(e) {
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

  refinementPttComboInput.value = formatKeyCombo(combo);
  stopRecordingRefinement();

  try {
    await chrome.storage.local.set({ refinementPttKeyCombo: combo });
    showSaveStatus();
    showRefinementPttStatus('Refinement hotkey saved!', 'success');
  } catch (err) {
    console.error('Error saving refinement key combo:', err);
    showRefinementPttStatus('Error saving hotkey', 'error');
  }
}

function showRefinementPttStatus(message, type) {
  refinementPttStatus.textContent = message;
  refinementPttStatus.className = `status ${type}`;
  setTimeout(() => {
    refinementPttStatus.textContent = '';
    refinementPttStatus.className = 'status';
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
    } else if (availability.canDownload) {
      apiStatus.textContent = '⚠ Model will download automatically on first use';
      apiStatus.style.color = '#d97706';
    } else {
      apiStatus.textContent = `✗ AI not available: ${availability.reason}`;
      apiStatus.style.color = '#dc2626';
    }
  } catch (err) {
    console.error('Error checking API availability:', err);
    apiStatus.textContent = `Error checking AI: ${err.message}`;
    apiStatus.style.color = '#dc2626';
  }
}
