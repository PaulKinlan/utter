// Service worker for the extension

import { refineWithPreset, refineWithCustomPrompt, checkAvailability, PRESET_PROMPTS } from './refinement-service.js';

console.log('Utter service worker loaded');

// Sidepanel fallback session management
/** @type {Map<string, {tabId: number, frameId?: number}>} */
const activeSessions = new Map();

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for the keyboard command
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);

  if (command === 'toggle-voice-input') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    console.log('Active tab:', tab);

    if (!tab?.id) {
      console.error('No active tab found');
      return;
    }

    // Inject the content script which uses iframe for speech recognition (like PTT)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      console.log('Content script injected');
    } catch (err) {
      console.error('Failed to inject content script:', err);
    }
  }
});

// Handle messages from content scripts and sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Utter Background: Received message:', message, 'from:', sender);

  // Handle sidepanel recognition start request from content scripts
  if (message.type === 'start-sidepanel-recognition') {
    handleStartSidepanelRecognition(message, sender)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Handle sidepanel recognition stop request from content scripts
  if (message.type === 'stop-sidepanel-recognition') {
    handleStopSidepanelRecognition(message.sessionId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Handle messages from sidepanel - route to content scripts
  if (message.type === 'recognition-started' ||
      message.type === 'recognition-result' ||
      message.type === 'recognition-error' ||
      message.type === 'recognition-ended') {
    handleSidepanelRecognitionMessage(message);
    return false;
  }

  // Handle settings request from sidepanel
  if (message.type === 'get-settings' && message.target === 'background') {
    chrome.storage.local.get([
      'selectedMicrophone',
      'soundFeedbackEnabled',
      'audioVolume'
    ]).then(result => {
      sendResponse(result);
    }).catch(err => {
      console.error('Utter Background: Error getting settings:', err);
      sendResponse({});
    });
    return true; // Will respond asynchronously
  }

  // Handle text refinement requests from content scripts
  if (message.type === 'refine-text') {
    handleRefineText(message).then(result => {
      sendResponse(result);
    }).catch(err => {
      console.error('Utter Background: Error refining text:', err);
      sendResponse({ error: err.message || 'Refinement failed' });
    });
    return true; // Will respond asynchronously
  }

  // Handle availability check requests
  if (message.type === 'check-refinement-availability') {
    checkAvailability().then(result => {
      sendResponse(result);
    }).catch(err => {
      console.error('Utter Background: Error checking availability:', err);
      sendResponse({ available: false, reason: err.message });
    });
    return true; // Will respond asynchronously
  }

  // Handle get presets request
  if (message.type === 'get-refinement-presets') {
    sendResponse({ presets: PRESET_PROMPTS });
    return false;
  }
});

/**
 * Handle text refinement request
 */
async function handleRefineText(message) {
  const { text, presetId, customPrompt } = message;

  if (!text) {
    throw new Error('No text to refine');
  }

  // Check availability first
  const availability = await checkAvailability();
  if (!availability.available) {
    throw new Error(availability.reason || 'AI not available');
  }

  let refinedText;
  if (customPrompt) {
    refinedText = await refineWithCustomPrompt(text, customPrompt);
  } else if (presetId) {
    refinedText = await refineWithPreset(text, presetId);
  } else {
    throw new Error('No preset or custom prompt specified');
  }

  return { refinedText };
}

/**
 * Handle start sidepanel recognition request (fallback when iframe fails)
 */
async function handleStartSidepanelRecognition(message, sender) {
  const sessionId = message.sessionId || Date.now().toString();
  const tabId = sender.tab?.id;

  if (!tabId) {
    throw new Error('No tab ID found');
  }

  // Store session info for routing messages back
  activeSessions.set(sessionId, { tabId, frameId: sender.frameId });

  // Open the sidepanel for the tab
  try {
    await chrome.sidePanel.open({ tabId });
  } catch (err) {
    console.error('Utter Background: Failed to open sidepanel:', err);
    activeSessions.delete(sessionId);
    throw new Error('Failed to open sidepanel');
  }

  // Give sidepanel a moment to initialize, then send start message
  await new Promise(resolve => setTimeout(resolve, 300));

  // Send start message to sidepanel
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'sidepanel',
      type: 'start-recognition',
      sessionId
    });

    if (!response?.success) {
      activeSessions.delete(sessionId);
      throw new Error(response?.error || 'Failed to start recognition in sidepanel');
    }

    return { success: true, sessionId };
  } catch {
    activeSessions.delete(sessionId);
    throw new Error('Sidepanel not responding');
  }
}

/**
 * Handle stop sidepanel recognition request
 */
async function handleStopSidepanelRecognition(sessionId) {
  if (!sessionId) {
    throw new Error('No session ID provided');
  }

  try {
    await chrome.runtime.sendMessage({
      target: 'sidepanel',
      type: 'stop-recognition',
      sessionId
    });
  } catch {
    // Sidepanel may not be open
  }

  activeSessions.delete(sessionId);
}

/**
 * Handle messages from sidepanel and route to content scripts
 */
function handleSidepanelRecognitionMessage(message) {
  const { sessionId, type, ...data } = message;

  if (!sessionId) {
    // Not a fallback session, ignore (sidepanel can also record independently)
    return;
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    // Not a tracked fallback session
    return;
  }

  // Route message to content script
  chrome.tabs.sendMessage(session.tabId, {
    source: 'utter-sidepanel',
    type,
    sessionId,
    ...data
  }).catch(err => {
    console.error('Utter Background: Failed to send to content script:', err);
  });

  // Clean up session on recognition ended
  if (type === 'recognition-ended') {
    activeSessions.delete(sessionId);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('Utter extension installed');

    // Set default settings
    const defaults = {
      activationMode: 'toggle',
      pttKeyCombo: {
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
        metaKey: false,
        key: '.',
        code: 'Period'
      },
      audioVolume: 0.5,
      refinementEnabled: false,
      selectedRefinementPrompt: 'basic-cleanup',
      // Per-style refinement hotkeys (only basic-cleanup has default)
      refinementHotkeys: {
        'basic-cleanup': {
          ctrlKey: false,
          shiftKey: false,
          altKey: true,
          metaKey: false,
          key: 'r',
          code: 'KeyR'
        },
        'remove-filler': null,
        'formal': null,
        'friendly': null,
        'concise': null
      },
      customRefinementPrompts: []
    };

    await chrome.storage.local.set(defaults);
    console.log('Default settings applied');
  }

  // Migration for existing users: convert refinementPttKeyCombo to refinementHotkeys
  if (details.reason === 'update') {
    console.log('Utter extension updated, checking for migration...');

    const result = await chrome.storage.local.get(['refinementPttKeyCombo', 'refinementHotkeys']);

    // Migrate old single hotkey to new per-style hotkeys
    if (result.refinementPttKeyCombo && !result.refinementHotkeys) {
      console.log('Migrating refinementPttKeyCombo to refinementHotkeys');

      const refinementHotkeys = {
        'basic-cleanup': result.refinementPttKeyCombo,
        'remove-filler': null,
        'formal': null,
        'friendly': null,
        'concise': null
      };

      await chrome.storage.local.set({ refinementHotkeys });
      await chrome.storage.local.remove('refinementPttKeyCombo');

      console.log('Migration complete');
    }

    // Ensure refinementHotkeys exists for users who never had refinementPttKeyCombo
    if (!result.refinementHotkeys && !result.refinementPttKeyCombo) {
      const refinementHotkeys = {
        'basic-cleanup': {
          ctrlKey: false,
          shiftKey: false,
          altKey: true,
          metaKey: false,
          key: 'r',
          code: 'KeyR'
        },
        'remove-filler': null,
        'formal': null,
        'friendly': null,
        'concise': null
      };
      await chrome.storage.local.set({ refinementHotkeys });
      console.log('Created default refinementHotkeys');
    }
  }
});
