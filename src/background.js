// Service worker for the extension

console.log('Utter service worker loaded');

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Track active recognition sessions by tab
const activeSessions = new Map();

// Create the offscreen document if it doesn't exist
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });

  if (existingContexts.length > 0) {
    console.log('Utter: Offscreen document already exists');
    return;
  }

  console.log('Utter: Creating offscreen document');
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Speech recognition requires microphone access via getUserMedia'
  });
  console.log('Utter: Offscreen document created');
}

// Close the offscreen document
async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });

  if (existingContexts.length > 0) {
    console.log('Utter: Closing offscreen document');
    await chrome.offscreen.closeDocument();
  }
}

// Generate a unique session ID
function generateSessionId(tabId) {
  return `${tabId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Start recognition for a tab
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
    await ensureOffscreenDocument();

    // Tell offscreen document to start recognition
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'start-recognition',
      sessionId
    });

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
      target: 'offscreen',
      type: 'stop-recognition',
      sessionId
    });
  } catch (err) {
    console.error('Utter: Error stopping recognition:', err);
  }

  // Close offscreen document if no more active sessions
  if (activeSessions.size === 0) {
    // Delay slightly to allow final messages to be processed
    setTimeout(async () => {
      if (activeSessions.size === 0) {
        await closeOffscreenDocument();
      }
    }, 1000);
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

    // Inject the content script first (for UI and text insertion)
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

// Handle messages from offscreen document and content scripts
chrome.runtime.onMessage.addListener((message, sender) => {
  console.log('Utter Background: Received message:', message, 'from:', sender);

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

  // Messages from offscreen document - forward to appropriate tab
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

      // Close offscreen document if no more sessions
      if (activeSessions.size === 0) {
        setTimeout(async () => {
          if (activeSessions.size === 0) {
            await closeOffscreenDocument();
          }
        }, 1000);
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
