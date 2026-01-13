# Product Requirements

This is a living document describing all features of the Utter Chrome extension. Update this file whenever new features are added.

## Overview

Utter is a Chrome extension that provides a global hotkey to invoke the Web Speech Recognition API, enabling voice-to-text input in any text field.

## Features

### v1.0 - Voice Input via Global Hotkey

**Description:** Press a keyboard shortcut to start speech recognition and transcribe spoken words into the currently focused text input.

**User Flow:**
1. User focuses on any text input field on a webpage
2. User presses the global hotkey (Ctrl+Shift+S / Cmd+Shift+S)
3. Speech recognition activates and begins listening
4. Transcribed text appears in real-time in the focused text field
5. Recognition stops when user stops speaking or presses the hotkey again

**Technical Requirements:**
- Use the Web Speech Recognition API (`webkitSpeechRecognition`)
- Register global hotkey via `chrome.commands` API
- Inject transcribed text into the active text input element
- Show visual indicator when listening is active

**Permissions Needed:**
- `activeTab` - to inject content script and access focused element
- `scripting` - to execute scripts in the active tab
