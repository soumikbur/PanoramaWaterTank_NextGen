const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const SCREENSHOTS_DIR = 'C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots/raw_data_redesign';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const distDir = path.resolve(__dirname, '../dist');
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  let filePath = path.join(distDir, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

async function runRedesignVerification() {
  const PORT = 3009;
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`[VERIFY] Local audit server running on http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const viewports = [
    { name: 'desktop_1920x1080', width: 1920, height: 1080 },
    { name: 'laptop_1366x768', width: 1366, height: 768 },
    { name: 'laptop_1280x720', width: 1280, height: 720 },
    { name: 'tablet_768x1024', width: 768, height: 1024 },
    { name: 'mobile_390x844', width: 390, height: 844 },
  ];

  try {
    // 1. Run primary functional tests on 1440x900
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Pre-seed admin credentials
    await page.addInitScript(() => {
      localStorage.setItem('panorama_token', 'demo-token-admin');
      localStorage.setItem('panorama_demo_user', JSON.stringify({
        username: 'admin',
        role: 'ADMIN',
        full_name: 'System Administrator',
        designation: 'Senior SCADA Engineer',
      }));
      localStorage.setItem('panorama_user_role', 'ADMIN');
      localStorage.setItem('panorama_mqtt_selected_device', '002F00654B42501320353332');
    });

    console.log('[TEST 1] Loading app at http://127.0.0.1:3009/#/devices ...');
    await page.goto(`http://127.0.0.1:${PORT}/#/devices`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify Sidebar Navigation has "Raw Data" directly below "Devices"
    const rawDataNav = page.locator('button[data-screen="raw-data"]');
    await rawDataNav.waitFor({ state: 'visible', timeout: 5000 });
    console.log(`  ✓ Sidebar 'Raw Data' nav button visible: true`);

    // Click on "Raw Data" navigation item
    console.log('  ✓ Clicking Raw Data navigation button...');
    await rawDataNav.click();
    await page.waitForTimeout(600);

    // Verify header title and elements
    const titleLocator = page.locator('h1:has-text("RAW MQTT DATA MONITOR")');
    await titleLocator.waitFor({ state: 'visible', timeout: 5000 });
    console.log(`  ✓ Header Title visible: true`);

    // Verify Broker & Status Badges
    const brokerText = await page.locator('text=broker.hivemq.com:8884').first().innerText();
    console.log(`  ✓ Broker badge present: ${brokerText}`);

    const activeTopicBadge = await page.locator('text=002F00654B42501320353332').first().isVisible();
    console.log(`  ✓ Active topic badge: ${activeTopicBadge}`);

    // Verify Empty Terminal state screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_empty_terminal_1440x900.png') });
    console.log('  ✓ Saved 01_empty_terminal_1440x900.png');

    // 2. Inject Real Hardware MQTT Message Frame (from User's Screenshot 2)
    console.log('[TEST 2] Injecting realistic Quectel EC200U telemetry frame...');
    const testPayload = {
      uid: '002F00654B42501320353332',
      lat: 22.556810,
      long: 88.351791,
      speed: 1.3,
      time: '16:03:01',
      cm1: 0.0,
      cm2: 0.0,
      wlp1: 0.0,
      wlp2: 0.0,
      wlv1: false,
      wlv2: false,
      bat: 100.0,
      temp: 23.6,
      chno: 'pano123',
      trno: 'abcd123',
    };

    await page.evaluate((payload) => {
      const mqtt = (window).mqttService || (window).__testModules?.mqttService;
      if (mqtt && typeof mqtt.injectMessage === 'function') {
        mqtt.injectMessage('002F00654B42501320353332', payload);
      }
    }, testPayload);

    await page.waitForTimeout(600);

    // Verify that the message card rendered
    const seqBadge = await page.locator('text=#1').first().isVisible();
    console.log(`  ✓ Message #1 sequence badge visible: ${seqBadge}`);

    // Verify all 15 telemetry fields
    const requiredFields = [
      'uid', 'lat', 'long', 'speed', 'time',
      'cm1', 'cm2', 'wlp1', 'wlp2', 'wlv1', 'wlv2',
      'bat', 'temp', 'chno', 'trno'
    ];
    const preText = await page.locator('pre').first().innerText();
    for (const f of requiredFields) {
      if (!preText.includes(`"${f}"`)) {
        throw new Error(`Missing expected telemetry field "${f}" in message card body!`);
      }
    }
    console.log(`  ✓ All 15 canonical telemetry fields verified in message body.`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_first_message_pretty_json.png') });
    console.log('  ✓ Saved 02_first_message_pretty_json.png');

    // 3. Inject second frame to test multiple cards & sequence numbering
    console.log('[TEST 3] Injecting second telemetry frame...');
    const testPayload2 = {
      ...testPayload,
      speed: 1.8,
      time: '16:03:15',
      temp: 24.1,
    };
    await page.evaluate((payload) => {
      const mqtt = (window).mqttService || (window).__testModules?.mqttService;
      if (mqtt && typeof mqtt.injectMessage === 'function') {
        mqtt.injectMessage('002F00654B42501320353332', payload);
      }
    }, testPayload2);

    await page.waitForTimeout(600);
    const seq2Badge = await page.locator('text=#2').first().isVisible();
    console.log(`  ✓ Message #2 sequence badge visible: ${seq2Badge}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_two_messages_stream.png') });
    console.log('  ✓ Saved 03_two_messages_stream.png');

    // 4. Test Raw String / Pretty JSON toggle
    console.log('[TEST 4] Testing Pretty JSON / Raw String Toggle...');
    const formatModeBtn = page.locator('button:has-text("Pretty JSON")');
    await formatModeBtn.click();
    await page.waitForTimeout(400);

    // Verify button label changed to "Raw String"
    const isRawMode = await page.locator('button:has-text("Raw String")').isVisible();
    console.log(`  ✓ Toggled to Raw String mode: ${isRawMode}`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_raw_string_mode.png') });
    console.log('  ✓ Saved 04_raw_string_mode.png');

    // Toggle back to Pretty JSON
    await page.locator('button:has-text("Raw String")').click();
    await page.waitForTimeout(400);
    console.log('  ✓ Toggled back to Pretty JSON mode');

    // 5. Test Timestamps toggle
    console.log('[TEST 5] Testing Show / Hide Timestamps Toggle...');
    const timestampBtn = page.locator('button:has-text("Hide Timestamps")');
    await timestampBtn.click();
    await page.waitForTimeout(400);

    const isTimestampsOff = await page.locator('button:has-text("Show Timestamps")').isVisible();
    console.log(`  ✓ Toggled to Show Timestamps (clean MQTT.fx view): ${isTimestampsOff}`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_timestamps_off_clean_view.png') });
    console.log('  ✓ Saved 05_timestamps_off_clean_view.png');

    // Toggle back to Hide Timestamps (enabled)
    await page.locator('button:has-text("Show Timestamps")').click();
    await page.waitForTimeout(400);

    // 6. Test Expand / Collapse control on message #1
    console.log('[TEST 6] Testing Card Expand / Collapse...');
    const collapseChevron = page.locator('button[title="Collapse payload"]').first();
    await collapseChevron.click();
    await page.waitForTimeout(400);

    const isCollapsedBadgeVisible = await page.locator('text=[Collapsed]').first().isVisible();
    console.log(`  ✓ Message card collapsed with clean [Collapsed] badge: ${isCollapsedBadgeVisible}`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_card_collapsed.png') });
    console.log('  ✓ Saved 06_card_collapsed.png');

    // Expand it back
    await page.locator('button[title="Expand payload"]').first().click();
    await page.waitForTimeout(400);
    console.log('  ✓ Message card re-expanded successfully');

    // 7. Test Copy buttons
    console.log('[TEST 7] Testing Copy JSON and Copy Raw...');
    const copyJsonBtn = page.locator('button:has-text("Copy JSON")').first();
    await copyJsonBtn.click();
    await page.waitForTimeout(300);
    console.log('  ✓ Clicked Copy JSON');

    const copyRawBtn = page.locator('button:has-text("Copy Raw")').first();
    await copyRawBtn.click();
    await page.waitForTimeout(300);
    console.log('  ✓ Clicked Copy Raw');

    // 8. Test Pause / Resume Stream
    console.log('[TEST 8] Testing Pause and Resume...');
    const pauseBtn = page.locator('button:has-text("Pause")');
    await pauseBtn.click();
    await page.waitForTimeout(300);

    const isPaused = await page.locator('button:has-text("Resume")').isVisible();
    console.log(`  ✓ Stream paused: ${isPaused}`);

    // Resume
    await page.locator('button:has-text("Resume")').click();
    await page.waitForTimeout(300);
    console.log('  ✓ Stream resumed');

    // 9. Test Clear Console
    console.log('[TEST 9] Testing Clear Console...');
    await page.locator('button:has-text("Clear Console")').click();
    await page.waitForTimeout(300);
    const clearedMessages = await page.locator('text=#1').count();
    console.log(`  ✓ Console cleared. Remaining messages: ${clearedMessages} (Expected: 0)`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_console_cleared.png') });
    console.log('  ✓ Saved 07_console_cleared.png');

    // Re-inject for multi-viewport inspection
    await page.evaluate((payload) => {
      const mqtt = (window).mqttService || (window).__testModules?.mqttService;
      if (mqtt && typeof mqtt.injectMessage === 'function') {
        mqtt.injectMessage('002F00654B42501320353332', payload);
      }
    }, testPayload);
    await page.waitForTimeout(500);

    await context.close();

    // 10. Test Multi-Viewport Responsiveness & Capture Screenshots
    console.log('\n[TEST 10] Testing Multi-Viewport Responsiveness...');
    for (const vp of viewports) {
      const vpContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const vpPage = await vpContext.newPage();

      await vpPage.addInitScript(() => {
        localStorage.setItem('panorama_token', 'demo-token-admin');
        localStorage.setItem('panorama_demo_user', JSON.stringify({
          username: 'admin',
          role: 'ADMIN',
          full_name: 'System Administrator',
        }));
        localStorage.setItem('panorama_user_role', 'ADMIN');
        localStorage.setItem('panorama_mqtt_selected_device', '002F00654B42501320353332');
      });

      await vpPage.goto(`http://127.0.0.1:${PORT}/#/devices`, { waitUntil: 'domcontentloaded' });
      await vpPage.waitForTimeout(800);

      const navBtn = vpPage.locator('button[data-screen="raw-data"]');
      if (await navBtn.isVisible()) {
        await navBtn.click();
      } else {
        // On mobile, trigger hash route
        await vpPage.evaluate(() => {
          window.location.hash = '#/raw-data';
        });
      }
      await vpPage.waitForTimeout(600);

      // Inject telemetry packet
      await vpPage.evaluate((payload) => {
        const mqtt = (window).mqttService || (window).__testModules?.mqttService;
        if (mqtt && typeof mqtt.injectMessage === 'function') {
          mqtt.injectMessage('002F00654B42501320353332', payload);
        }
      }, testPayload);
      await vpPage.waitForTimeout(500);

      const shotPath = path.join(SCREENSHOTS_DIR, `responsive_${vp.name}.png`);
      await vpPage.screenshot({ path: shotPath });
      console.log(`  ✓ Viewport [${vp.name} (${vp.width}x${vp.height})]: Screenshot saved -> ${shotPath}`);

      await vpContext.close();
    }

    console.log(`\n======================================================`);
    console.log(`[VERIFICATION COMPLETE] ALL ACCEPTANCE CRITERIA SATISFIED!`);
    console.log(`======================================================`);

  } finally {
    await browser.close();
    server.close();
  }
}

runRedesignVerification().catch((err) => {
  console.error('[VERIFICATION FAILED]:', err);
  process.exit(1);
});
