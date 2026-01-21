// Service worker for the extension

import { refineWithPreset, refineWithCustomPrompt, checkAvailability, PRESET_PROMPTS } from './refinement-service.js';

console.log('Utter service worker loaded');

// Offscreen document management
const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
let creatingOffscreen = null;
/** @type {Map<string, {tabId: number, frameId?: number}>} */
const activeSessions = new Map();

/**
 * Create the offscreen document if it doesn't exist
 */
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Speech recognition fallback when page blocks microphone access'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

/**
 * Close the offscreen document
 */
async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });

  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

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

  // Handle offscreen recognition start request from content scripts
  if (message.type === 'start-offscreen-recognition') {
    handleStartOffscreenRecognition(message, sender)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Handle offscreen recognition stop request from content scripts
  if (message.type === 'stop-offscreen-recognition') {
    handleStopOffscreenRecognition(message.sessionId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Handle messages from offscreen document - route to content scripts
  if (message.source === 'offscreen-recognition') {
    handleOffscreenMessage(message);
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
 * Handle start offscreen recognition request
 */
async function handleStartOffscreenRecognition(message, sender) {
  const sessionId = message.sessionId || Date.now().toString();
  const tabId = sender.tab?.id;

  if (!tabId) {
    throw new Error('No tab ID found');
  }

  // Store session info for routing messages back
  activeSessions.set(sessionId, { tabId, frameId: sender.frameId });

  // Create offscreen document if needed
  await setupOffscreenDocument();

  // Send start message to offscreen document
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen-recognition',
    type: 'start',
    sessionId
  });

  if (!response?.success) {
    activeSessions.delete(sessionId);
    throw new Error(response?.error || 'Failed to start recognition');
  }

  return { success: true, sessionId };
}

/**
 * Handle stop offscreen recognition request
 */
async function handleStopOffscreenRecognition(sessionId) {
  if (!sessionId) {
    throw new Error('No session ID provided');
  }

  try {
    await chrome.runtime.sendMessage({
      target: 'offscreen-recognition',
      type: 'stop',
      sessionId
    });
  } catch {
    // Offscreen document may already be closed
  }

  activeSessions.delete(sessionId);

  // Close offscreen document if no more active sessions
  if (activeSessions.size === 0) {
    await closeOffscreenDocument().catch(() => {});
  }
}

/**
 * Handle messages from offscreen document and route to content scripts
 */
function handleOffscreenMessage(message) {
  const { sessionId, type, ...data } = message;

  if (!sessionId) {
    console.warn('Utter Background: Offscreen message without sessionId');
    return;
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    console.warn('Utter Background: No active session for:', sessionId);
    return;
  }

  // Route message to content script
  chrome.tabs.sendMessage(session.tabId, {
    source: 'utter-offscreen',
    type,
    sessionId,
    ...data
  }).catch(err => {
    console.error('Utter Background: Failed to send to content script:', err);
  });

  // Clean up session on recognition ended
  if (type === 'recognition-ended') {
    activeSessions.delete(sessionId);
    if (activeSessions.size === 0) {
      closeOffscreenDocument().catch(() => {});
    }
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
