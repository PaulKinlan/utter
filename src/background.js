// Service worker for the extension

console.log('Utter service worker loaded');

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

// Handle messages from sidepanel (for settings requests)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Utter Background: Received message:', message, 'from:', sender);

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
