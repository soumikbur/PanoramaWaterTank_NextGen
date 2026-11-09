// apps/mobile/scripts/capture_search_showcase.cjs
/**
 * Capture high-quality before/after and interaction showcase screenshots
 * for Mobile Search Dedicated Submit Button.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8777;
const DIST_DIR = path.resolve(__dirname, '../dist');
const OUTPUT_DIR = path.resolve('C:/Users/soumi/.gemini/antigravity/brain/02d4ebd6-2deb-462f-b938-3b5741021d98/screenshots');

function createServer() {
  const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/v1/auth/me' || pathname === '/api/auth/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'usr-admin-01',
        username: '@admin',
        full_name: 'System Administrator',
        role: 'ADMIN',
        email: 'admin@railway.gov.in',
        is_active: true,
      }));
      return;
    }

    if (pathname.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', data: [] }));
      return;
    }

    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  return server;
}

const RUNNER_SCRIPT = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');

const PORT = ${PORT};
const OUTPUT_DIR = ${JSON.stringify(OUTPUT_DIR)};

async function run() {
  await app.whenReady();

  // Helper to type into input via React's internal value tracker
  async function typeQuery(win, text) {
    await win.webContents.executeJavaScript(\`
      (() => {
        const input = document.querySelector('input[type="search"]');
        if (input) {
          const lastValue = input.value;
          input.value = '\${text}';
          const tracker = input._valueTracker;
          if (tracker) {
            tracker.setValue(lastValue);
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    \`);
    await new Promise(r => setTimeout(r, 400));
  }

  // 1. Mobile Viewport 390x844
  const win = new BrowserWindow({
    width: 390,
    height: 844,
    show: false,
    useContentSize: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  await win.loadURL('http://localhost:' + PORT);

  await win.webContents.executeJavaScript(\`
    localStorage.setItem('panorama_token', 'demo_token_admin');
    localStorage.setItem('panorama_user', JSON.stringify({
      id: 'usr-admin-01',
      username: '@admin',
      full_name: 'System Administrator',
      role: 'ADMIN',
      email: 'admin@railway.gov.in',
      is_active: true
    }));
    window.location.reload();
  \`);

  await new Promise(r => setTimeout(r, 1500));

  // Capture State 1: Header normal mode (before search)
  let img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'search_showcase_01_mobile_header_normal.png'), img.toPNG());

  // Open Search Mode
  await win.webContents.executeJavaScript(\`
    (() => {
      const btn = document.querySelector('button[aria-label="Search fleet"]');
      if (btn) btn.click();
    })()
  \`);
  await new Promise(r => setTimeout(r, 500));

  // Capture State 2: Search Bar open (empty, button disabled)
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'search_showcase_02_mobile_search_empty.png'), img.toPNG());

  // Type query '225256'
  await typeQuery(win, '225256');

  // Capture State 3: Search Bar with text & active blue submit button
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'search_showcase_03_mobile_search_button_active.png'), img.toPNG());

  // Click dedicated submit button (Method A)
  await win.webContents.executeJavaScript(\`
    (() => {
      const submitBtn = document.querySelector('[data-testid="mobile-search-submit-btn"]');
      if (submitBtn) submitBtn.click();
    })()
  \`);
  await new Promise(r => setTimeout(r, 600));

  // Capture State 4: Search Results Panel Open for Train 225256
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'search_showcase_04_mobile_search_results_train.png'), img.toPNG());

  // Type non-existent query 'UNKNOWN-DEVICE-999'
  await typeQuery(win, 'UNKNOWN-DEVICE-999');
  await win.webContents.executeJavaScript(\`
    (() => {
      const submitBtn = document.querySelector('[data-testid="mobile-search-submit-btn"]');
      if (submitBtn) submitBtn.click();
    })()
  \`);
  await new Promise(r => setTimeout(r, 600));

  // Capture State 5: "No results found" panel
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'search_showcase_05_mobile_no_results.png'), img.toPNG());

  // Resize to 320x640 Small Mobile
  win.setContentSize(320, 640);
  await new Promise(r => setTimeout(r, 500));

  // Type 'C1' and submit via Enter key (Method B)
  await typeQuery(win, 'C1');
  await win.webContents.executeJavaScript(\`
    (() => {
      const input = document.querySelector('input[type="search"]');
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      }
    })()
  \`);
  await new Promise(r => setTimeout(r, 600));

  // Capture State 6: 320px small screen with search results
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'search_showcase_06_mobile_320px_results_coach.png'), img.toPNG());

  // Close search and resize to Desktop (1366x768)
  await win.webContents.executeJavaScript(\`
    (() => {
      const closeBtn = document.querySelector('button[aria-label="Close search"]');
      if (closeBtn) closeBtn.click();
    })()
  \`);
  await new Promise(r => setTimeout(r, 300));

  win.setContentSize(1366, 768);
  await new Promise(r => setTimeout(r, 500));

  // Capture State 7: Desktop view (header unchanged, no duplicate mobile button)
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'search_showcase_07_desktop_unchanged.png'), img.toPNG());

  win.destroy();
  console.log('[SUCCESS] All showcase screenshots captured!');
  app.quit();
}

run().catch(err => {
  console.error('[FATAL]', err);
  app.exit(1);
});
`;

async function main() {
  const server = createServer();
  await new Promise(r => server.listen(PORT, r));
  console.log(`[SERVER] Showcase server listening at http://localhost:${PORT}`);

  const runnerPath = path.resolve(__dirname, 'temp_showcase_runner.cjs');
  fs.writeFileSync(runnerPath, RUNNER_SCRIPT, 'utf8');

  const childEnv = Object.assign({}, process.env);
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = cp.spawn(electronPath, [runnerPath], {
    env: childEnv,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    try { fs.unlinkSync(runnerPath); } catch(e) {}
    server.close();
    process.exit(code || 0);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

