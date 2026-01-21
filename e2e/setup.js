import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Find Chrome/Chromium executable path
 */
export function findChrome() {
  const possiblePaths = [
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  // Check direct paths
  for (const chromePath of possiblePaths) {
    if (existsSync(chromePath)) {
      return chromePath;
    }
  }

  // Try using 'which' command on Unix-like systems
  try {
    const result = execSync('which google-chrome chromium-browser chromium 2>/dev/null', {
      encoding: 'utf8',
    }).trim();
    if (result) {
      return result.split('\n')[0];
    }
  } catch {
    // Command failed, continue
  }

  return null;
}

/**
 * Get path to the built extension
 */
export function getExtensionPath() {
  const distPath = path.resolve(__dirname, '..', 'dist');
  if (!existsSync(distPath)) {
    throw new Error(
      'Extension not built. Run "npm run build" first.'
    );
  }
  return distPath;
}

/**
 * Check if we're in a CI environment
 */
export function isCI() {
  return process.env.CI === 'true' || process.env.CI === '1';
}
