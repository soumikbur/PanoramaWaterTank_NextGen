// apps/mobile/scripts/verify_install_app_modal.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8998;
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

    if (pathname === '/') pathname = '/index.html';
    const filePath = path.join(DIST_DIR, pathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback
    const indexHtml = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexHtml).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function run() {
  const server = await createServer();
  console.log(`[TEST SERVER] Running at http://127.0.0.1:${PORT}`);

  const runnerScript = path.resolve(__dirname, 'electron_install_runner.cjs');
  const runnerCode = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = '${OUTPUT_DIR.replace(/\\/g, '\\\\')}';
const BRAIN_DIR = '${BRAIN_DIR.replace(/\\/g, '\\\\')}';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  // Test 1: Desktop Viewport
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  await win.loadURL('http://127.0.0.1:${PORT}/#/dashboard');
  await new Promise(r => setTimeout(r, 2000));

  // Click shortcut login if on login screen
  await win.webContents.executeJavaScript(\`(() => {
    const adminBtn = document.getElementById('btn-quick-login-admin') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Admin'));
    if (adminBtn) adminBtn.click();
  })()\`);
  await new Promise(r => setTimeout(r, 2000));

  // Capture desktop header with Install App button
  const p1 = path.join(OUTPUT_DIR, 'install_app_01_desktop_header.png');
  const p1b = path.join(BRAIN_DIR, 'install_app_01_desktop_header.png');
  const img1 = await win.webContents.capturePage();
  fs.writeFileSync(p1, img1.toPNG());
  fs.writeFileSync(p1b, img1.toPNG());
  console.log('[TEST] Captured desktop header with Install App button');

  // Click Install App button
  const clicked = await win.webContents.executeJavaScript(\`(() => {
    const btn = document.getElementById('header-install-app-btn');
    if (btn) { btn.click(); return true; }
    return false;
  })()\`);
  console.log('[TEST] Desktop Install App button clicked:', clicked);
  await new Promise(r => setTimeout(r, 1000));

  // Capture Install App Modal
  const p2 = path.join(OUTPUT_DIR, 'install_app_02_modal_desktop.png');
  const p2b = path.join(BRAIN_DIR, 'install_app_02_modal_desktop.png');
  const img2 = await win.webContents.capturePage();
  fs.writeFileSync(p2, img2.toPNG());
  fs.writeFileSync(p2b, img2.toPNG());
  console.log('[TEST] Captured Install App Modal');

  // Test 2: Mobile Viewport (390x844)
  win.setContentSize(390, 844);
  await new Promise(r => setTimeout(r, 1000));

  // Close existing modal
  await win.webContents.executeJavaScript(\`(() => {
    const closeBtn = document.querySelector('[aria-label="Close modal"]');
    if (closeBtn) closeBtn.click();
  })()\`);
  await new Promise(r => setTimeout(r, 600));

  // Capture mobile header
  const p3 = path.join(OUTPUT_DIR, 'install_app_03_mobile_header.png');
  const p3b = path.join(BRAIN_DIR, 'install_app_03_mobile_header.png');
  const img3 = await win.webContents.capturePage();
  fs.writeFileSync(p3, img3.toPNG());
  fs.writeFileSync(p3b, img3.toPNG());
  console.log('[TEST] Captured mobile header with Install App button');

  // Click mobile install app button
  const mClicked = await win.webContents.executeJavaScript(\`(() => {
    const btn = document.getElementById('mobile-install-app-btn');
    if (btn) { btn.click(); return true; }
    return false;
  })()\`);
  console.log('[TEST] Mobile Install App button clicked:', mClicked);
  await new Promise(r => setTimeout(r, 1000));

  // Capture mobile install modal
  const p4 = path.join(OUTPUT_DIR, 'install_app_04_modal_mobile.png');
  const p4b = path.join(BRAIN_DIR, 'install_app_04_modal_mobile.png');
  const img4 = await win.webContents.capturePage();
  fs.writeFileSync(p4, img4.toPNG());
  fs.writeFileSync(p4b, img4.toPNG());
  console.log('[TEST] Captured mobile install modal');

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

run().catch(err => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
