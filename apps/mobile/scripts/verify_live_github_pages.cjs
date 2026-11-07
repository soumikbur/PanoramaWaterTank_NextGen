// apps/mobile/scripts/verify_live_github_pages.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const LIVE_URL = 'https://soumikbur.github.io/PanoramaWaterTank_NextGen/';
const BRAIN_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\07f934a3-112b-4821-90f4-23baf24a9f52\\screenshots';
const LOCAL_DIR = path.resolve(__dirname, '../../screenshots_scada');

if (!fs.existsSync(BRAIN_DIR)) fs.mkdirSync(BRAIN_DIR, { recursive: true });
if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function saveScreenshot(win, filename) {
  const image = await win.webContents.capturePage();
  const buffer = image.toPNG();
  fs.writeFileSync(path.join(BRAIN_DIR, filename), buffer);
  fs.writeFileSync(path.join(LOCAL_DIR, filename), buffer);
  console.log('[SCREENSHOT SAVED]: ' + filename);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
    },
  });

  const consoleLogs = [];
  const consoleErrors = [];
  const networkFailed = [];

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    consoleLogs.push({ level, message, line, sourceId });
    if (level >= 2) {
      consoleErrors.push(message);
    }
  });

  win.webContents.session.webRequest.onErrorOccurred((details) => {
    networkFailed.push({ url: details.url, error: details.error });
  });

  try {
    console.log('[LIVE VERIFY] Loading ' + LIVE_URL + ' ...');
    await win.loadURL(LIVE_URL);
    await sleep(4000);

    // Login if on login screen
    console.log('[LIVE VERIFY] Checking login state...');
    await win.webContents.executeJavaScript(`
      (() => {
        const quick = document.getElementById('btn-quick-login-employee');
        if (quick) { quick.click(); return; }
        const u = document.getElementById('login-username');
        const p = document.getElementById('login-password');
        const btn = document.querySelector('button[type="submit"]');
        if (u && p && btn) {
          u.value = 'employee';
          u.dispatchEvent(new Event('input', { bubbles: true }));
          p.value = 'Employee@123';
          p.dispatchEvent(new Event('input', { bubbles: true }));
          btn.click();
        }
      })();
    `);
    await sleep(4000);

    // Inspect live DOM
    const domCheck = await win.webContents.executeJavaScript(`
      (() => {
        const txt = document.body.innerText;
        return {
          title: document.title,
          hasPanoramaHeader: txt.includes('PANORAMA WATER TANK MONITOR'),
          hasPanoramaScada: txt.includes('PANORAMA SCADA'),
          hasMqttStatus: Boolean(document.getElementById('header-mqtt-status-pill')),
          mqttStatusText: document.getElementById('header-mqtt-status-pill')?.innerText,
          bodySnippet: txt.substring(0, 300),
        };
      })();
    `);
    console.log('[LIVE DOM CHECK]:', JSON.stringify(domCheck, null, 2));

    // Capture 1920x1080 screenshot
    console.log('[LIVE VERIFY] Capturing 1920x1080 Full HD screenshot of published site...');
    win.setSize(1920, 1080);
    await sleep(1500);
    await saveScreenshot(win, '01_live_published_panorama_dashboard_1920x1080.png');

    // Capture 1366x768 screenshot
    console.log('[LIVE VERIFY] Capturing 1366x768 Laptop screenshot of published site...');
    win.setSize(1366, 768);
    await sleep(1500);
    await saveScreenshot(win, '02_live_published_panorama_dashboard_1366x768.png');

    // Navigate to coach-details and capture
    console.log('[LIVE VERIFY] Navigating to coach details on published site...');
    await win.webContents.executeJavaScript(`
      (() => {
        window.location.hash = '#/coach-details?train=225256&coach=C4';
      })();
    `);
    await sleep(3000);
    await saveScreenshot(win, '03_live_published_panorama_coach_details.png');

    console.log('CONSOLE_ERRORS_COUNT:', consoleErrors.length);
    console.log('NETWORK_FAILED_COUNT:', networkFailed.length);
    console.log('ALL_CHECKS_PASSED:', domCheck.hasPanoramaHeader && domCheck.hasPanoramaScada);

  } catch (err) {
    console.error('[LIVE VERIFY ERROR]:', err);
  } finally {
    win.close();
    app.quit();
  }
});

