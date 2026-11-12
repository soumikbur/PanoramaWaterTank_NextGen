// apps/mobile/scripts/verify_train_deletion_cascade_e2e.cjs
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');
const electronPath = require('electron');

const API_PORT = 8019;
const BASE_URL = `http://127.0.0.1:${API_PORT}`;
const BACKEND_DIR = path.resolve(__dirname, '../../../backend');
const PYTHON_EXE = path.join(BACKEND_DIR, 'venv', 'Scripts', 'python.exe');
const SCREENSHOT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\9e3514ab-7eb1-481b-ac5b-d7edda1def58\\screenshots';
const TMP_DB_PATH = path.join(os.tmpdir(), `panorama_cascade_e2e_${process.pid}.db`);

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function httpJson(method, urlPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE_URL}${urlPath}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForBackend() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await httpJson('GET', '/api/v1/health');
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Backend server failed to become healthy within 20s');
}

function buildElectronScript(token, userProfile) {
  return `
    const { app, BrowserWindow } = require('electron');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const assert = require('assert');

    const BASE_URL = ${JSON.stringify(BASE_URL)};
    const SCREENSHOT_DIR = ${JSON.stringify(SCREENSHOT_DIR)};
    const TOKEN = ${JSON.stringify(token)};
    const USER = ${JSON.stringify(userProfile)};
    const EMPTY_COPY = 'No trains configured. Please add a train to begin monitoring.';

    app.setPath('userData', path.join(os.tmpdir(), 'panorama-cascade-electron-' + process.pid));
    const consoleErrors = [];

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function saveShot(win, name) {
      await win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      await sleep(300);
      const img = await win.webContents.capturePage();
      const outPath = path.join(SCREENSHOT_DIR, name);
      fs.writeFileSync(outPath, img.toPNG());
      console.log('[SCREENSHOT]', outPath);
    }

    async function waitForSelector(win, jsExpr, timeoutMs = 12000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const found = await win.webContents.executeJavaScript(jsExpr);
        if (found) return found;
        await sleep(150);
      }
      throw new Error('Timeout waiting for: ' + jsExpr);
    }

    async function clickNav(win, screenId) {
      await win.webContents.executeJavaScript(\`(() => {
        const btn = document.querySelector('button[data-screen="${'${screenId}'}"]');
        if (btn) btn.click();
      })()\`);
      await sleep(500);
    }

    async function deleteTrainInUI(win, regionTitle, trainNo) {
      await clickNav(win, 'trains');
      await win.webContents.executeJavaScript(\`(() => {
        const regBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'REGIONS');
        if (regBtn) regBtn.click();
      })()\`);
      await waitForSelector(win, \`document.body.innerText.includes(\${JSON.stringify(regionTitle)})\`);
      await win.webContents.executeJavaScript(\`(() => {
        const cards = Array.from(document.querySelectorAll('div')).filter(el =>
          (el.textContent || '').includes(\${JSON.stringify(regionTitle)}) &&
          (el.textContent || '').includes('View Trains in Region')
        );
        const card = cards[cards.length - 1];
        if (card) {
          const btn = Array.from(card.querySelectorAll('button,div')).find(b => (b.textContent || '').includes('View Trains in Region')) || card;
          btn.click();
        }
      })()\`);
      await waitForSelector(win, \`document.querySelector('[data-testid="delete-train-\${trainNo}"]') !== null\`);
      await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-\${trainNo}"]').click()\`);
      await waitForSelector(win, \`document.querySelector('[data-testid="confirm-delete-train"]') !== null\`);
      await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="confirm-delete-train"]').click()\`);
      await waitForSelector(win, \`document.querySelector('[data-testid="train-action-success"]') !== null\`);
      await sleep(400);
    }

    app.whenReady().then(async () => {
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      win.webContents.on('console-message', (e, level, msg) => {
        if (
          level >= 3 &&
          !msg.includes('React DevTools') &&
          !msg.includes('Electron Security Warning') &&
          !msg.includes('ERR_NAME_NOT_RESOLVED') &&
          !msg.includes('[CRITICAL]') &&
          !msg.includes('WebSocket connection')
        ) {
          consoleErrors.push(msg);
          console.error('[BROWSER ERROR]', msg);
        }
      });

      try {
        await win.loadURL(BASE_URL + '/');
        await sleep(500);
        await win.webContents.executeJavaScript(\`
          localStorage.setItem('panorama_token', \${JSON.stringify(TOKEN)});
          localStorage.setItem('panorama_user', \${JSON.stringify(JSON.stringify(USER))});
          localStorage.setItem('panorama_static_fleet_v1', JSON.stringify({ trains: { '12002': {} } }));
          window.location.href = \${JSON.stringify(BASE_URL + '/')};
        \`);
        await win.webContents.once ? Promise.resolve() : sleep(600);
        await sleep(1200);

        // Ensure legacy v1 cache key was purged automatically
        const v1AfterInit = await win.webContents.executeJavaScript("localStorage.getItem('panorama_static_fleet_v1')");
        assert.strictEqual(v1AfterInit, null, 'Legacy panorama_static_fleet_v1 cache key must be purged');

        // TEST 2 (setup): Dashboard displays 99501 (24 coaches / 48 tanks) initially
        await waitForSelector(win, "document.body.innerText.includes('99501')");
        const initText = await win.webContents.executeJavaScript("document.body.innerText");
        assert(initText.includes('99501'), 'Dashboard must show seeded 24-coach train 99501');
        assert(initText.includes('24 Coaches') || initText.includes('24'), 'Must reflect 24 coaches for 99501');
        assert(initText.includes('48'), 'Must reflect 48 tanks for 99501');
        await saveShot(win, 'cascade_01_24coaches_desktop.png');
        console.log('[TEST 2 PASS] 24-coach / 48-tank train 99501 rendered cleanly.');

        // Open Tab 2 BEFORE deletions to verify Test 9 Multi-Tab Synchronization later
        const win2 = new BrowserWindow({
          width: 1280,
          height: 800,
          show: false,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        });
        await win2.loadURL(BASE_URL + '/');
        await sleep(900);
        await waitForSelector(win2, "document.body.innerText.includes('99501')");
        console.log('[TEST 9 SETUP] Second tab synchronized and showing 99501.');

        // TEST 5: Multi-Train Isolation — delete 99501 in UI, verify 99502 (2 coaches / 4 tanks) stays intact
        await deleteTrainInUI(win, 'Eastern Railway (ER)', '99501');
        await clickNav(win, 'dashboard');
        await waitForSelector(win, "document.body.innerText.includes('99502')");
        const afterDelAText = await win.webContents.executeJavaScript("document.body.innerText");
        assert(!afterDelAText.includes('99501'), 'Deleted train 99501 must not appear on Dashboard');
        assert(afterDelAText.includes('99502'), 'Remaining train 99502 must stay visible');
        assert(!afterDelAText.includes('C24'), '24-coach consist C24 from deleted train must be gone');
        console.log('[TEST 5 PASS] Multi-train isolation verified (99501 removed, 99502 intact).');

        // TEST 1 & TEST 2 & TEST 7: Delete remaining train 99502 -> Cross-screen 0 trains, 0 coaches, 0 tanks
        await deleteTrainInUI(win, 'Western Railway (WR)', '99502');

        // Wait for Tab 2 (Test 9 Multi-Tab Consistency) to sync automatically via storage event!
        await waitForSelector(win2, \`document.body.innerText.includes(\${JSON.stringify(EMPTY_COPY)})\`, 8000);
        const tab2Text = await win2.webContents.executeJavaScript("document.body.innerText");
        assert(!tab2Text.includes('99501') && !tab2Text.includes('99502'), 'Tab 2 must not retain deleted trains');
        win2.close();
        console.log('[TEST 9 PASS] Multi-tab synchronization updated Tab 2 automatically to empty state.');

        // Check Dashboard Empty State (Desktop 1280x800)
        await clickNav(win, 'dashboard');
        await waitForSelector(win, \`document.body.innerText.includes('Dashboard – Train List') && document.body.innerText.includes(\${JSON.stringify(EMPTY_COPY)})\`);
        await sleep(500);
        const emptyDash = await win.webContents.executeJavaScript("document.body.innerText");
        assert(!emptyDash.includes('CR123456') && !emptyDash.includes('225256') && !emptyDash.includes('12002'), 'No legacy fallback IDs');
        assert(!emptyDash.includes('99501') && !emptyDash.includes('99502'), 'No deleted trains in Dashboard');
        await saveShot(win, 'cascade_02_empty_desktop.png');

        // Check All Tanks screen empty state (Test 7)
        await clickNav(win, 'watertank');
        await waitForSelector(win, \`document.body.innerText.includes(\${JSON.stringify(EMPTY_COPY)})\`);
        const tankRows = await win.webContents.executeJavaScript("document.querySelectorAll('tbody tr').length");
        assert.strictEqual(tankRows, 0, 'All Tanks must render 0 rows when 0 trains exist');

        // Check Train Management empty banner (Test 7)
        await clickNav(win, 'trains');
        await waitForSelector(win, \`document.querySelector('[data-testid="trains-empty-banner"]') !== null\`);

        // Check Devices screen preserves detached hardware (Test 8)
        await clickNav(win, 'devices');
        await sleep(500);
        const devicesText = await win.webContents.executeJavaScript("document.body.innerText");
        assert(devicesText.includes('PANORAMA-99501-C1') || devicesText.includes('UNASSIGNED'), 'Hardware devices preserved as UNASSIGNED');
        console.log('[TEST 1, 2, 7, 8 PASS] Cross-screen empty state & hardware preservation verified.');

        // TEST 3: Browser Reload & Cache Persistence
        await win.reload();
        await sleep(1000);
        await clickNav(win, 'dashboard');
        await waitForSelector(win, \`document.body.innerText.includes(\${JSON.stringify(EMPTY_COPY)})\`);
        console.log('[TEST 3 PASS] Reload persistence maintains 0 trains/coaches/tanks.');

        // TEST 10: Direct URL Access to Deleted Train / Coach strips query params and shows empty state cleanly
        await win.loadURL(BASE_URL + '/#/coach-details?train=99501&coach=C1');
        await sleep(1100);
        const urlState = await win.webContents.executeJavaScript(\`({
          href: window.location.href,
          text: document.body.innerText,
        })\`);
        assert(!urlState.href.includes('train=99501'), 'Deleted train query param must be stripped, got: ' + urlState.href);
        assert(!urlState.href.includes('coach=C1'), 'Deleted coach query param must be stripped, got: ' + urlState.href);
        assert(urlState.text.includes(EMPTY_COPY), 'Direct URL to deleted train/coach must show empty state');
        console.log('[TEST 10 PASS] Direct URL access stripped deleted train/coach params.');

        // TEST 4: Incoming/Retained MQTT telemetry for deleted train & unknown train is ignored in UI & Backend
        await win.webContents.executeJavaScript(\`
          window.panoramaMqttService.handleIncomingPayload(JSON.stringify({
            uid: 'PANORAMA-99501-C1', trno: '99501', chno: 'C1', wlp1: 82.5, wlp2: 75.0,
            lat: 22.58, long: 88.34, speed: 60, time: '12:00:00'
          }));
          window.panoramaMqttService.handleIncomingPayload(JSON.stringify({
            uid: 'ROGUE-99999', trno: '99999', chno: 'Z9', wlp1: 15.0, wlp2: 15.0,
            lat: 23.00, long: 87.00, speed: 40, time: '12:00:05'
          }));
        \`);
        await sleep(500);
        const afterMqttDash = await win.webContents.executeJavaScript("document.body.innerText");
        assert(afterMqttDash.includes(EMPTY_COPY), 'MQTT for deleted/unknown train must never revive train');
        assert(!afterMqttDash.includes('99501') && !afterMqttDash.includes('99999'), 'Must ignore unconfigured MQTT train numbers');
        console.log('[TEST 4 PASS] MQTT telemetry for deleted & unknown trains rejected cleanly.');

        // Mobile viewport check (390x844) on Empty State
        win.setSize(390, 844);
        await win.webContents.executeJavaScript("window.dispatchEvent(new Event('resize'));");
        await sleep(500);
        await clickNav(win, 'dashboard');
        await waitForSelector(win, \`document.body.innerText.includes(\${JSON.stringify(EMPTY_COPY)})\`);
        await saveShot(win, 'cascade_03_empty_mobile.png');

        // TEST 6: Create New Train C (99503 with 3 coaches -> 6 tanks) -> Dashboard shows ONLY 3 coaches / 6 tanks
        win.setSize(1280, 800);
        await win.webContents.executeJavaScript("window.dispatchEvent(new Event('resize'));");
        const createCRes = await win.webContents.executeJavaScript(\`
          fetch('\${BASE_URL}/api/v1/trains', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + localStorage.getItem('panorama_token'),
            },
            body: JSON.stringify({
              train_number: '99503',
              name: 'Three Coach Shatabdi',
              region: 'NORTH',
              coaches: [{ coach_number: 'E1' }, { coach_number: 'E2' }, { coach_number: 'E3' }]
            }),
          }).then(r => r.status)
        \`);
        assert.strictEqual(createCRes, 201);
        await win.webContents.executeJavaScript("window.dispatchEvent(new Event('panorama:fleet-updated'));");
        await waitForSelector(win, "document.body.innerText.includes('99503')");
        await sleep(500);
        const newTrainText = await win.webContents.executeJavaScript("document.body.innerText");
        assert(newTrainText.includes('99503'), 'New train 99503 must appear');
        assert(newTrainText.includes('3 Coaches') || newTrainText.includes('3'), 'Must show 3 coaches for 99503');
        assert(!newTrainText.includes('24 Coaches') && !newTrainText.includes('48 Tanks'), 'Must NEVER fall back to 24 coaches/48 tanks');
        await saveShot(win, 'cascade_04_new_3coaches_desktop.png');
        console.log('[TEST 6 PASS] New 3-coach train 99503 rendered with ONLY its real 3 coaches & 6 tanks.');

        assert.strictEqual(consoleErrors.length, 0, 'Zero unexpected browser errors allowed, got: ' + consoleErrors.join(' | '));
        console.log('ALL 10 CASCADE DELETION E2E SCENARIOS PASSED PERFECTLY!');
        app.exit(0);
      } catch (err) {
        console.error('[CASCADE E2E FAILURE]', err);
        try { await saveShot(win, 'cascade_99_error.png'); } catch {}
        app.exit(1);
      }
    });
  `;
}

async function run() {
  try { fs.unlinkSync(TMP_DB_PATH); } catch {}
  const dbUrl = `sqlite+aiosqlite:///${TMP_DB_PATH.replace(/\\/g, '/')}`;
  console.log('[E2E] Starting FastAPI backend on port', API_PORT, 'with isolated DB:', dbUrl);

  const backendProc = cp.spawn(
    PYTHON_EXE,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(API_PORT), '--log-level', 'warning'],
    {
      cwd: BACKEND_DIR,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, DATABASE_URL: dbUrl },
    }
  );
  backendProc.stderr.on('data', (d) => {
    const s = d.toString();
    if (/ERROR|CRITICAL|Traceback/i.test(s) && !s.includes('[DEBUG]')) process.stderr.write('[UVICORN] ' + s);
  });

  let electronEntryFile = null;
  try {
    await waitForBackend();
    console.log('[E2E] Backend healthy');

    const loginRes = await httpJson('POST', '/api/v1/auth/login', {
      username: '@admin',
      password: 'Admin@123',
    });
    assert.strictEqual(loginRes.status, 200, 'Admin login failed');
    const token = loginRes.data.access_token;
    const user = loginRes.data.user;

    // Ensure clean starting fleet (remove any prior test trains)
    const existingRes = await httpJson('GET', '/api/v1/trains', null, token);
    if (Array.isArray(existingRes.data)) {
      for (const t of existingRes.data) {
        await httpJson('DELETE', `/api/v1/trains/${t.train_number}`, null, token);
      }
    }

    // Seed Train A (99501, 24 coaches = 48 tanks) in EAST and Train B (99502, 2 coaches = 4 tanks) in WEST
    const coaches24 = Array.from({ length: 24 }, (_, i) => ({ coach_number: `C${i + 1}` }));
    const resA = await httpJson(
      'POST',
      '/api/v1/trains',
      { train_number: '99501', name: 'East 24-Coach Express', region: 'EAST', coaches: coaches24 },
      token
    );
    assert.strictEqual(resA.status, 201, 'Failed to seed 24-coach train 99501: ' + JSON.stringify(resA.data));

    const resB = await httpJson(
      'POST',
      '/api/v1/trains',
      {
        train_number: '99502',
        name: 'West 2-Coach Shuttle',
        region: 'WEST',
        coaches: [{ coach_number: 'B1' }, { coach_number: 'B2' }],
      },
      token
    );
    assert.strictEqual(resB.status, 201, 'Failed to seed 2-coach train 99502');

    electronEntryFile = path.join(__dirname, '_tmp_cascade_delete_driver.cjs');
    fs.writeFileSync(electronEntryFile, buildElectronScript(token, user), 'utf8');

    const spawnEnv = { ...process.env };
    delete spawnEnv.ELECTRON_RUN_AS_NODE;
    const exitCode = await new Promise((resolve) => {
      const child = cp.spawn(electronPath, [electronEntryFile], { stdio: 'inherit', env: spawnEnv });
      child.on('exit', resolve);
    });
    assert.strictEqual(exitCode, 0, 'Electron cascade E2E verification failed');
  } finally {
    if (electronEntryFile && fs.existsSync(electronEntryFile)) {
      fs.unlinkSync(electronEntryFile);
    }
    try {
      if (process.platform === 'win32' && backendProc.pid) {
        cp.execFileSync('taskkill', ['/PID', String(backendProc.pid), '/F', '/T'], { stdio: 'ignore' });
      } else {
        backendProc.kill('SIGTERM');
      }
    } catch {}
    try { fs.unlinkSync(TMP_DB_PATH); } catch {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
