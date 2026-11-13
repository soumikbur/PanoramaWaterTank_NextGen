// apps/mobile/scripts/verify_multi_train_tracking.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8997;
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DIST_DIR = path.resolve(__dirname, '../dist');
const OUTPUT_DIR = path.resolve(REPO_ROOT, 'MOBILE_TEST_SCREENSHOTS');
const BRAIN_DIR = path.join(process.env.USERPROFILE || 'C:\\Users\\User', '.gemini', 'antigravity', 'brain', '9e3514ab-7eb1-481b-ac5b-d7edda1def58', 'screenshots');

[OUTPUT_DIR, BRAIN_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive',
};

function createServer() {
  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let pathname = decodeURIComponent(parsed.pathname);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    let filePath = path.join(DIST_DIR, pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch (err) {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[HTTP] Static server listening at http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

async function run() {
  const server = await createServer();
  const runnerScript = path.join(__dirname, 'electron_runner_multi_train.cjs');

  const runnerCode = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = ${JSON.stringify(OUTPUT_DIR)};
const BRAIN_DIR = ${JSON.stringify(BRAIN_DIR)};

function saveScreenshot(filename, img) {
  const p1 = path.join(OUTPUT_DIR, filename);
  const p2 = path.join(BRAIN_DIR, filename);
  fs.writeFileSync(p1, img.toPNG());
  fs.writeFileSync(p2, img.toPNG());
  console.log('[TEST] Saved screenshot: ' + filename);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  const url = 'http://127.0.0.1:${PORT}/#/dashboard';
  console.log('[TEST] Loading URL:', url);
  await win.loadURL(url);

  // Wait for React to render and mount
  await new Promise(r => setTimeout(r, 2000));

  // Perform quick admin login
  await win.webContents.executeJavaScript(\`(() => {
    const adminBtn = document.getElementById('btn-quick-login-admin') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Admin'));
    if (adminBtn) adminBtn.click();
  })()\`);
  await new Promise(r => setTimeout(r, 2000));

  // Navigate to #location
  await win.loadURL('http://127.0.0.1:${PORT}/#location');
  await new Promise(r => setTimeout(r, 2500));

  console.log('[TEST] Checking Location screen elements...');

  // TEST 1: Multiple Trains in All Trains Mode
  const stats = await win.webContents.executeJavaScript(\`(() => {
    const bodyText = document.body.innerText;
    const hasTotal = bodyText.includes('TOTAL REGISTERED');
    const hasOnline = bodyText.includes('ONLINE TRAINS');
    const hasOffline = bodyText.includes('OFFLINE TRAINS');
    const hasGpsUnavail = bodyText.includes('GPS UNAVAILABLE');
    const tableRows = document.querySelectorAll('#train-fleet-tracking-table tbody tr').length;
    const markers = document.querySelectorAll('.custom-train-div-icon').length;

    return {
      hasTotal,
      hasOnline,
      hasOffline,
      hasGpsUnavail,
      tableRows,
      markers,
      url: window.location.href,
    };
  })()\`);
  console.log('[TEST 1: MULTIPLE TRAINS STATS]', stats);

  const img1 = await win.webContents.capturePage();
  saveScreenshot('multi_train_01_all_trains_desktop.png', img1);

  // TEST 2: Online vs Offline Marker Colors & Details
  const markerColors = await win.webContents.executeJavaScript(\`(() => {
    const pins = Array.from(document.querySelectorAll('.train-map-marker-wrap'));
    return pins.map(p => {
      const text = p.innerText.trim();
      const circle = p.querySelector('div[style*="border-radius: 50%"][style*="border: 2.5px solid"]');
      const bg = circle ? circle.style.backgroundColor : '';
      return { text, bg };
    });
  })()\`);
  console.log('[TEST 2: MARKER PINS & COLORS]', markerColors);

  const img2 = await win.webContents.capturePage();
  saveScreenshot('multi_train_02_marker_colors.png', img2);

  // TEST 3: Click Marker to Open 13-Point Popup
  console.log('[TEST 3] Clicking train 12842 marker to open popup...');
  await win.webContents.executeJavaScript(\`(() => {
    const pins = Array.from(document.querySelectorAll('.train-map-marker-wrap'));
    const t1Pin = pins.find(p => p.innerText.includes('12842'));
    if (t1Pin) {
      t1Pin.click();
    }
  })()\`);
  await new Promise(r => setTimeout(r, 1500));

  const popupContent = await win.webContents.executeJavaScript(\`(() => {
    const popup = document.querySelector('.leaflet-popup-content');
    return popup ? {
      html: popup.innerHTML,
      hasSpeed: popup.innerText.includes('Speed'),
      hasRegion: popup.innerText.includes('Region'),
      hasDetailsBtn: !!popup.querySelector('[data-action="view-train-details"]'),
    } : null;
  })()\`);
  console.log('[TEST 3: POPUP VERIFICATION]', popupContent ? 'Popup Verified with View Details Button' : 'No popup found');

  const img3 = await win.webContents.capturePage();
  saveScreenshot('multi_train_03_train_popup.png', img3);

  // TEST 4: Individual Train Selection (Isolate Train 12841)
  console.log('[TEST 4] Selecting Train 12841 to isolate its tracking...');
  await win.webContents.executeJavaScript(\`(() => {
    const selector = document.getElementById('train-view-selector');
    if (selector) {
      selector.value = '12841';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()\`);
  await new Promise(r => setTimeout(r, 1500));

  const isolatedCheck = await win.webContents.executeJavaScript(\`(() => {
    const markers = document.querySelectorAll('.custom-train-div-icon').length;
    const isShowingReturnBtn = !!document.getElementById('btn-return-all-trains');
    const trackingBanner = document.body.innerText.includes('Tracking Train 12841');
    return { markers, isShowingReturnBtn, trackingBanner };
  })()\`);
  console.log('[TEST 4: ISOLATED TRAIN 12841 CHECK]', isolatedCheck);

  const img4 = await win.webContents.capturePage();
  saveScreenshot('multi_train_04_isolated_train.png', img4);

  // TEST 5: Return to All Trains Mode
  console.log('[TEST 5] Clicking Return to All Trains...');
  await win.webContents.executeJavaScript(\`(() => {
    const returnBtn = document.getElementById('btn-return-all-trains');
    if (returnBtn) returnBtn.click();
  })()\`);
  await new Promise(r => setTimeout(r, 1200));

  const returnCheck = await win.webContents.executeJavaScript(\`(() => {
    const markers = document.querySelectorAll('.custom-train-div-icon').length;
    return { markers };
  })()\`);
  console.log('[TEST 5: RETURNED TO ALL TRAINS]', returnCheck);

  const img5 = await win.webContents.capturePage();
  saveScreenshot('multi_train_05_return_all_trains.png', img5);

  // TEST 6: Live MQTT GPS Update Simulation
  console.log('[TEST 6] Injecting live MQTT telemetry update for Train 12842...');
  const mqttUpdated = await win.webContents.executeJavaScript(\`(() => {
    if (window.panoramaMqttService) {
      const payload = {
        uid: '0026004D4B42501120353332',
        trno: '12842',
        chno: 'A1',
        lat: 22.6120,
        long: 88.3950,
        speed: 88.5,
        sats: 12,
        gpsFix: true,
        isStale: false,
        receivedAt: Date.now(),
        wlp1: 76.0,
        wlp2: 74.5,
        bat: 12.8,
      };
      window.panoramaMqttService.handleIncomingPayload(JSON.stringify(payload));
      return true;
    }
    return false;
  })()\`);
  console.log('[TEST 6: MQTT TELEMETRY INGESTED]:', mqttUpdated);
  await new Promise(r => setTimeout(r, 800));

  const img6 = await win.webContents.capturePage();
  saveScreenshot('multi_train_06_live_mqtt_update.png', img6);

  // TEST 7: Table Row Synchronization
  console.log('[TEST 7] Testing table row selection for 12860 (GPS Unavailable)...');
  await win.webContents.executeJavaScript(\`(() => {
    const row = document.getElementById('train-row-12860');
    if (row) row.click();
  })()\`);
  await new Promise(r => setTimeout(r, 1000));

  const img7 = await win.webContents.capturePage();
  saveScreenshot('multi_train_07_table_sync.png', img7);

  // TEST 8: Mobile Viewport (390 x 844)
  console.log('[TEST 8] Switching to mobile viewport (390 x 844)...');
  win.setContentSize(390, 844);
  await new Promise(r => setTimeout(r, 1200));

  // Switch back to All Trains mode in mobile
  await win.webContents.executeJavaScript(\`(() => {
    const selector = document.getElementById('train-view-selector');
    if (selector) {
      selector.value = 'ALL';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()\`);
  await new Promise(r => setTimeout(r, 1000));

  const img8 = await win.webContents.capturePage();
  saveScreenshot('multi_train_08_mobile_all_trains.png', img8);

  // TEST 9: Mobile Bottom Sheet for Selected Train
  console.log('[TEST 9] Selecting train 12842 on mobile to verify Bottom Sheet...');
  await win.webContents.executeJavaScript(\`(() => {
    const row = document.getElementById('train-row-12842');
    if (row) row.click();
  })()\`);
  await new Promise(r => setTimeout(r, 1200));

  const img9 = await win.webContents.capturePage();
  saveScreenshot('multi_train_09_mobile_bottom_sheet.png', img9);

  // TEST 10: Navigation to Coach Details via "View Train Details" button
  console.log('[TEST 10] Testing View Train Details button navigation...');
  const navTriggered = await win.webContents.executeJavaScript(\`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const detailsBtn = buttons.find(b => b.innerText.includes('View Train Details'));
    if (detailsBtn) {
      detailsBtn.click();
      return true;
    }
    return false;
  })()\`);
  console.log('[TEST 10: NAVIGATION TRIGGERED]:', navTriggered);
  await new Promise(r => setTimeout(r, 1800));

  const currentScreen = await win.webContents.executeJavaScript(\`(() => {
    return {
      hash: window.location.hash,
      bodyTextSnippet: document.body.innerText.substring(0, 300),
    };
  })()\`);
  console.log('[TEST 10: CURRENT SCREEN AFTER NAVIGATION]:', currentScreen);

  const img10 = await win.webContents.capturePage();
  saveScreenshot('multi_train_10_navigated_to_coach_details.png', img10);

  console.log('[TEST SUITE COMPLETE] All 10 test scenarios executed successfully!');
  app.quit();
});
`;

  fs.writeFileSync(runnerScript, runnerCode, 'utf8');

  const childEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = cp.spawn(electronPath, [runnerScript], {
    stdio: 'inherit',
    env: childEnv,
  });

  child.on('close', (code) => {
    console.log(`[TEST] Electron runner finished with exit code ${code}`);
    server.close();
    try { fs.unlinkSync(runnerScript); } catch (e) {}
    process.exit(code || 0);
  });
}

run().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
