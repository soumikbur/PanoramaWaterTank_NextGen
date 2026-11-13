// scripts/inspect_deployed_console.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tempUserData = path.join(os.tmpdir(), 'electron-audit-' + Date.now());
app.setPath('userData', tempUserData);

const DEPLOYED_URL = 'https://soumikbur.github.io/PanoramaWaterTank_NextGen/';
const LOCAL_URL = 'http://127.0.0.1:8000';
const OUT_FILE = path.join(__dirname, '..', 'WLI_DOCS', 'live_browser_audit_raw.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = {
  deployed: {
    url: DEPLOYED_URL,
    consoleMessages: [],
    errors: [],
    warnings: [],
    failedRequests: [],
    pageErrors: [],
    webSockets: [],
  },
  local: {
    url: LOCAL_URL,
    consoleMessages: [],
    errors: [],
    warnings: [],
    failedRequests: [],
    pageErrors: [],
    webSockets: [],
  },
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  async function auditUrl(targetKey, targetUrl) {
    console.log(`\n=== AUDITING ${targetKey.toUpperCase()} URL: ${targetUrl} ===`);
    const targetObj = results[targetKey];

    const onConsole = (event, level, message, line, sourceId) => {
      const entry = { level, message, line, sourceId, timestamp: new Date().toISOString() };
      targetObj.consoleMessages.push(entry);
      if (level === 3) {
        targetObj.errors.push(entry);
        console.log(`[${targetKey.toUpperCase()} ERROR] ${message} (${sourceId}:${line})`);
      } else if (level === 2) {
        targetObj.warnings.push(entry);
        console.log(`[${targetKey.toUpperCase()} WARN] ${message}`);
      }
    };

    const onPageError = (event, error) => {
      targetObj.pageErrors.push(String(error));
      console.log(`[${targetKey.toUpperCase()} PAGE ERROR]`, error);
    };

    win.webContents.on('console-message', onConsole);
    win.webContents.on('page-error', onPageError);

    try {
      await win.loadURL(targetUrl);
      await sleep(5000); // Wait for background telemetry, WebSockets, and timers

      // Execute in-page inspections
      const pageInfo = await win.webContents.executeJavaScript(`
        (() => {
          return {
            title: document.title,
            localStorageKeys: Object.keys(localStorage),
            theme: document.documentElement.getAttribute('data-theme'),
            bodyLength: document.body.innerHTML.length,
            currentHash: window.location.hash,
          };
        })()
      `);
      targetObj.pageInfo = pageInfo;
      console.log(`[${targetKey.toUpperCase()} INFO] Page loaded:`, pageInfo);

      // Save screenshot
      const shotPath = path.join(__dirname, '..', 'WLI_DOCS', `deployed_screenshot_${targetKey}.png`);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(shotPath, img.toPNG());
      console.log(`[${targetKey.toUpperCase()}] Screenshot saved to ${shotPath}`);
    } catch (err) {
      console.error(`[${targetKey.toUpperCase()} LOAD FAILED]`, err.message);
      targetObj.loadError = err.message;
    } finally {
      win.webContents.removeListener('console-message', onConsole);
      win.webContents.removeListener('page-error', onPageError);
    }
  }

  // 1. Audit live deployed website
  await auditUrl('deployed', DEPLOYED_URL);

  // 2. Audit local development website
  await auditUrl('local', LOCAL_URL);

  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nAudit results written to: ${OUT_FILE}`);
  app.quit();
});
