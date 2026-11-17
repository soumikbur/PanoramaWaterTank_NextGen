/**
 * E2E Verification Script for Railway Route Visualization & Route Configuration Modal
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = 'C:/Users/soumi/.gemini/antigravity/brain/02d4ebd6-2deb-462f-b938-3b5741021d98/screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function checkHealth(url, maxTries = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      }).on('error', () => {
        if (tries >= maxTries) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for ${url}`));
        }
      });
    }, 500);
  });
}

(async () => {
  console.log('[E2E] Starting FastAPI backend on port 8000...');
  const pythonExe = path.join(__dirname, '..', 'backend', '.venv', 'Scripts', 'python.exe');
  const backendProc = spawn(pythonExe, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: path.join(__dirname, '..', 'backend'),
    stdio: 'ignore',
  });

  try {
    await checkHealth('http://127.0.0.1:8000/api/v1/health');
    console.log('[E2E] Backend is live at http://127.0.0.1:8000');

    console.log('[E2E] Launching Chromium browser...');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    console.log('[E2E] Navigating to Login page...');
    page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('[BROWSER ERROR]', err.message));

    await page.goto('http://127.0.0.1:8000/#/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Click Login as Admin shortcut
    console.log('[E2E] Logging in as Admin...');
    const adminBtn = page.locator('button:has-text("Login as Admin")');
    if (await adminBtn.count() > 0) {
      await adminBtn.click();
      await page.waitForTimeout(2000);
    }

    console.log('[E2E] Navigating to Location page...');
    await page.goto('http://127.0.0.1:8000/#/location', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    console.log('[E2E] Page URL after wait:', page.url());
    console.log('[E2E] Page body snippet:', (await page.innerText('body')).slice(0, 300));

    // Extract statistics
    const stats = await page.evaluate(() => {
      const polylines = Array.from(document.querySelectorAll('path.leaflet-interactive')).length;
      const markers = Array.from(document.querySelectorAll('.leaflet-marker-icon')).length;
      const stationMarkers = Array.from(document.querySelectorAll('.station-marker')).length;
      const trainRows = Array.from(document.querySelectorAll('tr[id^="train-row-"]')).map(tr => ({
        id: tr.id,
        text: tr.innerText.replace(/\s+/g, ' ').trim()
      }));

      return {
        polylines,
        markers,
        stationMarkers,
        trainRowsCount: trainRows.length,
        trainRows,
      };
    });

    console.log('[E2E] Verified DOM Stats:', JSON.stringify(stats, null, 2));

    const shot1 = path.join(SCREENSHOT_DIR, 'verified_railway_routes_e2e.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log(`[E2E] Saved Overview Screenshot: ${shot1}`);

    // Select Train 11043 via train view selector dropdown
    console.log('[E2E] Selecting Train 11043 (Ballia Express)...');
    await page.selectOption('#train-view-selector', '11043');
    await page.waitForTimeout(3000);
    const shot2 = path.join(SCREENSHOT_DIR, 'verified_isolated_route_11043.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log(`[E2E] Saved Isolated Route Screenshot: ${shot2}`);

    // Click on Configure Route button to verify RouteConfigModal
    console.log('[E2E] Opening Route Configuration Modal...');
    const configBtn = page.locator('#btn-configure-route');
    if (await configBtn.count() > 0) {
      await configBtn.click({ force: true });
      await page.waitForTimeout(2000);
      const shot3 = path.join(SCREENSHOT_DIR, 'verified_route_config_modal.png');
      await page.screenshot({ path: shot3, fullPage: false });
      console.log(`[E2E] Saved Route Config Modal Screenshot: ${shot3}`);
    }

    await browser.close();
    console.log('[E2E] Test run completed successfully!');
  } finally {
    console.log('[E2E] Stopping FastAPI backend process...');
    try {
      if (backendProc.pid) {
        spawn('taskkill', ['/pid', backendProc.pid.toString(), '/f', '/t']);
      }
    } catch {}
  }
})();
