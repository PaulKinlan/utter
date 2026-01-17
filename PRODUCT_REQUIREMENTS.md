# Product Requirements

This is a living document describing all features of the Utter Chrome extension. Update this file whenever new features are added.

## Overview

Utter is a Chrome extension that provides a global hotkey to invoke the Web Speech Recognition API, enabling voice-to-text input in any text field.

## Features

### v1.0 - Voice Input via Global Hotkey

**Description:** Press a keyboard shortcut to start speech recognition and transcribe spoken words into the currently focused text input.

**User Flow:**
1. User focuses on any text input field on a webpage
2. User presses the global hotkey (Ctrl+Shift+U / Cmd+Shift+U)
3. Speech recognition activates and begins listening
4. Transcribed text appears in real-time in the focused text field
5. Recognition stops when user presses the hotkey again

**Technical Requirements:**
- Use the Web Speech Recognition API (`webkitSpeechRecognition`)
- Register global hotkey via `chrome.commands` API
- Inject transcribed text into the active text input element
- Show visual indicator when listening is active
- Auto-restart recognition on no-speech timeout

**Permissions Needed:**
- `activeTab` - to inject content script and access focused element
- `scripting` - to execute scripts in the active tab
- `storage` - to persist user preferences

---

### v1.1 - Microphone Selection

**Description:** Allow users to select which microphone to use for speech recognition via an options page.

**User Flow:**
1. User right-clicks extension icon → Options (or goes to chrome://extensions → Utter → Details → Extension options)
2. Options page shows list of available audio input devices
3. User grants microphone permission if needed
4. User selects preferred microphone from dropdown
5. Selection is saved and used for subsequent speech recognition sessions

**Technical Requirements:**
- Options page using `options_ui` in manifest
- Enumerate devices via `navigator.mediaDevices.enumerateDevices()`
- Save preference to `chrome.storage.local`
- Prime selected microphone via `getUserMedia()` before starting recognition
- Handle permission flow gracefully

---

### v1.2 - Push-to-Talk Mode

**Description:** Alternative activation mode where users hold a custom key combination to talk, releasing to stop. More natural for quick voice inputs.

**User Flow:**
1. User opens Options and selects "Push-to-talk mode"
2. User clicks "Record" and presses their desired key combination (e.g., Ctrl+Space)
3. Key combo is saved
4. On any webpage, user holds the key combo to start voice input
5. User speaks while holding the keys
6. Releasing any key in the combo stops recognition

**Technical Requirements:**
- Activation mode selector in options (Toggle vs Push-to-Talk)
- Key combo recorder that captures modifiers + key
- Persistent content script (`content_scripts` in manifest) running on all pages
- Listen for `keydown` to start recognition when combo matches
- Listen for `keyup` to stop recognition when any combo key is released
- Store settings in `chrome.storage.local`
- Sync settings changes via `chrome.storage.onChanged`

**Permissions Needed:**
- Content script runs on `<all_urls>` for push-to-talk functionality

---

### v1.3 - Voice Input History (Side Panel)

**Description:** A side panel that displays a history of all voice inputs with timestamps and source page URLs. Users can view and delete entries.

**User Flow:**
1. User clicks extension icon to open side panel (or via Chrome's side panel menu)
2. Side panel displays all previous voice inputs in reverse chronological order
3. Each entry shows: transcribed text, timestamp, and source page URL
4. User can click URL to open that page
5. User can delete individual entries or clear all history

**Technical Requirements:**
- Chrome Side Panel API (`side_panel` in manifest)
- Store history entries in `chrome.storage.local` (no sync)
- Each entry contains: id, text, timestamp, url
- Real-time updates via `chrome.storage.onChanged`
- Limit history to 500 entries to prevent storage bloat
- Confirm dialog before clearing all history

**Permissions Needed:**
- `sidePanel` - to enable the side panel feature

**Data Structure:**
```json
{
  "utterHistory": [
    {
      "id": "unique-id",
      "text": "transcribed text",
      "timestamp": 1234567890,
      "url": "https://example.com/page"
    }
  ]
}
```

---

### v1.4 - Audio Recording and Playback

**Description:** Automatically record audio alongside voice transcription, allowing users to listen back to their recordings with an inline audio visualizer and download both transcriptions and audio files.

**User Flow:**
1. User records voice input via hotkey, push-to-talk, or sidepanel
2. Audio is automatically captured during the recording session
3. In the side panel history, entries with audio show an inline audio player
4. Audio player displays:
   - Play/pause button
   - Time progress (current / total duration)
   - Real-time frequency visualizer with gradient bars
   - Progress bar (clickable to seek)
5. User can download the transcription as a text file
6. User can download the audio recording as a .webm file
7. Deleting a history entry removes both transcription and audio

**User Benefits:**
- Verify accuracy by listening to original recordings
- Keep audio records for reference or archival purposes
- Review pronunciation or speaking patterns
- Download transcriptions and recordings for use in other applications

**Technical Requirements:**
- Use `MediaRecorder` API to capture audio from the microphone stream
- Record in `audio/webm;codecs=opus` format for compatibility and small size
- Store audio as base64 data URLs in `chrome.storage.local` alongside transcriptions
- Web Audio API visualizer using `AnalyserNode` for real-time frequency display
- Canvas-based waveform rendering with gradient colors
- Inline audio player with custom controls (no default HTML5 audio element)
- Download functionality using Blob URLs and anchor element download attribute

**Implementation Details:**

**Audio Recording in recognition-frame.js:**
```javascript
// Start MediaRecorder with microphone stream
mediaRecorder = new MediaRecorder(micStream, {
  mimeType: 'audio/webm;codecs=opus'
});

mediaRecorder.ondataavailable = (event) => {
  if (event.data.size > 0) {
    audioChunks.push(event.data);
  }
};

mediaRecorder.start();

// On stop, convert to data URL
const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
const reader = new FileReader();
reader.onloadend = () => {
  const audioDataUrl = reader.result; // base64 data URL
  // Send to parent via postMessage
};
reader.readAsDataURL(audioBlob);
```

**Storage Schema Update:**
```json
{
  "utterHistory": [
    {
      "id": "unique-id",
      "text": "transcribed text",
      "timestamp": 1234567890,
      "url": "https://example.com/page",
      "audioDataUrl": "data:audio/webm;base64,..." // NEW FIELD
    }
  ]
}
```

**Audio Player Component:**
- Custom UI built with DOM elements (buttons, canvas, progress bar)
- Web Audio API for visualizer:
  - `AudioContext` to process audio
  - `AnalyserNode` for frequency data
  - `requestAnimationFrame` for smooth visualization
  - Gradient bars (indigo to purple) showing frequency spectrum
- Responsive canvas (400x60px) with bars representing frequency bins
- Progress bar updates on `audio.ontimeupdate` event
- Clickable progress bar for seeking to specific times

**Download Functionality:**
```javascript
function downloadText(item) {
  const blob = new Blob([item.text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transcription-${item.id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAudio(item) {
  const a = document.createElement('a');
  a.href = item.audioDataUrl;
  a.download = `recording-${item.id}.webm`;
  a.click();
}
```

**Storage Considerations:**
- Audio recordings stored as base64 data URLs (~1.3x original size overhead)
- Typical 10-second recording: ~80-150KB
- 500 entry limit helps prevent storage quota issues
- Chrome extensions have ~10MB local storage quota (QUOTA_BYTES)
- Monitor storage usage and warn users if approaching limits

---

### v1.5 - AI-Powered Text Refinement

**Description:** After transcribing voice input, users can press a refinement hotkey to automatically improve the text using Chrome's built-in Prompt API (Gemini Nano). The AI can remove filler words, fix grammar, or change the tone to be more formal or friendly.

**User Flow:**
1. User completes voice transcription using hotkey or push-to-talk
2. User presses the refinement hotkey (default: Alt+R)
3. AI processes the transcription using the selected refinement style
4. Refined text replaces the original text in the input field
5. History entry is updated to show both original and refined versions

**User Benefits:**
- Automatically clean up "ums", "uhs", and other filler words
- Improve grammar and punctuation without manual editing
- Quickly adjust tone (formal for professional emails, friendly for casual messages)
- Create custom refinement prompts for specific use cases
- Compare original and refined text in history for review

**Technical Requirements:**
- Chrome Prompt API (Gemini Nano) via `window.LanguageModel`
- API Reference: https://developer.chrome.com/docs/ai/prompt-api
- Settings stored in `chrome.storage.local`:
  - `refinementEnabled` (boolean)
  - `selectedRefinementPrompt` (string - preset ID or custom prompt ID)
  - `refinementPttKeyCombo` (object - key combination for refinement trigger)
  - `customRefinementPrompts` (array - user-defined refinement prompts)
- Preset refinement styles:
  - **Remove Filler Words** - Strip "um", "uh", "like", etc.
  - **Basic Cleanup** - Remove fillers + fix basic grammar
  - **Make Formal** - Professional, business-appropriate tone
  - **Make Friendly** - Warm, conversational tone
  - **Make Concise** - Shorten while preserving meaning
- Custom prompt creation via options page modal
- Refinement hotkey listener in `ptt-listener.js` (works with both toggle and PTT modes)
- Dynamic import of `refinement-service.js` to avoid loading AI code unless needed

**Implementation Details:**

**Refinement Service (`refinement-service.js`):**
```javascript
// Check API availability
const availability = await LanguageModel.availability();
// Returns: "available", "downloading", or "unavailable"

// Get model parameters
const params = await LanguageModel.params();
// Returns: { defaultTopK, maxTopK, defaultTemperature, maxTemperature }

// Create session with low temperature for consistency
const session = await LanguageModel.create({
  temperature: 0.3,
  topK: 3
});

// Refine text with preset prompt
const result = await session.prompt(`
You are a text refinement assistant. ${presetPrompt.systemPrompt}

Original text:
${text}
`);

session.destroy();
return result.trim();
```

**Storage Schema Update:**
```json
{
  "refinementEnabled": true,
  "selectedRefinementPrompt": "basic-cleanup",
  "refinementPttKeyCombo": {
    "ctrlKey": false,
    "shiftKey": false,
    "altKey": true,
    "metaKey": false,
    "key": "r",
    "code": "KeyR"
  },
  "customRefinementPrompts": [
    {
      "id": "custom-1234567890",
      "name": "Make Technical",
      "description": "Use technical jargon and precise language",
      "prompt": "Rephrase using technical terminology..."
    }
  ],
  "utterHistory": [
    {
      "id": "unique-id",
      "text": "Um so like I think we should uh probably fix the bug",
      "refinedText": "I think we should fix the bug.", // NEW FIELD
      "timestamp": 1234567890,
      "url": "https://example.com/page",
      "audioDataUrl": "data:audio/webm;base64,..."
    }
  ]
}
```

**Refinement Trigger Flow:**
1. User completes transcription (PTT or toggle mode)
2. Transcription entry saved to `lastTranscriptionEntry` (ptt-listener.js) or `window.__utterLastTranscription` (content.js)
3. User presses refinement hotkey (e.g., Alt+R)
4. `ptt-listener.js` detects key combo match
5. Validates:
   - Refinement is enabled
   - Recent transcription exists
   - Active element is a text input
6. Shows "Refining text..." indicator
7. Dynamically imports `refinement-service.js`
8. Calls appropriate refinement function based on selected prompt
9. Inserts refined text into active input field
10. Updates history entry with `refinedText` field
11. Shows "Text refined!" success indicator

**Options Page UI:**
- "Enable text refinement" checkbox
- Refinement style dropdown with preset options
- Custom prompts section:
  - List of user-created prompts with name, description
  - "Add Custom Prompt" button opens modal
  - Modal fields: Name, Description, Prompt Instructions
  - Delete button for each custom prompt
- Refinement hotkey recorder (same UI as PTT hotkey)
- AI availability status indicator:
  - ✓ Available and ready
  - ⚠ Model will download on first use
  - ✗ Not available (unsupported hardware/browser)

**History Entry Display:**
When `refinedText` exists, sidepanel shows both versions:
```
┌────────────────────────────────────────┐
│  ORIGINAL                              │
│  "Um so like I think we should uh      │
│   probably fix the bug"                │
│  (grayed out, italic)                  │
│                                        │
│  REFINED                               │
│  "I think we should fix the bug."      │
│  (normal weight, green label)          │
└────────────────────────────────────────┘
```

**Download Behavior:**
When downloading text with refinement, the `.txt` file contains both versions:
```
ORIGINAL:
Um so like I think we should uh probably fix the bug

---

REFINED:
I think we should fix the bug.
```

**Preset Prompts Structure:**
```javascript
export const PRESET_PROMPTS = {
  'remove-filler': {
    id: 'remove-filler',
    name: 'Remove Filler Words',
    description: 'Remove ums, uhs, and other filler words',
    systemPrompt: 'Remove filler words like "um", "uh", "like"...'
  },
  // ... more presets
};
```

**Permissions Needed:**
- None - Prompt API is available to all extensions by default in Chrome 138+
- Note: The origin trial permission `aiLanguageModelOriginTrial` has been deprecated

**Browser Compatibility:**
- Chrome 138+ (stable)
- Requires supported hardware:
  - Windows 10/11
  - macOS 13+ (Ventura and onwards)
  - Linux
  - ChromeOS Chromebook Plus with 22GB free storage
- Not available on mobile devices
- Language support (Chrome 140+): English, Spanish, Japanese

**Error Handling:**
- API not available: Show clear error message in options, disable refinement features
- Refinement fails: Show "Refinement failed: {error}" indicator, keep original text
- No recent transcription: Show "No recent transcription to refine" indicator
- Session timeout: Automatically destroy session and retry once

---

## Architecture

### Iframe-Based Speech Recognition Architecture

Utter uses an innovative **iframe-based architecture** for speech recognition that enables voice-to-text input on any webpage without requiring the page itself to have microphone permissions. This approach is unified across both hotkey (toggle) and push-to-talk modes.

#### Why This Architecture Works

**The Key Insight:** An iframe with `allow="microphone"` attribute can request and use microphone access independently of the host page's permissions. This provides:

1. **Universal Microphone Access** - The extension's iframe has its own permission context, so speech recognition works on any page regardless of whether the page allows microphone access
2. **Isolation from Page Scripts** - Speech recognition runs in a sandboxed iframe context, preventing conflicts with page JavaScript
3. **No Background Page Required** - Unlike offscreen documents or background workers, the iframe runs directly in the page context with full Web Speech API access
4. **Lightweight & Fast** - The iframe is created on-demand and destroyed after use, with minimal resource overhead

#### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Chrome Extension                                               │
├─────────────────────────────────────────────────────────────────┤
│  background.js (Service Worker)                                 │
│  - Receives hotkey command via chrome.commands                  │
│  - Injects content.js into active tab                           │
├─────────────────────────────────────────────────────────────────┤
│  ptt-listener.js (Persistent Content Script)                    │
│  - Runs on all pages via manifest content_scripts               │
│  - Listens for PTT key combo (keydown/keyup)                    │
│  - Creates/destroys recognition iframe                          │
│  - Inserts transcribed text into focused input                  │
├─────────────────────────────────────────────────────────────────┤
│  content.js (Injected Content Script)                           │
│  - Injected on hotkey press                                     │
│  - Creates/destroys recognition iframe                          │
│  - Handles toggle on/off behavior                               │
│  - Inserts transcribed text into focused input                  │
├─────────────────────────────────────────────────────────────────┤
│  recognition-frame/ (Isolated Iframe)                           │
│  ├── recognition-frame.html                                     │
│  └── recognition-frame.js                                       │
│  - Has allow="microphone" attribute                             │
│  - Runs Web Speech Recognition API                              │
│  - Manages microphone stream                                    │
│  - Sends results via postMessage                                │
│  - Displays visual feedback (listening status, interim text)    │
└─────────────────────────────────────────────────────────────────┘
```

#### Message Flow

**From Iframe to Parent (content.js / ptt-listener.js):**
```javascript
{
  source: 'utter-recognition-frame',
  type: 'recognition-started' | 'recognition-result' | 'recognition-error' | 'recognition-ended',
  finalTranscript: 'completed text',
  interimTranscript: 'partial text...',
  error: 'error-name',
  recoverable: boolean,
  audioDataUrl: 'data:audio/webm;base64,...' // Sent with recognition-ended (v1.4)
}
```

**From Parent to Iframe:**
```javascript
{
  target: 'utter-recognition-frame',
  type: 'stop'
}
```

#### Hotkey Mode Flow

1. User presses `Ctrl+Shift+U` (or `Cmd+Shift+U` on Mac)
2. Chrome dispatches command to service worker (`background.js`)
3. Service worker injects `content.js` via `chrome.scripting.executeScript()`
4. `content.js` validates focus is on a text input
5. Creates iframe pointing to `recognition-frame.html` with `allow="microphone"`
6. Iframe initializes speech recognition and starts listening
7. User speaks; interim results display in iframe
8. Final transcripts sent via `postMessage` to `content.js`
9. `content.js` inserts text into the focused input
10. Pressing hotkey again sends `stop` message and removes iframe

#### Push-to-Talk Mode Flow

1. `ptt-listener.js` runs persistently on all pages
2. User holds configured key combo (e.g., `Alt+.`)
3. On `keydown`, validates focus is on a text input
4. Creates iframe with `allow="microphone"` attribute
5. Iframe initializes speech recognition and starts listening
6. User speaks while holding keys; interim results display in iframe
7. Final transcripts sent via `postMessage` to `ptt-listener.js`
8. Text inserted into focused input in real-time
9. On `keyup` (any combo key released), sends `stop` message
10. Iframe sends any pending interim text as final, then cleanup

#### Critical Implementation Details

**Iframe Creation (in both content.js and ptt-listener.js):**
```javascript
const frameUrl = chrome.runtime.getURL('recognition-frame/recognition-frame.html');
const iframe = document.createElement('iframe');
iframe.src = frameUrl;
iframe.allow = 'microphone';  // KEY: Grants independent microphone access
iframe.style.cssText = `
  position: fixed;
  bottom: 60px;
  right: 20px;
  width: 220px;
  height: 60px;
  border: none;
  border-radius: 8px;
  z-index: 2147483647;
`;
document.body.appendChild(iframe);
```

**Speech Recognition in Iframe (recognition-frame.js):**
```javascript
// Get microphone access directly in iframe context
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

// Initialize Web Speech API
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;

recognition.onresult = (event) => {
  // Send results to parent
  window.parent.postMessage({
    source: 'utter-recognition-frame',
    type: 'recognition-result',
    finalTranscript: '...',
    interimTranscript: '...'
  }, '*');
};

recognition.start();
```

**Pending Interim Text on Stop:**
When PTT key is released, any pending interim transcript is sent as final to avoid losing spoken words that haven't been finalized by the speech recognition API:

```javascript
function stopRecognition() {
  // Send any pending interim text as final
  if (lastInterimTranscript) {
    sendToParent({
      type: 'recognition-result',
      finalTranscript: lastInterimTranscript,
      interimTranscript: ''
    });
    lastInterimTranscript = '';
  }
  // ... cleanup
}
```

#### Why Not Other Approaches?

| Approach | Problem |
|----------|---------|
| Offscreen Document | Cannot access Web Speech API (headless context) |
| Background Service Worker | No DOM, no Web Speech API |
| Side Panel | Requires panel to be open; clunky UX |
| Content Script Directly | Page's CSP may block microphone; conflicts with page scripts |
| **Iframe (current)** | ✅ Works everywhere, isolated, lightweight |

#### Web Accessible Resources

The manifest must expose the iframe resources:
```json
"web_accessible_resources": [{
  "matches": ["<all_urls>"],
  "resources": [
    "recognition-frame/recognition-frame.html",
    "recognition-frame/recognition-frame.js",
    "audio/beep.wav",
    "audio/boop.wav"
  ]
}]
```
