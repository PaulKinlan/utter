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
  let contextInvalidated = false;
  let recognitionFrame = null;
  let lastTranscriptionEntry = null; // Track last transcription for refinement

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
          insertText(window.__utterTargetElement, message.finalTranscript);
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
        // Save accumulated text with audio data
        if (window.__utterSessionText) {
          saveToHistory(window.__utterSessionText, message.audioDataUrl);
        }
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
      console.log('Utter PTT: Refinement key released');
      isRefinementKeyHeld = false;
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
    window.__utterSessionText = '';
    removeIndicator();
    removeRecognitionFrame();
  }

  async function startRefinement() {
    if (!isContextValid()) {
      showIndicator('Extension updated - reload page', true);
      isRefinementKeyHeld = false;
      return;
    }

    // Check if we have a recent transcription to refine
    // Check both PTT mode entry and toggle mode entry (from content.js)
    const entryToRefine = lastTranscriptionEntry || window.__utterLastTranscription;

    if (!entryToRefine) {
      showIndicator('No recent transcription to refine', true);
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

    showIndicator('Refining text...');

    try {
      // Dynamically import the refinement service
      const { refineWithPreset, refineWithCustomPrompt, PRESET_PROMPTS } = await import(
        chrome.runtime.getURL('refinement-service.js')
      );

      const promptId = settings.selectedRefinementPrompt;
      let refinedText;

      // Check if it's a preset or custom prompt
      if (PRESET_PROMPTS[promptId]) {
        refinedText = await refineWithPreset(entryToRefine.text, promptId);
      } else {
        // Get custom prompt
        const result = await chrome.storage.local.get(['customRefinementPrompts']);
        const customPrompts = result.customRefinementPrompts || [];
        const customPrompt = customPrompts.find(p => p.id === promptId);

        if (customPrompt) {
          refinedText = await refineWithCustomPrompt(entryToRefine.text, customPrompt.prompt);
        } else {
          throw new Error('Selected prompt not found');
        }
      }

      // Insert the refined text
      insertText(targetElement, refinedText);

      // Update the history entry with refined text
      await updateHistoryWithRefinement(entryToRefine.id, refinedText);

      removeIndicator();
      showIndicator('Text refined!');
      setTimeout(() => removeIndicator(), 1500);

      isRefinementKeyHeld = false;
    } catch (err) {
      console.error('Utter PTT: Error refining text:', err);
      showIndicator(`Refinement failed: ${err.message}`, true);
      isRefinementKeyHeld = false;
    }
  }

  async function updateHistoryWithRefinement(entryId, refinedText) {
    if (!isContextValid()) return;
    try {
      const result = await chrome.storage.local.get(['utterHistory']);
      const history = result.utterHistory || [];

      const entry = history.find(e => e.id === entryId);
      if (entry) {
        entry.refinedText = refinedText;
        await chrome.storage.local.set({ utterHistory: history });
        console.log('Utter PTT: Updated history with refined text');
      }
    } catch (err) {
      console.error('Utter PTT: Error updating history with refinement:', err);
    }
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
