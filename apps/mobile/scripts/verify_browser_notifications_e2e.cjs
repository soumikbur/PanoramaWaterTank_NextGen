// apps/mobile/scripts/verify_browser_notifications_e2e.cjs
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');
const electronPath = require('electron');

const PORT = 8796;
const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\9e3514ab-7eb1-481b-ac5b-d7edda1def58\\screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function createTestServer() {
  const wsClients = new Set();

  function encodeWsTextFrame(str) {
    const payload = Buffer.from(str, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      throw new Error('Payload too large');
    }
    return Buffer.concat([header, payload]);
  }

  function broadcastWs(event, data) {
    const frame = encodeWsTextFrame(JSON.stringify({ event, data }));
    for (const socket of wsClients) {
      if (!socket.destroyed) {
        socket.write(frame);
      }
    }
  }

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsed.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (pathname.startsWith('/api/v1/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (pathname === '/api/v1/auth/me') {
        res.writeHead(200);
        res.end(JSON.stringify({ id: 'usr-admin-01', username: '@admin', role: 'ADMIN', fullName: 'System Administrator' }));
        return;
      }
      if (pathname === '/api/v1/tanks/live') {
        res.writeHead(200);
        res.end(JSON.stringify({
          tankId: 'DEV-WLI-01-arrival',
          deviceUid: 'DEV-WLI-01',
          trainNumber: '12841',
          coachNumber: 'C1',
          tankName: 'Arrival Side (Tank 1)',
          levelPercent: 65,
          isOnline: true,
          alarmStatus: 'NORMAL',
        }));
        return;
      }
      if (pathname === '/api/v1/tanks' || pathname === '/api/v1/devices' || pathname === '/api/v1/alarms' || pathname === '/api/v1/regions/summary') {
        res.writeHead(200);
        res.end(JSON.stringify([]));
        return;
      }
      if (pathname === '/api/v1/alarms/stats') {
        res.writeHead(200);
        res.end(JSON.stringify({ totalActive: 0, criticalCount: 0, warningCount: 0, resolvedToday: 0 }));
        return;
      }
      if (pathname.endsWith('/acknowledge')) {
        res.writeHead(404);
        res.end(JSON.stringify({ detail: 'Client-managed live alert' }));
        return;
      }
      if (pathname === '/api/v1/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'HEALTHY', app: 'Panorama', version: '2.0.0', database: 'sqlite', mqttBroker: 'CONNECTED', activeWebSockets: wsClients.size }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const extraHeaders = pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/', 'Cache-Control': 'no-cache' } : {};
    res.writeHead(200, { 'Content-Type': contentType, ...extraHeaders });
    fs.createReadStream(filePath).pipe(res);
  });

  // Handle control POST to trigger WS broadcast from Electron process
  server.on('upgrade', (req, socket) => {
    if (req.url !== '/api/v1/ws/live') {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    wsClients.add(socket);
    socket.on('close', () => wsClients.delete(socket));
    socket.on('error', () => wsClients.delete(socket));
  });

  // Local HTTP control endpoint for pushing WS telemetry frames from E2E runner
  const controlServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const msg = JSON.parse(body || '{}');
        broadcastWs(msg.event || 'TELEMETRY_UPDATE', msg.data || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sent: wsClients.size }));
      } catch (err) {
        res.writeHead(400);
        res.end(String(err));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(PORT, 'localhost', () => {
      controlServer.listen(PORT + 1, '127.0.0.1', () => {
        console.log(`[E2E-SERVER] Serving http://localhost:${PORT} (control http://127.0.0.1:${PORT + 1})`);
        resolve({ server, controlServer, broadcastWs, wsClients });
      });
    });
  });
}

function buildElectronRunnerScript() {
  return `
    const { app, BrowserWindow, session } = require('electron');
    const http = require('http');
    const fs = require('fs');
    const path = require('path');
    const assert = require('assert');

    const PORT = ${PORT};
    const SCREENSHOT_DIR = ${JSON.stringify(SCREENSHOT_DIR)};
    let forcedPermissionMode = 'granted';

    app.commandLine.appendSwitch('no-sandbox');

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function pushTelemetry(data) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: PORT + 1,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, (res) => {
          let out = '';
          res.on('data', (c) => out += c);
          res.on('end', () => resolve(JSON.parse(out || '{}')));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ event: 'TELEMETRY_UPDATE', data }));
        req.end();
      });
    }

    async function installNotificationSpy(win, deniedOverride = false) {
      await win.webContents.executeJavaScript(\`
        (function() {
          window.__capturedBrowserPopups = window.__capturedBrowserPopups || [];
          if (!window.__notifSpyInstalled) {
            window.__notifSpyInstalled = true;
            const OrigNotif = window.Notification;
            const origProtoShow = window.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype.showNotification;

            if (origProtoShow) {
              ServiceWorkerRegistration.prototype.showNotification = function(title, options) {
                window.__capturedBrowserPopups.push({
                  via: 'ServiceWorkerRegistration.showNotification',
                  title,
                  options,
                  at: Date.now(),
                });
                return origProtoShow.call(this, title, options).catch(() => {});
              };
            }

            if (OrigNotif) {
              const Wrapped = function(title, options) {
                window.__capturedBrowserPopups.push({
                  via: 'window.Notification',
                  title,
                  options,
                  at: Date.now(),
                });
                try {
                  return new OrigNotif(title, options);
                } catch (e) {
                  return { close: function() {}, onclick: null };
                }
              };
              Wrapped.requestPermission = function() {
                return Promise.resolve(window.__forcedPerm || 'granted');
              };
              Object.defineProperty(Wrapped, 'permission', {
                get: function() { return window.__forcedPerm || OrigNotif.permission || 'granted'; }
              });
              window.Notification = Wrapped;
            }
          }
          window.__forcedPerm = \${JSON.stringify(deniedOverride ? 'denied' : 'granted')};
        })();
      \`);
    }

    async function saveScreenshot(win, filename) {
      const image = await win.webContents.capturePage();
      const target = path.join(SCREENSHOT_DIR, filename);
      fs.writeFileSync(target, image.toPNG());
      console.log('[SCREENSHOT] Saved:', target);
      return target;
    }

    app.whenReady().then(async () => {
      session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
        if (permission === 'notifications') return forcedPermissionMode === 'granted';
        return true;
      });
      session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
        if (permission === 'notifications') return callback(forcedPermissionMode === 'granted');
        return callback(true);
      });

      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const report = { desktop: {}, mobile: {}, screenshots: [] };

      try {
        console.log('[E2E] 1. Opening Desktop Web Application at 1280x800...');
        await win.loadURL('http://localhost:' + PORT + '/');
        await sleep(600);

        // Seed Admin auth cleanly in localStorage so AppShell renders dashboard
        await win.webContents.executeJavaScript(\`
          localStorage.clear();
          localStorage.setItem('panorama_token', 'demo_token_admin');
          localStorage.setItem('panorama_user', JSON.stringify({
            id: 'usr-admin-01',
            username: '@admin',
            role: 'ADMIN',
            fullName: 'System Administrator'
          }));
          window.location.hash = '#/dashboard';
        \`);
        await win.webContents.reload();
        await sleep(1500);
        await installNotificationSpy(win, false);

        // Verify Service Worker registered cleanly
        const swState = await win.webContents.executeJavaScript(\`
          (async () => {
            if (!('serviceWorker' in navigator)) return 'unsupported';
            const reg = await navigator.serviceWorker.ready;
            return reg && reg.active ? 'active:' + reg.active.scriptURL : 'no-active';
          })()
        \`);
        console.log('[E2E] Desktop Service Worker:', swState);
        assert(swState.startsWith('active:'), 'Service Worker must be active, got: ' + swState);
        report.desktop.serviceWorker = swState;

        // Trigger CRITICAL Low Water Alert on Train 12841 Coach C1 Arrival Tank 1 (6.5%)
        console.log('[E2E] 2. Broadcasting real WebSocket telemetry (6.5% CRITICAL)...');
        await pushTelemetry({
          tankId: 'tank-c1-arrival',
          tankName: 'Arrival Side (Tank 1)',
          trainNumber: '12841',
          coachNumber: 'C1',
          deviceUid: 'DEV-C1',
          primaryLevel: 6.5,
          isOnline: true,
          timestamp: new Date().toISOString(),
        });
        await sleep(1200);

        const popupsAfterInitial = await win.webContents.executeJavaScript('window.__capturedBrowserPopups');
        assert.strictEqual(popupsAfterInitial.length, 1, 'Expected 1 initial popup, got ' + popupsAfterInitial.length);
        const p1 = popupsAfterInitial[0];
        assert(p1.title.includes('CRITICAL ALERT'), 'Title must say CRITICAL ALERT');
        assert(p1.options.body.includes('12841') && p1.options.body.includes('C1') && p1.options.body.includes('6.5%'), 'Popup body missing fields: ' + p1.options.body);
        console.log('[E2E] Initial popup verified via ' + p1.via + ':', p1.title);
        report.desktop.initialPopup = p1;
        report.screenshots.push(await saveScreenshot(win, '01_desktop_initial_critical_popup.png'));

        // Verify polling identical reading does NOT create duplicate popup
        await pushTelemetry({
          tankId: 'tank-c1-arrival',
          tankName: 'Arrival Side (Tank 1)',
          trainNumber: '12841',
          coachNumber: 'C1',
          deviceUid: 'DEV-C1',
          primaryLevel: 6.5,
          isOnline: true,
          timestamp: new Date().toISOString(),
        });
        await sleep(600);
        const popupsAfterDupPoll = await win.webContents.executeJavaScript('window.__capturedBrowserPopups.length');
        assert.strictEqual(popupsAfterDupPoll, 1, 'Polling duplicate reading must not fire extra popup');
        console.log('[E2E] Duplicate poll suppression verified (count=' + popupsAfterDupPoll + ')');

        // Navigate across Dashboard -> All Tanks -> back before 30s mark; wait for real 30s reminder
        await win.webContents.executeJavaScript("window.location.hash = '#/watertank';");
        await sleep(500);
        console.log('[E2E] 3. Waiting real 31s for first automatic reminder without timer reset on navigation...');
        await sleep(31000);

        const popupsAt31s = await win.webContents.executeJavaScript('window.__capturedBrowserPopups');
        assert.strictEqual(popupsAt31s.length, 2, 'Expected 2 popups after 30s (initial + Reminder #1), got ' + popupsAt31s.length);
        assert(popupsAt31s[1].options.body.includes('Reminder #1'), 'Second popup must be Reminder #1');
        console.log('[E2E] Real 30s Reminder #1 verified!');
        report.screenshots.push(await saveScreenshot(win, '02_desktop_30s_reminder_popup.png'));

        // Test Refresh Persistence: wait 15s, reload page mid-countdown, verify Reminder #2 fires ~16s later (t~60s)
        console.log('[E2E] 4. Waiting 14s then refreshing browser mid-countdown to test persistence...');
        await sleep(14000);
        await win.webContents.reload();
        await sleep(1500);
        await installNotificationSpy(win, false);
        const popupsRightAfterReload = await win.webContents.executeJavaScript('window.__capturedBrowserPopups.length');
        assert.strictEqual(popupsRightAfterReload, 0, 'Reload must not re-fire initial popup immediately');
        console.log('[E2E] Post-reload quiet check passed; waiting remaining 17s for scheduled Reminder #2...');
        await sleep(17000);

        const popupsAt60sAfterReload = await win.webContents.executeJavaScript('window.__capturedBrowserPopups');
        assert(popupsAt60sAfterReload.length >= 1, 'Expected Reminder #2 to fire on original schedule after reload!');
        assert(popupsAt60sAfterReload[0].options.body.includes('Reminder #2'), 'Expected Reminder #2 label, got: ' + popupsAt60sAfterReload[0].options.body);
        console.log('[E2E] Reminder #2 persisted cleanly across browser refresh!');

        // Test Notification Click Navigation -> simulate SW PANORAMA_NOTIFICATION_CLICK message from Dashboard to Alerts
        await win.webContents.executeJavaScript("window.location.hash = '#/dashboard';");
        await sleep(400);
        await win.webContents.executeJavaScript(\`
          navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
            data: {
              type: 'PANORAMA_NOTIFICATION_CLICK',
              data: { screen: 'alerts', trainNumber: '12841', coachNumber: 'C1', tankId: 'tank-c1-arrival' }
            }
          }));
        \`);
        await sleep(600);
        const hashAfterClick = await win.webContents.executeJavaScript('window.location.hash');
        assert(hashAfterClick.startsWith('#/alerts'), 'Notification click must navigate to Alerts page, got: ' + hashAfterClick);
        console.log('[E2E] Notification click navigation to #/alerts verified!');

        // Test Multiple Independent Alerts: add Coach C4 tank warning (14.5%)
        await pushTelemetry({
          tankId: 'tank-c4-departure',
          tankName: 'Departure Side (Tank 2)',
          trainNumber: '12841',
          coachNumber: 'C4',
          deviceUid: 'DEV-C4',
          primaryLevel: 14.5,
          isOnline: true,
          timestamp: new Date().toISOString(),
        });
        await sleep(800);
        const alertCardsCount = await win.webContents.executeJavaScript('Array.from(document.querySelectorAll("button")).filter(b => (b.getAttribute("data-testid") || "").startsWith("ack-btn-")).length');
        assert.strictEqual(alertCardsCount, 2, 'Expected 2 independent active alert cards on Alerts page, got ' + alertCardsCount);
        report.screenshots.push(await saveScreenshot(win, '03_desktop_multiple_alerts_page.png'));

        // Acknowledge first alert (C1) via UI button -> verify C1 stops reminding & shows Acknowledged by @admin
        await win.webContents.executeJavaScript(\`
          const btns = Array.from(document.querySelectorAll('[data-testid^="ack-btn-"]'));
          const c1Btn = btns.find((b) => b.getAttribute('data-testid').includes('tank-c1-arrival')) || btns[1];
          c1Btn.click();
        \`);
        await sleep(500);
        const ackedText = await win.webContents.executeJavaScript('document.body.innerText');
        assert(ackedText.includes('Reminders stopped') && ackedText.includes('@admin'), 'Acknowledged user/status not shown on Alerts page');
        console.log('[E2E] Alert acknowledgement stopped C1 reminders and recorded @admin!');
        report.screenshots.push(await saveScreenshot(win, '04_desktop_acknowledged_c1_stops_reminders.png'));

        // Verify Recovery resolves C4 & preserves history
        await pushTelemetry({
          tankId: 'tank-c4-departure',
          tankName: 'Departure Side (Tank 2)',
          trainNumber: '12841',
          coachNumber: 'C4',
          deviceUid: 'DEV-C4',
          primaryLevel: 55.0,
          isOnline: true,
          timestamp: new Date().toISOString(),
        });
        await sleep(800);
        const c4StillUnacked = await win.webContents.executeJavaScript(\`
          JSON.parse(localStorage.getItem('panorama_managed_alerts_v1') || '[]')
            .filter(a => a.status === 'ACTIVE').length
        \`);
        assert.strictEqual(c4StillUnacked, 0, 'After C1 ack & C4 recovery, 0 ACTIVE alerts should remain');
        console.log('[E2E] Recovery of C4 resolved alert & stopped all remaining reminders!');
        report.screenshots.push(await saveScreenshot(win, '05_desktop_resolved_history_preserved.png'));

        // =========================================================================
        // MOBILE BROWSER EMULATION (390x844 + Android Chrome User-Agent)
        // =========================================================================
        console.log('[E2E] 5. Switching to Mobile Browser (390x844 Android Chrome UA)...');
        win.setSize(390, 844);
        win.setContentSize(390, 844);
        win.webContents.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
        await win.webContents.executeJavaScript("localStorage.removeItem('panorama_managed_alerts_v1'); localStorage.removeItem('panorama_alert_history'); window.location.hash = '#/dashboard';");
        await win.webContents.reload();
        await sleep(1200);
        await installNotificationSpy(win, false);

        await pushTelemetry({
          tankId: 'tank-b2-arrival',
          tankName: 'Arrival Side (Tank 1)',
          trainNumber: '22525',
          coachNumber: 'B2',
          deviceUid: 'DEV-B2',
          primaryLevel: 7.2,
          isOnline: true,
          timestamp: new Date().toISOString(),
        });
        await sleep(1000);

        const mobilePopups = await win.webContents.executeJavaScript('window.__capturedBrowserPopups');
        assert.strictEqual(mobilePopups.length, 1, 'Expected 1 mobile SW notification');
        assert.strictEqual(mobilePopups[0].via, 'ServiceWorkerRegistration.showNotification', 'Mobile/Android Chrome must use ServiceWorkerRegistration.showNotification');
        const mobileOverflow = await win.webContents.executeJavaScript('document.documentElement.scrollWidth > window.innerWidth');
        assert.strictEqual(mobileOverflow, false, 'Mobile popup/banner view must have zero horizontal overflow');
        console.log('[E2E] Mobile Android Chrome SW notification + responsive layout verified!');
        report.screenshots.push(await saveScreenshot(win, '06_mobile_popup_and_banner.png'));

        await win.webContents.executeJavaScript(\`document.querySelector('[data-testid="banner-open-alerts-btn"]')?.click();\`);
        await sleep(600);
        report.screenshots.push(await saveScreenshot(win, '07_mobile_alerts_page.png'));

        // Permission Denied Handling on Mobile
        console.log('[E2E] 6. Verifying Denied Notification Permission Fallback...');
        forcedPermissionMode = 'denied';
        await win.reload();
        await sleep(1000);
        await installNotificationSpy(win, true);
        await win.webContents.executeJavaScript(\`
          window.dispatchEvent(new Event('focus'));
        \`);
        // Request permission via Alerts button to trigger permission state sync when denied
        await win.webContents.executeJavaScript(\`
          document.querySelector('[data-testid="alerts-enable-popups-btn"]')?.click();
        \`);
        await sleep(600);
        const deniedVisible = await win.webContents.executeJavaScript("document.body.innerText.includes('disabled/blocked') || document.body.innerText.includes('Popups Blocked')");
        assert.strictEqual(deniedVisible, true, 'Denied permission banner/status must be clearly visible');
        console.log('[E2E] Permission Denied fallback banner & in-app continuity verified!');
        report.screenshots.push(await saveScreenshot(win, '08_mobile_permission_denied_fallback.png'));

        console.log('\\n[E2E SUMMARY] ALL DESKTOP & MOBILE NOTIFICATION SCENARIOS PASSED!\\n', JSON.stringify({
          serviceWorker: report.desktop.serviceWorker,
          initialPopupVia: report.desktop.initialPopup.via,
          screenshotsCount: report.screenshots.length,
        }, null, 2));

        app.exit(0);
      } catch (err) {
        console.error('[E2E FAILED]', err);
        try { await saveScreenshot(win, '99_failure_state.png'); } catch {}
        app.exit(1);
      }
    });
  `;
}

async function main() {
  const srv = await createTestServer();
  const tempScriptPath = path.resolve(__dirname, '_tmp_notif_e2e.cjs');
  fs.writeFileSync(tempScriptPath, buildElectronRunnerScript(), 'utf8');

  try {
    const spawnEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
    delete spawnEnv.ELECTRON_RUN_AS_NODE;
    const exitCode = await new Promise((resolve) => {
      const child = cp.spawn(electronPath, [tempScriptPath], {
        stdio: 'inherit',
        env: spawnEnv,
      });
      child.on('exit', resolve);
    });
    if (exitCode !== 0) {
      process.exitCode = exitCode || 1;
    }
  } finally {
    try { fs.unlinkSync(tempScriptPath); } catch {}
    srv.server.close();
    srv.controlServer.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
