/**
 * Chrome DevTools Protocol & Playwright Browser Connector
 * 
 * Supports two modes:
 * 1. CDP Attach: Connects to an existing Chrome instance started with --remote-debugging-port=9222.
 * 2. Dedicated Chrome Launch: Launches Google Chrome with a dedicated, isolated profile.
 */

const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DEFAULT_CDP_PORT = 9222;
const DEFAULT_CDP_URL = `http://127.0.0.1:${DEFAULT_CDP_PORT}`;

/**
 * Checks if a CDP remote debugging port is actively listening.
 */
function probeCdpPort(url = DEFAULT_CDP_URL, timeoutMs = 1500) {
  return new Promise((resolve) => {
    try {
      const u = new URL('/json/version', url);
      const req = http.get(u.href, { timeout: timeoutMs }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              resolve({ available: true, version: parsed });
            } catch {
              resolve({ available: true, raw: data });
            }
          } else {
            resolve({ available: false });
          }
        });
      });
      req.on('error', () => resolve({ available: false }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ available: false });
      });
    } catch {
      resolve({ available: false });
    }
  });
}

/**
 * Connects to an existing Chrome instance or launches an isolated Chrome session.
 */
async function getBrowserSession(options = {}) {
  const {
    cdpUrl = DEFAULT_CDP_URL,
    preferCdp = true,
    headless = true,
    viewport = { width: 1440, height: 900 },
    tempUserDataDir = path.join(os.tmpdir(), `panorama-chrome-debug-${Date.now()}`),
  } = options;

  let browser;
  let context;
  let page;
  let mode = 'launch';
  let probe = null;

  if (preferCdp) {
    probe = await probeCdpPort(cdpUrl);
    if (probe.available) {
      try {
        console.log(`[CDP] Connecting to existing Chrome instance on ${cdpUrl}...`);
        browser = await chromium.connectOverCDP(cdpUrl);
        const contexts = browser.contexts();
        context = contexts.length > 0 ? contexts[0] : await browser.newContext({ viewport });
        const pages = context.pages();
        page = pages.length > 0 ? pages[0] : await context.newPage();
        mode = 'cdp';
        console.log(`[CDP] Successfully attached to existing Chrome instance via CDP!`);
        return { browser, context, page, mode, cdpUrl, tempUserDataDir: null };
      } catch (err) {
        console.warn(`[CDP] Failed to attach over CDP (${err.message}). Falling back to launching Chrome...`);
      }
    } else {
      console.log(`[CDP] No existing Chrome instance detected on ${cdpUrl} (probe returned unavailable).`);
    }
  }

  // Launch isolated Chrome instance using standard Google Chrome binary
  console.log(`[LAUNCH] Spawning dedicated Google Chrome instance (headless: ${headless})...`);
  if (!fs.existsSync(tempUserDataDir)) {
    fs.mkdirSync(tempUserDataDir, { recursive: true });
  }

  try {
    context = await chromium.launchPersistentContext(tempUserDataDir, {
      channel: 'chrome',
      headless,
      viewport,
      args: [
        `--remote-debugging-port=${DEFAULT_CDP_PORT}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-sync',
      ],
    });
    browser = context;
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
    mode = 'launched_chrome';
    console.log(`[LAUNCH] Dedicated Google Chrome session launched successfully.`);
  } catch (launchErr) {
    console.warn(`[LAUNCH] Google Chrome channel launch failed (${launchErr.message}). Falling back to bundled Chromium...`);
    context = await chromium.launchPersistentContext(tempUserDataDir, {
      headless,
      viewport,
      args: [
        `--remote-debugging-port=${DEFAULT_CDP_PORT}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    browser = context;
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
    mode = 'launched_chromium';
  }

  return { browser, context, page, mode, cdpUrl: DEFAULT_CDP_URL, tempUserDataDir };
}

/**
 * Closes the browser session cleanly.
 */
async function closeBrowserSession(session) {
  if (!session) return;
  const { browser, mode, tempUserDataDir } = session;
  try {
    if (browser) {
      if (typeof browser.close === 'function') {
        await browser.close();
      }
    }
  } catch (err) {
    console.warn(`[CLOSE] Error while closing browser session: ${err.message}`);
  }

  if (mode !== 'cdp' && tempUserDataDir && fs.existsSync(tempUserDataDir)) {
    try {
      fs.rmSync(tempUserDataDir, { recursive: true, force: true });
    } catch {}
  }
}

module.exports = {
  probeCdpPort,
  getBrowserSession,
  closeBrowserSession,
  DEFAULT_CDP_PORT,
  DEFAULT_CDP_URL,
};
