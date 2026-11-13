// apps/mobile/scripts/verify_alert_lifecycle_e2e.cjs
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');
const electronPath = require('electron');

const API_PORT = 8029;
const BASE_URL = `http://127.0.0.1:${API_PORT}`;
const BACKEND_DIR = path.resolve(__dirname, '../../../backend');
const SCREENSHOT_DIR = 'C:\\Users\\soumi\\.gemini\\antigravity\\brain\\02d4ebd6-2deb-462f-b938-3b5741021d98\\screenshots';
const TMP_DB_PATH = path.join(os.tmpdir(), `panorama_alert_lifecycle_${process.pid}.db`);

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function resolvePython() {
  const candidates = [
    path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe'),
    path.join(BACKEND_DIR, 'venv', 'Scripts', 'python.exe'),
    'C:\\Users\\soumi\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
    'python.exe',
    'python',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const out = cp.execFileSync(c, ['-c', 'import fastapi; print("ok")'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (out.trim() === 'ok') return c;
      } catch {}
    }
  }
  return 'python';
}
const PYTHON_EXE = resolvePython();

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

async function run() {
  try {
    fs.unlinkSync(TMP_DB_PATH);
  } catch {}
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

    // Clean start: ensure no pre-existing trains in DB
    const existingRes = await httpJson('GET', '/api/v1/trains', null, token);
    if (Array.isArray(existingRes.data)) {
      for (const t of existingRes.data) {
        await httpJson('DELETE', `/api/v1/trains/${t.train_number}`, null, token);
      }
    }

    const runnerFile = path.join(__dirname, 'alert_lifecycle_electron_runner.cjs');

    const spawnEnv = {
      ...process.env,
      TEST_BASE_URL: BASE_URL,
      TEST_SCREENSHOT_DIR: SCREENSHOT_DIR,
      TEST_TOKEN: token,
      TEST_USER_JSON: JSON.stringify(user),
    };
    delete spawnEnv.ELECTRON_RUN_AS_NODE;

    console.log('[E2E] Launching Electron Alert Lifecycle verification suite...');
    const exitCode = await new Promise((resolve) => {
      const child = cp.spawn(electronPath, [runnerFile], { stdio: 'inherit', env: spawnEnv });
      child.on('exit', resolve);
    });
    assert.strictEqual(exitCode, 0, 'Electron alert lifecycle E2E verification failed');
  } finally {
    try {
      if (process.platform === 'win32' && backendProc.pid) {
        cp.execFileSync('taskkill', ['/PID', String(backendProc.pid), '/F', '/T'], { stdio: 'ignore' });
      } else {
        backendProc.kill('SIGTERM');
      }
    } catch {}
    try {
      fs.unlinkSync(TMP_DB_PATH);
    } catch {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
