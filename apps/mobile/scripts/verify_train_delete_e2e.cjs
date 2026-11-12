// apps/mobile/scripts/verify_train_delete_e2e.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');
const electronPath = require('electron');

const API_PORT = 8016;
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

    async function waitForSelector(win, jsExpr, timeoutMs = 10000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const found = await win.webContents.executeJavaScript(jsExpr);
        if (found) return found;
        await sleep(150);
      }
      throw new Error('Timeout waiting for: ' + jsExpr);
    }

    async function openTrainManagementAndEast(win) {
      await waitForSelector(win, "Array.from(document.querySelectorAll('div,span,button')).some(el => (el.textContent || '').trim() === 'Train Management')");
      await win.webContents.executeJavaScript(\`(() => {
        const target = Array.from(document.querySelectorAll('div,span,button')).find(el => (el.textContent || '').trim() === 'Train Management');
        if (target) target.click();
      })()\`);
      await waitForSelector(win, "document.body.innerText.includes('Eastern Railway (ER)')");
      await win.webContents.executeJavaScript(\`(() => {
        const cards = Array.from(document.querySelectorAll('div')).filter(el => (el.textContent || '').includes('Eastern Railway (ER)') && (el.textContent || '').includes('View Trains in Region'));
        const card = cards[cards.length - 1];
        if (card) {
          const btn = Array.from(card.querySelectorAll('button,div')).find(b => (b.textContent || '').includes('View Trains in Region')) || card;
          btn.click();
        }
      })()\`);
      await waitForSelector(win, "document.body.innerText.includes('Configured Trains') || document.querySelector('[data-testid^=\\"delete-train-\\"]') !== null");
    }

    app.whenReady().then(async () => {
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      try {
        await win.loadURL(BASE_URL);
        await win.webContents.executeJavaScript(\`(() => {
          localStorage.setItem('panorama_token', \${JSON.stringify(TOKEN)});
          localStorage.setItem('panorama_demo_user', \${JSON.stringify(JSON.stringify(USER))});
        })()\`);
        await win.reload();

        // DESKTOP TEST (1280x800): Verify Train 98401 visible -> open modal -> cancel -> delete -> persist reload
        await openTrainManagementAndEast(win);
        await waitForSelector(win, "document.querySelector('[data-testid=\\"delete-train-98401\\"]') !== null");
        await saveShot(win, 'del_01_desktop_before.png');

        await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-98401"]').click()\`);
        await waitForSelector(win, "document.querySelector('[data-testid=\\"delete-train-modal\\"]') !== null");
        await saveShot(win, 'del_02_desktop_confirm_modal.png');

        // Cancel must keep train intact
        await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="cancel-delete-train"]').click()\`);
        await sleep(250);
        const stillThereAfterCancel = await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-98401"]') !== null\`);
        assert.strictEqual(stillThereAfterCancel, true, 'Cancel must leave train 98401 intact');

        // Confirm real DELETE API call
        await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-98401"]').click()\`);
        await waitForSelector(win, "document.querySelector('[data-testid=\\"confirm-delete-train\\"]') !== null");
        await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="confirm-delete-train"]').click()\`);

        await waitForSelector(win, "document.querySelector('[data-testid=\\"train-action-success\\"]') !== null");
        const removedFromDom = await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-98401"]') === null\`);
        assert.strictEqual(removedFromDom, true, 'Deleted train 98401 must be removed from DOM');
        await saveShot(win, 'del_03_desktop_after_delete.png');

        // Reload and verify deletion persisted in SQLite DB
        await win.reload();
        await openTrainManagementAndEast(win);
        await sleep(300);
        const persistedRemoved = await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-98401"]') === null\`);
        assert.strictEqual(persistedRemoved, true, 'Train 98401 must remain deleted after full reload');

        // MOBILE TEST (390x844): Verify clean error display when deleting missing/stale train + real delete success
        win.setSize(390, 844);
        await sleep(350);
        await waitForSelector(win, "document.querySelector('[data-testid=\\"delete-train-98402\\"]') !== null");

        // Remove 98402 server-side to force a real 404 TRAIN_NOT_FOUND when UI confirms delete
        const preDelRes = await win.webContents.executeJavaScript(\`fetch('\${BASE_URL}/api/v1/trains/98402', { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('panorama_token') } }).then(r => r.status)\`);
        assert.strictEqual(preDelRes, 200);

        await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-98402"]').click()\`);
        await waitForSelector(win, "document.querySelector('[data-testid=\\"confirm-delete-train\\"]') !== null");
        await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="confirm-delete-train"]').click()\`);
        await waitForSelector(win, "document.querySelector('[data-testid=\\"train-action-error\\"]') !== null");
        const errText = await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="train-action-error"]').innerText\`);
        assert(errText.includes('98402') || errText.includes('not found'), 'Expected clear error message, got: ' + errText);
        // Train card still intact in stale DOM before manual refresh
        const cardStillIntactOnError = await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-98402"]') !== null\`);
        assert.strictEqual(cardStillIntactOnError, true, 'Failed delete must not silently pretend removal before refresh');
        await saveShot(win, 'del_04_mobile_error_handled.png');

        // Also test real mobile success delete on 98403 (click Eastern Railway again if needed or stay in region list)
        await waitForSelector(win, "document.querySelector('[data-testid=\\"delete-train-98403\\"]') !== null");
        await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-98403"]').click()\`);
        await waitForSelector(win, "document.querySelector('[data-testid=\\"confirm-delete-train\\"]') !== null");
        await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="confirm-delete-train"]').click()\`);
        await waitForSelector(win, "document.querySelector('[data-testid=\\"train-action-success\\"]') !== null");
        const mobileRemoved = await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="delete-train-98403"]') === null\`);
        assert.strictEqual(mobileRemoved, true, 'Mobile delete must remove train 98403');
        await saveShot(win, 'del_05_mobile_deleted.png');

        console.log('ALL TRAIN DELETE E2E CHECKS PASSED');
        app.exit(0);
      } catch (err) {
        console.error('E2E FAILURE:', err);
        try { await saveShot(win, 'del_99_error.png'); } catch {}
        app.exit(1);
      }
    });
  `;
}

async function run() {
  console.log('[E2E] Starting FastAPI backend on port', API_PORT);
  const backendProc = cp.spawn(
    PYTHON_EXE,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(API_PORT), '--log-level', 'warning'],
    { cwd: BACKEND_DIR, stdio: ['ignore', 'ignore', 'pipe'] }
  );
  backendProc.stderr.on('data', (d) => {
    const s = d.toString();
    if (/ERROR|CRITICAL|Traceback/i.test(s)) process.stderr.write('[UVICORN] ' + s);
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

    // Seed clean test trains 98401, 98402, 98403
    for (const tno of ['98401', '98402', '98403']) {
      await httpJson('DELETE', `/api/v1/trains/${tno}`, null, token);
      const createRes = await httpJson(
        'POST',
        '/api/v1/trains',
        {
          train_number: tno,
          name: `E2E Delete Test ${tno}`,
          region: 'EAST',
          coach_number: 'A1',
        },
        token
      );
      assert.strictEqual(createRes.status, 201, `Failed to seed train ${tno}`);
    }

    electronEntryFile = path.join(SCREENSHOT_DIR, '_verify_train_delete_runner.cjs');
    fs.writeFileSync(electronEntryFile, buildElectronScript(token, user), 'utf8');

    const spawnEnv = { ...process.env };
    delete spawnEnv.ELECTRON_RUN_AS_NODE;
    const exitCode = await new Promise((resolve) => {
      const child = cp.spawn(electronPath, [electronEntryFile], { stdio: 'inherit', env: spawnEnv });
      child.on('exit', resolve);
    });
    assert.strictEqual(exitCode, 0, 'Electron E2E verification failed');
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
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
