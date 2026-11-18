const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require(path.resolve('PanoramaWaterTank_NextGen/node_modules/playwright'));

const HTTPS_SERVER_DIR = path.resolve('PanoramaWaterTank_NextGen/HTTPS_Server');
const PYTHON_EXE = path.resolve(HTTPS_SERVER_DIR, '.venv/Scripts/python.exe');
const SCREENSHOTS_DIR = path.resolve('PanoramaWaterTank_NextGen/screenshots');
const ARTIFACTS_DIR = path.resolve('C:/Users/User/.gemini/antigravity/brain/68ab95fd-172f-4f69-b69d-846a6b611df0');

const PORT = 8765;
const TEST_TOKEN = 'verify_ui_token_2026';

const VIEWPORTS = [
  { name: 'Desktop_1920x1080', width: 1920, height: 1080 },
  { name: 'Desktop_1600x900', width: 1600, height: 900 },
  { name: 'Desktop_1440x900', width: 1440, height: 900 },
  { name: 'Desktop_1366x768', width: 1366, height: 768 },
  { name: 'Laptop_1280x720', width: 1280, height: 720 },
  { name: 'Laptop_1024x768', width: 1024, height: 768 },
  { name: 'Tablet_768x1024', width: 768, height: 1024 },
  { name: 'Mobile_430x932', width: 430, height: 932 },
  { name: 'Mobile_390x844', width: 390, height: 844 },
  { name: 'Mobile_360x800', width: 360, height: 800 },
  { name: 'SmallMobile_320x568', width: 320, height: 568 },
];

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Timed out waiting for local HTTPS_Server');
}

(async () => {
  const serverProc = spawn(
    PYTHON_EXE,
    ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(PORT)],
    {
      cwd: HTTPS_SERVER_DIR,
      env: { ...process.env, API_TOKEN: TEST_TOKEN, ENVIRONMENT: 'development' },
      stdio: 'ignore',
    }
  );

  const baseUrl = `http://127.0.0.1:${PORT}`;
  const pageErrors = [];

  try {
    await waitForServer(baseUrl);
    console.log(`[*] Local FastAPI HTTPS_Server running at ${baseUrl}`);

    const browsersToTest = [
      { name: 'Chrome', exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
      { name: 'Edge', exe: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
    ].filter((b) => fs.existsSync(b.exe));

    for (const bSpec of browsersToTest) {
      console.log(`\n=== Testing in ${bSpec.name} ===`);
      const browser = await chromium.launch({
        executablePath: bSpec.exe,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      try {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage();
        page.on('pageerror', (err) => pageErrors.push(`[${bSpec.name}] ${err.message}`));

        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);

        // Only run full viewport + zoom + screenshot sweep on primary Chrome; quick sanity check on Edge
        if (bSpec.name === 'Chrome') {
          // 1. Live functional test: Authenticate + Send POST telemetry -> verify live UI renders real data
          await page.locator('#auth-token-input').fill(TEST_TOKEN);
          await page.locator('#auth-token-apply-btn').click();
          await page.waitForTimeout(400);
          await page.locator('#manual-post-send-btn').click();
          await page.waitForTimeout(1000);

          const functionalCheck = await page.evaluate(() => ({
            appStatus: document.getElementById('app-status')?.textContent,
            waterCm: document.getElementById('metric-water-cm')?.textContent,
            waterPct: document.getElementById('metric-water-pct')?.textContent,
            varTableRows: document.querySelectorAll('#variable-table-body tr').length,
            historyRows: document.querySelectorAll('#history-table-body tr').length,
            postStatus: document.getElementById('manual-post-result-status')?.textContent,
            containerWidthAt1920: Math.round(document.querySelector('.container')?.getBoundingClientRect().width || 0),
          }));
          console.log('[1] LIVE FUNCTIONALITY & 1920px WIDTH:', JSON.stringify(functionalCheck));

          // 2. Display Zoom Controller test (70% -> 150% -> persist reload -> keyboard -> RESET)
          for (let i = 0; i < 5; i++) await page.locator('#zoom-in-btn').click();
          const at150 = await page.evaluate(() => ({
            display: document.getElementById('zoom-level-display')?.textContent,
            cssVar: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
            rootFontSize: getComputedStyle(document.documentElement).fontSize,
            inDisabled: document.getElementById('zoom-in-btn')?.disabled,
            noOverflowAt150: document.documentElement.scrollWidth <= window.innerWidth + 2,
          }));

          // Reload and confirm persistence
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForTimeout(400);
          const afterReload = await page.evaluate(() => ({
            persistedDisplay: document.getElementById('zoom-level-display')?.textContent,
            persistedCssVar: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
          }));

          // Reset to 100%
          await page.locator('#zoom-reset-btn').click();
          const afterReset = await page.evaluate(() => document.getElementById('zoom-level-display')?.textContent);

          // Zoom out to 70%
          for (let i = 0; i < 3; i++) await page.locator('#zoom-out-btn').click();
          const at70 = await page.evaluate(() => ({
            display: document.getElementById('zoom-level-display')?.textContent,
            outDisabled: document.getElementById('zoom-out-btn')?.disabled,
            rootFontSize: getComputedStyle(document.documentElement).fontSize,
          }));

          // Keyboard shortcuts Ctrl+= (80%) and Ctrl+0 (100%)
          await page.locator('body').click({ position: { x: 10, y: 10 } });
          await page.keyboard.press('Control+Equal');
          const afterCtrlPlus = await page.evaluate(() => document.getElementById('zoom-level-display')?.textContent);
          await page.keyboard.press('Control+0');
          const afterCtrlZero = await page.evaluate(() => document.getElementById('zoom-level-display')?.textContent);

          console.log('[2] ZOOM CONTROLLER CHECK:', JSON.stringify({ at150, afterReload, afterReset, at70, afterCtrlPlus, afterCtrlZero }));

          // Re-apply token so screenshots show populated telemetry cleanly
          await page.locator('#auth-token-input').fill(TEST_TOKEN);
          await page.locator('#auth-token-apply-btn').click();
          await page.waitForTimeout(600);

          // 3. Multi-viewport responsive check (all 11 sizes)
          fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
          fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
          const viewportResults = [];

          for (const vp of VIEWPORTS) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.waitForTimeout(200);
            const metrics = await page.evaluate(() => ({
              scrollWidth: document.documentElement.scrollWidth,
              innerWidth: window.innerWidth,
              containerWidth: Math.round(document.querySelector('.container')?.getBoundingClientRect().width || 0),
              noBodyOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
            }));
            viewportResults.push({ viewport: vp.name, ...metrics });

            if (['Desktop_1920x1080', 'Desktop_1366x768', 'Tablet_768x1024', 'Mobile_390x844'].includes(vp.name)) {
              const fileName = `https_lab_${vp.name.toLowerCase()}.png`;
              await page.screenshot({ path: path.join(SCREENSHOTS_DIR, fileName), fullPage: false });
              await page.screenshot({ path: path.join(ARTIFACTS_DIR, fileName), fullPage: false });
            }
          }
          console.log('[3] RESPONSIVE MATRIX (11 VIEWPORTS):');
          viewportResults.forEach((r) => console.log('   ', JSON.stringify(r)));
        } else {
          // Edge verification
          await page.locator('#zoom-in-btn').click();
          const edgeRes = await page.evaluate(() => ({
            status: document.getElementById('app-status')?.textContent,
            zoom: document.getElementById('zoom-level-display')?.textContent,
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
          }));
          console.log('[EDGE CHECK]:', JSON.stringify(edgeRes));
        }
      } finally {
        await browser.close();
      }
    }

    console.log('\n[4] TOTAL UNCAUGHT PAGE ERRORS:', pageErrors.length);
    if (pageErrors.length > 0) {
      pageErrors.forEach((e) => console.error('   ERR:', e));
      process.exitCode = 1;
    }
  } finally {
    serverProc.kill();
  }
})();
