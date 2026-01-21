# Privacy Policy for Utter

**Last Updated:** January 2025

## Overview

Utter is a Chrome extension that provides voice-to-text input functionality. This privacy policy explains how Utter handles your data.

**The short version:** Utter does not collect, store, or transmit your personal data to any external servers. All data stays on your device.

## Data We Collect

**We do not collect any data.**

Utter does not:
- Collect personal information
- Track your browsing activity
- Send data to external servers
- Use analytics or telemetry
- Require user accounts
- Store data in the cloud

## Data Stored Locally on Your Device

Utter stores the following data locally on your device using Chrome's storage API (`chrome.storage.local`). This data never leaves your device:

### User Preferences
- Activation mode (toggle or push-to-talk)
- Custom push-to-talk key combination
- Selected microphone device ID
- Audio feedback preferences

### Voice Input History
- Transcribed text from your voice inputs
- Timestamps of when each input was made
- URLs of pages where inputs were made

**You can delete this data at any time** through the extension's side panel (for history) or by removing the extension.

## Speech Recognition

Utter uses the Web Speech Recognition API (`webkitSpeechRecognition`), which is built into Google Chrome. When you use voice input:

1. Your speech is sent to Google's speech recognition servers for processing
2. The transcribed text is returned to your browser
3. Utter receives only the text transcription

**Important:** The speech recognition service is provided by Google, not by Utter. Google's handling of speech data is governed by [Google's Privacy Policy](https://policies.google.com/privacy). Utter has no access to and does not store the audio data processed by Google's speech recognition service.

## Microphone Access

Utter requires microphone access to function. Your microphone is:
- Only accessed when you explicitly activate voice input (via hotkey or push-to-talk)
- Never accessed in the background
- Never recorded or stored by Utter

The microphone stream is used solely to provide input to Chrome's Web Speech Recognition API.

## Permissions Explained

Utter requests the following permissions:

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the current tab to insert transcribed text into text fields |
| `scripting` | Inject the voice input interface when you activate the hotkey |
| `storage` | Save your preferences and voice input history locally |
| `sidePanel` | Display your voice input history in Chrome's side panel |
| `offscreen` | Fallback for speech recognition on pages that block microphone access |

The content script runs on all URLs solely to enable push-to-talk functionality. It listens for your configured key combination and does not read or collect any page content.

## Third-Party Services

Utter uses only one third-party service:

**Google Web Speech API**
- Purpose: Convert speech to text
- Data sent: Audio from your microphone (only when voice input is active)
- Privacy policy: https://policies.google.com/privacy

Utter does not use any other third-party services, analytics, or tracking tools.

## Data Security

- All user preferences and history are stored locally using Chrome's secure storage APIs
- No data is transmitted over the network (except speech data to Google's speech recognition service)
- No encryption keys or sensitive credentials are stored

## Children's Privacy

Utter does not knowingly collect any personal information from children. The extension does not require accounts or collect any user data.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last Updated" date at the top. Significant changes will be noted in the extension's version history.

## Your Rights

Since Utter does not collect or store your personal data on external servers, there is no personal data for us to access, modify, or delete. All data stored by Utter exists only on your local device and can be deleted by:

1. Clearing history through the extension's side panel
2. Removing the extension from Chrome
3. Clearing Chrome's extension storage

## Open Source

Utter is open source. You can review the source code to verify our privacy practices:
https://github.com/nicosalm/utter

## Contact

For questions about this privacy policy or the extension:
- GitHub Issues: https://github.com/nicosalm/utter/issues

---

## Summary

| Question | Answer |
|----------|--------|
| Do you collect personal data? | No |
| Do you sell data? | No |
| Do you use analytics? | No |
| Is data stored in the cloud? | No |
| Can I delete my data? | Yes, through the extension or by uninstalling |
| Is the extension open source? | Yes |
