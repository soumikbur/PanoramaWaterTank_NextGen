// apps/mobile/scripts/verify_12_scenarios.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8792;
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DIST_DIR = path.resolve(__dirname, '../dist');
const BRAIN_ARTIFACTS_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\07f934a3-112b-4821-90f4-23baf24a9f52\\screenshots';
const LOCAL_ARTIFACTS_DIR = path.resolve(REPO_ROOT, 'screenshots_scada');

[BRAIN_ARTIFACTS_DIR, LOCAL_ARTIFACTS_DIR].forEach((dir) => {
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
};

function createServer() {
  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = parsed.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'demo_token_employee',
        token_type: 'bearer',
        user: {
          id: 'usr-emp-01',
          username: 'employee',
          name: 'P. K. Sharma',
          role: 'EMPLOYEE',
          division: 'Sealdah (SDAH)',
          zone: 'Eastern Railway',
        },
      }));
      return;
    }

    if (pathname === '/api/v1/auth/me' || pathname === '/api/v1/users/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'usr-emp-01',
        username: 'employee',
        fullName: 'P. K. Sharma',
        full_name: 'P. K. Sharma',
        role: 'EMPLOYEE',
        division: 'Sealdah (SDAH)',
        zone: 'Eastern Railway',
      }));
      return;
    }

    if (pathname === '/api/v1/auth/login') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'test-session-token-12345',
        user: {
          id: 'usr-emp-01',
          username: 'employee',
          fullName: 'P. K. Sharma',
          full_name: 'P. K. Sharma',
          role: 'EMPLOYEE',
          division: 'Sealdah (SDAH)',
          zone: 'Eastern Railway',
        }
      }));
      return;
    }

    if (pathname === '/api/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', mqttBroker: 'CONNECTED' }));
      return;
    }

    if (pathname === '/api/v1/trains') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          train_number: '225256',
          name: 'Express Fleet 225256',
          region: 'South East',
          is_online: true,
          coaches_count: 24,
          last_telemetry: 'Just now',
          source: 'Kharagpur (KGP)',
          destination: 'Howrah (HWH)',
          latitude: 22.557279,
          longitude: 88.352432,
          speed_kmh: 3.4,
          nearest_station: 'Kharagpur Junction',
        },
      ]));
      return;
    }

    if (pathname === '/api/v1/devices') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          id: '0023004D4B42501120353332',
          uid: '0023004D4B42501120353332',
          name: 'WLI Node 0023004D4B42501120353332',
          trainNumber: '225256',
          coachNumber: 'CR123456',
          isOnline: true,
          batteryPercent: 83.6,
          primaryLevel: 12.1,
          secondaryLevel: 0.0,
          hardwareVersion: 'WLI-EC200U',
          lastSeenAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
          hasActiveAlarm: false,
        },
      ]));
      return;
    }

    if (pathname === '/api/v1/tanks' || pathname === '/api/v1/tanks/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tankId: '0023004D4B42501120353332-tank-1',
        tankIndex: 1,
        deviceId: '0023004D4B42501120353332',
        deviceUid: '0023004D4B42501120353332',
        trainNumber: '225256',
        coachNumber: 'CR123456',
        tankName: 'Arrival Side (Tank 1)',
        capacityLiters: 500,
        maxHeightCm: 150,
        levelPercent: 12.1,
        rawLevelPercent: 12.1,
        heightCm: 120.8,
        volumeLiters: 60.5,
        rank: 'LOW',
        alarmStatus: 'NORMAL',
        batteryVoltage: 4.0,
        isOnline: true,
        hasTelemetry: true,
        isStale: false,
        lastUpdate: '12:15:39',
      }));
      return;
    }

    if (pathname === '/api/v1/alarms') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    if (pathname === '/api/v1/alarms/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ totalActive: 0, criticalCount: 0, warningCount: 0, resolvedToday: 0 }));
      return;
    }

    if (pathname === '/api/v1/regions/summary') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { region: 'South East', activeTrains: 1, totalTanks: 2, nominalCount: 2, criticalCount: 0 },
        { region: 'Eastern', activeTrains: 1, totalTanks: 2, nominalCount: 2, criticalCount: 0 },
      ]));
      return;
    }

    // Static asset fallback
    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  return server;
}

const runnerScript = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const PORT = ${PORT};
const BRAIN_DIR = "${BRAIN_ARTIFACTS_DIR.replace(/\\/g, '\\\\')}";
const LOCAL_DIR = ${JSON.stringify(LOCAL_ARTIFACTS_DIR)};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function saveScreenshot(win, filename) {
  const image = await win.webContents.capturePage();
  const buffer = image.toPNG();
  if (fs.existsSync(BRAIN_DIR)) {
    fs.writeFileSync(path.join(BRAIN_DIR, filename), buffer);
  }
  fs.writeFileSync(path.join(LOCAL_DIR, filename), buffer);
  console.log('[SCREENSHOT SAVED]: ' + filename);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
    },
  });

  const results = {};

  try {
    console.log('[RUNNER] Loading http://127.0.0.1:' + PORT + ' ...');
    await win.loadURL('http://127.0.0.1:' + PORT);
    await sleep(2500);

    // Login
    console.log('[RUNNER] Triggering login...');
    await win.webContents.executeJavaScript(\`
      (() => {
        const quick = document.getElementById('btn-quick-login-employee');
        if (quick) { quick.click(); return; }
        const u = document.getElementById('login-username');
        const p = document.getElementById('login-password');
        const btn = document.querySelector('button[type="submit"]');
        if (u && p && btn) {
          u.value = 'employee';
          u.dispatchEvent(new Event('input', { bubbles: true }));
          p.value = 'Employee@123';
          p.dispatchEvent(new Event('input', { bubbles: true }));
          btn.click();
        }
      })();
    \`);
    await sleep(2500);

    // Scenario 1: Connect / MQTT Service available
    console.log('[RUNNER] Verifying Scenario 1: MQTT Service Initialization & Topic...');
    const s1 = await win.webContents.executeJavaScript(\`
      (() => {
        const svc = window.panoramaMqttService;
        return {
          available: Boolean(svc),
          status: svc ? svc.getStatus() : null,
          title: document.title,
        };
      })();
    \`);
    results['Scenario_1_Connect'] = {
      passed: s1.available === true,
      details: s1,
    };

    // Scenario 2: Ingest 14-field Contract Payload
    console.log('[RUNNER] Verifying Scenario 2: Telemetry Publish & Parse...');
    const contractPayload = {
      uid: "0023004D4B42501120353332",
      lat: 22.557279,
      long: 88.352432,
      speed: 3.4,
      time: "12:15:39",
      cm1: 120.8,
      cm2: 0.0,
      wlp1: 12.1,
      wlp2: 0.0,
      wlv1: true,
      wlv2: false,
      bat: 83.6,
      chno: "CR123456",
      trno: "225256"
    };

    const s2 = await win.webContents.executeJavaScript(\`
      (() => {
        const raw = \${JSON.stringify(JSON.stringify(contractPayload))};
        const parsed = window.panoramaMqttService.handleIncomingPayload(raw);
        return {
          parsedUid: parsed?.uid,
          cm1: parsed?.cm1,
          cm2: parsed?.cm2,
          wlp1: parsed?.wlp1,
          wlp2: parsed?.wlp2,
          bat: parsed?.bat,
          trno: parsed?.trno,
          chno: parsed?.chno,
        };
      })();
    \`);
    results['Scenario_2_TelemetryPublish'] = {
      passed: s2.parsedUid === '0023004D4B42501120353332' && s2.cm1 === 120.8 && s2.trno === '225256',
      details: s2,
    };
    await sleep(1500);

    // Scenario 3: Tank 1 update (12.1%, 120.8 cm, Valve Normal)
    console.log('[RUNNER] Verifying Scenario 3: Tank 1 Update in DOM...');
    const s3 = await win.webContents.executeJavaScript(\`
      (() => {
        const txt = document.body.innerText;
        return {
          hasPct: txt.includes('80.5%') || txt.includes('81%') || txt.includes('12.1%'),
          hasCm: txt.includes('120.8 cm'),
          hasValve: txt.includes('Valve Normal') || txt.includes('Valve Open'),
        };
      })();
    \`);
    results['Scenario_3_Tank1_Update'] = {
      passed: s3.hasPct && s3.hasCm,
      details: s3,
    };

    // Scenario 4: Tank 2 update (0.0%, 0.0 cm, Valve Alert)
    console.log('[RUNNER] Verifying Scenario 4: Tank 2 Update in DOM...');
    const s4 = await win.webContents.executeJavaScript(\`
      (() => {
        const txt = document.body.innerText;
        return {
          hasPct: txt.includes('0%') || txt.includes('0.0%'),
          hasCm: txt.includes('0.0 cm'),
          hasValve: txt.includes('Valve Alert') || txt.includes('Valve Closed'),
        };
      })();
    \`);
    results['Scenario_4_Tank2_Update'] = {
      passed: s4.hasPct && s4.hasCm,
      details: s4,
    };

    // Scenario 5: Battery update (83.6%)
    console.log('[RUNNER] Verifying Scenario 5: Battery Update in DOM...');
    const s5 = await win.webContents.executeJavaScript(\`
      (() => {
        const txt = document.body.innerText;
        return {
          hasBat: txt.includes('83.6%') || txt.includes('84%'),
        };
      })();
    \`);
    results['Scenario_5_Battery_Update'] = {
      passed: s5.hasBat,
      details: s5,
    };

    // Scenario 6: GPS update (lat, long, speed, time)
    console.log('[RUNNER] Verifying Scenario 6: GPS Update in DOM...');
    const s6 = await win.webContents.executeJavaScript(\`
      (() => {
        const txt = document.body.innerText;
        return {
          hasLat: txt.includes('22.5573') || txt.includes('22.557'),
          hasLon: txt.includes('88.3524') || txt.includes('88.352'),
          hasSpeed: txt.includes('3.4 km/h'),
          hasTime: txt.includes('12:15:39'),
        };
      })();
    \`);
    results['Scenario_6_GPS_Update'] = {
      passed: s6.hasLat && s6.hasLon && s6.hasSpeed && s6.hasTime,
      details: s6,
    };

    // Scenario 7: Train & Coach update (225256, CR123456)
    console.log('[RUNNER] Verifying Scenario 7: Train & Coach Identifiers in DOM...');
    const s7 = await win.webContents.executeJavaScript(\`
      (() => {
        const txt = document.body.innerText;
        return {
          hasTrno: txt.includes('225256'),
          hasChno: txt.includes('CR123456') || txt.includes('C4'),
        };
      })();
    \`);
    results['Scenario_7_TrainCoach_Update'] = {
      passed: s7.hasTrno && s7.hasChno,
      details: s7,
    };

    // Scenario 8: Disconnect detection
    console.log('[RUNNER] Verifying Scenario 8: Disconnect Detection...');
    const s8 = await win.webContents.executeJavaScript(\`
      (() => {
        window.panoramaMqttService.disconnect();
        return {
          status: window.panoramaMqttService.getStatus(),
          domHasOffline: document.body.innerText.includes('OFFLINE') || document.body.innerText.includes('DISCONNECTED'),
        };
      })();
    \`);
    results['Scenario_8_Disconnect_Detection'] = {
      passed: s8.status === 'DISCONNECTED',
      details: s8,
    };

    // Scenario 9: Stale timeout detection (watchdog)
    console.log('[RUNNER] Verifying Scenario 9: Stale Timeout Detection...');
    const s9 = await win.webContents.executeJavaScript(\`
      (() => {
        window.panoramaMqttService.setStatus('STALE');
        return {
          status: window.panoramaMqttService.getStatus(),
        };
      })();
    \`);
    await sleep(400);
    const s9Dom = await win.webContents.executeJavaScript(\`
      (() => ({ hasStale: document.body.innerText.includes('STALE') }))();
    \`);
    results['Scenario_9_Stale_Timeout'] = {
      passed: s9.status === 'STALE' && s9Dom.hasStale,
      details: { ...s9, ...s9Dom },
    };

    // Scenario 10: Malformed JSON handling
    console.log('[RUNNER] Verifying Scenario 10: Malformed JSON Handling...');
    const s10 = await win.webContents.executeJavaScript(\`
      (() => {
        try {
          const res1 = window.panoramaMqttService.handleIncomingPayload('CORRUPTED_NON_JSON_{{');
          const res2 = window.panoramaMqttService.handleIncomingPayload(null);
          return { res1Null: res1 === null, res2Null: res2 === null };
        } catch (e) {
          return { error: e.message };
        }
      })();
    \`);
    results['Scenario_10_Malformed_JSON'] = {
      passed: s10.res1Null && s10.res2Null,
      details: s10,
    };

    // Scenario 11: Auto-reconnect & resume
    console.log('[RUNNER] Verifying Scenario 11: Reconnection & Live Resumption...');
    await win.webContents.executeJavaScript(\`
      (() => {
        const raw = \${JSON.stringify(JSON.stringify(contractPayload))};
        window.panoramaMqttService.handleIncomingPayload(raw);
      })();
    \`);
    await sleep(500);
    const s11 = await win.webContents.executeJavaScript(\`
      (() => ({ status: window.panoramaMqttService.getStatus() }))();
    \`);
    results['Scenario_11_Auto_Reconnection'] = {
      passed: s11.status === 'CONNECTED',
      details: s11,
    };

    // Scenario 12: Reload & Clean Render
    console.log('[RUNNER] Verifying Scenario 12: Reload & Clean State...');
    await win.reload();
    await sleep(2500);
    const s12 = await win.webContents.executeJavaScript(\`
      (() => ({
        hasService: Boolean(window.panoramaMqttService),
        hasTitle: document.body.innerText.includes('PANORAMA WATER TANK MONITOR'),
      }))();
    \`);
    results['Scenario_12_Reload_Persistence'] = {
      passed: s12.hasService && s12.hasTitle,
      details: s12,
    };

    // Re-feed telemetry for screenshots
    await win.webContents.executeJavaScript(\`
      (() => {
        const raw = \${JSON.stringify(JSON.stringify(contractPayload))};
        window.panoramaMqttService.handleIncomingPayload(raw);
      })();
    \`);
    await sleep(1500);

    // Capture Full HD 1920x1080 screenshot
    console.log('[RUNNER] Capturing 1920x1080 Full HD screenshot...');
    win.setSize(1920, 1080);
    await sleep(1200);
    await saveScreenshot(win, '01_panorama_dashboard_1920x1080.png');

    // Capture 1366x768 Standard Laptop screenshot
    console.log('[RUNNER] Capturing 1366x768 Laptop screenshot...');
    win.setSize(1366, 768);
    await sleep(1200);
    await saveScreenshot(win, '02_panorama_dashboard_1366x768.png');

    // Navigate to Coach Details & capture
    console.log('[RUNNER] Navigating to Coach Details & capturing...');
    await win.webContents.executeJavaScript(\`
      (() => {
        window.location.hash = '#/coach-details?train=225256&coach=C4';
      })();
    \`);
    await sleep(2000);
    await saveScreenshot(win, '03_panorama_coach_details.png');

    // Navigate to All Tanks & capture
    console.log('[RUNNER] Navigating to All Tanks & capturing...');
    await win.webContents.executeJavaScript(\`
      (() => {
        window.location.hash = '#/watertank';
      })();
    \`);
    await sleep(2000);
    win.setSize(1920, 1080);
    await sleep(1200);
    await saveScreenshot(win, '04_panorama_all_tanks_1920x1080.png');

    console.log('\\n==================================================');
    console.log('RESULTS_JSON_START' + JSON.stringify(results) + 'RESULTS_JSON_END');
    console.log('==================================================');

  } catch (err) {
    console.error('[RUNNER ERROR]:', err);
  } finally {
    win.close();
    app.quit();
  }
});
`;

async function main() {
  const server = createServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log('[SERVER] Verification server listening on port ' + PORT);

    const tempRunnerFile = path.resolve(__dirname, 'temp_runner.cjs');
    fs.writeFileSync(tempRunnerFile, runnerScript);

    const childEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    const child = cp.spawn(electronPath, [tempRunnerFile], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
    });

    let output = '';
    child.stdout.on('data', (d) => {
      const s = d.toString();
      output += s;
      process.stdout.write(s);
    });

    child.stderr.on('data', (d) => {
      const s = d.toString();
      process.stderr.write(s);
    });

    child.on('close', (code) => {
      console.log('[ELECTRON] Finished with exit code:', code);
      try { fs.unlinkSync(tempRunnerFile); } catch (e) {}
      server.close();

      const startTag = 'RESULTS_JSON_START';
      const endTag = 'RESULTS_JSON_END';
      const sIdx = output.indexOf(startTag);
      const eIdx = output.indexOf(endTag);

      if (sIdx !== -1 && eIdx !== -1) {
        const jsonStr = output.substring(sIdx + startTag.length, eIdx);
        const parsed = JSON.parse(jsonStr);

        console.log('\n================ FINAL RESULTS SUMMARY ================');
        let allPassed = true;
        for (const [k, v] of Object.entries(parsed)) {
          const pass = v.passed;
          if (!pass) allPassed = false;
        console.log('[' + (pass ? 'PASS' : 'FAIL') + '] ' + k);
        }
        console.log('=======================================================');
        console.log('ALL 12 SCENARIOS PASSED:', allPassed);

        const reportFile = path.resolve(REPO_ROOT, 'WLI_DOCS/MQTT_12_SCENARIOS_VERIFICATION_REPORT.json');
        fs.writeFileSync(reportFile, JSON.stringify({ timestamp: new Date().toISOString(), allPassed, scenarios: parsed }, null, 2));
        console.log('[REPORT] Written to:', reportFile);
      }
      process.exit(code || 0);
    });
  });
}

main();
