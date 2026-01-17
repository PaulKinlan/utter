// Push-to-talk listener - runs on all pages
// Listens for configured key combo to start/stop speech recognition
// Uses an iframe to run speech recognition directly (no sidepanel needed)

(function () {
  const INDICATOR_ID = 'utter-listening-indicator';
  const IFRAME_ID = 'utter-recognition-frame';

  let settings = {
    activationMode: 'toggle',
    pttKeyCombo: null,
    refinementEnabled: true,
    refinementPttKeyCombo: null,
    selectedRefinementPrompt: 'basic-cleanup'
  };

  let isKeyHeld = false;
  let isRefinementKeyHeld = false;
  let isRefinementRecording = false; // Track if current recording is for refinement
  let contextInvalidated = false;
  let recognitionFrame = null;
  let lastTranscriptionEntry = null; // Track last transcription for refinement
  let lastInsertionInfo = null; // Track where text was inserted for replacement

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
    if (changes.refinementEnabled) {
      settings.refinementEnabled = changes.refinementEnabled.newValue;
    }
    if (changes.refinementPttKeyCombo) {
      settings.refinementPttKeyCombo = changes.refinementPttKeyCombo.newValue;
    }
    if (changes.selectedRefinementPrompt) {
      settings.selectedRefinementPrompt = changes.selectedRefinementPrompt.newValue;
    }
  });

  async function loadSettings() {
    if (!isContextValid()) return;
    try {
      const result = await chrome.storage.local.get([
        'activationMode',
        'pttKeyCombo',
        'refinementEnabled',
        'refinementPttKeyCombo',
        'selectedRefinementPrompt'
      ]);
      settings.activationMode = result.activationMode || 'toggle';
      settings.pttKeyCombo = result.pttKeyCombo || null;
      settings.refinementEnabled = result.refinementEnabled !== false;
      settings.refinementPttKeyCombo = result.refinementPttKeyCombo || null;
      settings.selectedRefinementPrompt = result.selectedRefinementPrompt || 'basic-cleanup';
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        contextInvalidated = true;
        return;
      }
      console.error('Utter PTT: Error loading settings:', err);
    }
  }

  // Listen for messages from recognition iframe
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'utter-recognition-frame') return;
    handleRecognitionMessage(event.data);
  });

  function handleRecognitionMessage(message) {
    switch (message.type) {
      case 'recognition-started':
        // Iframe shows its own "Listening..." status
        removeIndicator(); // Remove any "Starting..." indicator
        break;

      case 'recognition-result':
        if (message.finalTranscript) {
          // In refinement mode, we accumulate but don't insert yet
          if (!isRefinementRecording) {
            insertText(window.__utterTargetElement, message.finalTranscript);
          }
          // Accumulate text for this session
          window.__utterSessionText = (window.__utterSessionText || '') + message.finalTranscript;
        }
        // Iframe shows interim transcription, no need for separate indicator
        break;

      case 'recognition-error':
        if (!message.recoverable) {
          showIndicator(`Error: ${message.error}`, true);
          cleanup();
        }
        // Iframe shows recoverable errors
        break;

      case 'recognition-ended':
        // Handle refinement mode - refine text before saving/inserting
        if (isRefinementRecording && window.__utterSessionText) {
          handleRefinementComplete(window.__utterSessionText, message.audioDataUrl);
        } else if (window.__utterSessionText) {
          // Normal mode - save accumulated text with audio data
          saveToHistory(window.__utterSessionText, message.audioDataUrl);
        }
        cleanup();
        break;
    }
  }

  async function handleRefinementComplete(text, audioDataUrl) {
    showIndicator('Refining text...');

    try {
      const promptId = settings.selectedRefinementPrompt;
      let refinedText;

      // Get presets from background service worker
      const presetsResponse = await chrome.runtime.sendMessage({ type: 'get-refinement-presets' });
      const PRESET_PROMPTS = presetsResponse?.presets || {};

      if (PRESET_PROMPTS[promptId]) {
        // Use preset - send to service worker
        const response = await chrome.runtime.sendMessage({
          type: 'refine-text',
          text: text,
          presetId: promptId
        });

        if (response.error) {
          throw new Error(response.error);
        }
        refinedText = response.refinedText;
      } else {
        // Get custom prompt and send to service worker
        const result = await chrome.storage.local.get(['customRefinementPrompts']);
        const customPrompts = result.customRefinementPrompts || [];
        const customPrompt = customPrompts.find(p => p.id === promptId);

        if (customPrompt) {
          const response = await chrome.runtime.sendMessage({
            type: 'refine-text',
            text: text,
            customPrompt: customPrompt.prompt
          });

          if (response.error) {
            throw new Error(response.error);
          }
          refinedText = response.refinedText;
        } else {
          throw new Error('Selected prompt not found');
        }
      }

      // Insert the refined text
      insertText(window.__utterTargetElement, refinedText);

      // Save to history with both original and refined text
      await saveToHistoryWithRefinement(text, refinedText, audioDataUrl);

      showIndicator('Text refined!');
      setTimeout(() => removeIndicator(), 1500);
    } catch (err) {
      console.error('Utter PTT: Error refining text:', err);
      // Fall back to inserting original text
      insertText(window.__utterTargetElement, text);
      saveToHistory(text, audioDataUrl);
      showIndicator(`Refinement failed: ${err.message}`, true);
    }
  }

  async function saveToHistoryWithRefinement(originalText, refinedText, audioDataUrl) {
    if (!isContextValid()) return;
    try {
      const result = await chrome.storage.local.get(['utterHistory']);
      const history = result.utterHistory || [];

      const entry = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text: originalText,
        refinedText: refinedText,
        timestamp: Date.now(),
        url: window.location.href
      };

      if (audioDataUrl) {
        entry.audioDataUrl = audioDataUrl;
      }

      history.unshift(entry);

      // Keep only last 100 entries
      if (history.length > 100) {
        history.pop();
      }

      await chrome.storage.local.set({ utterHistory: history });
      console.log('Utter PTT: Saved to history with refinement');

      lastTranscriptionEntry = entry;
    } catch (err) {
      console.error('Utter PTT: Error saving to history:', err);
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

  // Listen for refinement PTT keydown
  document.addEventListener('keydown', async (e) => {
    if (!isContextValid()) return;
    if (!settings.refinementEnabled) return;
    if (!settings.refinementPttKeyCombo) return;
    if (!matchesCombo(e, settings.refinementPttKeyCombo)) return;

    e.preventDefault();
    e.stopPropagation();

    if (isRefinementKeyHeld) return;
    isRefinementKeyHeld = true;

    console.log('Utter PTT: Refinement key pressed, starting refinement');
    await startRefinement();
  }, true);

  // Listen for refinement PTT keyup
  document.addEventListener('keyup', (e) => {
    if (!isContextValid()) return;
    if (!settings.refinementEnabled) return;
    if (!settings.refinementPttKeyCombo) return;
    if (!isRefinementKeyHeld) return;

    if (isPartOfCombo(e, settings.refinementPttKeyCombo)) {
      console.log('Utter PTT: Refinement key released, stopping recording');
      isRefinementKeyHeld = false;
      stopRefinementRecording();
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
    window.__utterSessionText = ''; // Accumulate all text from this session

    // Create iframe for speech recognition (iframe shows its own "Starting..." state)
    // This happens directly in response to keydown (user gesture)
    createRecognitionFrame();
  }

  function createRecognitionFrame() {
    // Remove any existing frame
    removeRecognitionFrame();

    try {
      const frameUrl = chrome.runtime.getURL('recognition-frame/recognition-frame.html');

      recognitionFrame = document.createElement('iframe');
      recognitionFrame.id = IFRAME_ID;
      recognitionFrame.src = frameUrl;
      recognitionFrame.allow = 'microphone';
      recognitionFrame.style.cssText = `
        position: fixed;
        bottom: 60px;
        right: 20px;
        width: 200px;
        height: 44px;
        border: none;
        border-radius: 6px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      `;

      document.body.appendChild(recognitionFrame);
      console.log('Utter PTT: Recognition frame created');
    } catch (err) {
      console.error('Utter PTT: Failed to create recognition frame:', err);
      showIndicator('Failed to start recognition', true);
      isKeyHeld = false;
    }
  }

  function removeRecognitionFrame() {
    if (recognitionFrame) {
      recognitionFrame.remove();
      recognitionFrame = null;
    }
    // Also remove any orphaned frames
    const existingFrame = document.getElementById(IFRAME_ID);
    if (existingFrame) {
      existingFrame.remove();
    }
  }

  function stopRecognition() {
    // Send stop message to iframe
    if (recognitionFrame?.contentWindow) {
      recognitionFrame.contentWindow.postMessage({
        target: 'utter-recognition-frame',
        type: 'stop'
      }, '*');
    }

    // Give iframe a moment to send final results, then remove
    setTimeout(() => {
      removeRecognitionFrame();
    }, 100);
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

        // Track insertion for contenteditable (best effort)
        lastInsertionInfo = {
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
        console.log('Utter PTT: Inserted into input/textarea');

        // Track insertion info for replacement during refinement
        lastInsertionInfo = {
          element: element,
          startPos: start,
          length: text.length,
          text: text,
          isContentEditable: false
        };
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

  function removeIndicator() {
    const indicator = document.getElementById(INDICATOR_ID);
    if (indicator) {
      indicator.remove();
    }
  }

  function cleanup() {
    window.__utterTargetElement = null;
    window.__utterSessionText = '';
    isRefinementRecording = false;
    removeIndicator();
    removeRecognitionFrame();
  }

  function replaceLastInsertion(refinedText) {
    // Check both local tracking (from PTT mode) and global tracking (from toggle mode)
    const insertionInfo = lastInsertionInfo || window.__utterLastInsertionInfo;

    if (!insertionInfo) {
      console.warn('Utter PTT: No insertion info, using regular insert');
      return false;
    }

    const { element, startPos, length, text, isContentEditable } = insertionInfo;

    // Verify element is still valid
    if (!element || !document.body.contains(element)) {
      console.warn('Utter PTT: Last insertion element no longer valid');
      return false;
    }

    try {
      element.focus();

      if (isContentEditable) {
        // For contenteditable, try to find and replace the last inserted text
        const currentText = element.textContent || '';
        const lastIndex = currentText.lastIndexOf(text);

        if (lastIndex !== -1) {
          // Select the text to replace
          const selection = window.getSelection();
          const range = document.createRange();

          // Find the text node and position
          let charCount = 0;
          let startNode = null;
          let startOffset = 0;
          let endNode = null;
          let endOffset = 0;

          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );

          while (walker.nextNode()) {
            const node = walker.currentNode;
            const nodeLength = node.textContent.length;

            if (charCount + nodeLength >= lastIndex && !startNode) {
              startNode = node;
              startOffset = lastIndex - charCount;
            }

            if (charCount + nodeLength >= lastIndex + text.length) {
              endNode = node;
              endOffset = (lastIndex + text.length) - charCount;
              break;
            }

            charCount += nodeLength;
          }

          if (startNode && endNode) {
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            range.deleteContents();
            range.insertNode(document.createTextNode(refinedText));
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);

            // Update tracking (both local and global)
            if (lastInsertionInfo) lastInsertionInfo.text = refinedText;
            if (window.__utterLastInsertionInfo) window.__utterLastInsertionInfo.text = refinedText;
            return true;
          }
        }

        // Fallback to regular insert
        return false;
      } else {
        // For input/textarea, we can precisely replace
        const value = element.value || '';

        // Verify the text is still there at the expected position
        const expectedEnd = startPos + length;
        if (value.substring(startPos, expectedEnd) === text) {
          // Replace the exact range
          element.value = value.substring(0, startPos) + refinedText + value.substring(expectedEnd);
          element.selectionStart = element.selectionEnd = startPos + refinedText.length;

          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));

          // Update tracking (both local and global)
          if (lastInsertionInfo) {
            lastInsertionInfo.length = refinedText.length;
            lastInsertionInfo.text = refinedText;
          }
          if (window.__utterLastInsertionInfo) {
            window.__utterLastInsertionInfo.length = refinedText.length;
            window.__utterLastInsertionInfo.text = refinedText;
          }

          console.log('Utter PTT: Replaced text at position', startPos);
          return true;
        } else {
          console.warn('Utter PTT: Text at tracked position does not match, cannot replace');
          return false;
        }
      }
    } catch (err) {
      console.error('Utter PTT: Error replacing text:', err);
      return false;
    }
  }

  async function startRefinement() {
    if (!isContextValid()) {
      showIndicator('Extension updated - reload page', true);
      isRefinementKeyHeld = false;
      return;
    }

    const targetElement = document.activeElement;
    const isTextInput =
      (targetElement.tagName === 'INPUT' && isTextInputType(targetElement.type)) ||
      targetElement.tagName === 'TEXTAREA' ||
      targetElement.isContentEditable;

    if (!isTextInput) {
      showIndicator('Focus on a text field first', true);
      isRefinementKeyHeld = false;
      return;
    }

    // Set up for refinement recording (same as PTT but with refinement flag)
    window.__utterTargetElement = targetElement;
    window.__utterSessionText = '';
    isRefinementRecording = true;

    // Create iframe for speech recognition
    createRecognitionFrame();
  }

  function stopRefinementRecording() {
    // Send stop message to iframe (same as stopRecognition)
    if (recognitionFrame?.contentWindow) {
      recognitionFrame.contentWindow.postMessage({
        target: 'utter-recognition-frame',
        type: 'stop'
      }, '*');
    }

    // Give iframe a moment to send final results, then remove
    setTimeout(() => {
      removeRecognitionFrame();
    }, 100);
  }

  async function saveToHistory(text, audioDataUrl = null) {
    if (!isContextValid()) return;
    try {
      const result = await chrome.storage.local.get(['utterHistory']);
      const history = result.utterHistory || [];

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
      console.log('Utter PTT: Saved to history with audio:', !!audioDataUrl);

      // Save this as the last transcription for potential refinement
      lastTranscriptionEntry = entry;
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        contextInvalidated = true;
        return;
      }
      console.error('Utter PTT: Error saving to history:', err);
    }
  }
})();
