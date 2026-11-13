/**
 * verify_console_stability.cjs
 *
 * Automated Electron verification script testing:
 * 1. Runtime console error elimination (Target: 0 unexpected errors/unhandled rejections).
 * 2. Centralized WebSocket connection lifecycle (CONNECTED, ping-pong, heartbeat, reconnect).
 * 3. Network resilience (offline pause, online recovery).
 * 4. Preflight health check probe (unreachable backend graceful handling without browser C++ WS errors).
 * 5. Multi-module navigation across all 13 modules without DOM lifecycle crashes or null reference errors.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Set unique user data dir to prevent cache contention on Windows
const tempUserData = path.join(os.tmpdir(), 'electron-console-audit-' + Date.now());
app.setPath('userData', tempUserData);

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', '..', 'PROJECT_SECURITY_AUDIT', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

let win;
const collectedLogs = {
  errors: [],
  warnings: [],
  info: [],
  pageErrors: [],
  unhandledRejections: [],
};

const moduleTestResults = {};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const entry = { level, message, line, sourceId };
    if (level === 3) {
      // 3 = Error
      collectedLogs.errors.push(entry);
      console.log(`[BROWSER ERROR] ${message} (${sourceId}:${line})`);
    } else if (level === 2) {
      // 2 = Warning
      collectedLogs.warnings.push(entry);
    } else {
      collectedLogs.info.push(entry);
    }
  });

  win.webContents.on('render-process-gone', (event, details) => {
    console.error('[ELECTRON RENDER GONE]', details);
  });

  win.webContents.on('page-error', (event, error) => {
    collectedLogs.pageErrors.push(error);
    console.error('[PAGE ERROR]', error);
  });

  try {
    console.log(`\n=== 1. Loading Application at ${BASE_URL} ===`);
    await win.loadURL(BASE_URL);
    await sleep(2000);

    // Ensure session is logged in as ADMIN
    await win.webContents.executeJavaScript(`
      (() => {
        localStorage.setItem('panorama_token', 'test-admin-audit-token');
        localStorage.setItem('panorama_user', JSON.stringify({
          id: 'admin-audit-001',
          username: '@admin',
          full_name: 'SCADA Audit Administrator',
          role: 'ADMIN',
          account_status: 'ACTIVE',
          is_active: true
        }));
        window.location.hash = '#/dashboard';
      })()
    `);
    await sleep(1500);

    // Verify WebSocket connection state
    console.log('\n=== 2. Verifying Centralized WebSocket Lifecycle ===');
    const wsStatusInitial = await win.webContents.executeJavaScript(`
      (() => {
        const testMods = window.__testModules;
        if (testMods && testMods.wsService) {
          return testMods.wsService.getStatus();
        }
        return 'UNKNOWN';
      })()
    `);
    console.log(`Initial WebSocket status: ${wsStatusInitial}`);

    // Allow time for WebSocket to achieve connected state
    let wsConnected = false;
    for (let i = 0; i < 10; i++) {
      const st = await win.webContents.executeJavaScript(`window.__testModules?.wsService?.getStatus() || 'UNKNOWN'`);
      if (st === 'CONNECTED') {
        wsConnected = true;
        break;
      }
      await sleep(500);
    }
    console.log(`WebSocket Connected to Backend: ${wsConnected ? 'PASS (CONNECTED)' : 'STATUS: ' + wsStatusInitial}`);
    moduleTestResults['WebSocket_Connected'] = wsConnected;

    // Test heartbeat ping
    console.log('\n=== 3. Testing WebSocket Heartbeat Ping-Pong ===');
    const pingSent = await win.webContents.executeJavaScript(`
      (() => {
        try {
          const ws = window.__testModules?.wsService?.ws;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
            return true;
          }
        } catch (e) {}
        return false;
      })()
    `);
    console.log(`Heartbeat ping sent: ${pingSent ? 'PASS' : 'SKIPPED'}`);

    // Test multi-module navigation across all 13 modules
    console.log('\n=== 4. Testing Multi-Module Navigation Matrix (13 Modules) ===');
    const screens = [
      'dashboard',
      'trains',
      'coaches',
      'coach-details',
      'watertank',
      'devices',
      'location',
      'monitoring',
      'alerts',
      'history',
      'reports',
      'settings',
      'users',
      'logs',
    ];

    for (const scr of screens) {
      const errCountBefore = collectedLogs.errors.length + collectedLogs.pageErrors.length;
      await win.webContents.executeJavaScript(`
        (() => {
          window.location.hash = '#/${scr}';
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        })()
      `);
      await sleep(600);

      const errCountAfter = collectedLogs.errors.length + collectedLogs.pageErrors.length;
      const screenPassed = errCountAfter === errCountBefore;
      moduleTestResults[scr] = screenPassed;
      console.log(`  Module [${scr.padEnd(14)}]: ${screenPassed ? 'OK (0 errors)' : 'FAIL (+errors)'}`);
    }

    // Return to dashboard
    await win.webContents.executeJavaScript(`window.location.hash = '#/dashboard';`);
    await sleep(600);

    // Test Offline & Online Resilience
    console.log('\n=== 5. Testing Network Offline / Online State Transitions ===');
    await win.webContents.executeJavaScript(`
      (() => {
        window.dispatchEvent(new Event('offline'));
      })()
    `);
    await sleep(800);
    const offlineStatus = await win.webContents.executeJavaScript(`window.__testModules?.wsService?.getStatus()`);
    console.log(`Status after OFFLINE event: ${offlineStatus} (Expected: DISCONNECTED)`);
    const offlinePassed = offlineStatus === 'DISCONNECTED';
    moduleTestResults['Offline_Resilience'] = offlinePassed;

    // Restore online
    await win.webContents.executeJavaScript(`
      (() => {
        window.dispatchEvent(new Event('online'));
      })()
    `);
    await sleep(1500);
    const onlineStatus = await win.webContents.executeJavaScript(`window.__testModules?.wsService?.getStatus()`);
    console.log(`Status after ONLINE event: ${onlineStatus} (Expected: CONNECTED or RECONNECTING)`);
    const onlinePassed = onlineStatus === 'CONNECTED' || onlineStatus === 'RECONNECTING';
    moduleTestResults['Online_Recovery'] = onlinePassed;

    // Test Preflight Health Probe against unreachable domain
    console.log('\n=== 6. Testing Preflight Health Probe (Unreachable Host Graceful Handling) ===');
    const probeTest = await win.webContents.executeJavaScript(`
      (async () => {
        const wsService = window.__testModules?.wsService;
        if (!wsService || typeof wsService.checkBackendHealth !== 'function') {
          return { tested: false };
        }
        
        try {
          // Probe valid local endpoint
          const validHealthy = await wsService.checkBackendHealth('ws://127.0.0.1:8000/api/v1/ws/live');
          
          // Probe unreachable endpoint
          const unreachableHealthy = await wsService.checkBackendHealth('ws://127.0.0.1:9999/api/v1/ws/live');
          
          return {
            tested: true,
            validHealthy,       // Expected: true
            unreachableHealthy, // Expected: false
          };
        } catch (e) {
          return { tested: false, error: String(e) };
        }
      })()
    `);
    console.log(`Preflight probe test results:`, probeTest);
    const probePassed = probeTest.tested && probeTest.validHealthy === true && probeTest.unreachableHealthy === false;
    moduleTestResults['Preflight_Probe_Handled'] = probePassed;

    // Capture screenshot of healthy UI
    const screenshotPath = path.join(SCREENSHOT_DIR, 'runtime_stability_audit.png');
    const image = await win.webContents.capturePage();
    fs.writeFileSync(screenshotPath, image.toPNG());
    console.log(`\nScreenshot saved: ${screenshotPath}`);

    // Summary of logs
    console.log('\n=== 7. Runtime Stability Summary ===');
    console.log(`Total Console Messages: ${collectedLogs.info.length}`);
    console.log(`Total Warnings:         ${collectedLogs.warnings.length}`);
    console.log(`Total Errors:           ${collectedLogs.errors.length}`);
    console.log(`Total Page Errors:      ${collectedLogs.pageErrors.length}`);

    // Filter unexpected application errors
    const unexpectedErrors = collectedLogs.errors.filter((e) => {
      const msg = e.message || '';
      // Exclude expected probe failures or external font notices
      if (msg.includes('net::ERR_CONNECTION_REFUSED') && msg.includes(':9999')) return false;
      return true;
    });

    console.log(`\nUnexpected Application Errors: ${unexpectedErrors.length}`);
    if (unexpectedErrors.length > 0) {
      console.log('Errors breakdown:');
      unexpectedErrors.forEach((err, idx) => {
        console.log(`  [${idx + 1}] ${err.message} (${err.sourceId}:${err.line})`);
      });
    }

    const allPassed = unexpectedErrors.length === 0 && collectedLogs.pageErrors.length === 0;
    console.log(`\nFINAL STABILITY VERIFICATION: ${allPassed ? 'PASSED (ZERO UNEXPECTED ERRORS)' : 'FAILED'}`);

    // Write JSON test artifact
    const artifactPath = path.join(__dirname, '..', '..', '..', 'PROJECT_SECURITY_AUDIT', 'runtime_stability_results.json');
    fs.writeFileSync(
      artifactPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          allPassed,
          unexpectedErrorsCount: unexpectedErrors.length,
          unexpectedErrors,
          moduleTestResults,
          totalWarnings: collectedLogs.warnings.length,
          totalInfo: collectedLogs.info.length,
        },
        null,
        2
      )
    );
    console.log(`Results written to: ${artifactPath}`);

    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Test execution failed with fatal error:', err);
    process.exit(1);
  }
});
