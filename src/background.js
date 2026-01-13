// Service worker for the extension

console.log('Utter service worker loaded');

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for the keyboard command - must be at top level
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);

  if (command === 'toggle-voice-input') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    console.log('Active tab:', tab);

    if (!tab?.id) {
      console.error('No active tab found');
      return;
    }

    // Inject the content script
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

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('Utter extension installed');

    // Set default settings
    // Default PTT key: Option+. (Mac) / Alt+. (Windows/Linux)
    const defaults = {
      activationMode: 'toggle',
      pttKeyCombo: {
        ctrlKey: false,
        shiftKey: false,
        altKey: true,  // Option on Mac, Alt on Windows/Linux
        metaKey: false,
        key: '.',
        code: 'Period'
      },
      audioVolume: 0.5  // Default audio volume (0.0 to 1.0)
    };

    await chrome.storage.local.set(defaults);
    console.log('Default settings applied');
  }
});
