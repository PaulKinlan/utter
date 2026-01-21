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
 * MV3 service workers register asynchronously, so we need to wait.
 * @param {import('puppeteer-core').Browser} browser
 * @param {number} timeout - Maximum time to wait in ms
 * @returns {Promise<string>} The extension ID
 */
export async function waitForExtensionId(browser, timeout = 30000) {
  // Open a blank page to help trigger extension activation
  const page = await browser.newPage();
  await page.goto('about:blank');

  try {
    // Use waitForTarget which is more reliable than manual polling
    const extensionTarget = await browser.waitForTarget(
      (target) => target.url().startsWith('chrome-extension://'),
      { timeout }
    );

    const url = extensionTarget.url();
    const extensionId = url.split('/')[2];

    await page.close();
    return extensionId;
  } catch (error) {
    // On failure, gather debug info
    const targets = await browser.targets();
    const targetInfo = targets.map((t) => `${t.type()}: ${t.url()}`).join('\n  ');

    await page.close();

    throw new Error(
      `Extension not found within ${timeout}ms.\n` +
      `Available targets:\n  ${targetInfo || '(none)'}\n` +
      `Ensure the extension is built and the dist/ directory contains a valid manifest.json.`
    );
  }
}
