// Push-to-talk listener - runs on all pages
// Listens for configured key combo to start/stop speech recognition
// Speech recognition is handled by the sidepanel

(function () {
  const INDICATOR_ID = 'utter-listening-indicator';

  let settings = {
    activationMode: 'toggle',
    pttKeyCombo: null
  };

  let isKeyHeld = false;
  let contextInvalidated = false;

  // Check if extension context is still valid
  function isContextValid() {
    try {
      return !contextInvalidated && chrome.runtime?.id != null;
    } catch {
      return false;
    }
  }

  // Load settings initially and listen for changes
  loadSettings();
  chrome.storage.onChanged.addListener((changes) => {
    if (!isContextValid()) return;
    if (changes.activationMode) {
      settings.activationMode = changes.activationMode.newValue;
    }
    if (changes.pttKeyCombo) {
      settings.pttKeyCombo = changes.pttKeyCombo.newValue;
    }
  });

  async function loadSettings() {
    if (!isContextValid()) return;
    try {
      const result = await chrome.storage.local.get(['activationMode', 'pttKeyCombo']);
      settings.activationMode = result.activationMode || 'toggle';
      settings.pttKeyCombo = result.pttKeyCombo || null;
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        contextInvalidated = true;
        return;
      }
      console.error('Utter PTT: Error loading settings:', err);
    }
  }

  // Set up message listener for recognition events
  chrome.runtime.onMessage.addListener((message) => {
    if (!isContextValid()) return;
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
    if (!isContextValid()) return;
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
    if (!isContextValid()) return;
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
    if (!isContextValid()) {
      showIndicator('Extension updated - reload page', true);
      isKeyHeld = false;
      return;
    }

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

    try {
      chrome.runtime.sendMessage({ type: 'start-recognition-request' });
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        contextInvalidated = true;
        showIndicator('Extension updated - reload page', true);
      }
    }
  }

  function stopRecognition() {
    if (!isContextValid()) return;
    try {
      chrome.runtime.sendMessage({ type: 'stop-recognition-request' });
    } catch {
      // Context invalidated, ignore
    }
  }

  function isTextInputType(type) {
    const textTypes = ['text', 'search', 'url', 'tel', 'password', 'email', ''];
    return textTypes.includes(type?.toLowerCase() || '');
  }

  function insertText(element, text) {
    if (!element) {
      console.warn('Utter PTT: No target element for text insertion');
      return;
    }

    if (!text) {
      console.warn('Utter PTT: Empty text, skipping insertion');
      return;
    }

    console.log('Utter PTT: Inserting text:', text, 'into element:', element.tagName);

    // Check if element is still in the DOM
    if (!document.body.contains(element)) {
      console.warn('Utter PTT: Target element no longer in DOM');
      return;
    }

    try {
      // Re-focus the element to ensure we can insert
      element.focus();

      if (element.isContentEditable) {
        // For contenteditable elements
        const success = document.execCommand('insertText', false, text);
        if (!success) {
          console.warn('Utter PTT: execCommand failed, trying fallback');
          // Fallback: insert at selection
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
          }
        }
        console.log('Utter PTT: Inserted into contenteditable');
      } else {
        // For input/textarea elements
        const start = element.selectionStart ?? element.value?.length ?? 0;
        const end = element.selectionEnd ?? element.value?.length ?? 0;
        const value = element.value || '';

        element.value = value.substring(0, start) + text + value.substring(end);
        element.selectionStart = element.selectionEnd = start + text.length;

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Utter PTT: Inserted into input/textarea');
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
      console.log('Utter PTT: Saved to history');
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        contextInvalidated = true;
        return;
      }
      console.error('Utter PTT: Error saving to history:', err);
    }
  }
})();
