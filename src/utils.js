// @ts-nocheck
// Shared utility functions for Utter extension

/**
 * Check if a keyboard event matches a key combo configuration
 * @param {KeyboardEvent} event - The keyboard event
 * @param {Object} combo - The combo configuration with ctrlKey, shiftKey, altKey, metaKey, key, code
 * @returns {boolean}
 */
export function matchesCombo(event, combo) {
  return (
    event.ctrlKey === combo.ctrlKey &&
    event.shiftKey === combo.shiftKey &&
    event.altKey === combo.altKey &&
    event.metaKey === combo.metaKey &&
    (event.key === combo.key || event.code === combo.code)
  );
}

/**
 * Check if a key release is part of a combo (any modifier or the main key)
 * @param {KeyboardEvent} event - The keyboard event
 * @param {Object} combo - The combo configuration
 * @returns {boolean}
 */
export function isPartOfCombo(event, combo) {
  if (event.key === combo.key || event.code === combo.code) return true;
  if (combo.ctrlKey && event.key === 'Control') return true;
  if (combo.shiftKey && event.key === 'Shift') return true;
  if (combo.altKey && event.key === 'Alt') return true;
  if (combo.metaKey && event.key === 'Meta') return true;
  return false;
}

/**
 * Check if an input type is a text-editable type
 * @param {string} type - The input type attribute
 * @returns {boolean}
 */
export function isTextInputType(type) {
  const textTypes = ['text', 'search', 'url', 'tel', 'password', 'email', ''];
  return textTypes.includes(type?.toLowerCase() || '');
}

/**
 * Format a key combo object into a human-readable string
 * @param {Object} combo - The combo configuration
 * @param {boolean} [isMac] - Whether the platform is Mac (auto-detected if not provided)
 * @returns {string}
 */
export function formatKeyCombo(combo, isMac) {
  // Auto-detect platform if not provided
  if (isMac === undefined) {
    isMac = typeof navigator !== 'undefined' &&
            navigator.platform?.toUpperCase().indexOf('MAC') >= 0;
  }

  const parts = [];

  if (combo.ctrlKey) parts.push('Ctrl');
  if (combo.altKey) parts.push(isMac ? 'Option' : 'Alt');
  if (combo.shiftKey) parts.push('Shift');
  if (combo.metaKey) parts.push(isMac ? 'Cmd' : 'Win');

  // Format the key nicely
  let keyDisplay = combo.key;
  if (combo.key === ' ') keyDisplay = 'Space';
  else if (combo.key === '.') keyDisplay = '.';
  else if (combo.key.length === 1) keyDisplay = combo.key.toUpperCase();

  parts.push(keyDisplay);

  return parts.join('+');
}

/**
 * Format a timestamp for display (e.g., "Today at 3:45 PM" or "Jan 5 at 3:45 PM")
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @param {Date} [now] - Current date for comparison (defaults to new Date())
 * @returns {string}
 */
export function formatTime(timestamp, now) {
  const date = new Date(timestamp);
  if (!now) now = new Date();

  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });

  if (isToday) {
    return `Today at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });

  return `${dateStr} at ${timeStr}`;
}

/**
 * Format a URL for display (hostname + pathname)
 * @param {string} url - The full URL
 * @returns {string}
 */
export function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    // Use host (includes port) instead of hostname (excludes port)
    return urlObj.host + (urlObj.pathname !== '/' ? urlObj.pathname : '');
  } catch {
    return url;
  }
}

/**
 * Generate a unique ID for history items
 * @returns {string}
 */
export function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/**
 * Trim history array to maximum size
 * @param {Array} history - The history array
 * @param {number} [maxSize=500] - Maximum number of items to keep
 * @returns {Array}
 */
export function trimHistory(history, maxSize = 500) {
  return history.slice(-maxSize);
}

/**
 * Insert text into an element (input, textarea, or contenteditable)
 * @param {HTMLElement} element - The target element
 * @param {string} text - The text to insert
 * @returns {boolean} - Whether insertion was successful
 */
export function insertText(element, text) {
  if (!element || !text) {
    return false;
  }

  try {
    element.focus();

    if (element.isContentEditable) {
      // For contenteditable elements
      const success = document.execCommand('insertText', false, text);
      if (!success) {
        // Fallback: insert at selection
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
        }
      }
      return true;
    } else if ('value' in element) {
      // For input/textarea elements
      const start = element.selectionStart ?? element.value?.length ?? 0;
      const end = element.selectionEnd ?? element.value?.length ?? 0;
      const value = element.value || '';

      element.value = value.substring(0, start) + text + value.substring(end);
      element.selectionStart = element.selectionEnd = start + text.length;

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
