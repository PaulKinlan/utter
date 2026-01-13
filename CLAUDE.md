# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension project targeting the latest stable Chrome version using Manifest V3.

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
```

## Chrome Extension Development Guidelines

### API Usage
- Always use the most modern Chrome Extension APIs available
- Target the latest stable Chrome version - check https://chromestatus.com for feature availability
- Use Manifest V3 exclusively (service workers, not background pages)
- Prefer `chrome.scripting` over deprecated `chrome.tabs.executeScript`
- Use `chrome.storage.session` for temporary data, `chrome.storage.local` for persistent data

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
