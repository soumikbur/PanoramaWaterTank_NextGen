// apps/mobile/scripts/capture_mobile_screenshots.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8993;
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DIST_DIR = path.resolve(__dirname, '../dist');
const OUTPUT_DIR = path.resolve(REPO_ROOT, 'MOBILE_TEST_SCREENSHOTS');
const BRAIN_DIR = 'C:\\Users\\soumi\\.gemini\\antigravity\\brain\\02d4ebd6-2deb-462f-b938-3b5741021d98\\screenshots';

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
          full_name: 'P. K. Sharma',
          role: 'EMPLOYEE',
          division_region: 'Eastern',
        },
      }));
      return;
    }

    if (pathname === '/api/v1/auth/me' || pathname === '/api/v1/users/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'usr-emp-01',
        username: 'employee',
        full_name: 'P. K. Sharma',
        role: 'EMPLOYEE',
        division_region: 'Eastern',
        is_active: true,
      }));
      return;
    }

    if (pathname === '/api/v1/regions/summary' || pathname === '/api/v1/regions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          region: 'EAST',
          name: 'Eastern Railway Division',
          code: 'ER',
          configuredTrains: 1,
          coaches: 24,
          tanks: 48,
          onlineTrains: 1,
          status: 'All Normal',
          trains: [
            {
              train_number: '225256',
              name: 'Special Express (225256)',
              source_station: 'Live Corridor',
              destination_station: 'In Service',
              region: 'Eastern',
              coaches_count: 24,
              tanks_count: 48,
              is_online: true,
              status: 'Normal',
              active_alarms: 0,
            }
          ]
        },
        {
          region: 'NORTH',
          name: 'Northern Railway Division',
          code: 'NR',
          configuredTrains: 1,
          coaches: 20,
          tanks: 40,
          onlineTrains: 1,
          status: 'All Normal',
          trains: [
            {
              train_number: '12002',
              name: 'Shatabdi Express',
              source_station: 'New Delhi (NDLS)',
              destination_station: 'Bhopal (BPL)',
              region: 'Northern',
              coaches_count: 20,
              tanks_count: 40,
              is_online: true,
              status: 'Normal',
              active_alarms: 0,
            }
          ]
        },
        {
          region: 'WEST',
          name: 'Western Railway Division',
          code: 'WR',
          configuredTrains: 1,
          coaches: 22,
          tanks: 44,
          onlineTrains: 1,
          status: 'All Normal',
          trains: [
            {
              train_number: '12951',
              name: 'Mumbai Rajdhani',
              source_station: 'Mumbai Central (MMCT)',
              destination_station: 'New Delhi (NDLS)',
              region: 'Western',
              coaches_count: 22,
              tanks_count: 44,
              is_online: true,
              status: 'Normal',
              active_alarms: 0,
            }
          ]
        },
        {
          region: 'SOUTH',
          name: 'Southern Railway Division',
          code: 'SR',
          configuredTrains: 0,
          coaches: 0,
          tanks: 0,
          onlineTrains: 0,
          status: 'All Normal',
          trains: []
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/trains') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          train_number: '225256',
          name: 'Special Express (225256)',
          source_station: 'Live Corridor',
          destination_station: 'In Service',
          region: 'Eastern',
          online_status: true,
          coaches_count: 24,
          tanks_count: 48,
          last_telemetry: new Date().toISOString(),
          coaches: Array.from({ length: 24 }, (_, i) => ({
            coach_number: `C${i + 1}`,
            device_uid: `DEV-WLI-${i < 9 ? '0' + (i + 1) : i + 1}`,
            is_online: true,
            battery_percent: 88,
            tanks: [
              { tank_id: `t-arr-${i+1}`, type: 'Arrival', level_percent: 74, height_cm: 111.0, status: 'NORMAL' },
              { tank_id: `t-dep-${i+1}`, type: 'Departure', level_percent: 68, height_cm: 102.0, status: 'NORMAL' },
            ]
          }))
        },
        {
          train_number: '12002',
          name: 'Shatabdi Express',
          source_station: 'New Delhi (NDLS)',
          destination_station: 'Bhopal (BPL)',
          region: 'Northern',
          online_status: true,
          coaches_count: 20,
          tanks_count: 40,
          last_telemetry: new Date().toISOString(),
          coaches: []
        },
        {
          train_number: '12951',
          name: 'Mumbai Rajdhani',
          source_station: 'Mumbai Central (MMCT)',
          destination_station: 'New Delhi (NDLS)',
          region: 'Western',
          online_status: true,
          coaches_count: 22,
          tanks_count: 44,
          last_telemetry: new Date().toISOString(),
          coaches: []
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/tanks' || pathname === '/api/v1/tanks/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          tankId: 'tank-225256-C4-arr',
          tankIndex: 1,
          deviceId: '0023004D4B42501120353332',
          trainNumber: '225256',
          coachNumber: 'C4',
          tankName: 'Arrival Side (Tank 1)',
          capacityLiters: 500.0,
          maxHeightCm: 150.0,
          levelPercent: 74.0,
          volumeLiters: 370.0,
          heightCm: 111.0,
          rank: 'GOOD',
          alarmStatus: 'NORMAL',
          batteryVoltage: 3.9,
          temperature: 27.5,
          isOnline: true,
          hasTelemetry: true,
          isStale: false,
          lastUpdate: new Date().toISOString(),
        },
        {
          tankId: 'tank-225256-C4-dep',
          tankIndex: 2,
          deviceId: '0023004D4B42501120353332',
          trainNumber: '225256',
          coachNumber: 'C4',
          tankName: 'Departure Side (Tank 2)',
          capacityLiters: 500.0,
          maxHeightCm: 150.0,
          levelPercent: 68.0,
          volumeLiters: 340.0,
          heightCm: 102.0,
          rank: 'GOOD',
          alarmStatus: 'NORMAL',
          batteryVoltage: 3.9,
          temperature: 27.5,
          isOnline: true,
          hasTelemetry: true,
          isStale: false,
          lastUpdate: new Date().toISOString(),
        }
      ]));
      return;
    }

    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[SERVER] Screenshot capture server listening on port ${PORT}`);
      resolve(server);
    });
  });
}

const runnerScript = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = '${OUTPUT_DIR.replace(/\\/g, '\\\\')}';
const BRAIN_DIR = '${BRAIN_DIR.replace(/\\/g, '\\\\')}';

app.commandLine.appendSwitch('ignore-certificate-errors');

async function saveScreenshot(win, filename) {
  const image = await win.webContents.capturePage();
  const png = image.toPNG();
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), png);
  try {
    fs.writeFileSync(path.join(BRAIN_DIR, filename), png);
  } catch (err) {}
  console.log('[SAVED]: ' + filename + ' (Size: ' + png.length + ' bytes)');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const win = new BrowserWindow({
    width: 390,
    height: 844,
    show: false,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  console.log('[RUNNER] Initializing session on http://127.0.0.1:${PORT} ...');
  await win.loadURL('http://127.0.0.1:${PORT}/');
  await sleep(1000);

  // Bootstrap authenticated user session
  await win.webContents.executeJavaScript(\`(() => {
    localStorage.setItem('panorama_token', 'demo_token_employee');
    localStorage.setItem('panorama_user', JSON.stringify({
      id: 'usr-emp-01',
      username: 'employee',
      full_name: 'P. K. Sharma',
      role: 'EMPLOYEE',
      division_region: 'Eastern',
      is_active: true,
    }));
  })()\`);

  // Reload with authenticated employee session
  await win.loadURL('http://127.0.0.1:${PORT}/');
  await sleep(2000);

  // Check state
  const stateCheck = await win.webContents.executeJavaScript(\`(() => {
    const isLogin = Boolean(document.querySelector('input[type="password"]'));
    const isHeader = Boolean(document.querySelector('header'));
    const isSidebar = Boolean(document.querySelector('aside'));
    return { isLogin, isHeader, isSidebar, bodySnippet: document.body.innerText.substring(0, 80) };
  })()\`);
  console.log('[RUNNER] Authenticated state:', JSON.stringify(stateCheck));

  // VIEWPORT MATRIX
  const viewports = [
    { w: 320, h: 640, name: '01_viewport_320x640_small_mobile.png' },
    { w: 360, h: 800, name: '02_viewport_360x800_standard_mobile.png' },
    { w: 375, h: 812, name: '03_viewport_375x812_iphone_mini.png' },
    { w: 390, h: 844, name: '04_viewport_390x844_iphone_pro.png' },
    { w: 430, h: 932, name: '05_viewport_430x932_iphone_promax.png' },
    { w: 600, h: 960, name: '06_viewport_600x960_small_tablet.png' },
    { w: 768, h: 1024, name: '07_viewport_768x1024_ipad_portrait.png' },
    { w: 1024, h: 768, name: '08_viewport_1024x768_laptop_tablet_landscape.png' },
    { w: 1366, h: 768, name: '09_viewport_1366x768_desktop.png' },
    { w: 1920, h: 1080, name: '10_viewport_1920x1080_large_desktop.png' },
  ];

  for (const vp of viewports) {
    win.setContentSize(vp.w, vp.h);
    await sleep(600);
    await saveScreenshot(win, vp.name);
  }

  // INTERACTIVE TEST: Mobile Navigation Drawer Open (390x844)
  win.setContentSize(390, 844);
  await sleep(400);
  console.log('[RUNNER] Triggering Mobile Drawer Hamburger...');
  await win.webContents.executeJavaScript(\`
    const hamburger = document.querySelector('button[aria-label="Open Navigation Menu"]');
    if (hamburger) hamburger.click();
  \`);
  await sleep(700);
  await saveScreenshot(win, '11_mobile_390x844_drawer_open.png');

  // Close Drawer by clicking backdrop
  await win.webContents.executeJavaScript(\`
    const backdrop = document.querySelector('.mobile-drawer-backdrop');
    if (backdrop) backdrop.click();
  \`);
  await sleep(400);

  // INTERACTIVE TEST: Mobile Search Trigger
  console.log('[RUNNER] Triggering Mobile Search Modal...');
  await win.webContents.executeJavaScript(\`
    const searchBtn = document.querySelector('button[aria-label="Search fleet"]');
    if (searchBtn) searchBtn.click();
  \`);
  await sleep(700);
  await saveScreenshot(win, '12_mobile_390x844_search_modal.png');

  // Dismiss Search
  await win.webContents.executeJavaScript(\`
    const closeBtn = document.querySelector('button[aria-label="Close search"]');
    if (closeBtn) closeBtn.click();
  \`);
  await sleep(400);

  // SCREEN-BY-SCREEN TEST AT 390x844
  const screens = [
    { screen: 'trains', file: '13_mobile_390x844_trains_screen.png' },
    { screen: 'coach-details', file: '14_mobile_390x844_coach_details.png' },
    { screen: 'watertank', file: '15_mobile_390x844_all_tanks.png' },
    { screen: 'devices', file: '16_mobile_390x844_devices_mapping.png' },
    { screen: 'alerts', file: '17_mobile_390x844_alerts_screen.png' },
    { screen: 'history', file: '18_mobile_390x844_history_screen.png' },
    { screen: 'reports', file: '19_mobile_390x844_reports_screen.png' },
    { screen: 'location', file: '20_mobile_390x844_location_map.png' },
  ];

  for (const s of screens) {
    console.log('[RUNNER] Navigating to ' + s.screen + '...');
    await win.webContents.executeJavaScript(\`
      window.location.hash = '#/' + '\${s.screen}';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    \`);
    await sleep(900);
    await saveScreenshot(win, s.file);
  }

  console.log('[RUNNER] All screenshots captured successfully.');
  app.quit();
}

app.whenReady().then(run);
`;

async function main() {
  const server = await createServer();
  const runnerPath = path.resolve(__dirname, 'temp_screenshot_runner.cjs');
  fs.writeFileSync(runnerPath, runnerScript, 'utf8');

  console.log('[ELECTRON] Spawning Electron screenshot capture...');
  const childEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = cp.spawn(electronPath, [runnerPath], {
    stdio: 'inherit',
    env: childEnv,
  });

  child.on('close', (code) => {
    console.log(`[ELECTRON] Screenshot runner finished with exit code ${code}`);
    server.close();
    try { fs.unlinkSync(runnerPath); } catch (e) {}
    process.exit(code || 0);
  });
}

main();
