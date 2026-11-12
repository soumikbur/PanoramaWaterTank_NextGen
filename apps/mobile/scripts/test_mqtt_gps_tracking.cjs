// apps/mobile/scripts/test_mqtt_gps_tracking.cjs
/**
 * Unit + Electron E2E verification for MQTT-only GPS Tracking:
 * 1. parseValidGps & MqttService unit invariants (valid, (0,0), out-of-range, NaN, gps_valid:false, alt/sats, waypoints)
 * 2. Initial empty state has NO train marker and NO fabricated default coordinates
 * 3. Valid MQTT GPS frames populate Dashboard & Location map at Desktop (1280x800) & Mobile (390x844)
 * 4. Incremental movement updates marker position smoothly without recreating map/marker DOM
 * 5. GPS signal loss preserves water telemetry & last known GPS position with explicit status indicator
 * 6. MQTT disconnect & reconnect recovery updates status badge and resumes live tracking
 * 7. Zero navigator.geolocation calls, zero manual location UI, "Live Train Position" button works
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const esbuild = require('esbuild');
const electronPath = require('electron');

const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOT_DIR = 'C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots';
const PORT = 8771;
const USER_DATA_DIR = path.join(require('os').tmpdir(), 'panorama-mqtt-gps-e2e-' + process.pid);

async function runUnitTests() {
  console.log('[UNIT] Bundling mqttService.ts with esbuild for Node unit assertions...');
  const built = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src/services/mqttService.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const code = built.outputFiles[0].text;
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', code);
  fn(mod.exports, require, mod);

  const { parseValidGps, mqttService } = mod.exports;

  // 1. Valid EC200U-CN hardware JSON
  const g1 = parseValidGps({ uid: '0023004D4B42501120353332', lat: 22.8272, long: 88.1969, alt: 18.5, sats: 11, accuracy: 1.2 });
  assert.deepStrictEqual(g1, { lat: 22.8272, long: 88.1969, alt: 18.5, sats: 11, accuracy: 1.2, gpsFix: true });

  // 2. Reject Null Island (0, 0)
  const g0 = parseValidGps({ lat: 0, long: 0, sats: 0 });
  assert.strictEqual(g0.gpsFix, false);
  assert.strictEqual(g0.lat, null);
  assert.strictEqual(g0.long, null);

  // 3. Reject out-of-range coordinates (999, -999)
  const gOor = parseValidGps({ lat: 999, long: 88.3 });
  assert.strictEqual(gOor.gpsFix, false);
  assert.strictEqual(gOor.lat, null);

  // 4. Reject NaN / Infinity
  const gNan = parseValidGps({ lat: Number.NaN, lon: 88.35 });
  assert.strictEqual(gNan.gpsFix, false);
  assert.strictEqual(gNan.lat, null);

  // 5. Reject explicit gps_valid: false even with numeric coords
  const gNoFix = parseValidGps({ lat: 22.55, long: 88.35, gps_valid: false });
  assert.strictEqual(gNoFix.gpsFix, false);
  assert.strictEqual(gNoFix.lat, null);

  // 6. MqttService retains water telemetry + preserves lastValidGps across GPS loss frames
  const t1 = mqttService.handleIncomingPayload(JSON.stringify({
    uid: '0023004D4B42501120353332', lat: 22.5839, long: 88.3426, speed: 42.5, alt: 12, sats: 10,
    time: '12:00:01', cm1: 120.0, cm2: 90.0, wlp1: 80, wlp2: 60, wlv1: true, wlv2: true, bat: 91, chno: 'CR123456', trno: '225256'
  }));
  assert.strictEqual(t1.gpsFix, true);
  assert.strictEqual(t1.lat, 22.5839);
  assert.strictEqual(mqttService.getLastValidGps().lat, 22.5839);

  // GPS signal lost frame with (0, 0) & different cm1: tank telemetry still processes, lastValidGps stays 22.5839!
  const tLoss = mqttService.handleIncomingPayload(JSON.stringify({
    uid: '0023004D4B42501120353332', lat: 0, long: 0, gps_valid: false, speed: 0,
    time: '12:00:15', cm1: 118.0, cm2: 90.0, wlp1: 78.7, wlp2: 60, wlv1: true, wlv2: true, bat: 90, chno: 'CR123456', trno: '225256'
  }));
  assert.strictEqual(tLoss.gpsFix, false);
  assert.strictEqual(tLoss.lat, null);
  assert.strictEqual(tLoss.cm1, 118.0);
  assert.strictEqual(mqttService.getLastValidGps().lat, 22.5839);

  // Moving frame adds 2nd waypoint
  const t2 = mqttService.handleIncomingPayload(JSON.stringify({
    uid: '0023004D4B42501120353332', lat: 22.8272, long: 88.1969, speed: 68.0, sats: 12,
    time: '12:00:30', cm1: 117.5, cm2: 90.0, wlp1: 78.3, wlp2: 60, wlv1: true, wlv2: true, bat: 90, chno: 'CR123456', trno: '225256'
  }));
  assert.strictEqual(t2.gpsFix, true);
  assert.strictEqual(mqttService.getGpsWaypoints().length, 2);

  mqttService.disconnect();
  assert.strictEqual(mqttService.getStatus(), 'DISCONNECTED');
  // Last known valid GPS still preserved across disconnect
  assert.strictEqual(mqttService.getLastValidGps().lat, 22.8272);

  console.log('[UNIT] All 6 unit test groups passed.');
}

function createStaticServer() {
  const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  let train225256Enabled = false;
  return http.createServer((req, res) => {
    const reqPath = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname;
    if (reqPath === '/__test/enable-225256') {
      train225256Enabled = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (reqPath.startsWith('/api/v1/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (reqPath === '/api/v1/health') {
        res.end(JSON.stringify({ status: 'HEALTHY', mqtt_connected: true }));
      } else if (reqPath === '/api/v1/alarms/stats') {
        res.end(JSON.stringify({ active: 0, critical: 0, warning: 0, resolved: 0 }));
      } else if (reqPath === '/api/v1/tanks/live') {
        res.end('null');
      } else if (reqPath === '/api/v1/trains/regions') {
        const t225256 = {
          train_number: '225256',
          name: 'Howrah - New Delhi Express',
          type: 'Express',
          coaches_count: 1,
          tanks_count: 2,
          is_online: false,
          status: 'All Normal',
          active_alarms: 0,
          region: 'EAST',
        };
        res.end(JSON.stringify([
          { region: 'NORTH', name: 'Northern Railway', code: 'NR', configuredTrains: 0, coaches: 0, tanks: 0, onlineTrains: 0, status: 'All Normal', trains: [] },
          { region: 'SOUTH', name: 'Southern Railway', code: 'SR', configuredTrains: 0, coaches: 0, tanks: 0, onlineTrains: 0, status: 'All Normal', trains: [] },
          { region: 'EAST', name: 'Eastern & South East', code: 'ER/SER', configuredTrains: train225256Enabled ? 1 : 0, coaches: train225256Enabled ? 1 : 0, tanks: train225256Enabled ? 2 : 0, onlineTrains: 0, status: 'All Normal', trains: train225256Enabled ? [t225256] : [] },
          { region: 'WEST', name: 'Western Railway', code: 'WR', configuredTrains: 0, coaches: 0, tanks: 0, onlineTrains: 0, status: 'All Normal', trains: [] },
        ]));
      } else if (reqPath === '/api/v1/trains/225256/consist') {
        res.end(JSON.stringify({
          train_number: '225256',
          name: 'Howrah - New Delhi Express',
          region: 'EAST',
          coaches_count: 1,
          tanks_count: 2,
          online_status: false,
          active_alarms_count: 0,
          coaches: [{
            coach_number: 'CR123456',
            coach_category: 'AC',
            device_uid: '0023004D4B42501120353332',
            is_online: false,
            tanks: [
              { id: 't1', tank_index: 1, name: 'Tank 1', capacity_liters: 500, current_level_percent: 0, current_volume_liters: 0, status: 'NORMAL' },
              { id: 't2', tank_index: 2, name: 'Tank 2', capacity_liters: 500, current_level_percent: 0, current_volume_liters: 0, status: 'NORMAL' },
            ],
          }],
        }));
      } else {
        res.end('[]');
      }
      return;
    }
    let filePath = path.join(DIST_DIR, reqPath === '/' ? 'index.html' : reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function runElectronE2E() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const driverScript = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PORT = ${PORT};
const SCREENSHOT_DIR = ${JSON.stringify(SCREENSHOT_DIR)};
const consoleErrors = [];

app.setPath('userData', ${JSON.stringify(USER_DATA_DIR)});

async function snap(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOT_DIR, name), img.toPNG());
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  win.webContents.on('console-message', (e, level, msg) => {
    if (level >= 3 && !msg.includes('React DevTools') && !msg.includes('Electron Security Warning') && !msg.includes('ERR_NAME_NOT_RESOLVED') && !msg.includes('[CRITICAL]')) {
      consoleErrors.push(msg);
      console.error('[BROWSER ERROR]', msg);
    }
  });

  try {
    await win.loadURL('http://127.0.0.1:' + PORT + '/');
    await new Promise(r => setTimeout(r, 900));
    await win.webContents.executeJavaScript(\`
      document.getElementById('btn-quick-login-admin')?.click();
    \`);
    await new Promise(r => setTimeout(r, 900));

    // Attach geolocation spy once logged in
    await win.webContents.executeJavaScript(\`
      window.__geoCalls = 0;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = () => { window.__geoCalls++; };
        navigator.geolocation.watchPosition = () => { window.__geoCalls++; return 1; };
      }
      void 0;
    \`);

    // Check Settings screen has NO manual/sim-fallback controls
    await win.webContents.executeJavaScript(\`document.querySelector('button[data-screen="settings"]')?.click(); void 0;\`);
    await new Promise(r => setTimeout(r, 400));
    const hasSimCheckbox = await win.webContents.executeJavaScript(\`Boolean(document.getElementById('sim-fallback-checkbox'))\`);
    assert.strictEqual(hasSimCheckbox, false, 'Settings must not have sim-fallback-checkbox');

    // Go to Location screen (1280x800 Desktop) before any MQTT GPS arrives
    await win.webContents.executeJavaScript(\`document.querySelector('button[data-screen="location"]')?.click(); void 0;\`);
    await new Promise(r => setTimeout(r, 900));

    const initialLoc = await win.webContents.executeJavaScript(\`({
      markers: document.querySelectorAll('.custom-train-marker').length,
      btnText: document.getElementById('map-currentloc-btn')?.textContent?.trim(),
      hasDefaultFake: document.body.textContent.includes('ROUTE DEMO') || document.body.textContent.includes('ROUTE SIMULATION'),
      text: document.body.textContent,
    })\`);
    assert.strictEqual(initialLoc.markers, 0, 'No train marker may be placed before valid MQTT GPS');
    assert.strictEqual(initialLoc.hasDefaultFake, false, 'Must not display ROUTE DEMO or ROUTE SIMULATION');
    assert.strictEqual(initialLoc.btnText, 'Live Train Position', 'Button must be renamed to Live Train Position');
    console.log('[E2E PASS] Initial empty state: 0 markers, no fake simulation, Live Train Position button present.');

    // Configure train 225256 on mock API & fleet store so MQTT train-validation accepts live telemetry for 225256
    await win.webContents.executeJavaScript(\`(async () => {
      await fetch('/__test/enable-225256');
      window.localStorage.setItem('panorama_static_fleet_v2', JSON.stringify({
        trains: {
          '225256': {
            train: {
              train_number: '225256',
              name: 'Howrah - New Delhi Express',
              type: 'Express',
              coaches_count: 1,
              tanks_count: 2,
              is_online: false,
              status: 'All Normal',
              active_alarms: 0,
              region: 'EAST',
              total_coaches: 1
            },
            consist: {
              train_number: '225256',
              name: 'Howrah - New Delhi Express',
              region: 'EAST',
              coaches_count: 1,
              tanks_count: 2,
              online_status: false,
              active_alarms_count: 0,
              coaches: [{
                coach_number: 'CR123456',
                coach_category: 'AC',
                device_uid: '0023004D4B42501120353332',
                is_online: false,
                tanks: [
                  { id: 't1', tank_index: 1, name: 'Tank 1', capacity_liters: 500, current_level_percent: 0, current_volume_liters: 0, status: 'NORMAL' },
                  { id: 't2', tank_index: 2, name: 'Tank 2', capacity_liters: 500, current_level_percent: 0, current_volume_liters: 0, status: 'NORMAL' }
                ]
              }]
            }
          }
        }
      }));
      window.dispatchEvent(new Event('panorama:fleet-updated'));
      return true;
    })()\`);
    await new Promise(r => setTimeout(r, 500));

    // Inject invalid (0,0) and out-of-range coordinates -> marker stays 0
    await win.webContents.executeJavaScript(\`
      window.panoramaMqttService.handleIncomingPayload(JSON.stringify({
        uid: '0023004D4B42501120353332', lat: 0, long: 0, gps_valid: false, speed: 0,
        time: '12:10:00', cm1: 110, cm2: 0, wlp1: 73.3, wlp2: 0, wlv1: true, wlv2: false, bat: 88, chno: 'CR123456', trno: '225256'
      }));
      window.panoramaMqttService.handleIncomingPayload(JSON.stringify({
        uid: '0023004D4B42501120353332', lat: 999, long: -999, speed: 0,
        time: '12:10:02', cm1: 110, cm2: 0, wlp1: 73.3, wlp2: 0, wlv1: true, wlv2: false, bat: 88, chno: 'CR123456', trno: '225256'
      }));
    \`);
    await new Promise(r => setTimeout(r, 400));
    const afterInvalidCount = await win.webContents.executeJavaScript(\`document.querySelectorAll('.custom-train-marker').length\`);
    assert.strictEqual(afterInvalidCount, 0, 'Invalid (0,0) and OOR MQTT payloads must not place a train marker');

    // Inject valid MQTT GPS frame #1 (Kamarkundu 22.8272, 88.1969)
    await win.webContents.executeJavaScript(\`
      window.panoramaMqttService.handleIncomingPayload(JSON.stringify({
        uid: '0023004D4B42501120353332', lat: 22.8272, long: 88.1969, speed: 64.2, sats: 11, alt: 19,
        time: '12:15:39', cm1: 120.8, cm2: 0, wlp1: 80.5, wlp2: 0, wlv1: true, wlv2: false, bat: 85.4, chno: 'CR123456', trno: '225256'
      }));
    \`);
    await new Promise(r => setTimeout(r, 500));

    // Tag the Leaflet map container & train marker DOM node to prove no teardown on movement!
    await win.webContents.executeJavaScript(\`
      window.__locMapNode = document.getElementById('location-map-container');
      window.__trainMarkerNode = document.querySelector('.custom-train-marker');
      window.__initialTransform = window.__trainMarkerNode?.style?.transform || '';
    \`);

    // Inject valid MQTT GPS frame #2 (Moving toward Bardhaman 23.0250, 88.0150)
    await win.webContents.executeJavaScript(\`
      window.panoramaMqttService.handleIncomingPayload(JSON.stringify({
        uid: '0023004D4B42501120353332', lat: 23.0250, long: 88.0150, speed: 79.0, sats: 12, alt: 24,
        time: '12:16:09', cm1: 120.2, cm2: 0, wlp1: 80.1, wlp2: 0, wlv1: true, wlv2: false, bat: 85.2, chno: 'CR123456', trno: '225256'
      }));
    \`);
    await new Promise(r => setTimeout(r, 600));

    // Click "Live Train Position" button -> centers on MQTT GPS, zero geolocation calls
    await win.webContents.executeJavaScript(\`document.getElementById('map-currentloc-btn')?.click()\`);
    await new Promise(r => setTimeout(r, 600));

    const afterLive = await win.webContents.executeJavaScript(\`({
      markers: document.querySelectorAll('.custom-train-marker').length,
      sameMapNode: document.getElementById('location-map-container') === window.__locMapNode,
      sameMarkerNode: document.querySelector('.custom-train-marker') === window.__trainMarkerNode,
      hasLiveStatus: document.body.textContent.includes('MQTT GPS LIVE (12 Satellites)'),
      hasCoords: document.body.textContent.includes('23.0250° N, 88.0150° E'),
      hasToast: document.body.textContent.includes('Live Train Position (225256): 23.02500° N, 88.01500° E'),
      geoCalls: window.__geoCalls,
    })\`);
    assert.strictEqual(afterLive.markers, 1);
    assert.strictEqual(afterLive.sameMapNode, true, 'Map node must not recreate on GPS movement');
    assert.strictEqual(afterLive.sameMarkerNode, true, 'Train marker DOM node must move incrementally without recreate');
    assert.strictEqual(afterLive.hasLiveStatus, true, 'Status pill must show MQTT GPS LIVE (12 Satellites)');
    assert.strictEqual(afterLive.hasCoords, true, 'Status pill must show updated live coordinates');
    assert.strictEqual(afterLive.hasToast, true, 'Clicking Live Train Position must center on latest MQTT fix');
    assert.strictEqual(afterLive.geoCalls, 0, 'navigator.geolocation must NEVER be called');
    await snap(win, 'mqtt_gps_01_desktop_live.png');
    console.log('[E2E PASS] Desktop live MQTT GPS movement + Live Train Position button verified.');

    // Simulate GPS signal loss (valid tank telemetry, gps_valid: false) -> marker kept at last known fix with warning badge
    await win.webContents.executeJavaScript(\`
      window.panoramaMqttService.handleIncomingPayload(JSON.stringify({
        uid: '0023004D4B42501120353332', lat: 0, long: 0, gps_valid: false, speed: 0,
        time: '12:16:40', cm1: 119.5, cm2: 0, wlp1: 79.7, wlp2: 0, wlv1: true, wlv2: false, bat: 85.0, chno: 'CR123456', trno: '225256'
      }));
    \`);
    await new Promise(r => setTimeout(r, 400));
    const gpsLossCheck = await win.webContents.executeJavaScript(\`({
      markers: document.querySelectorAll('.custom-train-marker').length,
      hasLossBadge: document.body.textContent.includes('GPS SIGNAL LOST (LAST KNOWN FIX)'),
      keepsLastCoords: document.body.textContent.includes('23.0250° N, 88.0150° E'),
    })\`);
    assert.strictEqual(gpsLossCheck.markers, 1);
    assert.strictEqual(gpsLossCheck.hasLossBadge, true, 'Status must show GPS SIGNAL LOST (LAST KNOWN FIX)');
    assert.strictEqual(gpsLossCheck.keepsLastCoords, true, 'Must keep last known coordinates 23.0250, 88.0150');
    await snap(win, 'mqtt_gps_02_desktop_signal_lost.png');

    // Simulate MQTT disconnect -> status reflects disconnected + preserves last known coords
    await win.webContents.executeJavaScript(\`window.panoramaMqttService.disconnect();\`);
    await new Promise(r => setTimeout(r, 400));
    const disconnectCheck = await win.webContents.executeJavaScript(\`
      document.body.textContent.includes('MQTT DISCONNECTED (LAST KNOWN GPS)')
    \`);
    assert.strictEqual(disconnectCheck, true, 'Status must indicate MQTT DISCONNECTED (LAST KNOWN GPS)');

    // Recover MQTT connection & valid fix
    await win.webContents.executeJavaScript(\`
      window.panoramaMqttService.handleIncomingPayload(JSON.stringify({
        uid: '0023004D4B42501120353332', lat: 23.2324, long: 87.8615, speed: 75.4, sats: 13, alt: 32,
        time: '12:17:10', cm1: 119.0, cm2: 0, wlp1: 79.3, wlp2: 0, wlv1: true, wlv2: false, bat: 84.9, chno: 'CR123456', trno: '225256'
      }));
    \`);
    await new Promise(r => setTimeout(r, 400));
    const recoveredCheck = await win.webContents.executeJavaScript(\`
      document.body.textContent.includes('MQTT GPS LIVE (13 Satellites)') &&
      document.body.textContent.includes('23.2324° N, 87.8615° E')
    \`);
    assert.strictEqual(recoveredCheck, true, 'Recovered telemetry must return to MQTT GPS LIVE (13 Satellites)');

    // Check Dashboard mini-map & table show real MQTT coords (never 22.5841 / 3D DGPS)
    await win.webContents.executeJavaScript(\`document.querySelector('button[data-screen="dashboard"]')?.click()\`);
    await new Promise(r => setTimeout(r, 800));
    const dashCheck = await win.webContents.executeJavaScript(\`({
      hasNewLat: document.body.textContent.includes('23.2324° N'),
      hasNewLon: document.body.textContent.includes('87.8615° E'),
      hasHardcodedFake: document.body.textContent.includes('22.5841') || document.body.textContent.includes('3D DGPS'),
      hasGnssFix: document.body.textContent.includes('Fix: MQTT GNSS'),
    })\`);
    assert.strictEqual(dashCheck.hasNewLat && dashCheck.hasNewLon, true, 'Dashboard must display latest MQTT GPS coords');
    assert.strictEqual(dashCheck.hasHardcodedFake, false, 'Dashboard must not show hardcoded 22.5841 or 3D DGPS');
    assert.strictEqual(dashCheck.hasGnssFix, true, 'Dashboard diagnostic card must display Fix: MQTT GNSS');
    await snap(win, 'mqtt_gps_03_desktop_dashboard.png');

    // Mobile viewport (390x844) check
    win.setSize(390, 844);
    await win.webContents.executeJavaScript(\`
      window.dispatchEvent(new Event('resize'));
      document.querySelector('button[data-screen="location"]')?.click();
    \`);
    await new Promise(r => setTimeout(r, 900));
    const mobCheck = await win.webContents.executeJavaScript(\`({
      markers: document.querySelectorAll('.custom-train-marker').length,
      hasPill: document.body.textContent.includes('MQTT GPS (13 Sat)'),
      hasBtn: document.getElementById('map-currentloc-btn')?.getAttribute('aria-label') === 'Live Train Position',
      geoCalls: window.__geoCalls,
    })\`);
    assert.strictEqual(mobCheck.markers, 1);
    assert.strictEqual(mobCheck.hasPill, true, 'Mobile pill must show MQTT GPS (13 Sat)');
    assert.strictEqual(mobCheck.hasBtn, true, 'Mobile FAB aria-label must be Live Train Position');
    assert.strictEqual(mobCheck.geoCalls, 0);
    await snap(win, 'mqtt_gps_04_mobile_live.png');

    assert.strictEqual(consoleErrors.length, 0, 'Zero console errors expected, got: ' + consoleErrors.join(' | '));
    console.log('[E2E PASS] All Desktop (1280x800) & Mobile (390x844) MQTT GPS assertions passed!');
    app.exit(0);
  } catch (err) {
    console.error('[E2E FAIL]', err);
    try { await snap(win, 'mqtt_gps_99_error.png'); } catch {}
    app.exit(1);
  }
});
`;

  const tmpDriver = path.join(__dirname, '_tmp_mqtt_gps_driver.cjs');
  fs.writeFileSync(tmpDriver, driverScript, 'utf8');
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve, reject) => {
      const child = cp.spawn(electronPath, [tmpDriver], { stdio: 'inherit', env });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Electron exited with code ${code}`));
      });
    });
  } finally {
    try { fs.unlinkSync(tmpDriver); } catch {}
    server.close();
  }
}

(async () => {
  await runUnitTests();
  await runElectronE2E();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

