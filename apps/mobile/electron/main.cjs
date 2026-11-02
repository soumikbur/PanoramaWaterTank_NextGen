/**
 * Electron Main Process for Panorama Water Tank Monitor (Railway SCADA/HMI).
 * Manages native window lifecycle, automated Python backend daemon supervision,
 * health-check polling, and secure inter-process communication.
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execSync } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let backendHealthy = false;
let backendPort = 8000;
let logStream = null;

// Enforce single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Setup log directory in User AppData
function getLogPath() {
  const userData = app.getPath('userData');
  const logDir = path.join(userData, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return path.join(logDir, 'backend.log');
}

function getBackendExecutable() {
  // 1. Packaged resource directory
  if (app.isPackaged) {
    const packagedExe = path.join(process.resourcesPath, 'backend', 'panorama-backend.exe');
    if (fs.existsSync(packagedExe)) return { type: 'exe', path: packagedExe };
  }

  // 2. Local PyInstaller build
  const localDistExe = path.resolve(__dirname, '..', '..', '..', 'backend', 'dist', 'panorama-backend', 'panorama-backend.exe');
  if (fs.existsSync(localDistExe)) {
    return { type: 'exe', path: localDistExe };
  }

  // 3. Fallback to venv Python
  const venvPython = path.resolve(__dirname, '..', '..', '..', 'backend', 'venv', 'Scripts', 'python.exe');
  const runnerScript = path.resolve(__dirname, '..', '..', '..', 'backend', 'run_server.py');
  if (fs.existsSync(venvPython) && fs.existsSync(runnerScript)) {
    return { type: 'python', python: venvPython, script: runnerScript };
  }

  return null;
}

function startBackend() {
  const target = getBackendExecutable();
  const logFile = getLogPath();
  logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const logMsg = `\n--- Panorama Backend Launch: ${new Date().toISOString()} ---\n`;
  logStream.write(logMsg);

  if (!target) {
    const err = 'No backend executable or Python runtime found.';
    logStream.write(`[ERROR] ${err}\n`);
    console.error(err);
    return;
  }

  const env = {
    ...process.env,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    PYTHONUNBUFFERED: '1',
  };

  try {
    if (target.type === 'exe') {
      logStream.write(`[INFO] Spawning packaged backend binary: ${target.path}\n`);
      const backendCwd = path.dirname(target.path);
      backendProcess = spawn(target.path, [], {
        cwd: backendCwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } else {
      logStream.write(`[INFO] Spawning python runner: ${target.python} ${target.script}\n`);
      const backendCwd = path.dirname(target.script);
      backendProcess = spawn(target.python, [target.script], {
        cwd: backendCwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    }

    backendProcess.stdout.on('data', (chunk) => {
      if (logStream) logStream.write(chunk);
    });

    backendProcess.stderr.on('data', (chunk) => {
      if (logStream) logStream.write(chunk);
    });

    backendProcess.on('exit', (code, signal) => {
      backendHealthy = false;
      const exitMsg = `[INFO] Backend process exited with code ${code}, signal ${signal}\n`;
      if (logStream) logStream.write(exitMsg);
      console.log(exitMsg);
    });

    backendProcess.on('error', (err) => {
      backendHealthy = false;
      const errMsg = `[ERROR] Failed to start backend process: ${err.message}\n`;
      if (logStream) logStream.write(errMsg);
      console.error(errMsg);
    });
  } catch (e) {
    logStream.write(`[EXCEPTION] ${e.message}\n`);
  }
}

function stopBackend() {
  if (backendProcess && backendProcess.pid) {
    try {
      if (process.platform === 'win32') {
        // Kill the full process tree forcefully on Windows
        execSync(`taskkill /pid ${backendProcess.pid} /T /F`, { stdio: 'ignore' });
      } else {
        backendProcess.kill('SIGKILL');
      }
    } catch (e) {
      // Ignore if already terminated
    }
    backendProcess = null;
    backendHealthy = false;
  }
}

function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${backendPort}/api/v1/health`, (res) => {
      if (res.statusCode === 200) {
        backendHealthy = true;
        resolve(true);
      } else {
        resolve(false);
      }
    });

    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(maxAttempts = 35) {
  for (let i = 0; i < maxAttempts; i++) {
    const isUp = await checkBackendHealth();
    if (isUp) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function createMainWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Panorama Water Tank Monitor — Railway SCADA/HMI',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#F5F7FB',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Strip standard menu bar for sleek industrial look
  mainWindow.setMenuBarVisibility(false);

  // Security: Prevent external navigation inside the main window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsed = new URL(navigationUrl);
    if (parsed.protocol !== 'file:' && !parsed.href.startsWith('http://127.0.0.1')) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  // Load production bundle
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('backend:status', () => ({
  healthy: backendHealthy,
  port: backendPort,
  pid: backendProcess ? backendProcess.pid : null,
}));
ipcMain.handle('shell:openExternal', (event, url) => shell.openExternal(url));
ipcMain.handle('backend:restart', async () => {
  stopBackend();
  startBackend();
  return await waitForBackend();
});

// App Lifecycle
app.whenReady().then(async () => {
  console.log('[MAIN] Starting Panorama Water Tank Desktop application...');
  startBackend();

  // Wait for backend to be ready, then open the native window
  await waitForBackend();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  stopBackend();
  if (logStream) logStream.end();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

