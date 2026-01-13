# Software Requirements

Tools and dependencies needed to develop this Chrome extension.

## Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | JavaScript runtime for build tools |
| npm | 10+ | Package manager |
| Chrome | Latest stable | Testing and debugging |

## Development Dependencies

Installed via `npm install`:

| Package | Purpose |
|---------|---------|
| esbuild | Fast JavaScript bundler |
| eslint | Code linting |

## Chrome for Testing

For automated testing, use Chrome for Testing:
- Download: https://googlechromelabs.github.io/chrome-for-testing/
- Provides versioned Chrome binaries for consistent test environments

## Recommended VS Code Extensions

- Chrome Extension Manifest JSON Schema
- ESLint

## System Setup

```bash
# Verify Node.js version
node --version  # Should be 20+

# Install dependencies
npm install

# Load extension in Chrome
# 1. Navigate to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the dist/ folder
```
