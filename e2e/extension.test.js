import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer from 'puppeteer-core';
import { findChrome, getExtensionPath, waitForExtensionId } from './setup.js';

const chromePath = findChrome();

let browser;
let extensionId;

describe.skipIf(!chromePath)('Utter Extension E2E Tests', () => {
  beforeAll(async () => {
    const extensionPath = getExtensionPath();

    browser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--headless=new',
      ],
    });

    // Wait for extension to load and get its ID
    extensionId = await waitForExtensionId(browser);
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Options Page', () => {
    it('should load the options page', async () => {
      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/options/options.html`, {
        waitUntil: 'domcontentloaded',
      });

      const title = await page.title();
      expect(title).toBe('Utter Options');

      const h1Text = await page.$eval('h1', (el) => el.textContent);
      expect(h1Text).toContain('Utter Options');

      const activationSection = await page.$('section h2');
      expect(activationSection).not.toBeNull();

      await page.close();
    }, 15000);

    it('should have activation mode radio buttons', async () => {
      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/options/options.html`, {
        waitUntil: 'domcontentloaded',
      });

      const toggleRadio = await page.$('input[name="activation-mode"][value="toggle"]');
      expect(toggleRadio).not.toBeNull();

      const pttRadio = await page.$('input[name="activation-mode"][value="push-to-talk"]');
      expect(pttRadio).not.toBeNull();

      await page.close();
    }, 15000);

    it('should have sound feedback checkbox', async () => {
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
      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
        waitUntil: 'domcontentloaded',
      });

      const title = await page.title();
      expect(title).toBe('Utter');

      const h1Text = await page.$eval('h1', (el) => el.textContent);
      expect(h1Text).toBe('Utter');

      const historyList = await page.$('#history-list');
      expect(historyList).not.toBeNull();

      await page.close();
    }, 15000);

    it('should have empty state when no recordings', async () => {
      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
        waitUntil: 'domcontentloaded',
      });

      const emptyState = await page.$('#empty-state');
      expect(emptyState).not.toBeNull();

      const emptyStateTitle = await page.$eval('.empty-state-title', (el) => el.textContent);
      expect(emptyStateTitle).toContain('No voice inputs yet');

      await page.close();
    }, 15000);

    it('should have settings and clear buttons', async () => {
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
      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/recognition-frame/recognition-frame.html`, {
        waitUntil: 'domcontentloaded',
      });

      const body = await page.$('body');
      expect(body).not.toBeNull();

      await page.close();
    }, 15000);
  });

  describe('Background Service Worker', () => {
    it('should have service worker registered for the extension', async () => {
      const targets = await browser.targets();
      const serviceWorker = targets.find(
        (target) =>
          target.type() === 'service_worker' &&
          target.url().startsWith(`chrome-extension://${extensionId}/`)
      );

      expect(serviceWorker).toBeDefined();
      expect(serviceWorker.url()).toContain(extensionId);
    }, 15000);
  });
});
