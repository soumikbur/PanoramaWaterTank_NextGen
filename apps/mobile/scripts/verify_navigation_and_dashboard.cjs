// apps/mobile/scripts/verify_navigation_and_dashboard.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8793;
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DIST_DIR = path.resolve(__dirname, '../dist');
const BRAIN_ARTIFACTS_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\07f934a3-112b-4821-90f4-23baf24a9f52\\screenshots';
const LOCAL_ARTIFACTS_DIR = path.resolve(REPO_ROOT, 'screenshots_scada');

[BRAIN_ARTIFACTS_DIR, LOCAL_ARTIFACTS_DIR].forEach((dir) => {
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
          division_region: 'South East',
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
        division_region: 'South East',
      }));
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
      console.log(`[SERVER] Navigation verification server listening on port ${PORT}`);
      resolve(server);
    });
  });
}

const runnerScript = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const BRAIN_ARTIFACTS_DIR = 'C:\\\\Users\\\\User\\\\.gemini\\\\antigravity\\\\brain\\\\07f934a3-112b-4821-90f4-23baf24a9f52\\\\screenshots';
const LOCAL_ARTIFACTS_DIR = path.resolve(__dirname, '../../../screenshots_scada');

app.commandLine.appendSwitch('ignore-certificate-errors');

async function run() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  console.log('[RUNNER] Loading http://127.0.0.1:${PORT} ...');
  await win.loadURL('http://127.0.0.1:${PORT}');
  await sleep(1500);

  // Set auth token if needed
  await win.webContents.executeJavaScript(\`
    localStorage.setItem('panorama_token', 'demo_token_employee');
    window.location.hash = '#/dashboard';
  \`);
  await sleep(1500);

  // 1. Verify Top Navigation Bar Branding
  const topBranding = await win.webContents.executeJavaScript(\`
    (() => {
      const header = document.querySelector('header');
      if (!header) return { found: false };
      const text = header.innerText || '';
      const hasWater = text.includes('PANORAMA WATER');
      const hasTank = text.includes('TANK MONITOR');
      const hasHome = Boolean(header.querySelector('button[title*="Home"]'));
      return { found: true, text: text.substring(0, 100), hasWater, hasTank, hasHome };
    })()
  \`);
  console.log('[TEST 1] Top Bar Branding:', JSON.stringify(topBranding));

  // 2. Verify Sidebar Restructuring
  const sidebarNav = await win.webContents.executeJavaScript(\`
    (() => {
      const sidebar = document.querySelector('aside');
      if (!sidebar) return { found: false };

      // Check if Panorama logo/branding is absent from sidebar
      const text = sidebar.innerText || '';
      const hasSidebarBranding = text.indexOf('PANORAMA') !== -1 && text.indexOf('Water Tank Monitor') !== -1;

      // Check navigation buttons
      const buttons = Array.from(sidebar.querySelectorAll('button.sidebar-nav-item')).map(b => b.innerText.trim());

      const hasDashboard = buttons.some(b => b.includes('Dashboard'));
      const hasTrainMgmt = buttons.some(b => b.includes('Train Management'));
      const hasAllTanks = buttons.some(b => b.includes('All Tanks'));
      const hasDevices = buttons.some(b => b.includes('Devices'));
      const hasLocation = buttons.some(b => b.includes('Location'));
      const hasAlerts = buttons.some(b => b.includes('Alerts'));
      const hasHistory = buttons.some(b => b.includes('History'));
      const hasReports = buttons.some(b => b.includes('Reports'));
      const hasSettings = buttons.some(b => b.includes('Settings'));

      // Verify Configuration, Users, Logs are ABSENT
      const hasConfig = buttons.some(b => b.includes('Configuration'));
      const hasUsers = buttons.some(b => b.includes('Users'));
      const hasLogs = buttons.some(b => b.includes('Logs'));

      return {
        found: true,
        buttons,
        hasSidebarBranding,
        hasDashboard,
        hasTrainMgmt,
        hasAllTanks,
        hasDevices,
        hasLocation,
        hasAlerts,
        hasHistory,
        hasReports,
        hasSettings,
        hasConfig,
        hasUsers,
        hasLogs,
      };
    })()
  \`);
  console.log('[TEST 2] Sidebar Navigation Items:', JSON.stringify(sidebarNav));

  // 3. Verify Dashboard Content (15 SCADA items)
  const dashboardContent = await win.webContents.executeJavaScript(\`
    (() => {
      const bodyText = document.body.innerText;
      return {
        hasActiveTrain: bodyText.includes('Active Train:'),
        hasSelectedCoach: bodyText.includes('Selected Coach:'),
        hasUID: bodyText.includes('UID:'),
        hasTank1: bodyText.includes('Tank 1 (Arr)'),
        hasTank2: bodyText.includes('Tank 2 (Dep)'),
        hasBattery: bodyText.includes('Battery:'),
        hasMqttStream: bodyText.includes('MQTT STREAM') || bodyText.includes('TELEMETRY'),
        hasTrainList: bodyText.includes('Dashboard – Train List') || bodyText.includes('Train List'),
        hasCoachConsist: bodyText.includes('WAP-7') || bodyText.includes('LOCO') || bodyText.includes('C1') || bodyText.includes('Coach Consist'),
        hasWaterTankStatus: bodyText.includes('Water Tank Status'),
        hasTrainLocation: bodyText.includes('Train Location'),
        hasHistoryBtns: bodyText.includes('Water Level History') || bodyText.includes('GPS / Train History'),
      };
    })()
  \`);
  console.log('[TEST 3] Dashboard Content Items:', JSON.stringify(dashboardContent));

  // 4. Capture 1920x1080 Screenshot of Dashboard
  win.setSize(1920, 1080);
  await sleep(1000);
  const img1920 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(BRAIN_ARTIFACTS_DIR, '01_restructured_scada_dashboard_1920x1080.png'), img1920.toPNG());
  fs.writeFileSync(path.join(LOCAL_ARTIFACTS_DIR, '01_restructured_scada_dashboard_1920x1080.png'), img1920.toPNG());
  console.log('[SCREENSHOT SAVED]: 01_restructured_scada_dashboard_1920x1080.png');

  // 5. Capture 1600x900 Screenshot
  win.setSize(1600, 900);
  await sleep(800);
  const img1600 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(BRAIN_ARTIFACTS_DIR, '02_restructured_scada_dashboard_1600x900.png'), img1600.toPNG());
  fs.writeFileSync(path.join(LOCAL_ARTIFACTS_DIR, '02_restructured_scada_dashboard_1600x900.png'), img1600.toPNG());
  console.log('[SCREENSHOT SAVED]: 02_restructured_scada_dashboard_1600x900.png');

  // 6. Capture 1366x768 Screenshot
  win.setSize(1366, 768);
  await sleep(800);
  const img1366 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(BRAIN_ARTIFACTS_DIR, '03_restructured_scada_dashboard_1366x768.png'), img1366.toPNG());
  fs.writeFileSync(path.join(LOCAL_ARTIFACTS_DIR, '03_restructured_scada_dashboard_1366x768.png'), img1366.toPNG());
  console.log('[SCREENSHOT SAVED]: 03_restructured_scada_dashboard_1366x768.png');

  // 7. Test Home Icon Navigation
  win.setSize(1920, 1080);
  // Navigate away to All Tanks
  await win.webContents.executeJavaScript(\`
    window.location.hash = '#/watertank';
  \`);
  await sleep(800);
  console.log('[NAV] Currently on All Tanks. Clicking Home Icon...');
  await win.webContents.executeJavaScript(\`
    const homeBtn = document.querySelector('header button[title*="Home"]');
    if (homeBtn) homeBtn.click();
  \`);
  await sleep(1000);
  const currentHash = await win.webContents.executeJavaScript('window.location.hash');
  console.log('[TEST 4] Navigated Hash after clicking Home:', currentHash);

  // 8. Test Collapse Navigation
  console.log('[NAV] Testing Collapse Navigation...');
  await win.webContents.executeJavaScript(\`
    const collapseBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Collapse Navigation'));
    if (collapseBtn) collapseBtn.click();
  \`);
  await sleep(800);
  const imgCollapsed = await win.webContents.capturePage();
  fs.writeFileSync(path.join(BRAIN_ARTIFACTS_DIR, '04_collapsed_sidebar_dashboard_1920x1080.png'), imgCollapsed.toPNG());
  fs.writeFileSync(path.join(LOCAL_ARTIFACTS_DIR, '04_collapsed_sidebar_dashboard_1920x1080.png'), imgCollapsed.toPNG());
  console.log('[SCREENSHOT SAVED]: 04_collapsed_sidebar_dashboard_1920x1080.png');

  const finalCheck = {
    topBranding: topBranding.hasWater && topBranding.hasTank && topBranding.hasHome,
    noSidebarBranding: !sidebarNav.hasSidebarBranding,
    primaryNavOrder: sidebarNav.hasDashboard && sidebarNav.hasTrainMgmt && sidebarNav.hasAllTanks && sidebarNav.hasDevices,
    systemNavClean: sidebarNav.hasSettings && !sidebarNav.hasConfig && !sidebarNav.hasUsers && !sidebarNav.hasLogs,
    dashboardItems: dashboardContent.hasActiveTrain && dashboardContent.hasSelectedCoach && dashboardContent.hasUID,
    homeNavigatesToDashboard: currentHash.includes('dashboard'),
  };

  console.log('FINAL_VERIFICATION_RESULTS:' + JSON.stringify(finalCheck));

  app.quit();
}

app.whenReady().then(run);
`;

async function main() {
  const server = await createServer();
  const runnerPath = path.resolve(__dirname, 'temp_nav_runner.cjs');
  fs.writeFileSync(runnerPath, runnerScript, 'utf8');

  console.log('[ELECTRON] Spawning Electron runner...');
  const childEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = cp.spawn(electronPath, [runnerPath], {
    stdio: 'inherit',
    env: childEnv,
  });

  child.on('close', (code) => {
    console.log(`[ELECTRON] Runner finished with exit code ${code}`);
    server.close();
    try { fs.unlinkSync(runnerPath); } catch (e) {}
    process.exit(code || 0);
  });
}

main();
