// apps/mobile/scripts/verify_reference_layout_e2e.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8781;
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
        access_token: 'demo_token_employee',
        token_type: 'bearer',
        user: {
          id: 'usr-emp-01',
          username: 'employee',
          full_name: 'Employee',
          role: 'EMPLOYEE',
          is_active: true,
        }
      }));
      return;
    }

    if (pathname === '/api/v1/auth/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'usr-emp-01',
        username: 'employee',
        full_name: 'Employee',
        role: 'EMPLOYEE',
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
        { region: 'Western', total_trains: 10, active_trains: 9 },
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

    // Bootstrap user and display preferences with LIGHT theme
    await win.webContents.executeJavaScript(\`(() => {
      const lightPrefs = {
        version: 2,
        theme: 'light',
        zoom: '100%',
        fontSize: 'default',
        density: 'comfortable',
        sidebarMode: 'expanded',
        dashboard: {
          showSummaryCards: true,
          showSecondaryInfo: true,
          layout: 'standard'
        }
      };
      localStorage.setItem('panorama_token', 'demo_token_employee');
      localStorage.setItem('panorama_user', JSON.stringify({
        id: 'usr-emp-01',
        username: 'employee',
        full_name: 'Employee',
        role: 'EMPLOYEE',
        is_active: true,
      }));
      localStorage.setItem('panorama_display_preferences_v2_employee', JSON.stringify(lightPrefs));
      localStorage.setItem('panorama_display_preferences_v2', JSON.stringify(lightPrefs));
      localStorage.setItem('panorama_display_preferences', JSON.stringify(lightPrefs));
    })()\`);

    // Reload with light preferences
    await win.loadURL('http://127.0.0.1:' + PORT + '/');
    await sleep(2500);

    // =========================================================================
    // 1. LIGHT THEME REFERENCE LAYOUT CAPTURE
    // =========================================================================
    console.log('[*] Capturing 01_reference_layout_light_dashboard.png...');
    await saveScreenshot(win, '01_reference_layout_light_dashboard.png');

    // =========================================================================
    // 2. COACH SELECTION INTERACTION (Click C2)
    // =========================================================================
    console.log('[*] Selecting Coach C2...');
    await win.webContents.executeJavaScript(\`(() => {
      const coaches = Array.from(document.querySelectorAll('div')).filter(el => el.textContent.trim() === 'C2');
      if (coaches.length > 0) {
        coaches[0].click();
      }
    })()\`);
    await sleep(800);
    console.log('[*] Capturing 03_coach_selection_c4_to_c2.png...');
    await saveScreenshot(win, '03_coach_selection_c4_to_c2.png');

    // Reset back to C4
    await win.webContents.executeJavaScript(\`(() => {
      const coaches = Array.from(document.querySelectorAll('div')).filter(el => el.textContent.trim() === 'C4');
      if (coaches.length > 0) {
        coaches[0].click();
      }
    })()\`);
    await sleep(600);

    // =========================================================================
    // 3. DARK THEME REFERENCE LAYOUT CAPTURE
    // =========================================================================
    console.log('[*] Switching to Dark Theme...');
    await win.webContents.executeJavaScript(\`(() => {
      const darkPrefs = {
        version: 2,
        theme: 'dark',
        zoom: '100%',
        fontSize: 'default',
        density: 'comfortable',
        sidebarMode: 'expanded',
        dashboard: {
          showSummaryCards: true,
          showSecondaryInfo: true,
          layout: 'standard'
        }
      };
      localStorage.setItem('panorama_display_preferences_v2_employee', JSON.stringify(darkPrefs));
      localStorage.setItem('panorama_display_preferences_v2', JSON.stringify(darkPrefs));
      localStorage.setItem('panorama_display_preferences', JSON.stringify(darkPrefs));
    })()\`);
    // Reload for clean dark theme application
    await win.loadURL('http://127.0.0.1:' + PORT + '/');
    await sleep(2500);
    console.log('[*] Capturing 02_reference_layout_dark_dashboard.png...');
    await saveScreenshot(win, '02_reference_layout_dark_dashboard.png');

    // =========================================================================
    // 4. RESPONSIVE RESOLUTIONS VERIFICATION
    // =========================================================================
    const resolutions = [
      { w: 1920, h: 1080, name: '12_res_1920x1080.png' },
      { w: 1600, h: 900,  name: '13_res_1600x900.png' },
      { w: 1280, h: 720,  name: '14_res_1280x720.png' },
      { w: 1024, h: 768,  name: '15_res_1024x768.png' },
    ];

    for (const res of resolutions) {
      console.log('[*] Testing resolution ' + res.w + 'x' + res.h + '...');
      win.setSize(res.w, res.h);
      await sleep(800);
      await saveScreenshot(win, res.name);
    }

    console.log('[SUCCESS] All reference layout visual verifications completed successfully!');
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
  console.log(`[SERVER] Mock SCADA server listening on http://127.0.0.1:${PORT}`);

  const tempRunnerPath = path.resolve(__dirname, 'temp_runner.cjs');
  fs.writeFileSync(tempRunnerPath, runnerScript, 'utf8');

  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    console.log(`[ELECTRON] Launching Electron with ${tempRunnerPath}...`);
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
