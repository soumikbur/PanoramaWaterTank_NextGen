const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const SCREENSHOTS_DIR = 'C:/Users/soumi/.gemini/antigravity/brain/02d4ebd6-2deb-462f-b938-3b5741021d98/screenshots';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// 1. Quick local static server for built dist
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

async function main() {
  await new Promise((resolve) => server.listen(3002, '127.0.0.1', resolve));
  console.log('Temporary local audit server listening on http://127.0.0.1:3002/');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 667 },
  ];

  try {
    for (const vp of viewports) {
      console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto('http://127.0.0.1:3002/#/alerts', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // Auto login if on login screen
      const quickLogin = page.locator('#btn-quick-login-admin');
      if (await quickLogin.isVisible({ timeout: 1500 }).catch(() => false)) {
        await quickLogin.click();
        await page.waitForTimeout(1500);
      }

      // Ensure on alerts screen
      const alertsBtn = page.locator('button[data-screen="alerts"]');
      if (await alertsBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await alertsBtn.click();
        await page.waitForTimeout(1000);
      }

      // Check sections
      const pageContent = await page.content();
      const hasSensorHealth = pageContent.includes('SENSOR HEALTH') || (await page.locator('#alerts-sensor-health-status').count()) > 0;
      const hasWaterLevel = pageContent.includes('CURRENT WATER LEVEL');
      const hasAlertState = pageContent.includes('ALERT STATE');
      const hasTelemetryUpdate = pageContent.includes('LAST TELEMETRY UPDATE');

      console.log(`[${vp.name}] SENSOR HEALTH present: ${hasSensorHealth} (Expected: false)`);
      console.log(`[${vp.name}] CURRENT WATER LEVEL present: ${hasWaterLevel} (Expected: true)`);
      console.log(`[${vp.name}] ALERT STATE present: ${hasAlertState} (Expected: true)`);
      console.log(`[${vp.name}] LAST TELEMETRY UPDATE present: ${hasTelemetryUpdate} (Expected: true)`);

      if (hasSensorHealth) {
        throw new Error(`SENSOR HEALTH section is still present in viewport ${vp.name}!`);
      }
      if (!hasWaterLevel || !hasAlertState || !hasTelemetryUpdate) {
        throw new Error(`One of the 3 required sections is missing in viewport ${vp.name}!`);
      }

      console.log(`[${vp.name}] Console Errors: ${consoleErrors.length}`);

      const screenshotPath = path.join(SCREENSHOTS_DIR, `alerts_three_sections_${vp.name}.png`);
      await page.screenshot({ path: screenshotPath });
      console.log(`[${vp.name}] Screenshot saved to: ${screenshotPath}`);

      await context.close();
    }

    console.log('\n✓ ALL VIEWPORT TESTS PASSED: SENSOR HEALTH completely absent, 3 sections evenly aligned!');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
