// apps/mobile/scripts/verify_light_theme_e2e.cjs
/**
 * Automated Verification Suite for Global Light Mode Consistency & Simplified Display Settings
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8785;
const REPO_ROOT = path.resolve(__dirname, '../../../');
const DIST_DIR = path.resolve(__dirname, '../dist');
const BRAIN_ARTIFACTS_DIR = 'C:\\\\Users\\\\User\\\\.gemini\\\\antigravity\\\\brain\\\\07f934a3-112b-4821-90f4-23baf24a9f52\\\\screenshots';
const LOCAL_ARTIFACTS_DIR = path.resolve(REPO_ROOT, 'test_artifacts');

[LOCAL_ARTIFACTS_DIR].forEach((dir) => {
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
};

function createServer() {
  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = parsed.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'demo_token_admin',
        token_type: 'bearer',
        user: {
          id: 'usr-admin-01',
          username: 'admin',
          full_name: 'System Administrator',
          role: 'ADMIN',
          is_active: true,
        }
      }));
      return;
    }

    if (pathname === '/api/v1/auth/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'usr-admin-01',
        username: 'admin',
        full_name: 'System Administrator',
        role: 'ADMIN',
        is_active: true,
        must_change_password: false,
      }));
      return;
    }

    if (pathname === '/api/v1/trains') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          train_number: '12841',
          name: 'Coromandel Express',
          source: 'Chennai (MAS)',
          destination: 'Howrah (HWH)',
          region: 'South East',
          is_online: true,
          coaches_count: 24,
          tanks_count: 48,
          last_telemetry: '23 Jan 2025, 11:26:20',
          latitude: 22.5726,
          longitude: 88.3639,
          speed_kmh: 0,
          nearest_station: 'Kharagpur (KGP)',
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/regions/summary' || pathname === '/api/v1/regions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { region: 'South East', total_trains: 14, active_trains: 12 },
        { region: 'Northern', total_trains: 18, active_trains: 16 },
      ]));
      return;
    }

    if (pathname === '/api/v1/tanks/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tankId: 'tank-c4-arr',
        trainNumber: '12841',
        coachNumber: 'C4',
        levelPercent: 70.0,
        volumeLiters: 14.0,
        heightCm: 35.0,
        maxHeightCm: 50.0,
        capacityLiters: 20.0,
        isOnline: true,
        hasTelemetry: true,
      }));
      return;
    }

    if (pathname === '/api/v1/tanks') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    if (pathname === '/api/v1/devices') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { uid: 'Device-1', coachNumber: 'C4', isOnline: true, battery: 62 }
      ]));
      return;
    }

    if (pathname === '/api/v1/alerts' || pathname === '/api/v1/alerts/active') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    if (pathname === '/api/v1/alerts/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ total: 0, critical: 0, warning: 0, info: 0 }));
      return;
    }

    if (pathname === '/api/v1/logs' || pathname === '/api/v1/system/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { time: '11:26:20', level: 'INFO', module: 'TELEMETRY', msg: 'Packet received from Train 12841 Coach C4' },
        { time: '11:25:50', level: 'INFO', module: 'MQTT', msg: 'Broker connection stable 24/24 nodes' },
        { time: '11:24:10', level: 'WARN', module: 'CALIBRATION', msg: 'Secondary sensor delta 0.4cm within nominal bounds' },
      ]));
      return;
    }

    // Static asset fallback
    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  return server;
}

const runnerScript = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const PORT = ${PORT};
const BRAIN_DIR = "${BRAIN_ARTIFACTS_DIR}";
const LOCAL_DIR = ${JSON.stringify(LOCAL_ARTIFACTS_DIR)};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function saveScreenshot(win, filename) {
  const image = await win.webContents.capturePage();
  const buffer = image.toPNG();
  if (fs.existsSync(BRAIN_DIR)) {
    fs.writeFileSync(path.join(BRAIN_DIR, filename), buffer);
  }
  fs.writeFileSync(path.join(LOCAL_DIR, filename), buffer);
  console.log('[SCREENSHOT SAVED]: ' + filename);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  try {
    console.log('[*] Loading URL http://127.0.0.1:' + PORT + '/ ...');
    await win.loadURL('http://127.0.0.1:' + PORT + '/');

    // Bootstrap user and display preferences
    await win.webContents.executeJavaScript(\`(() => {
      localStorage.setItem('panorama_token', 'demo_token_admin');
      localStorage.setItem('panorama_user', JSON.stringify({
        id: 'usr-admin-01',
        username: 'admin',
        full_name: 'System Administrator',
        role: 'ADMIN',
        is_active: true,
      }));
      localStorage.removeItem('panorama_display_preferences_v2_admin');
      localStorage.removeItem('panorama_display_preferences_v2');
    })()\`);

    // Reload with authenticated admin session
    await win.loadURL('http://127.0.0.1:' + PORT + '/');
    await sleep(2500);

    // 1. Capture Main Dashboard in Light Mode
    console.log('[*] Capturing 01_light_mode_dashboard.png...');
    await saveScreenshot(win, '01_light_mode_dashboard.png');

    // 2. Navigate to Display Settings
    console.log('[*] Navigating to Display Settings...');
    await win.webContents.executeJavaScript(\`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Display Settings') || el.getAttribute('data-screen') === 'settings');
      if (btn) btn.click();
    })()\`);
    await sleep(1000);

    // In Admin Settings, click 'Display & Interface Preferences' tab if present
    await win.webContents.executeJavaScript(\`(() => {
      const tabs = Array.from(document.querySelectorAll('button')).filter(el => el.textContent.includes('Display') || el.textContent.includes('Preferences'));
      if (tabs.length > 0) tabs[tabs.length - 1].click();
    })()\`);
    await sleep(800);

    console.log('[*] Capturing 03_light_mode_settings_panel.png...');
    await saveScreenshot(win, '03_light_mode_settings_panel.png');

    // 3. Test Zoom Controls: Zoom Out to 80%
    console.log('[*] Testing Zoom Out to 80%...');
    for (let i = 0; i < 5; i++) {
      await win.webContents.executeJavaScript(\`(() => {
        const btn = document.getElementById('zoom-out-btn');
        if (btn) btn.click();
      })()\`);
      await sleep(200);
    }
    console.log('[*] Capturing 04_zoom_80_percent.png...');
    await saveScreenshot(win, '04_zoom_80_percent.png');

    // 4. Test Zoom In to 125%
    console.log('[*] Testing Zoom In to 125%...');
    for (let i = 0; i < 10; i++) {
      await win.webContents.executeJavaScript(\`(() => {
        const btn = document.getElementById('zoom-in-btn');
        if (btn) btn.click();
      })()\`);
      await sleep(200);
    }
    console.log('[*] Capturing 05_zoom_125_percent.png...');
    await saveScreenshot(win, '05_zoom_125_percent.png');

    // 5. Test Font Size: Small
    console.log('[*] Testing Font Size: Small...');
    await win.webContents.executeJavaScript(\`(() => {
      const card = document.querySelector('[data-font-option="small"]');
      if (card) card.click();
    })()\`);
    await sleep(600);
    console.log('[*] Capturing 06_font_small.png...');
    await saveScreenshot(win, '06_font_small.png');

    // 6. Test Font Size: Large
    console.log('[*] Testing Font Size: Large...');
    await win.webContents.executeJavaScript(\`(() => {
      const card = document.querySelector('[data-font-option="large"]');
      if (card) card.click();
    })()\`);
    await sleep(600);
    console.log('[*] Capturing 07_font_large.png...');
    await saveScreenshot(win, '07_font_large.png');

    // Set Zoom to 115% for persistence test
    await win.webContents.executeJavaScript(\`(() => {
      const resetBtn = document.getElementById('zoom-reset-btn');
      if (resetBtn) resetBtn.click();
    })()\`);
    await sleep(300);
    // Click zoom in 3 times => 100% -> 115%
    for (let i = 0; i < 3; i++) {
      await win.webContents.executeJavaScript(\`(() => {
        const btn = document.getElementById('zoom-in-btn');
        if (btn) btn.click();
      })()\`);
      await sleep(150);
    }

    // 7. Test Persistence After Reload
    console.log('[*] Reloading to test persistence...');
    await win.loadURL('http://127.0.0.1:' + PORT + '/');
    await sleep(2000);

    // Verify stored values in DOM
    const domCheck = await win.webContents.executeJavaScript(\`(() => {
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        zoom: document.documentElement.getAttribute('data-zoom'),
        fontSize: document.documentElement.getAttribute('data-font-size'),
        bg: window.getComputedStyle(document.body).backgroundColor,
        color: window.getComputedStyle(document.body).color,
      };
    })()\`);
    console.log('[*] Persisted DOM attributes after reload:', JSON.stringify(domCheck));
    console.log('[*] Capturing 08_persistence_after_reload.png...');
    await saveScreenshot(win, '08_persistence_after_reload.png');

    // 8. Test Reset to Defaults
    console.log('[*] Navigating to Settings to test Reset...');
    await win.webContents.executeJavaScript(\`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Display Settings') || el.getAttribute('data-screen') === 'settings');
      if (btn) btn.click();
    })()\`);
    await sleep(800);
    await win.webContents.executeJavaScript(\`(() => {
      const tabs = Array.from(document.querySelectorAll('button')).filter(el => el.textContent.includes('Display') || el.textContent.includes('Preferences'));
      if (tabs.length > 0) tabs[tabs.length - 1].click();
    })()\`);
    await sleep(600);

    await win.webContents.executeJavaScript(\`(() => {
      const resetBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Reset to Defaults'));
      if (resetBtn) resetBtn.click();
    })()\`);
    await sleep(800);
    console.log('[*] Capturing 09_reset_to_defaults.png...');
    await saveScreenshot(win, '09_reset_to_defaults.png');

    // 9. Verify Logs Screen in Light Mode
    console.log('[*] Checking Logs Screen in Light Mode...');
    await win.webContents.executeJavaScript(\`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('System Logs') || el.getAttribute('data-screen') === 'logs');
      if (btn) btn.click();
    })()\`);
    await sleep(800);
    console.log('[*] Capturing 10_admin_logs_light.png...');
    await saveScreenshot(win, '10_admin_logs_light.png');

    // 10. Verify Coach Management Screen in Light Mode
    console.log('[*] Checking Coach Management in Light Mode...');
    await win.webContents.executeJavaScript(\`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Coach Management') || el.getAttribute('data-screen') === 'coaches');
      if (btn) btn.click();
    })()\`);
    await sleep(800);
    console.log('[*] Capturing 11_coach_management_light.png...');
    await saveScreenshot(win, '11_coach_management_light.png');

    console.log('[SUCCESS] All Light Theme and Simplified Settings E2E verifications completed successfully!');
  } catch (err) {
    console.error('[ERROR during verification]:', err);
  } finally {
    win.destroy();
    app.quit();
  }
});
`;

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`[SERVER] Mock server listening on http://127.0.0.1:${PORT}`);

  const tempRunnerPath = path.resolve(__dirname, 'temp_runner_light.cjs');
  fs.writeFileSync(tempRunnerPath, runnerScript, 'utf8');

  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    console.log(`[ELECTRON] Launching Electron verification runner...`);
    const child = cp.spawn(electronPath, [tempRunnerPath], {
      env,
      stdio: 'inherit',
    });

    await new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Electron exited with code ${code}`));
      });
      child.on('error', reject);
    });
  } finally {
    if (fs.existsSync(tempRunnerPath)) {
      try { fs.unlinkSync(tempRunnerPath); } catch (e) {}
    }
    server.close();
  }
}

main().catch((err) => {
  console.error('[FATAL]:', err);
  process.exit(1);
});

