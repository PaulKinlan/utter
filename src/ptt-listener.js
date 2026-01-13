// Push-to-talk listener - runs on all pages
// Listens for configured key combo to start/stop speech recognition

(function () {
  const INDICATOR_ID = 'utter-listening-indicator';

  let settings = {
    activationMode: 'toggle',
    pttKeyCombo: null,
    selectedMicrophone: '',
    soundFeedbackEnabled: true
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
    if (changes.selectedMicrophone) {
      settings.selectedMicrophone = changes.selectedMicrophone.newValue;
    }
    if (changes.soundFeedbackEnabled !== undefined) {
      settings.soundFeedbackEnabled = changes.soundFeedbackEnabled.newValue;
    }
  });

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        'activationMode',
        'pttKeyCombo',
        'selectedMicrophone',
        'soundFeedbackEnabled'
      ]);
      settings.activationMode = result.activationMode || 'toggle';
      settings.pttKeyCombo = result.pttKeyCombo || null;
      settings.selectedMicrophone = result.selectedMicrophone || '';
      settings.soundFeedbackEnabled = result.soundFeedbackEnabled !== false;
    } catch (err) {
      console.error('Utter: Error loading settings:', err);
    }
  }

  // Listen for keydown
  document.addEventListener('keydown', async (e) => {
    // Only handle push-to-talk mode
    if (settings.activationMode !== 'push-to-talk') return;
    if (!settings.pttKeyCombo) return;

    // Check if key combo matches
    if (!matchesCombo(e, settings.pttKeyCombo)) return;

    // Prevent default and stop propagation
    e.preventDefault();
    e.stopPropagation();

    // Don't restart if already held
    if (isKeyHeld) return;
    isKeyHeld = true;

    console.log('Utter PTT: Key combo pressed, starting recognition');
    await startRecognition();
  }, true);

  // Listen for keyup
  document.addEventListener('keyup', (e) => {
    // Only handle push-to-talk mode
    if (settings.activationMode !== 'push-to-talk') return;
    if (!settings.pttKeyCombo) return;
    if (!isKeyHeld) return;

    // Check if the released key is part of our combo
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
    // Check if the released key is the main key or any required modifier
    if (e.key === combo.key || e.code === combo.code) return true;
    if (combo.ctrlKey && e.key === 'Control') return true;
    if (combo.shiftKey && e.key === 'Shift') return true;
    if (combo.altKey && e.key === 'Alt') return true;
    if (combo.metaKey && e.key === 'Meta') return true;
    return false;
  }

  // Play an audio file from the extension
  function playSound(filename) {
    if (!settings.soundFeedbackEnabled) return;

    try {
      const audioUrl = chrome.runtime.getURL(`audio/${filename}`);
      const audio = new Audio(audioUrl);
      audio.volume = 0.5;
      audio.play().catch(err => {
        console.warn('Utter PTT: Could not play sound:', err);
      });
    } catch (err) {
      console.warn('Utter PTT: Could not play sound:', err);
    }
  }

  // Play start sound (beep)
  function playStartSound() {
    playSound('beep.wav');
  }

  // Play stop sound (boop)
  function playStopSound() {
    playSound('boop.wav');
  }

  async function startRecognition() {
    // Stop any existing recognition
    if (window.__utterRecognition) {
      const oldRecognition = window.__utterRecognition;
      window.__utterRecognition = null;
      oldRecognition.stop();
    }

    const targetElement = document.activeElement;

    // Check if the active element is a text input
    const isTextInput =
      (targetElement.tagName === 'INPUT' && isTextInputType(targetElement.type)) ||
      targetElement.tagName === 'TEXTAREA' ||
      targetElement.isContentEditable;

    if (!isTextInput) {
      showIndicator('Focus on a text field first', true);
      return;
    }

    // Check for Speech Recognition API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showIndicator('Speech Recognition not supported', true);
      return;
    }

    // Prime the selected microphone
    const micStream = await primeSelectedMicrophone();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    window.__utterRecognition = recognition;
    window.__utterTargetElement = targetElement;
    window.__utterMicStream = micStream;

    recognition.onstart = () => {
      console.log('Utter PTT: Speech recognition started');
      playStartSound();
      showIndicator('Listening...');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        insertText(window.__utterTargetElement, finalTranscript);
        saveToHistory(finalTranscript);
      }

      if (interimTranscript) {
        updateIndicator(`Listening: ${interimTranscript}`);
      } else {
        updateIndicator('Listening...');
      }
    };

    recognition.onerror = (event) => {
      console.warn('Utter PTT: Speech recognition error:', event.error);

      if (event.error === 'no-speech' || event.error === 'aborted') {
        updateIndicator('Listening... (speak now)');
        return;
      }

      showIndicator(`Error: ${event.error}`, true);
      cleanup();
    };

    recognition.onend = () => {
      console.log('Utter PTT: Speech recognition ended');

      // In PTT mode, only restart if key is still held
      if (window.__utterRecognition && isKeyHeld) {
        console.log('Utter PTT: Restarting recognition (key still held)');
        try {
          recognition.start();
        } catch (err) {
          console.error('Utter PTT: Failed to restart:', err);
          cleanup();
        }
        return;
      }

      cleanup();
    };

    recognition.start();
  }

  function stopRecognition() {
    if (window.__utterRecognition) {
      const recognition = window.__utterRecognition;
      window.__utterRecognition = null;
      recognition.stop();
    }
  }

  async function primeSelectedMicrophone() {
    try {
      if (!settings.selectedMicrophone) {
        return null;
      }

      const constraints = {
        audio: {
          deviceId: { exact: settings.selectedMicrophone }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      console.warn('Utter PTT: Could not prime microphone:', err.message);
      return null;
    }
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
    playStopSound();
    if (window.__utterMicStream) {
      window.__utterMicStream.getTracks().forEach(track => track.stop());
      window.__utterMicStream = null;
    }
    window.__utterRecognition = null;
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

      // Keep only the last 500 entries to prevent storage bloat
      const trimmedHistory = history.slice(-500);

      await chrome.storage.local.set({ utterHistory: trimmedHistory });
      console.log('Utter PTT: Saved to history');
    } catch (err) {
      console.error('Utter PTT: Error saving to history:', err);
    }
  }
})();
