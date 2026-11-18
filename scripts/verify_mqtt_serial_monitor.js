const path = require('path');
const http = require('http');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require(path.resolve('PanoramaWaterTank_NextGen/node_modules/playwright'));

const DIST_DIR = path.resolve('PanoramaWaterTank_NextGen/dist');
const SCREENSHOTS_DIR = path.resolve('PanoramaWaterTank_NextGen/screenshots');
const ARTIFACTS_DIR = path.resolve('C:/Users/User/.gemini/antigravity/brain/68ab95fd-172f-4f69-b69d-846a6b611df0');
const PYTHON_EXE = path.resolve('PanoramaWaterTank_NextGen/backend/venv/Scripts/python.exe');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
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
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

function publishViaExternalBroker(topic, payloadStr) {
  const pyCode = `
import paho.mqtt.publish as publish
publish.single(${JSON.stringify(topic)}, payload=${JSON.stringify(payloadStr)}, hostname="broker.hivemq.com", port=1883, qos=1)
`;
  execFileSync(PYTHON_EXE, ['-c', pyCode], { timeout: 15000 });
}

(async () => {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const pageErrors = [];
  const tempTopic = `panorama_serial_test_${Date.now()}`;

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const adminUser = {
        id: 'admin-demo-001',
        username: '@admin',
        full_name: 'Chief Rolling Stock Engineer',
        role: 'ADMIN',
        account_status: 'ACTIVE',
        is_active: true,
      };
      localStorage.setItem('panorama_demo_user', JSON.stringify(adminUser));
      localStorage.setItem('panorama_user', JSON.stringify(adminUser));
      localStorage.setItem('panorama_user_role', 'ADMIN');
      localStorage.setItem('panorama_auth_token', 'local-verify');
    });

    await page.goto(`${url}#/raw-data`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    if ((await page.locator('text=RAW MQTT SERIAL MONITOR').count()) === 0) {
      await page.locator('input[type="text"]').first().fill('@admin');
      await page.locator('input[type="password"]').first().fill('Admin@123');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(2000);
      await page.goto(`${url}#/raw-data`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
    }

    // Wait up to 15s for live HiveMQ WSS connection
    let connectedLive = false;
    for (let i = 0; i < 30; i++) {
      const info = await page.evaluate(() => window.panoramaMqttService?.getBrokerInfo?.());
      if (info && info.status === 'CONNECTED') {
        connectedLive = true;
        break;
      }
      await page.waitForTimeout(500);
    }

    const layoutCheck = await page.evaluate(() => {
      const txt = document.body.innerText;
      const streamEl = document.querySelector('.mqtt-serial-stream');
      const streamRect = streamEl ? streamEl.getBoundingClientRect() : null;
      const mainRect = document.querySelector('main')?.getBoundingClientRect();
      return {
        hasMonitorTitle: txt.includes('RAW MQTT SERIAL MONITOR'),
        hasDefaultTopic: txt.includes('002F00654B42501320353332'),
        hasNoHardwarePanels: !txt.includes('ADS1115') && !txt.includes('BME280') && !txt.includes('FreeRTOS') && !txt.includes('COMMUNICATION ARCHITECTURE'),
        terminalHeightPx: streamRect ? Math.round(streamRect.height) : 0,
        terminalPercent: streamRect && mainRect ? Number(((streamRect.height / mainRect.height) * 100).toFixed(1)) : 0,
      };
    });
    console.log('[1] DEFAULT TOPIC & LAYOUT CHECK:', JSON.stringify({ connectedLive, ...layoutCheck }));

    // Subscribe to isolated live test topic on broker.hivemq.com via UI input + SUBSCRIBE button
    const topicInput = page.locator('input[placeholder="Enter MQTT topic..."]');
    await topicInput.fill(tempTopic);
    await page.getByRole('button', { name: 'SUBSCRIBE', exact: true }).click();
    await page.waitForTimeout(3500);

    // Publish real JSON via external Python paho-mqtt client to broker.hivemq.com:1883 -> browser receives over WSS:8884!
    publishViaExternalBroker(
      tempTopic,
      JSON.stringify({
        device_uid: '002F00654B42501320353332',
        timestamp: '2026-11-18T13:26:00Z',
        cm1: 94.2,
        wlp1: 62.8,
        rawVoltage: 3.012,
        temp: 27.1,
        sensorStatus: 1,
      })
    );

    // Publish real invalid JSON (plain text) via external Python paho-mqtt client
    publishViaExternalBroker(tempTopic, 'RAW_PLAIN_TEXT_HEARTBEAT_OK');

    for (let i = 0; i < 20; i++) {
      const done = await page.evaluate(() => {
        const t = document.body.innerText;
        return t.includes('94.2') && t.includes('RAW_PLAIN_TEXT_HEARTBEAT_OK');
      });
      if (done) break;
      await page.waitForTimeout(300);
    }

    const liveReceiveCheck = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        validJsonReceivedOverBroker: t.includes('"device_uid"') && t.includes('94.2') && t.includes('3.012'),
        invalidJsonReceivedOverBroker: t.includes('RAW_PLAIN_TEXT_HEARTBEAT_OK') && t.includes('PLAIN TEXT'),
        deviceTimestampShown: t.includes('2026-11-18T13:26:00Z'),
      };
    });
    console.log('[2] LIVE EXTERNAL BROKER JSON + PLAIN TEXT CHECK:', JSON.stringify(liveReceiveCheck));

    // Capture crisp screenshot of JSON + Plain Text live messages
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'mqtt_serial_monitor_json_live.png') });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mqtt_serial_monitor_json_live.png') });

    // Test Raw View / JSON View
    await page.locator('button:has-text("Raw View")').click();
    await page.waitForTimeout(150);
    const rawViewActive = await page.evaluate(() => document.body.innerText.includes('RAW VIEW'));
    await page.locator('button:has-text("JSON View")').click();
    await page.waitForTimeout(150);

    // Test Pause -> publish over real HiveMQ broker -> verify queued -> Resume -> verify displayed!
    await page.locator('button:has-text("Pause")').click();
    await page.waitForTimeout(200);
    publishViaExternalBroker(tempTopic, JSON.stringify({ event: 'BUFFERED_WHILE_PAUSED', seq: 99 }));
    for (let i = 0; i < 15; i++) {
      if (await page.evaluate(() => document.body.innerText.includes('PAUSED (+1)'))) break;
      await page.waitForTimeout(300);
    }
    const pauseCheck = await page.evaluate(() => ({
      hiddenWhilePaused: !document.body.innerText.includes('BUFFERED_WHILE_PAUSED'),
      queuedCounterShown: document.body.innerText.includes('PAUSED (+1)'),
      mqttStillConnected: document.body.innerText.includes('CONNECTED'),
    }));
    await page.locator('button:has-text("Resume")').click();
    await page.waitForTimeout(300);
    const appearedAfterResume = await page.evaluate(() => document.body.innerText.includes('BUFFERED_WHILE_PAUSED'));
    console.log('[3] LIVE PAUSE / RESUME QUEUING CHECK:', JSON.stringify({ rawViewActive, ...pauseCheck, appearedAfterResume }));

    // Test Download Logs
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Download Logs")').click(),
    ]);
    const dlJson = JSON.parse(fs.readFileSync(await download.path(), 'utf-8'));
    console.log('[4] DOWNLOAD LOGS CHECK:', JSON.stringify({ validJsonFile: Array.isArray(dlJson.messages), exportedCount: dlJson.exportedCount }));

    // Test Clear Console does NOT unsubscribe or disconnect
    await page.locator('button:has-text("Clear Console")').click();
    await page.waitForTimeout(200);
    const clearCheck = await page.evaluate(() => ({
      cleared: document.body.innerText.includes('Listening on MQTT topic'),
      stillSubscribed: document.body.innerText.includes('SUBSCRIBED') && !document.body.innerText.includes('UNSUBSCRIBED'),
      stillConnected: document.body.innerText.includes('CONNECTED'),
    }));
    console.log('[5] CLEAR CONSOLE CHECK:', JSON.stringify(clearCheck));

    // Restore default hardware UID subscription & test Mobile + Dashboard
    await topicInput.fill('002F00654B42501320353332');
    await page.getByRole('button', { name: 'SUBSCRIBE', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const mobileOk = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${url}#/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const dashboardOk = await page.evaluate(() => document.body.innerText.length > 100);
    console.log('[6] RESPONSIVE & OTHER PAGES CHECK:', JSON.stringify({ mobileOk, dashboardOk, pageErrors: pageErrors.length }));

    if (pageErrors.length > 0) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
