# Chrome Web Store Listing

This document contains all the information needed for the Chrome Web Store listing. **This file must be updated whenever the extension's features, permissions, or functionality changes.**

## Extension Name

**Utter**

## Short Description (132 characters max)

Voice-to-text anywhere: press a hotkey or hold keys to speak, and your words appear in any text field. Fast, private, no account needed.

## Detailed Description (16,000 characters max)

Utter is a lightweight Chrome extension that brings voice-to-text input to any webpage. Simply press a keyboard shortcut or hold your custom key combination, speak naturally, and watch your words appear in real-time in any text field.

**Key Features:**

• **Universal Voice Input** — Works in any text field on any website. Write emails, fill forms, compose documents, or chat — all by speaking.

• **AI-Powered Text Refinement** — After transcribing, press Alt+R to automatically improve your text using Chrome's built-in AI (Gemini Nano). Remove "ums" and "uhs", fix grammar, or change the tone to be more formal or friendly. Choose from preset styles or create custom refinement prompts. Both original and refined versions are saved in your history.

• **Two Activation Modes:**
  - **Toggle Mode** — Press Ctrl+Shift+U (Cmd+Shift+U on Mac) to start listening, press again to stop
  - **Push-to-Talk** — Hold your custom key combination while speaking, release to stop. Perfect for quick voice inputs.

• **Voice Input History** — Access your transcription history in the side panel. Review past inputs with timestamps and source URLs, and easily delete entries you no longer need.

• **Audio Recording & Playback** — Automatically records audio alongside your transcriptions. Listen back to your recordings with an inline audio visualizer, verify transcription accuracy, and download both text and audio files.

• **Microphone Priority** — Set a priority order for your microphones. The extension automatically uses the highest-priority device that's connected, with seamless fallback to lower-priority devices. New devices are remembered and can be reordered anytime.

• **Visual Feedback** — A small floating indicator shows when Utter is listening and displays your speech in real-time as it's transcribed.

• **Audio Feedback** — Optional sounds let you know when voice recognition starts and stops.

• **Privacy Focused** — All speech processing uses Chrome's built-in Web Speech API. Text refinement uses Chrome's built-in AI (Gemini Nano), which runs entirely on your device. Your voice data is processed by Google's speech recognition service (the same service used by Google Search voice input) but is never stored by Utter. No account required, no data collection.

**How to Use:**

1. Install Utter from the Chrome Web Store
2. Click the extension icon and grant microphone permission when prompted
3. Focus on any text input field
4. Press Ctrl+Shift+U (or Cmd+Shift+U on Mac) to start voice input
5. Speak clearly — your words will appear as you talk
6. Press the hotkey again to stop

**For Push-to-Talk Mode:**

1. Go to the extension options (right-click icon → Options)
2. Select "Push-to-Talk" mode
3. Record your preferred key combination
4. Hold your key combo while speaking on any page

**Why Utter?**

- Fast — Start speaking instantly with a keyboard shortcut
- Simple — No complicated setup or accounts
- Private — No data stored, no analytics, no tracking
- Universal — Works on every website

**Support & Feedback:**

Visit our GitHub repository to report issues or suggest features: https://github.com/nicosalm/utter

---

## Single Purpose Description (For Chrome Web Store Review)

Utter provides voice-to-text input via keyboard shortcuts. Users press a hotkey or hold keys to activate speech recognition, and spoken words are transcribed into the currently focused text field.

---

## Category

**Productivity**

---

## Language

**English**

---

## Permissions Justification

This section explains why each permission is required. Copy these justifications into the Chrome Web Store Developer Dashboard.

### Permission: `activeTab`

**Justification:** Required to inject the speech recognition interface into the currently active tab when the user activates voice input via keyboard shortcut. This permission is used to:
1. Detect the currently focused text input element
2. Insert transcribed text into that element
3. Display the visual listening indicator on the page

We use `activeTab` instead of broader host permissions to minimize access — the extension only interacts with a page when explicitly activated by the user's keyboard shortcut.

### Permission: `scripting`

**Justification:** Required to inject the content script that handles speech recognition when the user presses the voice input hotkey. The `chrome.scripting.executeScript()` API is used to run the transcription interface in the active tab. This is only triggered by explicit user action (pressing the keyboard shortcut).

### Permission: `storage`

**Justification:** Required to save user preferences and voice input history locally on the user's device. Stored data includes:
1. Activation mode preference (toggle vs push-to-talk)
2. Custom push-to-talk key combination
3. Selected microphone device ID
4. Voice input history (transcriptions, timestamps, page URLs, audio recordings, and refined text)
5. Audio recordings stored as WebM files (base64 encoded) for playback
6. Text refinement preferences (enabled/disabled, selected refinement style, refinement hotkey, custom refinement prompts)

All data is stored locally using `chrome.storage.local` and is never transmitted to external servers.

### Permission: `sidePanel`

**Justification:** Required to display the voice input history panel. The side panel shows users their past transcriptions with timestamps and source page URLs, allowing them to review or delete entries. This feature is optional and the extension works fully without opening the side panel.

### Host Permission: `<all_urls>` (Content Scripts)

**Justification:** The push-to-talk feature requires a content script to run on all pages to listen for the user's custom key combination. This script:
1. Listens for keydown/keyup events matching the user's configured key combo
2. Activates speech recognition only when the user explicitly holds their key combo while focused on a text input
3. Does not read, collect, or modify any page content

The script is completely passive until the user activates it with their key combination.

---

## Privacy Practices (For Chrome Web Store)

### Single Purpose

Voice-to-text input via keyboard shortcuts.

### Permission Justification

See "Permissions Justification" section above.

### Data Usage

**Are you collecting or using data?** No

**Detailed Explanation:**
- Utter does NOT collect, transmit, or sell user data
- Speech is processed by Google's Web Speech API (Chrome's built-in speech recognition)
- Voice input history is stored locally on the user's device only
- No analytics, tracking, or telemetry
- No account required
- No external server communication

### Data Usage Disclosure Checkboxes

For the Chrome Web Store data usage disclosure, select:

- [ ] Personally identifiable information — NOT COLLECTED
- [ ] Health information — NOT COLLECTED
- [ ] Financial and payment information — NOT COLLECTED
- [ ] Authentication information — NOT COLLECTED
- [ ] Personal communications — NOT COLLECTED
- [ ] Location — NOT COLLECTED
- [ ] Web history — NOT COLLECTED
- [ ] User activity — NOT COLLECTED
- [ ] Website content — NOT COLLECTED

**Certification:** This extension does not collect or transmit user data. It does not sell data to third parties, does not use data for purposes unrelated to the extension's single purpose, and does not use data for creditworthiness or lending purposes.

---

## Store Assets Required

### Icon Sizes
- 128x128 pixels — Store listing icon
- 48x48 pixels — Extension management page
- 32x32 pixels — Toolbar icon (2x)
- 16x16 pixels — Toolbar icon (1x)

All icons should be located in `src/icons/`.

### Screenshots (1280x800 or 640x400 recommended)

Required screenshots to create:
1. **Hero shot** — Extension in action, showing the listening indicator while text appears in a text field
2. **Push-to-talk mode** — Options page showing the push-to-talk configuration
3. **History panel with audio player** — Side panel showing voice input history with inline audio player and visualizer
4. **Audio playback** — Close-up of audio player showing frequency visualizer and playback controls
5. **Options page** — Full options page with microphone selection

### Promotional Images (Optional)

- Small tile: 440x280 pixels
- Large tile: 920x680 pixels
- Marquee: 1400x560 pixels

---

## Version History

### v2.1.0 (Current)
- **NEW:** Audio device priority system — set a priority order for microphones
- **NEW:** Automatic device selection — uses the highest-priority connected device
- **NEW:** Seamless fallback — automatically switches to next priority device when preferred device is unavailable
- **NEW:** Device history — remembers all previously connected devices
- **NEW:** Drag-and-drop reordering in options page
- Replaced single microphone dropdown with full priority list management

### v2.0.0
- **NEW:** AI-powered text refinement using Chrome's built-in Prompt API (Gemini Nano)
- **NEW:** 5 preset refinement styles: Remove Filler Words, Basic Cleanup, Make Formal, Make Friendly, Make Concise
- **NEW:** Custom refinement prompt creation — create and save your own refinement styles
- **NEW:** Refinement hotkey (default: Alt+R) to improve text after transcription
- **NEW:** History entries now show both original and refined text side-by-side
- **NEW:** Download refined transcriptions as text files with both versions
- Enhanced options page with AI availability status indicator
- Improved sidepanel UI with refined text display

### v1.1.0
- **NEW:** Audio recording and playback — Automatically record audio during voice input sessions
- **NEW:** Inline audio player with real-time frequency visualizer
- **NEW:** Download transcriptions as text files
- **NEW:** Download audio recordings as WebM files
- Enhanced history panel with audio playback controls

### v1.0.0
- Initial release
- Global hotkey voice input (Ctrl+Shift+U / Cmd+Shift+U)
- Push-to-talk mode with custom key combinations
- Microphone selection in options
- Voice input history in side panel
- Audio feedback (optional beep sounds)
- Visual listening indicator

---

## Support Information

**Homepage URL:** https://github.com/nicosalm/utter

**Support URL:** https://github.com/nicosalm/utter/issues

**Privacy Policy URL:** (Link to PRIVACY.md hosted publicly or a privacy policy page)

---

## Developer Information

**Developer Name:** (Your name or organization)

**Developer Email:** (Required for Chrome Web Store)

**Developer Address:** (May be required for some regions)

---

## Review Notes for Chrome Web Store Team

This extension uses the Web Speech Recognition API (webkitSpeechRecognition) for voice-to-text functionality and the Chrome Prompt API (Gemini Nano) for optional text refinement. Key implementation details:

1. **Microphone access** is requested via an iframe with `allow="microphone"` attribute, which enables speech recognition to work on any page regardless of the page's own permissions.

2. **Content script on all URLs** (`<all_urls>`) is required solely for push-to-talk functionality and refinement hotkey — the script listens for the user's configured key combinations and does not interact with page content otherwise.

3. **Chrome Prompt API** is used for text refinement (v1.2.0+). The AI runs entirely on-device using Chrome's built-in Gemini Nano model. No API keys or remote servers required. Users can disable this feature in options.

4. **No remote code** — All JavaScript is bundled with the extension.

5. **No data collection** — The extension stores user preferences and history locally only. Voice data is processed by Chrome's built-in speech recognition service. Text refinement is processed by Chrome's on-device AI.

To test voice input:
1. Install the extension
2. Grant microphone permission when prompted
3. Focus on a text field (e.g., Google search box)
4. Press Ctrl+Shift+U (Windows/Linux) or Cmd+Shift+U (Mac)
5. Speak and observe transcription
6. Press the hotkey again to stop

To test AI text refinement:
1. After completing a voice transcription
2. Focus on a text field
3. Press Alt+R (default refinement hotkey)
4. Observe the text being automatically improved
5. Check the side panel history to see both original and refined versions
