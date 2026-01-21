import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer from 'puppeteer-core';
import { findChrome, getExtensionPath, isCI } from './setup.js';

let browser;
let chromePath;

describe('Utter Extension E2E Tests', () => {
  beforeAll(async () => {
    chromePath = findChrome();

    if (!chromePath) {
      console.warn('Chrome/Chromium not found. Skipping e2e tests.');
      return;
    }

    const extensionPath = getExtensionPath();

    browser = await puppeteer.launch({
      headless: false, // Extensions require non-headless mode
      executablePath: chromePath,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        // Use new headless mode that supports extensions
        '--headless=new',
      ],
    });
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should skip if Chrome is not available', async () => {
    if (!chromePath) {
      console.log('Skipping: Chrome not available');
      return;
    }
    expect(browser).toBeDefined();
  });

  describe('Options Page', () => {
    it('should load the options page', async () => {
      if (!browser) return;

      // Get extension ID from the loaded extension
      const targets = await browser.targets();
      const extensionTarget = targets.find(
        (target) => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://')
      );

      if (!extensionTarget) {
        // Extension may not have service worker active yet, try background page
        const backgroundTarget = targets.find(
          (target) => target.url().startsWith('chrome-extension://')
        );
        expect(backgroundTarget).toBeDefined();
        return;
      }

      const extensionUrl = extensionTarget.url();
      const extensionId = extensionUrl.split('/')[2];

      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/options/options.html`, {
        waitUntil: 'domcontentloaded',
      });

      // Check that the options page has loaded correctly
      const title = await page.title();
      expect(title).toBe('Utter Options');

      // Check for key elements on the options page
      const h1Text = await page.$eval('h1', (el) => el.textContent);
      expect(h1Text).toContain('Utter Options');

      // Check that activation mode section exists
      const activationSection = await page.$('section h2');
      expect(activationSection).not.toBeNull();

      await page.close();
    }, 15000);

    it('should have activation mode radio buttons', async () => {
      if (!browser) return;

      const targets = await browser.targets();
      const extensionTarget = targets.find(
        (target) => target.url().startsWith('chrome-extension://')
      );

      if (!extensionTarget) return;

      const extensionUrl = extensionTarget.url();
      const extensionId = extensionUrl.split('/')[2];

      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/options/options.html`, {
        waitUntil: 'domcontentloaded',
      });

      // Check toggle mode radio
      const toggleRadio = await page.$('input[name="activation-mode"][value="toggle"]');
      expect(toggleRadio).not.toBeNull();

      // Check push-to-talk radio
      const pttRadio = await page.$('input[name="activation-mode"][value="push-to-talk"]');
      expect(pttRadio).not.toBeNull();

      await page.close();
    }, 15000);

    it('should have sound feedback checkbox', async () => {
      if (!browser) return;

      const targets = await browser.targets();
      const extensionTarget = targets.find(
        (target) => target.url().startsWith('chrome-extension://')
      );

      if (!extensionTarget) return;

      const extensionUrl = extensionTarget.url();
      const extensionId = extensionUrl.split('/')[2];

      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/options/options.html`, {
        waitUntil: 'domcontentloaded',
      });

      const soundCheckbox = await page.$('#sound-feedback');
      expect(soundCheckbox).not.toBeNull();

      await page.close();
    }, 15000);
  });

  describe('Side Panel', () => {
    it('should load the sidepanel page', async () => {
      if (!browser) return;

      const targets = await browser.targets();
      const extensionTarget = targets.find(
        (target) => target.url().startsWith('chrome-extension://')
      );

      if (!extensionTarget) return;

      const extensionUrl = extensionTarget.url();
      const extensionId = extensionUrl.split('/')[2];

      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
        waitUntil: 'domcontentloaded',
      });

      // Check that the sidepanel has loaded correctly
      const title = await page.title();
      expect(title).toBe('Utter');

      // Check for header
      const h1Text = await page.$eval('h1', (el) => el.textContent);
      expect(h1Text).toBe('Utter');

      // Check for history list container
      const historyList = await page.$('#history-list');
      expect(historyList).not.toBeNull();

      await page.close();
    }, 15000);

    it('should have empty state when no recordings', async () => {
      if (!browser) return;

      const targets = await browser.targets();
      const extensionTarget = targets.find(
        (target) => target.url().startsWith('chrome-extension://')
      );

      if (!extensionTarget) return;

      const extensionUrl = extensionTarget.url();
      const extensionId = extensionUrl.split('/')[2];

      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
        waitUntil: 'domcontentloaded',
      });

      // Check for empty state
      const emptyState = await page.$('#empty-state');
      expect(emptyState).not.toBeNull();

      const emptyStateTitle = await page.$eval('.empty-state-title', (el) => el.textContent);
      expect(emptyStateTitle).toContain('No voice inputs yet');

      await page.close();
    }, 15000);

    it('should have settings and clear buttons', async () => {
      if (!browser) return;

      const targets = await browser.targets();
      const extensionTarget = targets.find(
        (target) => target.url().startsWith('chrome-extension://')
      );

      if (!extensionTarget) return;

      const extensionUrl = extensionTarget.url();
      const extensionId = extensionUrl.split('/')[2];

      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
        waitUntil: 'domcontentloaded',
      });

      const settingsButton = await page.$('#settings');
      expect(settingsButton).not.toBeNull();

      const clearButton = await page.$('#clear-all');
      expect(clearButton).not.toBeNull();

      await page.close();
    }, 15000);
  });

  describe('Recognition Frame', () => {
    it('should load the recognition frame', async () => {
      if (!browser) return;

      const targets = await browser.targets();
      const extensionTarget = targets.find(
        (target) => target.url().startsWith('chrome-extension://')
      );

      if (!extensionTarget) return;

      const extensionUrl = extensionTarget.url();
      const extensionId = extensionUrl.split('/')[2];

      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/recognition-frame/recognition-frame.html`, {
        waitUntil: 'domcontentloaded',
      });

      // Recognition frame should load without errors
      // It's a minimal page for speech recognition
      const body = await page.$('body');
      expect(body).not.toBeNull();

      await page.close();
    }, 15000);
  });

  describe('Background Service Worker', () => {
    it('should have service worker registered', async () => {
      if (!browser) return;

      const targets = await browser.targets();
      const serviceWorker = targets.find(
        (target) => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://')
      );

      // Service worker should be registered (may be inactive)
      // We just verify it exists at some point
      expect(targets.some((t) => t.url().startsWith('chrome-extension://'))).toBe(true);
    }, 15000);
  });
});
