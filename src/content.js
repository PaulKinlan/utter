// Content script for speech recognition
// This script is injected each time the hotkey is pressed

(async function () {
  const INDICATOR_ID = 'utter-listening-indicator';

  // Sound feedback settings
  let soundFeedbackEnabled = true;
  let audioVolume = 0.5;

  // Load sound feedback settings
  try {
    const result = await chrome.storage.local.get(['soundFeedbackEnabled', 'audioVolume']);
    soundFeedbackEnabled = result.soundFeedbackEnabled !== false;
    audioVolume = result.audioVolume !== undefined ? result.audioVolume : 0.5;
  } catch (err) {
    console.warn('Utter: Could not load sound settings:', err);
  }

  // Play an audio file from the extension
  function playSound(filename) {
    if (!soundFeedbackEnabled) return;

    try {
      const audioUrl = chrome.runtime.getURL(`audio/${filename}`);
      const audio = new Audio(audioUrl);
      audio.volume = audioVolume;
      audio.play().catch(err => {
        console.warn('Utter: Could not play sound:', err);
      });
    } catch (err) {
      console.warn('Utter: Could not play sound:', err);
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

  // Check if we already have a recognition instance running - toggle off
  if (window.__utterRecognition) {
    console.log('Utter: Stopping recognition (toggle off)');
    const recognition = window.__utterRecognition;
    // Clear the reference BEFORE stopping so onend doesn't restart
    window.__utterRecognition = null;
    recognition.stop();
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

  // Check for Speech Recognition API support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showIndicator('Speech Recognition not supported', true);
    return;
  }

  // Prime the selected microphone before starting recognition
  const micStream = await primeSelectedMicrophone();

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  window.__utterRecognition = recognition;
  window.__utterTargetElement = targetElement;
  window.__utterMicStream = micStream;

  recognition.onstart = () => {
    console.log('Utter: Speech recognition started');
    playStartSound();
    showIndicator('Listening...');
  };

  recognition.onresult = (event) => {
    console.log('Utter: Got result', event.results);

    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      console.log('Utter: Transcript', i, transcript, 'isFinal:', event.results[i].isFinal);

      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    // Insert final text into the target element
    if (finalTranscript) {
      console.log('Utter: Inserting final text:', finalTranscript);
      insertText(window.__utterTargetElement, finalTranscript);
      saveToHistory(finalTranscript);
    }

    // Update indicator with interim results
    if (interimTranscript) {
      updateIndicator(`Listening: ${interimTranscript}`);
    } else {
      updateIndicator('Listening...');
    }
  };

  recognition.onerror = (event) => {
    console.warn('Utter: Speech recognition error:', event.error);

    // These errors are recoverable - just keep listening
    if (event.error === 'no-speech' || event.error === 'aborted') {
      updateIndicator('Listening... (speak now)');
      return;
    }

    // Fatal errors
    showIndicator(`Error: ${event.error}`, true);
    cleanup();
  };

  recognition.onend = () => {
    console.log('Utter: Speech recognition ended');

    // If we still have an active session, restart (handles no-speech timeout)
    if (window.__utterRecognition) {
      console.log('Utter: Restarting recognition');
      try {
        recognition.start();
      } catch (err) {
        console.error('Utter: Failed to restart:', err);
        cleanup();
      }
      return;
    }

    cleanup();
  };

  recognition.start();

  async function primeSelectedMicrophone() {
    try {
      // Get saved microphone preference from extension storage
      const result = await chrome.storage.local.get(['selectedMicrophone']);
      const deviceId = result.selectedMicrophone;

      if (!deviceId) {
        console.log('Utter: Using default microphone');
        return null;
      }

      console.log('Utter: Priming microphone:', deviceId);

      // Request the specific microphone - this may influence Chrome's speech recognition
      const constraints = {
        audio: {
          deviceId: { exact: deviceId }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Utter: Microphone primed successfully');
      return stream;
    } catch (err) {
      console.warn('Utter: Could not prime microphone:', err.message);
      return null;
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
        // For contenteditable elements, use execCommand for better compatibility
        document.execCommand('insertText', false, text);
        console.log('Utter: Used execCommand for contenteditable');
      } else {
        // For input/textarea elements
        const start = element.selectionStart ?? element.value.length;
        const end = element.selectionEnd ?? element.value.length;
        const value = element.value || '';

        element.value = value.substring(0, start) + text + value.substring(end);
        element.selectionStart = element.selectionEnd = start + text.length;

        // Trigger input event for frameworks that listen to it
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
    playStopSound();
    // Stop the microphone stream if we have one
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
      console.log('Utter: Saved to history');
    } catch (err) {
      console.error('Utter: Error saving to history:', err);
    }
  }
})();
