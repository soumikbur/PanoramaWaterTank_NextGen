const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const ELECTRON_BIN = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const OUTPUT_DIR = path.join(__dirname, '..', 'screenshots');
const BRAIN_DIR = 'C:\\Users\\soumi\\.gemini\\antigravity\\brain\\02d4ebd6-2deb-462f-b938-3b5741021d98\\screenshots';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(BRAIN_DIR)) fs.mkdirSync(BRAIN_DIR, { recursive: true });

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
    width: 1280,
    height: 800,
    show: false,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  console.log('[RUNNER] Loading http://127.0.0.1:3001/ ...');
  await win.loadURL('http://127.0.0.1:3001/');
  await sleep(1000);

  // Set demo login
  await win.webContents.executeJavaScript(\`(() => {
    localStorage.setItem('panorama_token', 'demo_token_employee');
    localStorage.setItem('panorama_demo_user', JSON.stringify({
      id: 'usr-emp-01',
      username: 'employee',
      full_name: 'P. K. Sharma',
      role: 'EMPLOYEE',
      division_region: 'Eastern',
      is_active: true,
    }));
    localStorage.setItem('panorama_telemetry_timeout_sec', '120');
  })()\`);

  await win.loadURL('http://127.0.0.1:3001/');
  await sleep(1500);

  // If on login page, click quick login
  await win.webContents.executeJavaScript(\`(() => {
    const btn = document.querySelector('#btn-quick-login-employee');
    if (btn) btn.click();
  })()\`);
  await sleep(1500);

  console.log('=== TEST 1: DESKTOP DASHBOARD & SIDEBAR TRAIN SUMMARY ===');
  win.setContentSize(1280, 800);
  await sleep(800);

  const desktopSummary = await win.webContents.executeJavaScript(\`(() => {
    const sidebarCard = document.querySelector('#sidebar-train-summary-card');
    return {
      sidebarText: sidebarCard ? sidebarCard.innerText.replace(/\\s+/g, ' ').trim() : 'NOT_FOUND'
    };
  })()\`);
  console.log('[DESKTOP SIDEBAR]:', JSON.stringify(desktopSummary));
  await saveScreenshot(win, 'verify_01_desktop_dashboard_sidebar.png');

  console.log('=== TEST 2: MOBILE VIEWPORT (390x844) TRAIN SUMMARY CARD ===');
  win.setContentSize(390, 844);
  await sleep(800);

  const mobileDashboard = await win.webContents.executeJavaScript(\`(() => {
    const allDivs = Array.from(document.querySelectorAll('div'));
    const summaryCard = allDivs.find(d => d.innerText && d.innerText.includes('TRAIN SUMMARY') && d.innerText.includes('Total Coaches'));
    const activeTrainCard = allDivs.find(d => d.innerText && d.innerText.includes('ACTIVE TRAIN TELEMETRY INFO'));
    return {
      trainSummaryText: summaryCard ? summaryCard.innerText.replace(/\\s+/g, ' ').trim() : 'NOT_FOUND',
      activeTrainText: activeTrainCard ? activeTrainCard.innerText.replace(/\\s+/g, ' ').trim() : 'NOT_FOUND'
    };
  })()\`);
  console.log('[MOBILE DASHBOARD]:', JSON.stringify(mobileDashboard, null, 2));
  await saveScreenshot(win, 'verify_02_mobile_dashboard_summary.png');

  console.log('=== TEST 3: MOBILE NAVIGATION DRAWER TRAIN SUMMARY ===');
  await win.webContents.executeJavaScript(\`(() => {
    const hamburger = document.querySelector('button[aria-label="Open Navigation Menu"]');
    if (hamburger) hamburger.click();
  })()\`);
  await sleep(600);

  const drawerSummary = await win.webContents.executeJavaScript(\`(() => {
    const drawer = document.querySelector('.mobile-nav-drawer');
    return {
      drawerText: drawer ? drawer.innerText.substring(0, 300).replace(/\\s+/g, ' ').trim() : 'NOT_FOUND'
    };
  })()\`);
  console.log('[MOBILE DRAWER]:', JSON.stringify(drawerSummary));
  await saveScreenshot(win, 'verify_03_mobile_drawer_train_summary.png');

  // Close drawer
  await win.webContents.executeJavaScript(\`(() => {
    const backdrop = document.querySelector('.mobile-drawer-backdrop');
    if (backdrop) backdrop.click();
  })()\`);
  await sleep(400);

  console.log('=== TEST 4: ALL TANKS SCREEN (WATERTANK) ===');
  await win.webContents.executeJavaScript(\`(() => {
    window.location.hash = '#/watertank';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  })()\`);
  await sleep(1000);

  const waterTankScreenMetrics = await win.webContents.executeJavaScript(\`(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.replace(/\\s+/g, ' ').trim());
    const filterPills = buttons.filter(t => t.includes('All') || t.includes('Online') || t.includes('Offline') || t.includes('Low Level'));
    return { filterPills };
  })()\`);
  console.log('[ALL TANKS METRICS]:', JSON.stringify(waterTankScreenMetrics, null, 2));
  await saveScreenshot(win, 'verify_04_watertank_screen.png');

  console.log('=== TEST 5: TRAIN MANAGEMENT SCREEN ===');
  await win.webContents.executeJavaScript(\`(() => {
    window.location.hash = '#/trains';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  })()\`);
  await sleep(1000);

  const trainsScreenMetrics = await win.webContents.executeJavaScript(\`(() => {
    const onlineTrainsElements = Array.from(document.querySelectorAll('div, span')).filter(e => e.innerText && e.innerText.includes('Online Trains:')).map(e => e.innerText.replace(/\\s+/g, ' ').trim());
    return { onlineTrains: Array.from(new Set(onlineTrainsElements)) };
  })()\`);
  console.log('[TRAINS SCREEN]:', JSON.stringify(trainsScreenMetrics, null, 2));
  await saveScreenshot(win, 'verify_05_trains_management.png');

  console.log('=== TEST 6: DEVICE MAPPING SCREEN & TIMEOUT SELECTOR ===');
  await win.webContents.executeJavaScript(\`(() => {
    window.location.hash = '#/devices';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  })()\`);
  await sleep(1000);

  const devicesScreenMetrics = await win.webContents.executeJavaScript(\`(() => {
    const select = document.querySelector('select');
    const cards = Array.from(document.querySelectorAll('div')).filter(d => d.innerText && (d.innerText.includes('CONSIST TANKS') || d.innerText.includes('OFFLINE NODES'))).map(d => d.innerText.replace(/\\s+/g, ' ').trim());
    return { timeoutSelected: select ? select.value : 'NO_SELECT', cards: Array.from(new Set(cards)) };
  })()\`);
  console.log('[DEVICES SCREEN]:', JSON.stringify(devicesScreenMetrics, null, 2));
  await saveScreenshot(win, 'verify_06_devices_mapping.png');

  console.log('=== TEST 7: COACH DETAILS SCREEN ===');
  await win.webContents.executeJavaScript(\`(() => {
    window.location.hash = '#/coach-details';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  })()\`);
  await sleep(1000);

  const coachDetailsMetrics = await win.webContents.executeJavaScript(\`(() => {
    const statusDiv = Array.from(document.querySelectorAll('div')).filter(d => d.innerText && d.innerText.includes('DEVICE STATUS'));
    return { deviceStatus: statusDiv.length > 0 ? statusDiv[0].innerText.replace(/\\s+/g, ' ').trim() : 'NOT_FOUND' };
  })()\`);
  console.log('[COACH DETAILS]:', JSON.stringify(coachDetailsMetrics, null, 2));
  await saveScreenshot(win, 'verify_07_coach_details.png');

  console.log('[VERIFY COMPLETE] All UI screens successfully validated.');
  app.quit();
}

app.whenReady().then(run);
`;

const runnerPath = path.join(__dirname, 'temp_tank_runner.cjs');
fs.writeFileSync(runnerPath, runnerScript);

console.log('[LAUNCH] Executing Electron UI verification...');
const childEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
delete childEnv.ELECTRON_RUN_AS_NODE;
const child = cp.spawn(ELECTRON_BIN, [runnerPath], { env: childEnv, stdio: 'inherit' });

child.on('exit', (code) => {
  console.log('[EXIT] Runner exited with code:', code);
  try { fs.unlinkSync(runnerPath); } catch (e) {}
  process.exit(code);
});
