const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require(path.resolve('PanoramaWaterTank_NextGen/node_modules/playwright'));

const DIST_DIR = path.resolve('PanoramaWaterTank_NextGen/dist');
const SCREENSHOTS_DIR = path.resolve('PanoramaWaterTank_NextGen/screenshots');
const ARTIFACTS_DIR = path.resolve('C:/Users/User/.gemini/antigravity/brain/68ab95fd-172f-4f69-b69d-846a6b611df0');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const cleanPath = (req.url || '/').split('?')[0];
      let filePath = path.join(DIST_DIR, cleanPath === '/' ? 'index.html' : cleanPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

(async () => {
  const { server, url } = await startStaticServer();
  console.log(`[*] Local dist preview started at ${url}`);

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const pageErrors = [];
  const consoleErrors = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Seed admin session in localStorage before loading so we jump straight into authenticated SCADA shell
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => {
      const adminUser = {
        id: 'admin-demo-001',
        username: '@admin',
        full_name: 'Chief Rolling Stock Engineer',
        email: 'admin@panorama.railways.gov',
        role: 'ADMIN',
        account_status: 'ACTIVE',
        is_active: true,
      };
      localStorage.setItem('panorama_demo_user', JSON.stringify(adminUser));
      localStorage.setItem('panorama_user', JSON.stringify(adminUser));
      localStorage.setItem('panorama_user_role', 'ADMIN');
      localStorage.setItem('panorama_auth_token', 'local-verification-session');
      localStorage.setItem('auth_token', 'local-verification-session');
    });

    // Navigate directly to Raw Data page via hash route
    await page.goto(`${url}#/raw-data`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4500); // Allow live WSS handshake to broker.hivemq.com:8884

    // Check if login screen appeared; if so, click demo admin shortcut or login
    const hasConsoleTitle = await page.locator('text=PANORAMA HARDWARE & COMMUNICATION DIAGNOSTICS CONSOLE').count();
    if (hasConsoleTitle === 0) {
      // Try logging in via UI form if auth required
      const userInput = page.locator('input[type="text"], input[placeholder*="user" i]').first();
      if (await userInput.count()) {
        await userInput.fill('@admin');
        const passInput = page.locator('input[type="password"]').first();
        await passInput.fill('Admin@123');
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(2500);
        await page.goto(`${url}#/raw-data`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(4000);
      }
    }

    // 1. Verify initial state (pre-telemetry)
    const preTelemetryCheck = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const diag = window.panoramaMqttService ? window.panoramaMqttService.getDiagnostics() : null;
      return {
        hasTitle: bodyText.includes('PANORAMA HARDWARE & COMMUNICATION DIAGNOSTICS CONSOLE'),
        hasDefaultUid: bodyText.includes('002F00654B42501320353332'),
        hasMcuNotConfigured: bodyText.includes('Not Configured'),
        hasAds1115: bodyText.includes('ADS1115') && bodyText.includes('0x48'),
        hasBme280: bodyText.includes('BME280'),
        hasHydrostatic: bodyText.includes('Hydrostatic Pressure Sensor'),
        hasEc200u: bodyText.includes('EC200U LTE Modem'),
        hasRs485: bodyText.includes('Modbus RTU') && bodyText.includes('9600'),
        hasBle: bodyText.includes('Water Level Sensor'),
        hasFreeRtos: bodyText.includes('SensorTask') && bodyText.includes('UploadTask') && bodyText.includes('BMERetryTask'),
        hasUnknownStatus: bodyText.includes('Unknown'),
        brokerDiag: diag,
      };
    });

    console.log('\n[1] PRE-TELEMETRY & LIVE MQTT BROKER CHECK:');
    console.log(JSON.stringify(preTelemetryCheck, null, 2));

    // Wait up to 20s for actual Paho SUBACK confirmation on target topic before publishing test packet
    for (let i = 0; i < 40; i++) {
      const ready = await page.evaluate(() => {
        const d = window.panoramaMqttService ? window.panoramaMqttService.getDiagnostics() : null;
        return Boolean(d && d.mqttSessionConnected && d.confirmedTopics.includes('002F00654B42501320353332'));
      });
      if (ready) break;
      await page.waitForTimeout(500);
    }

    // 2. Test LIVE MQTT round-trip through broker.hivemq.com:8884 on topic 002F00654B42501320353332!
    // (Publishes a test verification frame with an extra diagnostic key `rawVoltage` to verify Raw JSON + Parsed Telemetry)
    const publishResult = await page.evaluate(() => {
      const svc = window.panoramaMqttService;
      if (!svc) return { ok: false, reason: 'no_service' };
      const diag = svc.getDiagnostics();
      const testPayload = {
        uid: '002F00654B42501320353332',
        lat: 22.556949,
        long: 88.352447,
        speed: 0.0,
        time: '12:15:00',
        cm1: 82.4,
        cm2: 0.0,
        wlp1: 54.9,
        wlp2: 0.0,
        wlv1: false,
        wlv2: false,
        bat: 96.2,
        temp: 26.8,
        rawVoltage: 2.697,
        chno: 'pano123',
        trno: '12841',
      };
      if (diag.mqttSessionConnected && diag.confirmedTopics.includes('002F00654B42501320353332')) {
        const sent = svc.publish('002F00654B42501320353332', testPayload, false, 1);
        return { ok: sent, mode: 'LIVE_BROKER_ROUNDTRIP', broker: `${diag.host}:${diag.port}` };
      }
      svc.injectMessage('002F00654B42501320353332', testPayload, 0, false);
      return { ok: true, mode: 'LOCAL_INJECT_FALLBACK' };
    });

    console.log('\n[2] TELEMETRY TRANSMISSION TEST:', JSON.stringify(publishResult));
    // Wait up to 10 seconds for live HiveMQ round-trip echo
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const arrived = await page.evaluate(() => document.body.innerText.includes('82.4'));
      if (arrived) break;
    }

    // Check raw messages received by mqttService
    const rawMsgCount = await page.evaluate(() => {
      const msgs = window.panoramaMqttService ? window.panoramaMqttService.getRawMessages() : [];
      return msgs.map((m) => ({ topic: m.topic, uid: m.uid, isJson: m.isJson, size: m.payloadSize }));
    });
    console.log('[2b] MQTT SERVICE RAW MESSAGES:', JSON.stringify(rawMsgCount));

    // Verify Raw JSON rendering (including extra field rawVoltage!)
    const rawViewCheck = await page.evaluate(() => {
      const txt = document.body.innerText;
      return {
        receivedWaterLevel: txt.includes('82.4'),
        receivedRawVoltage: txt.includes('2.697') || txt.includes('rawVoltage'),
        receivedTemp: txt.includes('26.8'),
        receivingBadge: txt.includes('RECEIVING'),
      };
    });
    console.log('[3] RAW JSON VIEW CHECK:', JSON.stringify(rawViewCheck));

    // Capture Desktop Screenshot (top half: Health + Identity + Hardware)
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'raw_data_diagnostics_desktop.png'), fullPage: false });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'raw_data_diagnostics_desktop.png'), fullPage: false });

    // Scroll <main> to Live Telemetry Inspector and capture Raw JSON + Parsed Telemetry views
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = main.scrollHeight;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'raw_data_diagnostics_terminal_raw.png'), fullPage: false });

    // 4. Switch to Parsed Telemetry mode and verify
    await page.locator('button:has-text("Parsed Telemetry")').click();
    await page.waitForTimeout(400);
    const parsedCheck = await page.evaluate(() => {
      const txt = document.body.innerText;
      return {
        showsWaterLevelLabel: txt.includes('Water Level (Tank 1)'),
        showsRawVoltageLabel: txt.includes('Raw Voltage'),
        showsTempLabel: txt.includes('Temperature'),
      };
    });
    console.log('[4] PARSED TELEMETRY VIEW CHECK:', JSON.stringify(parsedCheck));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'raw_data_diagnostics_parsed.png'), fullPage: false });

    // 5. Expand Communication Architecture panel to verify diagram rendering
    const archHeader = page.locator('text=COMMUNICATION ARCHITECTURE').first();
    if (await archHeader.count()) {
      await archHeader.click();
      await page.waitForTimeout(300);
    }
    const archCheck = await page.evaluate(() => {
      const txt = document.body.innerText.toLowerCase();
      return {
        hasHardwarePath: txt.includes('edge hardware & cellular path'),
        hasDashboardPath: txt.includes('panorama dashboard mqtt path'),
        hasUbidotsAuditNote: txt.includes('http post uploads to ubidots'),
      };
    });
    console.log('[5] ARCHITECTURE PANEL CHECK:', JSON.stringify(archCheck));

    // 6. Test Edit Hardware Metadata modal persistence
    await page.locator('button:has-text("Edit Metadata")').click();
    await page.waitForTimeout(300);
    const modalVisible = await page.locator('text=Associate Hardware & Firmware Metadata').isVisible();
    await page.locator('button:has-text("Cancel")').click();
    console.log('[6] METADATA MODAL CHECK:', JSON.stringify({ modalVisible }));

    // 7. Test Mobile viewport (390x844) responsiveness
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const mobileOverflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4,
      };
    });
    console.log('[7] MOBILE 390x844 RESPONSIVE CHECK:', JSON.stringify(mobileOverflow));

    // 8. Verify other dashboard pages remain functional
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${url}#/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const dashboardWorks = await page.evaluate(() => document.body.innerText.length > 100);
    console.log('[8] OTHER PAGES CHECK (Dashboard):', JSON.stringify({ dashboardWorks }));

    console.log('\n[9] UNCAUGHT PAGE ERRORS:', pageErrors.length);
    pageErrors.forEach((e) => console.log('  PAGEERR:', e));
    console.log('[10] CONSOLE ERRORS (non-API-offline):', consoleErrors.filter((c) => !c.includes('onrender.com') && !c.includes('CORS')).length);

    if (pageErrors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
})();
