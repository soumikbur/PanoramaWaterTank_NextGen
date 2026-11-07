// apps/mobile/scripts/verify_coach_details_and_e2e.cjs
/**
 * Automated Verification Suite for Coach Details & Full Application Audit
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
let electronPath;
try {
  electronPath = require('electron');
} catch (e) {
  electronPath = require(path.resolve(__dirname, '../node_modules/electron'));
}
if (typeof electronPath !== 'string') {
  electronPath = String(electronPath.default || electronPath);
}

const PORT = 8790;
const REPO_ROOT = path.resolve(__dirname, '../../../');
const DIST_DIR = path.resolve(__dirname, '../dist');
const BRAIN_ARTIFACTS_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\07f934a3-112b-4821-90f4-23baf24a9f52\\screenshots';
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
          source_station: 'Chennai Central (MAS)',
          destination_station: 'Howrah Junction (HWH)',
          region: 'South East',
          online_status: true,
          coaches_count: 24,
          tanks_count: 48,
          last_telemetry: new Date().toISOString(),
          coaches: Array.from({ length: 24 }, (_, i) => ({
            coach_number: `C${i + 1}`,
            device_uid: `DEV-WLI-${i < 9 ? '0' + (i + 1) : i + 1}`,
            is_online: i % 7 !== 0,
            battery_percent: 75,
            tanks: [
              { tank_id: `t-arr-${i+1}`, type: 'Arrival', level_percent: 70, height_cm: 35.0, status: 'NORMAL' },
              { tank_id: `t-dep-${i+1}`, type: 'Departure', level_percent: 40, height_cm: 20.0, status: 'NORMAL' },
            ]
          }))
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/tanks' || pathname === '/api/v1/tanks/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          tankId: 'tank-12841-C4-arr',
          tankIndex: 1,
          deviceId: 'Device-1',
          trainNumber: '12841',
          coachNumber: 'C4',
          tankName: 'Arrival Side (Tank 1)',
          capacityLiters: 20.0,
          maxHeightCm: 50.0,
          levelPercent: 70.0,
          volumeLiters: 14.0,
          heightCm: 35.0,
          rank: 'GOOD',
          alarmStatus: 'NORMAL',
          batteryVoltage: 3.8,
          temperature: 28.0,
          isOnline: true,
          hasTelemetry: true,
          isStale: false,
          lastUpdate: new Date().toISOString(),
        },
        {
          tankId: 'tank-12841-C4-dep',
          tankIndex: 2,
          deviceId: 'Device-1',
          trainNumber: '12841',
          coachNumber: 'C4',
          tankName: 'Departure Side (Tank 2)',
          capacityLiters: 20.0,
          maxHeightCm: 50.0,
          levelPercent: 40.0,
          volumeLiters: 8.0,
          heightCm: 20.0,
          rank: 'GOOD',
          alarmStatus: 'NORMAL',
          batteryVoltage: 3.8,
          temperature: 28.2,
          isOnline: true,
          hasTelemetry: true,
          isStale: false,
          lastUpdate: new Date().toISOString(),
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/devices') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          id: 'dev-01',
          uid: 'Device-1',
          trainNumber: '12841',
          coachNumber: 'C4',
          isOnline: true,
          batteryPercent: 62,
          primaryLevel: 70.0,
          secondaryLevel: 40.0,
          lastHeartbeat: new Date().toISOString(),
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/logs' || pathname === '/api/v1/system/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { time: '11:26:20', level: 'INFO', module: 'TELEMETRY', msg: 'Packet received from Train 12841 Coach C4' }
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
const BRAIN_DIR = "${BRAIN_ARTIFACTS_DIR.replace(/\\/g, '\\\\')}";
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

  win.webContents.on('console-message', (e, level, msg, line, src) => {
    if (level >= 2) {
      console.log('[BROWSER ERR/WARN]:', msg);
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

    // Reload with authenticated admin session on dashboard
    await win.loadURL('http://127.0.0.1:' + PORT + '/#/dashboard');
    await sleep(2500);

    // =========================================================================
    // STEP 1: Verify Dashboard loads cleanly
    // =========================================================================
    console.log('[TEST 1] Verifying Dashboard & Coach Consist button presence...');
    const dashInfo = await win.webContents.executeJavaScript(\`(() => {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => h.textContent.trim());
      const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
      return { headings, btns: btns.slice(0, 25), hasBlank: document.body.innerHTML.length < 500 };
    })()\`);
    console.log('Dashboard headings:', dashInfo.headings);
    if (dashInfo.hasBlank) throw new Error('Dashboard rendered blank page!');

    // =========================================================================
    // STEP 2: Click "Coach Consist" from Dashboard
    // =========================================================================
    console.log('[TEST 2] Clicking Coach Consist...');
    await win.webContents.executeJavaScript(\`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Coach Consist'));
      if (btn) btn.click();
      else throw new Error('Coach Consist button not found on Dashboard');
    })()\`);
    await sleep(1500);

    const consistInfo = await win.webContents.executeJavaScript(\`(() => {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => h.textContent.trim());
      const bodyLen = document.body.innerHTML.length;
      return { headings, bodyLen };
    })()\`);
    console.log('Coach Consist headings:', consistInfo.headings);
    if (consistInfo.bodyLen < 500) throw new Error('Coach Consist rendered blank page!');

    // =========================================================================
    // STEP 3: Select Coach C1 and click "Full Details" / "Coach Details"
    // =========================================================================
    console.log('[TEST 3] Selecting Coach C1 and navigating to Coach Details...');
    await win.webContents.executeJavaScript(\`(() => {
      // Find coach card C1
      const cards = Array.from(document.querySelectorAll('div')).filter(el => el.textContent.includes('Coach C1') && el.style.cursor === 'pointer');
      if (cards.length > 0) cards[0].click();
    })()\`);
    await sleep(1000);

    // Click "Full Details"
    await win.webContents.executeJavaScript(\`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Full Details') || b.textContent.includes('Coach Details'));
      if (btn) btn.click();
      else throw new Error('Full Details button not found');
    })()\`);
    await sleep(2000);

    // Verify Coach Details Screen rendered
    const coach1Details = await win.webContents.executeJavaScript(\`(() => {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => h.textContent.trim());
      const bodyLen = document.body.innerHTML.length;
      const text = document.body.innerText;
      return {
        headings,
        bodyLen,
        hasCoach1: text.includes('Coach C1') || text.includes('Coach : C1'),
        hasArrival: text.includes('Arrival Side'),
        hasDeparture: text.includes('Departure Side'),
        hasGPS: text.includes('Eastern Railway Mainline Corridor'),
        hasHistory: text.includes('Water Level History'),
      };
    })()\`);
    console.log('Coach C1 Details checks:', coach1Details);
    if (coach1Details.bodyLen < 500 || !coach1Details.hasCoach1) {
      throw new Error('Coach C1 Details page failed to render properly!');
    }
    await saveScreenshot(win, '01_coach_details_c1.png');

    // =========================================================================
    // STEP 4: Test Browser Refresh on Coach Details route
    // =========================================================================
    console.log('[TEST 4] Testing browser refresh on #/coach-details?train=12841&coach=C1 ...');
    await win.reload();
    await sleep(2500);

    const postRefreshInfo = await win.webContents.executeJavaScript(\`(() => {
      const text = document.body.innerText;
      const bodyLen = document.body.innerHTML.length;
      const url = window.location.href;
      return {
        url,
        bodyLen,
        hasCoach1: text.includes('Coach C1') || text.includes('Coach : C1'),
        hasArrival: text.includes('Arrival Side'),
        hasDeparture: text.includes('Departure Side'),
      };
    })()\`);
    console.log('Post-refresh info:', postRefreshInfo);
    if (postRefreshInfo.bodyLen < 500 || !postRefreshInfo.hasCoach1) {
      throw new Error('Post-refresh Coach Details failed or rendered blank page!');
    }
    await saveScreenshot(win, '02_coach_details_after_refresh.png');

    // =========================================================================
    // STEP 5: Direct URL Navigation (#/coach-details?train=12841&coach=C14)
    // =========================================================================
    console.log('[TEST 5] Testing direct URL navigation to Coach C14...');
    await win.loadURL('http://127.0.0.1:' + PORT + '/#/coach-details?train=12841&coach=C14');
    await sleep(2000);

    const c14Info = await win.webContents.executeJavaScript(\`(() => {
      const text = document.body.innerText;
      return {
        hasCoach14: text.includes('Coach C14') || text.includes('Coach : C14'),
        hasArrival: text.includes('Arrival Side'),
        bodyLen: document.body.innerHTML.length,
      };
    })()\`);
    console.log('Direct C14 info:', c14Info);
    if (!c14Info.hasCoach14) throw new Error('Direct navigation to Coach C14 failed!');
    await saveScreenshot(win, '03_coach_details_direct_url_c14.png');

    // =========================================================================
    // STEP 6: Graceful handling of invalid coach ID (e.g. C99)
    // =========================================================================
    console.log('[TEST 6] Testing invalid coach ID C99...');
    await win.loadURL('http://127.0.0.1:' + PORT + '/#/coach-details?train=12841&coach=C99');
    await sleep(1500);

    const invalidNotice = await win.webContents.executeJavaScript(\`(() => {
      const text = document.body.innerText;
      return {
        hasNotice: text.includes('Invalid Coach Identifier: C99'),
        hasButton: text.includes('Select Coach C1') || text.includes('Return to Dashboard'),
        bodyLen: document.body.innerHTML.length,
      };
    })()\`);
    console.log('Invalid coach notice check:', invalidNotice);
    if (!invalidNotice.hasNotice) throw new Error('Invalid coach notice not displayed properly!');
    await saveScreenshot(win, '04_invalid_coach_graceful_notice.png');

    // =========================================================================
    // STEP 7: Return to Dashboard and navigate to Coach C2
    // =========================================================================
    console.log('[TEST 7] Returning to Dashboard and selecting Coach C2...');
    await win.webContents.executeJavaScript(\`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Return to Dashboard'));
      if (btn) btn.click();
    })()\`);
    await sleep(2000);

    // In Dashboard, select Coach C2
    await win.webContents.executeJavaScript(\`(() => {
      const coach2 = Array.from(document.querySelectorAll('div')).find(el => el.textContent.trim() === 'C2');
      if (coach2) coach2.click();
    })()\`);
    await sleep(1000);

    // Click "View Details" / "Coach Details" primary button from Dashboard bottom bar
    await win.webContents.executeJavaScript(\`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View Details') || b.textContent.includes('Coach Details'));
      if (btn) btn.click();
      else throw new Error('View Details button not found on Dashboard');
    })()\`);
    await sleep(2000);

    const c2Info = await win.webContents.executeJavaScript(\`(() => {
      const text = document.body.innerText;
      return {
        hasCoach2: text.includes('Coach C2') || text.includes('Coach : C2'),
        hasArrival: text.includes('Arrival Side'),
        bodyLen: document.body.innerHTML.length,
      };
    })()\`);
    console.log('Coach C2 details info:', c2Info);
    if (!c2Info.hasCoach2) throw new Error('Coach C2 details failed to render from Dashboard!');
    await saveScreenshot(win, '05_coach_c2_details.png');

    // =========================================================================
    // STEP 8: Multi-resolution Responsiveness Testing
    // =========================================================================
    console.log('[TEST 8] Multi-resolution verification...');
    const resolutions = [
      { w: 1920, h: 1080, name: '06_res_1920x1080_coach_details.png' },
      { w: 1600, h: 900, name: '07_res_1600x900_coach_details.png' },
      { w: 1366, h: 768, name: '08_res_1366x768_coach_details.png' },
    ];

    for (const res of resolutions) {
      win.setSize(res.w, res.h);
      await sleep(1000);
      await saveScreenshot(win, res.name);
    }

    console.log('[SUCCESS] All Coach Details & Navigation tests passed with flying colors!');
    app.quit();
  } catch (err) {
    console.error('[TEST SUITE ERROR]:', err);
    process.exit(1);
  }
});
`;

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`[SERVER] Mock server listening on http://127.0.0.1:${PORT}`);

  const tempRunnerPath = path.resolve(__dirname, 'temp_runner_coach_details.cjs');
  fs.writeFileSync(tempRunnerPath, runnerScript, 'utf8');

  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    console.log(`[ELECTRON] Launching Electron E2E verification runner...`);
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

