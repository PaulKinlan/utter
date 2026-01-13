# Utter

A Chrome extension that provides voice-to-text input via a global hotkey using the Web Speech Recognition API.

## Features

- **Global Hotkey**: Press `Ctrl+Shift+U` (or `Cmd+Shift+U` on Mac) to toggle voice input in any text field
- **Push-to-Talk Mode**: Hold a custom key combination to speak, release to stop
- **Microphone Selection**: Choose which audio input device to use
- **Voice Input History**: Side panel showing all previous transcriptions with timestamps and source URLs

## Installation

### From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/user/utter.git
   cd utter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` directory

## Usage

1. Focus on any text input field on a webpage
2. Press the hotkey (`Ctrl+Shift+U` / `Cmd+Shift+U`) to start listening
3. Speak - your words will be transcribed in real-time
4. Press the hotkey again to stop, or switch to Push-to-Talk mode in options

### Push-to-Talk Mode

1. Right-click the extension icon and select "Options"
2. Select "Push-to-Talk" mode
3. Click "Record" and press your preferred key combination
4. Hold the key combination while speaking, release to stop

### Voice History

Click the extension icon to open the side panel with your transcription history.

## Development

```bash
# Build the extension
npm run build

# Package for Chrome Web Store
npm run package

# Run linting
npm run lint

# Generate placeholder icons
npm run generate-icons
```

## Project Structure

```
src/
├── background.js      # Service worker
├── content.js         # Content script for voice input
├── ptt-listener.js    # Push-to-talk content script
├── manifest.json      # Extension manifest (Manifest V3)
├── icons/             # Extension icons
├── options/           # Options page
├── popup/             # Browser action popup
└── sidepanel/         # Side panel UI
```

## Permissions

- `activeTab` - Access the focused element for text input
- `scripting` - Execute content scripts
- `storage` - Persist user preferences and history
- `sidePanel` - Enable the voice history side panel

## License

Apache-2.0
