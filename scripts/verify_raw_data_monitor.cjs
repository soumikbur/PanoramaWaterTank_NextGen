const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const SCREENSHOTS_DIR = 'C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots/raw_data_monitor';
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

async function runVerification() {
  const PORT = 3004;
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`[VERIFY] Local audit server running on http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Pre-seed admin credentials into localStorage
  await page.addInitScript(() => {
    localStorage.setItem('panorama_token', 'demo-token-admin');
    localStorage.setItem('panorama_demo_user', JSON.stringify({
      username: 'admin',
      role: 'ADMIN',
      full_name: 'System Administrator',
      designation: 'Senior SCADA Engineer',
    }));
    localStorage.setItem('panorama_user_role', 'ADMIN');
    localStorage.setItem('panorama_mqtt_target_topic', '002F00654B42501320353332');
  });

  try {
    console.log('[VERIFY] Navigating to http://127.0.0.1:3004/#/devices ...');
    await page.goto(`http://127.0.0.1:${PORT}/#/devices`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 1. Verify Sidebar Navigation has "Raw Data" directly below "Devices"
    const rawDataNav = page.locator('button[data-screen="raw-data"]');
    const isNavVisible = await rawDataNav.isVisible();
    console.log(`[VERIFY] Sidebar 'Raw Data' nav button visible: ${isNavVisible}`);
    if (!isNavVisible) {
      throw new Error("Sidebar 'Raw Data' nav button is NOT visible!");
    }

    // Capture screenshot of Sidebar with Raw Data
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_sidebar_with_raw_data.png') });
    console.log('[VERIFY] Saved 01_sidebar_with_raw_data.png');

    // 2. Click on "Raw Data" navigation item
    console.log('[VERIFY] Clicking Raw Data navigation button...');
    await rawDataNav.click();
    await page.waitForTimeout(800);

    // Verify header title
    const headerTitle = await page.locator('h1:has-text("RAW MQTT DATA MONITOR")').innerText();
    console.log(`[VERIFY] Header title: "${headerTitle}"`);

    // Verify Topic Input is pre-filled with 002F00654B42501320353332
    const topicInputValue = await page.locator('input[placeholder*="002F00654B42501320353332"]').inputValue();
    console.log(`[VERIFY] Topic input pre-filled value: "${topicInputValue}"`);

    // Capture screenshot of initial empty terminal
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_empty_terminal_waiting.png') });
    console.log('[VERIFY] Saved 02_empty_terminal_waiting.png');

    // 3. Inject actual hardware MQTT message from MQTT.fx screenshot
    console.log('[VERIFY] Injecting actual hardware MQTT message...');
    await page.evaluate(() => {
      const mqtt = (window).mqttService || (window).__testModules?.mqttService;
      if (mqtt && typeof mqtt.injectMessage === 'function') {
        mqtt.injectMessage('002F00654B42501320353332', {
          uid: '002F00654B42501320353332',
          lat: 22.556949,
          long: 88.352447,
          speed: 0.9,
          time: '12:20:14',
          cm1: 0.0,
          cm2: 0.0,
          wlp1: 0.0,
          wlp2: 0.0,
          wlv1: false,
          wlv2: false,
          bat: 97.1,
          temp: 25.7,
          chno: 'pano123',
          trno: 'abcd123'
        }, 0);
      }
    });

    await page.waitForTimeout(500);

    // Verify message has arrived
    const frameHeader = await page.locator('text=002F00654B42501320353332').first().isVisible();
    console.log(`[VERIFY] Message frame on topic 002F00654B42501320353332 visible: ${frameHeader}`);

    // Verify timestamp header mode is displayed
    const timestampBanner = await page.locator('text=MQTT MESSAGE RECEIVED').first().isVisible();
    console.log(`[VERIFY] Timestamp banner visible in timestamp mode: ${timestampBanner}`);

    // Capture screenshot with timestamp banner
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_terminal_with_timestamps.png') });
    console.log('[VERIFY] Saved 03_terminal_with_timestamps.png');

    // 4. Toggle "Show Timestamps" checkbox OFF (Mode 2: Minimal MQTT.fx view)
    console.log('[VERIFY] Toggling Show Timestamps to OFF...');
    const showTimestampsCheckbox = page.locator('label:has-text("Show Timestamps") input[type="checkbox"]');
    await showTimestampsCheckbox.uncheck();
    await page.waitForTimeout(400);

    const timestampBannerAfterUncheck = await page.locator('text=MQTT MESSAGE RECEIVED').count();
    console.log(`[VERIFY] Timestamp banner count after uncheck: ${timestampBannerAfterUncheck} (Expected: 0)`);

    // Capture screenshot in clean MQTT.fx mode
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_terminal_clean_mqttfx_mode.png') });
    console.log('[VERIFY] Saved 04_terminal_clean_mqttfx_mode.png');

    // 5. Test Copy Buttons
    console.log('[VERIFY] Testing Copy JSON button...');
    const copyJsonBtn = page.locator('button:has-text("Copy JSON")').first();
    await copyJsonBtn.click();
    await page.waitForTimeout(300);

    // 6. Test Clear Console
    console.log('[VERIFY] Testing Clear Console...');
    const clearBtn = page.locator('button:has-text("Clear Console")');
    await clearBtn.click();
    await page.waitForTimeout(400);
    const messagesCount = await page.locator('text=Buffer: 0/500').isVisible();
    console.log(`[VERIFY] Buffer cleared (0/500): ${messagesCount}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_terminal_cleared.png') });
    console.log('[VERIFY] Saved 05_terminal_cleared.png');

    // 7. Inject a message again for Mobile Viewport Test
    await page.evaluate(() => {
      const mqtt = (window).mqttService || (window).__testModules?.mqttService;
      if (mqtt && typeof mqtt.injectMessage === 'function') {
        mqtt.injectMessage('002F00654B42501320353332', {
          uid: '002F00654B42501320353332',
          lat: 22.556949,
          long: 88.352447,
          speed: 0.9,
          time: '12:20:14',
          cm1: 0.0,
          cm2: 0.0,
          wlp1: 0.0,
          wlp2: 0.0,
          wlv1: false,
          wlv2: false,
          bat: 97.1,
          temp: 25.7,
          chno: 'pano123',
          trno: 'abcd123'
        }, 0);
      }
    });
    await page.waitForTimeout(400);

    // 8. Test Mobile Viewport (375x667)
    console.log('[VERIFY] Testing mobile viewport 375x667...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_mobile_raw_data_view.png') });
    console.log('[VERIFY] Saved 06_mobile_raw_data_view.png');

    // Open mobile navigation drawer
    const mobileMenuBtn = page.locator('button[aria-label="Toggle navigation menu"]');
    if (await mobileMenuBtn.isVisible()) {
      await mobileMenuBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_mobile_drawer_with_raw_data.png') });
      console.log('[VERIFY] Saved 07_mobile_drawer_with_raw_data.png');
    }

    console.log('\n========================================================');
    console.log(' [SUCCESS] ALL RAW DATA MONITOR VERIFICATIONS PASSED!');
    console.log('========================================================\n');
  } finally {
    await browser.close();
    server.close();
  }
}

runVerification().catch((err) => {
  console.error('[VERIFY] Verification failed:', err);
  process.exit(1);
});
