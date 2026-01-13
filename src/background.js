// Service worker for the extension
// Uses Manifest V3 service worker pattern

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
  }
});
