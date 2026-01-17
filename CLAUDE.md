# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Utter is a Chrome extension that provides a global hotkey to invoke the Web Speech Recognition API for voice-to-text input. Targets the latest stable Chrome version using Manifest V3.

## Documentation Workflow (MANDATORY)

When making ANY changes to the extension, you MUST update the relevant documentation files. This is not optional.

### When Adding New Features:
1. Update `PRODUCT_REQUIREMENTS.md` with the feature description, user flow, and technical requirements
2. Update `CHROME_WEB_STORE.md` with:
   - New feature description in the detailed description
   - Version history entry
   - Any new permission justifications if permissions changed
3. Update `PRIVACY.md` if the feature affects:
   - Data collection or storage
   - New permissions
   - Third-party service usage

### When Changing Permissions:
1. Update `manifest.json` with the new permission
2. Update `CHROME_WEB_STORE.md` "Permissions Justification" section with a clear explanation of why the permission is needed
3. Update `PRIVACY.md` "Permissions Explained" table

### When Releasing a New Version:
1. Update version number in `manifest.json`
2. Add version history entry in `CHROME_WEB_STORE.md`
3. Review all sections in `CHROME_WEB_STORE.md` for accuracy

### Key Documentation Files:

| File | Purpose | When to Update |
|------|---------|----------------|
| `PRODUCT_REQUIREMENTS.md` | Technical requirements and feature specifications | When features change |
| `CHROME_WEB_STORE.md` | Chrome Web Store listing content (descriptions, permissions, screenshots) | When features, permissions, or version changes |
| `PRIVACY.md` | Privacy policy for users | When data handling or permissions change |

### Chrome Web Store Documentation (`CHROME_WEB_STORE.md`)

This file contains EVERYTHING needed for the Chrome Web Store listing:
- Extension name and descriptions (short and detailed)
- Permission justifications (copy directly into CWS dashboard)
- Privacy practice disclosures
- Screenshot requirements
- Version history
- Review notes for the CWS team

**This file must accurately reflect the current state of the extension at all times.**

## Build Commands

```bash
# Install dependencies
npm install

# Build the extension (outputs to dist/)
npm run build

# Package for Chrome Web Store (creates extension.zip from dist/)
npm run package

# Run linting
npm run lint

# Regenerate placeholder icons
npm run generate-icons
```

## Required Assets

Icons must exist in `src/icons/` before building:
- `icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`

Run `npm run generate-icons` to create placeholder icons if missing.

## Chrome Extension Development Guidelines

### API Usage
- Always use the most modern Chrome Extension APIs available
- Target the latest stable Chrome version - check https://chromestatus.com for feature availability
- Use Manifest V3 exclusively (service workers, not background pages)
- Prefer `chrome.scripting` over deprecated `chrome.tabs.executeScript`
- Use `chrome.storage.session` for temporary data, `chrome.storage.local` for persistent data

### Browser Compatibility
- **Target: Latest stable Chrome only** (currently Chrome 130+)
- **No polyfills required** - all modern web platform features are available:
  - Native ES modules with `import`/`export`
  - Top-level `await`
  - `modulepreload` (no polyfill needed)
  - Native `fetch`, `Promise`, `async/await`
  - All modern CSS features (container queries, `:has()`, nesting, etc.)
  - All modern JavaScript features (optional chaining, nullish coalescing, private fields, etc.)
- **Do not add polyfills or compatibility shims** - if a feature isn't available in the latest Chrome, find an alternative approach rather than polyfilling
- Remove any existing polyfills found in the codebase - they add unnecessary bloat

### Permissions
- Request only the minimum permissions required for functionality
- Prefer `activeTab` over broad host permissions when possible
- Use optional permissions (`optional_permissions` in manifest) for features not needed at install time
- Document why each permission is needed in the manifest comments

### Architecture
- `src/` - Source files
  - `background.js` - Service worker (extension background logic)
  - `content.js` - Content scripts (injected into web pages)
  - `popup/` - Browser action popup UI
  - `options/` - Extension options page
- `dist/` - Built extension (do not edit directly)
- `manifest.json` - Extension manifest in src/, copied to dist/ on build

### Code Style
- Use ES modules where supported
- Prefer async/await over callbacks for Chrome APIs
- All Chrome API calls should handle errors appropriately

### Speech Recognition Architecture (DO NOT REGRESS)

The extension uses an **iframe-based architecture** for speech recognition. This design is critical and must not be changed without understanding why it exists.

**Why Iframes:**
- An iframe with `allow="microphone"` has independent microphone permission, working on ANY page regardless of the page's CSP or permissions
- The Web Speech API runs in an isolated context, preventing conflicts with page scripts
- Works without requiring sidepanel to be open or offscreen documents (which lack DOM access)

**Key Components:**
1. `ptt-listener.js` - Persistent content script for push-to-talk mode (keydown/keyup)
2. `content.js` - Injected script for hotkey toggle mode
3. `recognition-frame/` - Iframe that runs Web Speech API with its own microphone access

**Critical Implementation Rules:**
- ALWAYS create iframe with `allow="microphone"` attribute
- ALWAYS use `chrome.runtime.getURL()` to get the iframe src
- NEVER try to run speech recognition directly in content scripts
- NEVER use offscreen documents for speech recognition (no DOM access)
- Communication between iframe and content scripts uses `postMessage`
- When stopping recognition, ALWAYS send pending interim text as final (prevents word loss)

**Message Protocol:**
```javascript
// Iframe → Parent
{ source: 'utter-recognition-frame', type: 'recognition-result', finalTranscript, interimTranscript }

// Parent → Iframe
{ target: 'utter-recognition-frame', type: 'stop' }
```

See PRODUCT_REQUIREMENTS.md "Architecture" section for full details.

### Chrome Prompt API (Gemini Nano)

The extension uses Chrome's built-in Prompt API for AI-powered text refinement.

**API Reference:** https://developer.chrome.com/docs/ai/prompt-api

**Correct API Surface (DO NOT USE OLD API):**
```javascript
// Namespace: window.LanguageModel (NOT window.ai.languageModel)

// Check availability - returns "available", "downloading", or "unavailable"
const availability = await LanguageModel.availability();

// Get model parameters
const params = await LanguageModel.params();
// Returns: { defaultTopK, maxTopK, defaultTemperature, maxTemperature }

// Create session
const session = await LanguageModel.create({
  temperature: 0.3,
  topK: 3,
  initialPrompts: [],  // Optional: seed context with prior messages
  signal: abortSignal, // Optional: AbortSignal to destroy session
});

// Session methods
await session.prompt(input);           // Returns complete response
session.promptStreaming(input);        // Returns ReadableStream
await session.append(messages);        // Add context after creation
await session.clone();                 // Fork conversation
await session.measureInputUsage(input); // Check quota before prompting
session.destroy();                     // Free resources

// Session properties
session.inputUsage;  // Current tokens consumed
session.inputQuota;  // Maximum tokens available
```

**Message Format:**
- Messages have `role` ("user", "assistant", "system") and `content`
- Content supports mixed modality arrays with `type` and `value` fields

**Implementation:** See `src/refinement-service.js`

## Source Control

- **Always commit automatically** when you complete a task or logical unit of work - do not ask for permission
- Write descriptive commit messages that explain:
  - What changed (summary of the diff)
  - Why it changed (the purpose/intent of the change)
- Use conventional commit format when appropriate (e.g., `feat:`, `fix:`, `refactor:`, `docs:`)
