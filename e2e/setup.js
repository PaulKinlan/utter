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
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
  ];

  // Check direct paths
  for (const chromePath of possiblePaths) {
    if (chromePath && existsSync(chromePath)) {
      return chromePath;
    }
  }

  // Try using 'which' command on Unix-like systems only
  if (process.platform !== 'win32') {
    const commands = ['google-chrome', 'chromium-browser', 'chromium'];
    for (const cmd of commands) {
      try {
        const result = execSync(`which ${cmd}`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        if (result && existsSync(result)) {
          return result;
        }
      } catch {
        // Command not found, try next
      }
    }
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
      'Extension not built. The "dist" directory does not exist.\n' +
      'Please run "npm run build" to build the extension before running e2e tests.'
    );
  }
  return distPath;
}

/**
 * Wait for the extension service worker target to be available.
 * MV3 service workers register asynchronously, so we need to poll.
 * @param {import('puppeteer-core').Browser} browser
 * @param {number} timeout - Maximum time to wait in ms
 * @returns {Promise<string>} The extension ID
 */
export async function waitForExtensionId(browser, timeout = 10000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const targets = await browser.targets();

    // First, try to find the service worker (preferred for MV3)
    const serviceWorkerTarget = targets.find(
      (target) => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://')
    );

    if (serviceWorkerTarget) {
      const url = serviceWorkerTarget.url();
      return url.split('/')[2];
    }

    // Fallback: look for any extension target
    const extensionTarget = targets.find(
      (target) => target.url().startsWith('chrome-extension://')
    );

    if (extensionTarget) {
      const url = extensionTarget.url();
      return url.split('/')[2];
    }

    // Wait 100ms before retrying
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Extension not found within ${timeout}ms. Ensure the extension loaded correctly.`);
}
