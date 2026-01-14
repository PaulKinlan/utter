// Service worker for the extension
/* global self */

console.log('Utter service worker loaded');

// Track active recognition sessions by tab
const activeSessions = new Map();

// Track if sidepanel is ready
let sidepanelReady = false;

// Generate a unique session ID
function generateSessionId(tabId) {
  return `${tabId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Check if sidepanel is open for a specific tab
// Note: Chrome doesn't expose per-tab sidepanel state, so tabId is unused but kept for future API changes
async function isSidepanelOpen(_tabId) {
  try {
    // Get all extension contexts
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['SIDE_PANEL']
    });
    // Check if any sidepanel context exists (Chrome doesn't expose per-tab info)
    // but also check if sidepanel is ready to receive messages
    return contexts.length > 0 && sidepanelReady;
  } catch {
    return false;
  }
}

// Wait for sidepanel to be ready with improved reliability
function waitForSidepanelReady(timeout = 5000) {
  return new Promise((resolve) => {
    // Check immediately in case ready signal came before we started waiting
    if (sidepanelReady) {
      resolve();
      return;
    }

    const timeoutId = setTimeout(() => {
      console.warn('Utter: Sidepanel ready timeout, proceeding anyway');
      // Don't reject - proceed anyway since sidepanel might still work
      resolve();
    }, timeout);

    const checkReady = () => {
      if (sidepanelReady) {
        self.clearTimeout(timeoutId);
        resolve();
      } else {
        self.setTimeout(checkReady, 50);
      }
    };
    checkReady();
  });
}

// Start recognition for a tab
// The sidepanel should already be open (opened in command handler or by user clicking icon)
// For PTT mode, the user must have the sidepanel open first since we can't open it from content script gestures
async function startRecognitionForTab(tabId) {
  // Check if already running for this tab
  if (activeSessions.has(tabId)) {
    console.log('Utter: Stopping existing session for tab', tabId);
    await stopRecognitionForTab(tabId);
    return;
  }

  const sessionId = generateSessionId(tabId);
  activeSessions.set(tabId, sessionId);

  console.log('Utter: Starting recognition for tab', tabId, 'session', sessionId);

  try {
    // Check if sidepanel is open - it should have been opened in the command handler
    // or by the user clicking the extension icon (required for PTT mode)
    const isOpen = await isSidepanelOpen(tabId);
    if (!isOpen) {
      // Sidepanel not open - this happens with PTT mode since content script gestures
      // can't be used to open the sidepanel (Chrome API restriction)
      console.log('Utter: Sidepanel not open, waiting for it to be ready...');

      // Wait a short time for the sidepanel to initialize (it may have just been opened)
      await waitForSidepanelReady(3000);

      // Check again
      const isOpenNow = await isSidepanelOpen(tabId);
      if (!isOpenNow) {
        throw new Error('Please click the Utter extension icon first to open the sidepanel');
      }
    }

    // Tell sidepanel to start recognition
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        target: 'sidepanel',
        type: 'start-recognition',
        sessionId,
        tabId
      });
    } catch (msgErr) {
      console.error('Utter: Failed to send message to sidepanel:', msgErr);
      throw new Error('Sidepanel is not responding. Please try again.');
    }

    if (!response?.success) {
      console.error('Utter: Failed to start recognition:', response?.error);
      activeSessions.delete(tabId);

      // Notify content script of failure
      await chrome.tabs.sendMessage(tabId, {
        type: 'recognition-error',
        error: response?.error || 'Failed to start recognition',
        recoverable: false
      });
    }
  } catch (err) {
    console.error('Utter: Error starting recognition:', err);
    activeSessions.delete(tabId);

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'recognition-error',
        error: err.message,
        recoverable: false
      });
    } catch {
      // Tab might be closed
    }
  }
}

// Stop recognition for a tab
async function stopRecognitionForTab(tabId) {
  const sessionId = activeSessions.get(tabId);
  if (!sessionId) {
    console.log('Utter: No active session for tab', tabId);
    return;
  }

  console.log('Utter: Stopping recognition for tab', tabId, 'session', sessionId);
  activeSessions.delete(tabId);

  try {
    await chrome.runtime.sendMessage({
      target: 'sidepanel',
      type: 'stop-recognition',
      sessionId
    });
  } catch (err) {
    console.error('Utter: Error stopping recognition:', err);
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

    // Open sidepanel FIRST while we still have user gesture context
    // This MUST happen synchronously in response to the command
    const isOpen = await isSidepanelOpen(tab.id);
    if (!isOpen) {
      console.log('Utter: Opening sidepanel in command handler (user gesture context)');
      sidepanelReady = false;
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (openErr) {
        console.error('Utter: Failed to open sidepanel:', openErr);
        // Try with windowId as fallback
        try {
          await chrome.sidePanel.open({ windowId: tab.windowId });
        } catch (openErr2) {
          console.error('Utter: Failed to open sidepanel (fallback):', openErr2);
        }
      }
    }

    // Inject the content script (for UI and text insertion)
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

// Handle messages from sidepanel and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Utter Background: Received message:', message, 'from:', sender);

  // Sidepanel ready signal
  if (message.type === 'sidepanel-ready') {
    console.log('Utter Background: Sidepanel is ready');
    sidepanelReady = true;
    return;
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

  // Messages from content scripts
  if (message.type === 'start-recognition-request') {
    const tabId = sender.tab?.id;
    if (tabId) {
      startRecognitionForTab(tabId);
    }
    return;
  }

  if (message.type === 'stop-recognition-request') {
    const tabId = sender.tab?.id;
    if (tabId) {
      stopRecognitionForTab(tabId);
    }
    return;
  }

  // Stop request from sidepanel
  if (message.type === 'stop-recognition-request-from-sidepanel') {
    // Find the tab for this session and clean up
    for (const [tabId, sessionId] of activeSessions.entries()) {
      if (sessionId === message.sessionId) {
        activeSessions.delete(tabId);
        break;
      }
    }
    return;
  }

  // Messages from sidepanel - forward to appropriate tab
  if (message.type === 'recognition-started' ||
      message.type === 'recognition-result' ||
      message.type === 'recognition-error' ||
      message.type === 'recognition-ended') {

    // Find the tab for this session
    for (const [tabId, sessionId] of activeSessions.entries()) {
      if (sessionId === message.sessionId) {
        chrome.tabs.sendMessage(tabId, message).catch(err => {
          console.warn('Utter: Could not forward message to tab', tabId, err);
          // Tab might be closed, clean up
          activeSessions.delete(tabId);
        });
        break;
      }
    }

    // If recognition ended, clean up the session
    if (message.type === 'recognition-ended') {
      for (const [tabId, sessionId] of activeSessions.entries()) {
        if (sessionId === message.sessionId) {
          activeSessions.delete(tabId);
          break;
        }
      }
    }
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeSessions.has(tabId)) {
    console.log('Utter: Tab closed, stopping recognition for tab', tabId);
    stopRecognitionForTab(tabId);
  }
});

// Reset sidepanel ready state when sidepanel closes
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    port.onDisconnect.addListener(() => {
      console.log('Utter Background: Sidepanel disconnected');
      sidepanelReady = false;
    });
  }
});

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
      audioVolume: 0.5
    };

    await chrome.storage.local.set(defaults);
    console.log('Default settings applied');
  }
});
