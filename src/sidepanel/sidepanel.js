// Side panel script - displays voice input history

const historyList = document.getElementById('history-list');
const clearAllBtn = document.getElementById('clear-all');

let history = [];

// Load history on init
init();

async function init() {
  await loadHistory();
  renderHistory();

  // Listen for storage changes to update in real-time
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.utterHistory) {
      history = changes.utterHistory.newValue || [];
      renderHistory();
    }
  });
}

async function loadHistory() {
  try {
    const result = await chrome.storage.local.get(['utterHistory']);
    history = result.utterHistory || [];
  } catch (err) {
    console.error('Error loading history:', err);
    history = [];
  }
}

function renderHistory() {
  // Clear existing content
  while (historyList.firstChild) {
    historyList.removeChild(historyList.firstChild);
  }

  if (history.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No voice inputs yet. Use the keyboard shortcut to start dictating.';
    historyList.appendChild(emptyState);
    return;
  }

  // Render items in reverse chronological order
  const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

  sortedHistory.forEach((item) => {
    const itemEl = createHistoryItem(item);
    historyList.appendChild(itemEl);
  });
}

function createDeleteIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M18 6L6 18M6 6l12 12');
  svg.appendChild(path);

  return svg;
}

function createHistoryItem(item) {
  const div = document.createElement('div');
  div.className = 'history-item';
  div.dataset.id = item.id;

  // Header with meta info and delete button
  const header = document.createElement('div');
  header.className = 'history-item-header';

  const meta = document.createElement('div');
  meta.className = 'history-item-meta';

  const time = document.createElement('span');
  time.className = 'history-item-time';
  time.textContent = formatTime(item.timestamp);
  meta.appendChild(time);

  if (item.url) {
    const url = document.createElement('a');
    url.className = 'history-item-url';
    url.href = item.url;
    url.textContent = formatUrl(item.url);
    url.title = item.url;
    url.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: item.url });
    });
    meta.appendChild(url);
  }

  header.appendChild(meta);

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-button danger history-item-delete';
  deleteBtn.title = 'Delete this entry';
  deleteBtn.appendChild(createDeleteIcon());
  deleteBtn.addEventListener('click', () => deleteItem(item.id));
  header.appendChild(deleteBtn);

  div.appendChild(header);

  // Text content
  const text = document.createElement('p');
  text.className = 'history-item-text';
  text.textContent = item.text;
  div.appendChild(text);

  return div;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
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

function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '');
  } catch {
    return url;
  }
}

async function deleteItem(id) {
  history = history.filter(item => item.id !== id);
  await saveHistory();
  renderHistory();
}

async function clearAllHistory() {
  history = [];
  await saveHistory();
  renderHistory();
}

async function saveHistory() {
  try {
    await chrome.storage.local.set({ utterHistory: history });
  } catch (err) {
    console.error('Error saving history:', err);
  }
}

// Clear all button with confirmation
clearAllBtn.addEventListener('click', () => {
  if (history.length === 0) return;

  showConfirmDialog(
    'Clear All History',
    'Are you sure you want to delete all voice input history? This cannot be undone.',
    clearAllHistory
  );
});

function showConfirmDialog(title, message, onConfirm) {
  // Create dialog
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';

  const content = document.createElement('div');
  content.className = 'confirm-dialog-content';

  const h2 = document.createElement('h2');
  h2.textContent = title;
  content.appendChild(h2);

  const p = document.createElement('p');
  p.textContent = message;
  content.appendChild(p);

  const buttons = document.createElement('div');
  buttons.className = 'confirm-dialog-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.remove());
  buttons.appendChild(cancelBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-danger';
  confirmBtn.textContent = 'Delete';
  confirmBtn.addEventListener('click', () => {
    onConfirm();
    dialog.remove();
  });
  buttons.appendChild(confirmBtn);

  content.appendChild(buttons);
  dialog.appendChild(content);
  document.body.appendChild(dialog);

  // Close on backdrop click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.remove();
    }
  });
}
