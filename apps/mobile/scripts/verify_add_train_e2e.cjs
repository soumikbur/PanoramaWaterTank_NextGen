// apps/mobile/scripts/verify_add_train_e2e.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');
const electronPath = require('electron');

const API_PORT = 8015;
const BASE_URL = `http://127.0.0.1:${API_PORT}`;
const BACKEND_DIR = path.resolve(__dirname, '../../../backend');
const PYTHON_EXE = path.join(BACKEND_DIR, 'venv', 'Scripts', 'python.exe');
const SCREENSHOT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\9e3514ab-7eb1-481b-ac5b-d7edda1def58\\screenshots';

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
    const path = require('path');
    const assert = require('assert');

    const BASE_URL = ${JSON.stringify(BASE_URL)};
    const SCREENSHOT_DIR = ${JSON.stringify(SCREENSHOT_DIR)};
    const TOKEN = ${JSON.stringify(token)};
    const USER = ${JSON.stringify(userProfile)};

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function saveShot(win, name) {
      await win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      await sleep(350);
      const img = await win.webContents.capturePage();
      const outPath = path.join(SCREENSHOT_DIR, name);
      fs.writeFileSync(outPath, img.toPNG());
      console.log('[SCREENSHOT]', outPath);
    }

    async function setInputValue(win, selector, value) {
      return win.webContents.executeJavaScript(\`
        (() => {
          const el = document.querySelector(\${JSON.stringify(selector)});
          if (!el) return false;
          const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          desc.set.call(el, \${JSON.stringify(value)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()
      \`);
    }

    async function clickSelector(win, selector) {
      return win.webContents.executeJavaScript(\`
        (() => {
          const el = document.querySelector(\${JSON.stringify(selector)});
          if (!el) return false;
          el.click();
          return true;
        })()
      \`);
    }

    async function clickButtonContaining(win, text) {
      return win.webContents.executeJavaScript(\`
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes(\${JSON.stringify(text)}));
          if (!btn) return false;
          btn.click();
          return true;
        })()
      \`);
    }

    async function waitForSelector(win, selector, checkFnJs = 'true', timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const res = await win.webContents.executeJavaScript(\`
          (() => {
            const el = document.querySelector(\${JSON.stringify(selector)});
            if (!el) return null;
            if (!(\${checkFnJs})) return null;
            return (el.innerText || el.value || 'ok');
          })()
        \`);
        if (res !== null) return res;
        await sleep(120);
      }
      throw new Error('Timed out waiting for ' + selector);
    }

    app.whenReady().then(async () => {
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        show: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false },
      });

      try {
        await win.loadURL(BASE_URL);
        await sleep(500);
        await win.webContents.executeJavaScript(\`
          localStorage.clear();
          localStorage.setItem('panorama_token', \${JSON.stringify(TOKEN)});
          localStorage.setItem('panorama_user', \${JSON.stringify(JSON.stringify(USER))});
        \`);

        // 1. Ensure authenticated on Desktop Dashboard (either restored session or Login UI)
        await win.reload();
        await sleep(700);
        const hasAddBtnInitially = await win.webContents.executeJavaScript(
          'Boolean(document.querySelector(\"[data-testid=open-add-train-btn]\"))'
        );
        if (!hasAddBtnInitially) {
          assert.strictEqual(await clickButtonContaining(win, 'Login as Admin'), true, 'Login as Admin button missing');
        }
        await waitForSelector(win, '[data-testid="open-add-train-btn"]', 'true', 10000);
        // Wait for fade-in transition if any
        await sleep(500);
        assert.strictEqual(await clickSelector(win, '[data-testid="open-add-train-btn"]'), true);
        await waitForSelector(win, '[data-testid="add-train-modal"]');

        // 1b. Enter valid train number WITHOUT clicking Verify -> ZERO automatic API requests!
        await win.webContents.executeJavaScript(\`
          window.__lookupCalls = [];
          window.__origFetch = window.fetch;
          window.fetch = (...args) => {
            if (String(args[0]).includes('/trains/lookup/')) {
              window.__lookupCalls.push(String(args[0]));
            }
            return window.__origFetch(...args);
          };
          true;
        \`);
        await setInputValue(win, '[data-testid="train-number-input"]', '15102');
        await sleep(600);
        const autoCallsCount = await win.webContents.executeJavaScript('window.__lookupCalls.length');
        assert.strictEqual(autoCallsCount, 0, 'Typing train number must NEVER trigger automatic API requests');
        const unverifiedConfirmDisabled = await win.webContents.executeJavaScript(
          'document.querySelector(\\'[data-testid="confirm-add-train-btn"]\\').disabled'
        );
        assert.strictEqual(unverifiedConfirmDisabled, true, 'Confirm & Add Train must stay disabled before Verify click');
        console.log('[PASS] No auto-search on typing & Add blocked without verification.');

        // 2. Click Verify for invalid format -> format error without API request
        await setInputValue(win, '[data-testid="train-number-input"]', 'abc');
        assert.strictEqual(await clickSelector(win, '[data-testid="verify-train-btn"]'), true);
        const fmtErr = await waitForSelector(win, '[data-testid="train-lookup-error"]');
        assert(fmtErr.toLowerCase().includes('4- or 5-digit'), 'Expected format error, got: ' + fmtErr);
        assert.strictEqual(await win.webContents.executeJavaScript('window.__lookupCalls.length'), 0);
        console.log('[PASS] Desktop format check on Verify click:', fmtErr);

        // 3. Non-existent train number -> click Verify -> NOT_FOUND popup
        await setInputValue(win, '[data-testid="train-number-input"]', '99998');
        assert.strictEqual(await clickSelector(win, '[data-testid="verify-train-btn"]'), true);
        const notFoundText = await waitForSelector(
          win,
          '[data-testid="train-lookup-error"]',
          'el.innerText.includes("Invalid Train Number")'
        );
        const btnDisabledInvalid = await win.webContents.executeJavaScript(
          'document.querySelector(\\'[data-testid="confirm-add-train-btn"]\\').disabled'
        );
        assert.strictEqual(btnDisabledInvalid, true, 'Confirm must stay disabled for invalid train');
        await saveShot(win, 'add_train_01_invalid_error.png');
        console.log('[PASS] Desktop NOT_FOUND check:', notFoundText);

        // 4. Rapid Verify clicks deduplication + verification (15102 / 12951) -> change invalidation
        await win.webContents.executeJavaScript('window.__lookupCalls = []; true;');
        await setInputValue(win, '[data-testid="train-number-input"]', '12951');
        // Click Verify 3 times rapidly before response resolves
        await win.webContents.executeJavaScript(\`
          const btn = document.querySelector('[data-testid="verify-train-btn"]');
          btn.click();
          btn.click();
          btn.click();
        \`);
        const verified12951 = await waitForSelector(
          win,
          '[data-testid="train-lookup-status"]',
          'el.innerText.includes("Train successfully verified")'
        );
        const rapidCallsCount = await win.webContents.executeJavaScript('window.__lookupCalls.length');
        assert.strictEqual(rapidCallsCount, 1, 'Rapid Verify clicks must issue only 1 API request, got ' + rapidCallsCount);
        const auto12951 = await win.webContents.executeJavaScript(\`(() => ({
          name: document.querySelector('[data-testid="train-name-input"]')?.value,
          src: document.querySelector('[data-testid="train-source-input"]')?.value,
          dst: document.querySelector('[data-testid="train-destination-input"]')?.value,
          reg: document.querySelector('[data-testid="train-region-select"]')?.value,
          zone: document.querySelector('[data-testid="train-zone-input"]')?.value,
          type: document.querySelector('[data-testid="train-type-input"]')?.value,
        }))()\`);
        assert(auto12951.name && auto12951.name.toUpperCase().includes('RAJDHANI'), 'Expected Rajdhani for 12951, got ' + auto12951.name);
        assert.strictEqual(auto12951.reg, 'WEST', 'Expected WEST region for WR');
        await saveShot(win, 'add_train_02_desktop_verified.png');
        console.log('[PASS] Desktop rapid-click dedup & auto-population (12951):', JSON.stringify(auto12951), verified12951);

        // 4b. Changing verified train number must invalidate verification immediately
        await setInputValue(win, '[data-testid="train-number-input"]', '1510');
        await sleep(100);
        const invalidatedState = await win.webContents.executeJavaScript(\`(() => ({
          statusPresent: Boolean(document.querySelector('[data-testid="train-lookup-status"]')),
          nameVal: document.querySelector('[data-testid="train-name-input"]')?.value,
          confirmDisabled: document.querySelector('[data-testid="confirm-add-train-btn"]')?.disabled,
        }))()\`);
        assert.strictEqual(invalidatedState.statusPresent, false, 'Previous verification badge must clear on edit');
        assert.strictEqual(invalidatedState.nameVal, '', 'Previous train name must clear on edit');
        assert.strictEqual(invalidatedState.confirmDisabled, true, 'Confirm button must disable when train number edited');
        console.log('[PASS] Verification invalidated upon editing train number.');

        // 4c. Verify 15120 (Banaras Janta Express) & verify no missing fields fabricated
        await setInputValue(win, '[data-testid="train-number-input"]', '15120');
        assert.strictEqual(await clickSelector(win, '[data-testid="verify-train-btn"]'), true);
        await waitForSelector(
          win,
          '[data-testid="train-lookup-status"]',
          'el.innerText.includes("Train successfully verified")'
        );
        const info15120 = await win.webContents.executeJavaScript(\`(() => ({
          name: document.querySelector('[data-testid="train-name-input"]')?.value,
          src: document.querySelector('[data-testid="train-source-input"]')?.value,
          dst: document.querySelector('[data-testid="train-destination-input"]')?.value,
          reg: document.querySelector('[data-testid="train-region-select"]')?.value,
          type: document.querySelector('[data-testid="train-type-input"]')?.value,
        }))()\`);
        assert(info15120.name && info15120.name.toUpperCase().includes('JANTA'), 'Expected Banaras Janta Express for 15120, got ' + info15120.name);
        assert(info15120.src && info15120.src.includes('DDN'), 'Expected DDN source for 15120, got ' + info15120.src);
        assert(info15120.dst && (info15120.dst.includes('BNRS') || info15120.dst.includes('BSBS')), 'Expected BNRS/BSBS dest for 15120, got ' + info15120.dst);
        assert.strictEqual(info15120.reg, 'NORTH', 'Expected NORTH region for DDN origin');
        console.log('[PASS] Live 15120 verification & auto-population:', JSON.stringify(info15120));

        // 5. Verify & Add clean train 12842 -> verify persistence across reload
        await setInputValue(win, '[data-testid="train-number-input"]', '12842');
        assert.strictEqual(await clickSelector(win, '[data-testid="verify-train-btn"]'), true);
        await waitForSelector(
          win,
          '[data-testid="train-lookup-status"]',
          'el.innerText.includes("Train successfully verified")'
        );
        await waitForSelector(
          win,
          '[data-testid="train-name-input"]',
          'el.value.toUpperCase().includes("COROMANDEL")'
        );
        await clickSelector(win, '[data-testid="confirm-add-train-btn"]');
        for (let i = 0; i < 40; i++) {
          const open = await win.webContents.executeJavaScript('Boolean(document.querySelector(\\'[data-testid="add-train-modal"]\\'))');
          if (!open) break;
          await sleep(120);
        }
        await sleep(500);
        await win.reload();
        await waitForSelector(win, '[data-testid="open-add-train-btn"]', 'true', 10000);
        const persistedInApi = await win.webContents.executeJavaScript(\`
          fetch(window.location.origin + '/api/v1/trains', {
            headers: { Authorization: 'Bearer ' + localStorage.getItem('panorama_token') }
          }).then(r => r.json())
        \`);
        assert(persistedInApi.some(t => t.train_number === '12842'), 'Train 12842 missing from DB after reload!');
        await saveShot(win, 'add_train_03_desktop_added.png');
        console.log('[PASS] Train 12842 persisted in DB & survived page reload.');

        // 6. Duplicate entry protection
        await clickSelector(win, '[data-testid="open-add-train-btn"]');
        await waitForSelector(win, '[data-testid="add-train-modal"]');
        await setInputValue(win, '[data-testid="train-number-input"]', '12842');
        assert.strictEqual(await clickSelector(win, '[data-testid="verify-train-btn"]'), true);
        const dupMsg = await waitForSelector(
          win,
          '[data-testid="train-lookup-status"]',
          'el.innerText.includes("already registered")'
        );
        const dupDisabled = await win.webContents.executeJavaScript(
          'document.querySelector(\\'[data-testid="confirm-add-train-btn"]\\').disabled'
        );
        assert.strictEqual(dupDisabled, true, 'Duplicate submit should be blocked');
        await saveShot(win, 'add_train_04_duplicate_blocked.png');
        console.log('[PASS] Duplicate detection:', dupMsg);

        // 7. API Unavailable error differentiation (offline/503 simulation) & Network Timeout differentiation
        await win.webContents.executeJavaScript(\`
          window.__origFetch = window.__origFetch || window.fetch;
          window.fetch = (...args) => {
            if (String(args[0]).includes('/trains/lookup/')) {
              return Promise.resolve(new Response('Service Unavailable', { status: 503 }));
            }
            return window.__origFetch(...args);
          };
          true;
        \`);
        await setInputValue(win, '[data-testid="train-number-input"]', '12004');
        assert.strictEqual(await clickSelector(win, '[data-testid="verify-train-btn"]'), true);
        const offlineMsg = await waitForSelector(
          win,
          '[data-testid="train-lookup-error"]',
          'el.getAttribute("data-error-code") === "SERVER_UNAVAILABLE"'
        );
        console.log('[PASS] API Unavailable distinction:', offlineMsg);

        await win.webContents.executeJavaScript(\`
          window.fetch = (...args) => {
            if (String(args[0]).includes('/trains/lookup/')) {
              const e = new Error('Network timed out');
              e.name = 'AbortError';
              return Promise.reject(e);
            }
            return window.__origFetch(...args);
          };
          true;
        \`);
        await setInputValue(win, '[data-testid="train-number-input"]', '12005');
        assert.strictEqual(await clickSelector(win, '[data-testid="verify-train-btn"]'), true);
        const timeoutMsg = await waitForSelector(
          win,
          '[data-testid="train-lookup-error"]',
          'el.getAttribute("data-error-code") === "TIMEOUT"'
        );
        console.log('[PASS] Network Timeout distinction:', timeoutMsg);

        await win.webContents.executeJavaScript('if (window.__origFetch) { window.fetch = window.__origFetch; } true;');
        await clickSelector(win, '[data-testid="close-add-train-btn"]');

        // 8. Mobile viewport (390x844) on Dashboard/Train Management -> shared AddTrainModal
        win.setSize(390, 844);
        win.setContentSize(390, 844);
        await sleep(500);
        // Open Train Management via nav or Add Train directly from mobile header/dashboard
        const switchedToTrains = await clickButtonContaining(win, 'Train Management');
        if (switchedToTrains) await sleep(500);
        assert.strictEqual(await clickButtonContaining(win, 'Add Train'), true, 'Mobile Add Train button not found');
        await waitForSelector(win, '[data-testid="add-train-modal"]');
        await setInputValue(win, '[data-testid="train-number-input"]', '12621');
        assert.strictEqual(await clickSelector(win, '[data-testid="verify-train-btn"]'), true);
        await waitForSelector(
          win,
          '[data-testid="train-lookup-status"]',
          'el.innerText.includes("Train successfully verified")'
        );
        await waitForSelector(
          win,
          '[data-testid="train-name-input"]',
          'el.value.toUpperCase().includes("TAMIL")'
        );
        const mobileOverflow = await win.webContents.executeJavaScript(\`
          (() => {
            const modal = document.querySelector('[data-testid="add-train-modal"] > div');
            const rect = modal.getBoundingClientRect();
            return {
              scrollWidth: modal.scrollWidth,
              clientWidth: modal.clientWidth,
              rightEdge: rect.right,
              viewportWidth: window.innerWidth,
            };
          })()
        \`);
        assert(mobileOverflow.scrollWidth <= mobileOverflow.clientWidth + 2, 'Mobile modal horizontal overflow: ' + JSON.stringify(mobileOverflow));
        assert(mobileOverflow.rightEdge <= mobileOverflow.viewportWidth + 1, 'Mobile modal clipped horizontally');
        await saveShot(win, 'add_train_05_mobile_verified.png');
        console.log('[PASS] Mobile 390x844 layout & auto-fill:', JSON.stringify(mobileOverflow));

        app.exit(0);
      } catch (err) {
        console.error('[ADD TRAIN E2E FAILED]', err);
        try { await saveShot(win, 'add_train_99_error.png'); } catch {}
        app.exit(1);
      }
    });
  `;
}

async function main() {
  console.log('[1] Starting live FastAPI uvicorn server on port', API_PORT);
  const backendProc = cp.spawn(
    PYTHON_EXE,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(API_PORT), '--log-level', 'warning'],
    { cwd: BACKEND_DIR, stdio: ['ignore', 'ignore', 'pipe'] }
  );
  backendProc.stderr.on('data', (d) => {
    const s = d.toString();
    if (/ERROR|CRITICAL|Traceback/i.test(s)) process.stderr.write('[UVICORN] ' + s);
  });

  let tmpScript = null;
  try {
    await waitForBackend();
    console.log('[2] Backend healthy. Logging in as @admin...');
    const loginRes = await httpJson('POST', '/api/v1/auth/login', {
      username: '@admin',
      password: 'Admin@123',
    });
    assert.strictEqual(loginRes.status, 200, 'Admin login failed');
    const token = loginRes.data.access_token;
    const user = loginRes.data.user;

    // Clean any leftover test trains
    await httpJson('DELETE', '/api/v1/trains/12842', null, token);
    await httpJson('DELETE', '/api/v1/trains/12621', null, token);

    // Benchmark Cold/Refresh vs Cached lookup latency cleanly
    const cold = await httpJson('GET', '/api/v1/trains/lookup/12301?refresh=true', null, token);
    const warm = await httpJson('GET', '/api/v1/trains/lookup/12301', null, token);
    console.log('[BENCHMARK] 12301 Refresh (Live Provider):', JSON.stringify(cold.data));
    console.log('[BENCHMARK] 12301 Cached Lookup:', JSON.stringify({
      status: warm.data.status,
      provider: warm.data.provider,
      cached: warm.data.cached,
      latency_ms: warm.data.latency_ms,
    }));

    // Run Electron E2E verification
    tmpScript = path.resolve(__dirname, '_tmp_add_train_e2e.cjs');
    fs.writeFileSync(tmpScript, buildElectronScript(token, user), 'utf8');

    const spawnEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
    delete spawnEnv.ELECTRON_RUN_AS_NODE;
    const exitCode = await new Promise((resolve) => {
      const child = cp.spawn(electronPath, [tmpScript], { stdio: 'inherit', env: spawnEnv });
      child.on('exit', resolve);
    });

    // Cleanup test train 12842
    await httpJson('DELETE', '/api/v1/trains/12842', null, token);
    await httpJson('DELETE', '/api/v1/trains/12621', null, token);

    if (exitCode !== 0) {
      process.exitCode = exitCode || 1;
    } else {
      console.log('\n[ADD TRAIN E2E ALL TESTS PASSED!]\n');
    }
  } finally {
    if (tmpScript) {
      try { fs.unlinkSync(tmpScript); } catch {}
    }
    try {
      if (process.platform === 'win32' && backendProc.pid) {
        cp.execFileSync('taskkill', ['/PID', String(backendProc.pid), '/F', '/T'], { stdio: 'ignore' });
      } else {
        backendProc.kill('SIGTERM');
      }
    } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
