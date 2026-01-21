// Content script for speech recognition UI and text insertion
// Uses iframe for speech recognition (like PTT mode)
// Falls back to sidepanel when iframe fails due to CSP/Permissions-Policy

(async function () {
  const INDICATOR_ID = 'utter-listening-indicator';
  const IFRAME_ID = 'utter-recognition-frame';
  const IFRAME_STARTUP_TIMEOUT = 3000; // 3 seconds to detect iframe failure
  const PERMISSION_ERRORS = ['not-allowed', 'permission-denied', 'permission-dismissed'];

  // Track if we're using sidepanel fallback
  let usingSidepanelFallback = false;
  let sidepanelSessionId = null;
  let iframeStartupTimer = null;

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
    stopRecognition();
    return;
  }

  // Store reference to the target element
  /** @type {HTMLElement | null} */
  const targetElement = /** @type {HTMLElement | null} */ (document.activeElement);

  console.log('Utter: Target element:', targetElement?.tagName, targetElement);

  if (!targetElement) {
    showIndicator('Focus on a text field first', true);
    return;
  }

  // Check if the active element is a text input
  const inputElement = /** @type {HTMLInputElement} */ (targetElement);
  const isTextInput =
    (targetElement.tagName === 'INPUT' && isTextInputType(inputElement.type)) ||
    targetElement.tagName === 'TEXTAREA' ||
    targetElement.isContentEditable;

  if (!isTextInput) {
    showIndicator('Focus on a text field first', true);
    return;
  }

  // Mark as active and store target element
  window.__utterActive = true;
  window.__utterTargetElement = targetElement;
  window.__utterSessionText = ''; // Accumulate all text from this session

  // Set up message listener for recognition events from iframe
  if (!window.__utterMessageListener) {
    window.__utterMessageListener = (event) => {
      if (event.data?.source !== 'utter-recognition-frame') return;
      handleRecognitionMessage(event.data);
    };
    window.addEventListener('message', window.__utterMessageListener);
  }

  // Set up listener for sidepanel recognition messages (via background)
  if (!window.__utterSidepanelListener) {
    window.__utterSidepanelListener = (message) => {
      if (message?.source !== 'utter-sidepanel') return;
      if (message.sessionId !== sidepanelSessionId) return;
      handleRecognitionMessage(message);
    };
    chrome.runtime.onMessage.addListener(window.__utterSidepanelListener);
  }

  // Create the recognition iframe
  createRecognitionFrame();

  function handleRecognitionMessage(message) {
    console.log('Utter Content: Received message:', message);

    switch (message.type) {
      case 'recognition-started':
        // Clear startup timer - iframe/sidepanel is working
        if (iframeStartupTimer) {
          clearTimeout(iframeStartupTimer);
          iframeStartupTimer = null;
        }
        // Show indicator for sidepanel mode (recording happens in sidepanel)
        if (usingSidepanelFallback) {
          showIndicator('Listening... (via sidepanel)');
        } else {
          removeIndicator();
        }
        break;

      case 'recognition-result':
        if (message.finalTranscript) {
          insertText(window.__utterTargetElement, message.finalTranscript);
          // Accumulate text for this session
          window.__utterSessionText += message.finalTranscript;
        }
        // Update interim display for sidepanel mode
        if (usingSidepanelFallback && message.interimTranscript) {
          showIndicator(`Listening: ${message.interimTranscript.substring(0, 30)}...`);
        }
        break;

      case 'recognition-error':
        if (!message.recoverable) {
          // Check if this is a permission error that we should fallback for
          if (!usingSidepanelFallback && PERMISSION_ERRORS.includes(message.error)) {
            console.log('Utter Content: Permission error in iframe, trying sidepanel fallback');
            removeRecognitionFrame();
            startSidepanelRecognition();
            return;
          }
          showIndicator(getErrorMessage(message.error), true);
          cleanup();
        }
        break;

      case 'recognition-ended':
        // Save accumulated text with audio data
        if (window.__utterSessionText) {
          saveToHistory(window.__utterSessionText, message.audioDataUrl);
        }
        cleanup();
        break;
    }
  }

  /**
   * Map error codes to user-friendly messages
   */
  function getErrorMessage(errorCode) {
    const errorMessages = {
      'not-allowed': 'Microphone access blocked by this page',
      'permission-denied': 'Microphone permission denied',
      'permission-dismissed': 'Microphone permission request dismissed',
      'no-speech': 'No speech detected',
      'audio-capture': 'No microphone available',
      'network': 'Network error - check your connection',
      'aborted': 'Recognition was aborted',
      'service-not-allowed': 'Speech service not available'
    };
    return errorMessages[errorCode] || `Error: ${errorCode}`;
  }

  function createRecognitionFrame() {
    // Remove any existing frame
    removeRecognitionFrame();

    try {
      const frameUrl = chrome.runtime.getURL('recognition-frame/recognition-frame.html');

      window.__utterRecognitionFrame = document.createElement('iframe');
      window.__utterRecognitionFrame.id = IFRAME_ID;
      window.__utterRecognitionFrame.src = frameUrl;
      window.__utterRecognitionFrame.allow = 'microphone';
      window.__utterRecognitionFrame.style.cssText = `
        position: fixed;
        bottom: 60px;
        right: 20px;
        width: 220px;
        height: 60px;
        border: none;
        border-radius: 8px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      `;

      // Handle iframe load errors (CSP blocking the iframe src)
      window.__utterRecognitionFrame.onerror = () => {
        console.log('Utter: Iframe load error, trying sidepanel fallback');
        removeRecognitionFrame();
        startSidepanelRecognition();
      };

      document.body.appendChild(window.__utterRecognitionFrame);
      console.log('Utter: Recognition frame created');

      // Set up startup timeout - if we don't get recognition-started within timeout,
      // assume iframe failed (e.g., Permissions-Policy blocking microphone)
      iframeStartupTimer = setTimeout(() => {
        if (!usingSidepanelFallback && window.__utterActive) {
          console.log('Utter: Iframe startup timeout, trying sidepanel fallback');
          removeRecognitionFrame();
          startSidepanelRecognition();
        }
      }, IFRAME_STARTUP_TIMEOUT);

    } catch (err) {
      console.error('Utter: Failed to create recognition frame:', err);
      // Try sidepanel fallback
      startSidepanelRecognition();
    }
  }

  /**
   * Start recognition using sidepanel (fallback mode)
   */
  async function startSidepanelRecognition() {
    if (usingSidepanelFallback) return; // Already using fallback

    usingSidepanelFallback = true;
    showIndicator('Opening sidepanel...');

    try {
      sidepanelSessionId = Date.now().toString();
      const response = await chrome.runtime.sendMessage({
        type: 'start-sidepanel-recognition',
        sessionId: sidepanelSessionId
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to start sidepanel recognition');
      }

      console.log('Utter: Sidepanel recognition started, session:', sidepanelSessionId);
    } catch (err) {
      console.error('Utter: Failed to start sidepanel recognition:', err);
      showIndicator(getErrorMessage(err.message || 'Failed to start recognition'), true);
      cleanup();
    }
  }

  function removeRecognitionFrame() {
    if (window.__utterRecognitionFrame) {
      window.__utterRecognitionFrame.remove();
      window.__utterRecognitionFrame = null;
    }
    // Also remove any orphaned frames
    const existingFrame = document.getElementById(IFRAME_ID);
    if (existingFrame) {
      existingFrame.remove();
    }
  }

  function stopRecognition() {
    // Clear startup timer if pending
    if (iframeStartupTimer) {
      clearTimeout(iframeStartupTimer);
      iframeStartupTimer = null;
    }

    if (usingSidepanelFallback && sidepanelSessionId) {
      // Stop sidepanel recognition
      chrome.runtime.sendMessage({
        type: 'stop-sidepanel-recognition',
        sessionId: sidepanelSessionId
      }).catch(() => {});
    } else if (window.__utterRecognitionFrame?.contentWindow) {
      // Send stop message to iframe
      window.__utterRecognitionFrame.contentWindow.postMessage({
        target: 'utter-recognition-frame',
        type: 'stop'
      }, '*');
    }

    // Give iframe/sidepanel a moment to send final results, then cleanup
    setTimeout(() => {
      cleanup();
    }, 100);
  }

  function isTextInputType(type) {
    const textTypes = ['text', 'search', 'url', 'tel', 'password', 'email', ''];
    return textTypes.includes(type?.toLowerCase() || '');
  }

  function insertText(element, text) {
    if (!element) {
      console.warn('Utter: No target element for text insertion');
      return;
    }

    if (!text) {
      console.warn('Utter: Empty text, skipping insertion');
      return;
    }

    console.log('Utter: Inserting text:', text, 'into element:', element.tagName);

    // Check if element is still in the DOM
    if (!document.body.contains(element)) {
      console.warn('Utter: Target element no longer in DOM');
      return;
    }

    try {
      // Re-focus the element to ensure we can insert
      element.focus();

      if (element.isContentEditable) {
        // For contenteditable elements
        const success = document.execCommand('insertText', false, text);
        if (!success) {
          console.warn('Utter: execCommand failed, trying fallback');
          // Fallback: insert at selection
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
          }
        }
        console.log('Utter: Inserted into contenteditable');

        // Track insertion for contenteditable (best effort) - share with ptt-listener.js
        window.__utterLastInsertionInfo = {
          element: element,
          text: text,
          isContentEditable: true
        };
      } else {
        // For input/textarea elements
        const start = element.selectionStart ?? element.value?.length ?? 0;
        const end = element.selectionEnd ?? element.value?.length ?? 0;
        const value = element.value || '';

        element.value = value.substring(0, start) + text + value.substring(end);
        const newCursorPos = start + text.length;
        element.selectionStart = element.selectionEnd = newCursorPos;

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Utter: Inserted into input/textarea');

        // Track insertion info for replacement during refinement - share with ptt-listener.js
        window.__utterLastInsertionInfo = {
          element: element,
          startPos: start,
          length: text.length,
          text: text,
          isContentEditable: false
        };
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

  function removeIndicator() {
    const indicator = document.getElementById(INDICATOR_ID);
    if (indicator) {
      indicator.remove();
    }
  }

  function cleanup() {
    window.__utterActive = false;
    window.__utterTargetElement = null;
    window.__utterSessionText = '';
    usingSidepanelFallback = false;
    sidepanelSessionId = null;
    if (iframeStartupTimer) {
      clearTimeout(iframeStartupTimer);
      iframeStartupTimer = null;
    }
    removeIndicator();
    removeRecognitionFrame();
  }

  /**
   * Save transcription to history
   * @param {string} text - The transcribed text
   * @param {string | null} [audioDataUrl=null] - Optional audio data URL
   */
  async function saveToHistory(text, audioDataUrl = null) {
    if (!isContextValid()) return;
    try {
      const result = await chrome.storage.local.get(['utterHistory']);
      /** @type {Array<{id: string, text: string, timestamp: number, url: string, audioDataUrl?: string}>} */
      const history = Array.isArray(result.utterHistory) ? result.utterHistory : [];

      /** @type {{id: string, text: string, timestamp: number, url: string, audioDataUrl?: string}} */
      const entry = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text: text,
        timestamp: Date.now(),
        url: window.location.href
      };

      // Add audio data if available
      if (audioDataUrl) {
        entry.audioDataUrl = audioDataUrl;
      }

      history.push(entry);

      const trimmedHistory = history.slice(-500);

      await chrome.storage.local.set({ utterHistory: trimmedHistory });
      console.log('Utter: Saved to history with audio:', !!audioDataUrl);

      // Store this as the last transcription globally for refinement
      // This allows the refinement hotkey (in ptt-listener.js) to work with toggle mode transcriptions
      window.__utterLastTranscription = entry;
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        return;
      }
      console.error('Utter: Error saving to history:', err);
    }
  }
})();
