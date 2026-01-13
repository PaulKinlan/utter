// Push-to-talk listener - runs on all pages
// Listens for configured key combo to start/stop speech recognition
// Speech recognition is handled by the offscreen document

(function () {
  const INDICATOR_ID = 'utter-listening-indicator';

  let settings = {
    activationMode: 'toggle',
    pttKeyCombo: null
  };

  let isKeyHeld = false;

  // Load settings initially and listen for changes
  loadSettings();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.activationMode) {
      settings.activationMode = changes.activationMode.newValue;
    }
    if (changes.pttKeyCombo) {
      settings.pttKeyCombo = changes.pttKeyCombo.newValue;
    }
  });

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['activationMode', 'pttKeyCombo']);
      settings.activationMode = result.activationMode || 'toggle';
      settings.pttKeyCombo = result.pttKeyCombo || null;
    } catch (err) {
      console.error('Utter PTT: Error loading settings:', err);
    }
  }

  // Set up message listener for recognition events
  chrome.runtime.onMessage.addListener((message) => {
    handleRecognitionMessage(message);
  });

  function handleRecognitionMessage(message) {
    // Only handle if PTT mode and key is held
    if (settings.activationMode !== 'push-to-talk') return;

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

  // Listen for keydown
  document.addEventListener('keydown', async (e) => {
    if (settings.activationMode !== 'push-to-talk') return;
    if (!settings.pttKeyCombo) return;
    if (!matchesCombo(e, settings.pttKeyCombo)) return;

    e.preventDefault();
    e.stopPropagation();

    if (isKeyHeld) return;
    isKeyHeld = true;

    console.log('Utter PTT: Key combo pressed, starting recognition');
    await startRecognition();
  }, true);

  // Listen for keyup
  document.addEventListener('keyup', (e) => {
    if (settings.activationMode !== 'push-to-talk') return;
    if (!settings.pttKeyCombo) return;
    if (!isKeyHeld) return;

    if (isPartOfCombo(e, settings.pttKeyCombo)) {
      console.log('Utter PTT: Key released, stopping recognition');
      isKeyHeld = false;
      stopRecognition();
    }
  }, true);

  function matchesCombo(e, combo) {
    return (
      e.ctrlKey === combo.ctrlKey &&
      e.shiftKey === combo.shiftKey &&
      e.altKey === combo.altKey &&
      e.metaKey === combo.metaKey &&
      (e.key === combo.key || e.code === combo.code)
    );
  }

  function isPartOfCombo(e, combo) {
    if (e.key === combo.key || e.code === combo.code) return true;
    if (combo.ctrlKey && e.key === 'Control') return true;
    if (combo.shiftKey && e.key === 'Shift') return true;
    if (combo.altKey && e.key === 'Alt') return true;
    if (combo.metaKey && e.key === 'Meta') return true;
    return false;
  }

  async function startRecognition() {
    const targetElement = document.activeElement;

    const isTextInput =
      (targetElement.tagName === 'INPUT' && isTextInputType(targetElement.type)) ||
      targetElement.tagName === 'TEXTAREA' ||
      targetElement.isContentEditable;

    if (!isTextInput) {
      showIndicator('Focus on a text field first', true);
      isKeyHeld = false;
      return;
    }

    window.__utterTargetElement = targetElement;
    showIndicator('Starting...');

    chrome.runtime.sendMessage({ type: 'start-recognition-request' });
  }

  function stopRecognition() {
    chrome.runtime.sendMessage({ type: 'stop-recognition-request' });
  }

  function isTextInputType(type) {
    const textTypes = ['text', 'search', 'url', 'tel', 'password', 'email', ''];
    return textTypes.includes(type?.toLowerCase() || '');
  }

  function insertText(element, text) {
    if (!element) return;

    element.focus();

    try {
      if (element.isContentEditable) {
        document.execCommand('insertText', false, text);
      } else {
        const start = element.selectionStart ?? element.value.length;
        const end = element.selectionEnd ?? element.value.length;
        const value = element.value || '';

        element.value = value.substring(0, start) + text + value.substring(end);
        element.selectionStart = element.selectionEnd = start + text.length;

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (err) {
      console.error('Utter PTT: Error inserting text:', err);
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
    window.__utterTargetElement = null;
    removeIndicator();
  }

  async function saveToHistory(text) {
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
      console.log('Utter PTT: Saved to history');
    } catch (err) {
      console.error('Utter PTT: Error saving to history:', err);
    }
  }
})();
