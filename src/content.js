// Content script for speech recognition UI and text insertion
// Speech recognition is handled by the sidepanel

(async function () {
  const INDICATOR_ID = 'utter-listening-indicator';

  // Check if extension context is still valid
  function isContextValid() {
    try {
      return chrome.runtime?.id != null;
    } catch {
      return false;
    }
  }

  // Check context validity upfront
  if (!isContextValid()) {
    showIndicator('Extension updated - reload page', true);
    return;
  }

  // Check if we already have an active session - toggle off
  if (window.__utterActive) {
    console.log('Utter: Stopping recognition (toggle off)');
    window.__utterActive = false;
    try {
      chrome.runtime.sendMessage({ type: 'stop-recognition-request' });
    } catch {
      // Context invalidated
    }
    removeIndicator();
    return;
  }

  // Store reference to the target element
  const targetElement = document.activeElement;

  console.log('Utter: Target element:', targetElement.tagName, targetElement);

  // Check if the active element is a text input
  const isTextInput =
    (targetElement.tagName === 'INPUT' && isTextInputType(targetElement.type)) ||
    targetElement.tagName === 'TEXTAREA' ||
    targetElement.isContentEditable;

  if (!isTextInput) {
    showIndicator('Focus on a text field first', true);
    return;
  }

  // Mark as active and store target element
  window.__utterActive = true;
  window.__utterTargetElement = targetElement;

  // Set up message listener for recognition events
  if (!window.__utterMessageListener) {
    window.__utterMessageListener = (message) => {
      if (!isContextValid()) return;
      handleRecognitionMessage(message);
    };
    chrome.runtime.onMessage.addListener(window.__utterMessageListener);
  }

  // Show initial indicator
  showIndicator('Starting...');

  // Request recognition start from background
  try {
    chrome.runtime.sendMessage({ type: 'start-recognition-request' });
  } catch {
    showIndicator('Extension updated - reload page', true);
    return;
  }

  function handleRecognitionMessage(message) {
    console.log('Utter Content: Received message:', message);

    switch (message.type) {
      case 'recognition-started':
        showIndicator('Listening...');
        break;

      case 'recognition-result':
        if (message.finalTranscript) {
          insertText(window.__utterTargetElement, message.finalTranscript);
          saveToHistory(message.finalTranscript);
        }
        if (message.interimTranscript) {
          updateIndicator(`Listening: ${message.interimTranscript}`);
        } else {
          updateIndicator('Listening...');
        }
        break;

      case 'recognition-error':
        if (message.recoverable) {
          updateIndicator('Listening... (speak now)');
        } else {
          showIndicator(`Error: ${message.error}`, true);
          cleanup();
        }
        break;

      case 'recognition-ended':
        cleanup();
        break;
    }
  }

  function isTextInputType(type) {
    const textTypes = ['text', 'search', 'url', 'tel', 'password', 'email', ''];
    return textTypes.includes(type?.toLowerCase() || '');
  }

  function insertText(element, text) {
    if (!element) {
      console.error('Utter: No target element');
      return;
    }

    console.log('Utter: insertText called with:', text, 'into', element.tagName);

    // Re-focus the element to ensure we can insert
    element.focus();

    try {
      if (element.isContentEditable) {
        document.execCommand('insertText', false, text);
        console.log('Utter: Used execCommand for contenteditable');
      } else {
        const start = element.selectionStart ?? element.value.length;
        const end = element.selectionEnd ?? element.value.length;
        const value = element.value || '';

        element.value = value.substring(0, start) + text + value.substring(end);
        element.selectionStart = element.selectionEnd = start + text.length;

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        console.log('Utter: Inserted into input/textarea, new value:', element.value);
      }
    } catch (err) {
      console.error('Utter: Error inserting text:', err);
    }
  }

  function showIndicator(message, isError = false) {
    let indicator = document.getElementById(INDICATOR_ID);

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = INDICATOR_ID;
      indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        transition: opacity 0.2s;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        pointer-events: none;
      `;
      document.body.appendChild(indicator);
    }

    indicator.textContent = message;
    indicator.style.backgroundColor = isError ? '#ef4444' : '#3b82f6';
    indicator.style.color = '#ffffff';

    if (isError) {
      setTimeout(() => removeIndicator(), 2000);
    }
  }

  function updateIndicator(message) {
    const indicator = document.getElementById(INDICATOR_ID);
    if (indicator) {
      indicator.textContent = message;
    }
  }

  function removeIndicator() {
    const indicator = document.getElementById(INDICATOR_ID);
    if (indicator) {
      indicator.remove();
    }
  }

  function cleanup() {
    window.__utterActive = false;
    window.__utterTargetElement = null;
    removeIndicator();
  }

  async function saveToHistory(text) {
    if (!isContextValid()) return;
    try {
      const result = await chrome.storage.local.get(['utterHistory']);
      const history = result.utterHistory || [];

      history.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text: text,
        timestamp: Date.now(),
        url: window.location.href
      });

      const trimmedHistory = history.slice(-500);

      await chrome.storage.local.set({ utterHistory: trimmedHistory });
      console.log('Utter: Saved to history');
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        return;
      }
      console.error('Utter: Error saving to history:', err);
    }
  }
})();
