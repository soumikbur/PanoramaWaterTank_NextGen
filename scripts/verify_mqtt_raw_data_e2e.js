const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require(path.resolve('PanoramaWaterTank_NextGen/node_modules/playwright'));

const DIST_DIR = path.resolve('PanoramaWaterTank_NextGen/dist');
const ARTIFACTS_DIR = 'C:/Users/User/.gemini/antigravity/brain/68ab95fd-172f-4f69-b69d-846a6b611df0';
const PORT = 8770;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const clean = req.url.split('?')[0];
  let filePath = path.join(DIST_DIR, clean === '/' ? 'index.html' : clean);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const consoleWarnings = [];
    const pageErrors = [];
    const wsEvents = [];

    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
      if (m.type() === 'warning') consoleWarnings.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('websocket', (ws) => {
      wsEvents.push({ event: 'created', url: ws.url() });
      ws.on('close', () => wsEvents.push({ event: 'closed', url: ws.url() }));
    });

    await page.goto(`http://127.0.0.1:${PORT}/#/raw-data`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5500);

    // Wait for HiveMQ live MQTT connection
    const connBefore = await page.evaluate(() => ({
      status: window.panoramaMqttService?.getStatus?.(),
      topic: window.panoramaMqttService?.getTopic?.(),
    }));
    console.log('1. INITIAL LIVE HIVEMQ CONNECTION:', JSON.stringify(connBefore));

    // Publish all 6 payload types over REAL HiveMQ MQTT (and inject binary/empty edge cases through classifier)
    const testResults = await page.evaluate(async () => {
      const svc = window.panoramaMqttService;
      const topic = '002F00654B42501320353332';

      // Test 1: Plain text 'hello' published live to HiveMQ
      svc.publish(topic, 'hello', false, 0);

      // Test 2: Valid JSON Object published live to HiveMQ
      svc.publish(topic, {
        device_id: 'WLI_TEST_01',
        water_level_cm: 125.5,
        water_level_percentage: 75,
        battery_voltage: 12.6,
        sensor_status: 'NORMAL',
      }, false, 0);

      // Test 3: Valid JSON Array published live to HiveMQ
      svc.publish(topic, [
        { device_id: 'WLI_TEST_01', water_level_cm: 100 },
        { device_id: 'WLI_TEST_02', water_level_cm: 150 },
      ], false, 0);

      // Test 4: Empty payload published live to HiveMQ
      svc.publish(topic, '', false, 0);

      // Test 5: Malformed JSON-like payload published live to HiveMQ
      svc.publish(topic, '{ "broken": ', false, 0);

      // Test 6: Binary non-UTF-8 payload via injectMessage (Paho publish encodes UTF-8 strings)
      svc.injectMessage(topic, new Uint8Array([0x00, 0xfe, 0xff, 0x10, 0xaa, 0xbb]), 0, false);

      return { publishedAll: true };
    });

    await page.waitForTimeout(2500);

    const renderedState = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const frames = window.panoramaMqttService?.getRawMessages?.() || [];
      const typesSeen = Array.from(new Set(frames.map((f) => f.payloadType)));
      return {
        frameCount: frames.length,
        typesSeen,
        hasHelloText: bodyText.includes('hello'),
        hasJsonObj: bodyText.includes('WLI_TEST_01') && bodyText.includes('125.5'),
        hasJsonArr: bodyText.includes('WLI_TEST_02'),
        hasEmptyLabel: bodyText.includes('(empty payload)'),
        hasBinaryBadge: bodyText.includes('BINARY'),
        hasInvalidBadge: bodyText.includes('INVALID'),
        hasTextBadge: bodyText.includes('TEXT'),
        hasJsonBadge: bodyText.includes('JSON'),
      };
    });
    console.log('2. PAYLOAD CLASSIFICATION & RENDERING:', JSON.stringify(renderedState));

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'raw_data_mqtt_fixed_local.png'), fullPage: false });

    // Test 7: Simulate unexpected broker disconnection -> verify DISCONNECTED -> auto-reconnect -> subscription restored
    await page.evaluate(() => {
      const svc = window.panoramaMqttService;
      // Trigger unexpected onConnectionLost on current Paho client (errorCode 8 = socket closed)
      if (svc && svc.client && typeof svc.client.onConnectionLost === 'function') {
        svc.client.onConnectionLost({ errorCode: 8, errorMessage: 'AMQJS0008I Socket closed.' });
      }
    });
    await page.waitForTimeout(200);
    const afterDrop = await page.evaluate(() => window.panoramaMqttService?.getStatus?.());

    // Wait 3.5s for exponential backoff reconnect (1s) + HiveMQ handshake + subscription restore
    await page.waitForTimeout(3800);
    const afterReconnect = await page.evaluate(() => ({
      status: window.panoramaMqttService?.getStatus?.(),
      subscribedTopics: window.panoramaMqttService?.getSubscribedTopics?.(),
      isSubscribed: window.panoramaMqttService?.isTopicSubscribed?.(),
    }));

    // Publish post-reconnect message to verify live delivery resumed
    await page.evaluate(() => {
      window.panoramaMqttService?.publish('002F00654B42501320353332', 'post-reconnect-ok', false, 0);
    });
    await page.waitForTimeout(1500);
    const postReconnectDelivered = await page.evaluate(() => document.body.innerText.includes('post-reconnect-ok'));

    // Test 8: Intentional disconnect must NOT auto-reconnect
    await page.evaluate(() => window.panoramaMqttService?.disconnect?.());
    await page.waitForTimeout(2200);
    const afterIntentionalDisconnect = await page.evaluate(() => window.panoramaMqttService?.getStatus?.());

    console.log('3. RECONNECTION & LIFECYCLE:', JSON.stringify({
      afterDrop,
      afterReconnect,
      postReconnectDelivered,
      afterIntentionalDisconnect,
    }));
    console.log('4. WS EVENTS:', JSON.stringify(wsEvents));
    console.log('5. CONSOLE ERRORS:', consoleErrors.length, JSON.stringify(consoleErrors));
    console.log('6. CONSOLE WARNINGS:', consoleWarnings.length, JSON.stringify(consoleWarnings));
    console.log('7. PAGE ERRORS:', pageErrors.length, JSON.stringify(pageErrors));
  } finally {
    await browser.close();
    server.close();
  }
})();
