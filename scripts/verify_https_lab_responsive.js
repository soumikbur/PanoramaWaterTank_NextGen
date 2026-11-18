const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require(path.resolve('PanoramaWaterTank_NextGen/node_modules/playwright'));

const HTTPS_SERVER_DIR = path.resolve('PanoramaWaterTank_NextGen/HTTPS_Server');
const PYTHON_EXE = path.resolve(HTTPS_SERVER_DIR, '.venv/Scripts/python.exe');
const SCREENSHOTS_DIR = path.resolve('PanoramaWaterTank_NextGen/screenshots');
const ARTIFACTS_DIR = path.resolve('C:/Users/User/.gemini/antigravity/brain/68ab95fd-172f-4f69-b69d-846a6b611df0');

const PORT = 8766;
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

        if (bSpec.name === 'Chrome') {
          // 1. Seed stale 130% preference (without v2 version marker) before load -> must migrate to 100%
          await page.addInitScript(() => {
            if (!sessionStorage.getItem('_seeded_stale_130')) {
              localStorage.removeItem('wli_https_lab_zoom_ver');
              localStorage.setItem('wli_https_lab_zoom', '130');
              sessionStorage.setItem('_seeded_stale_130', '1');
            }
          });

          await page.goto(baseUrl, { waitUntil: 'networkidle' });
          await page.waitForTimeout(500);

          const initialMigrationCheck = await page.evaluate(() => ({
            display: document.getElementById('zoom-level-display')?.textContent,
            cssVar: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
            rootFontSize: getComputedStyle(document.documentElement).fontSize,
            resetDisabledAt100: document.getElementById('zoom-reset-btn')?.disabled,
            storedVer: localStorage.getItem('wli_https_lab_zoom_ver'),
          }));
          console.log('[1] ZOOM MIGRATION (STALE 130% -> 100%):', JSON.stringify(initialMigrationCheck));

          // 2. Subsequent user zoom preference persistence (120% -> reload -> 120% -> RESET -> 100%)
          await page.locator('#zoom-in-btn').click();
          await page.locator('#zoom-in-btn').click();
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForTimeout(400);
          const persistedAt120 = await page.evaluate(() => ({
            display: document.getElementById('zoom-level-display')?.textContent,
            cssVar: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
          }));

          await page.locator('#zoom-reset-btn').click();
          const afterReset = await page.evaluate(() => ({
            display: document.getElementById('zoom-level-display')?.textContent,
            cssVar: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
          }));

          // Bounds check: 150% max and 70% min
          for (let i = 0; i < 5; i++) await page.locator('#zoom-in-btn').click();
          const at150 = await page.evaluate(() => ({
            display: document.getElementById('zoom-level-display')?.textContent,
            inDisabled: document.getElementById('zoom-in-btn')?.disabled,
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
          }));
          await page.locator('#zoom-reset-btn').click();
          for (let i = 0; i < 3; i++) await page.locator('#zoom-out-btn').click();
          const at70 = await page.evaluate(() => ({
            display: document.getElementById('zoom-level-display')?.textContent,
            outDisabled: document.getElementById('zoom-out-btn')?.disabled,
          }));
          await page.locator('#zoom-reset-btn').click();
          console.log('[2] ZOOM PERSISTENCE & BOUNDS:', JSON.stringify({ persistedAt120, afterReset, at150, at70 }));

          // 3. Expanded Manual JSON Editor geometry + syntax + large payload + validation + Reset + POST
          const editorDims = await page.evaluate(() => {
            const shell = document.getElementById('manual-post-editor-shell')?.getBoundingClientRect();
            const raw = document.querySelector('.panel-raw-json')?.getBoundingClientRect();
            const manual = document.querySelector('.panel-manual-post')?.getBoundingClientRect();
            const upload = document.querySelector('.panel-upload')?.getBoundingClientRect();
            return {
              editorHeightPx: Math.round(shell?.height || 0),
              editorWidthPx: Math.round(shell?.width || 0),
              rawPanelWidthPx: Math.round(raw?.width || 0),
              manualPanelWidthPx: Math.round(manual?.width || 0),
              uploadPanelWidthPx: Math.round(upload?.width || 0),
              hasSyntaxTokens: document.querySelectorAll('#manual-post-highlight .json-tok-key').length,
              lineCount: (document.getElementById('manual-post-line-numbers')?.textContent || '').split('\n').length,
            };
          });
          console.log('[3] EXPANDED EDITOR GEOMETRY (1920px):', JSON.stringify(editorDims));

          // Authenticate
          await page.locator('#auth-token-input').fill(TEST_TOKEN);
          await page.locator('#auth-token-apply-btn').click();
          await page.waitForTimeout(400);

          // Invalid JSON test (must show inline red error, zero alert)
          await page.locator('#manual-post-json-editor').fill('{ "device_id": "BAD_JSON", ');
          const invalidState = await page.evaluate(() => ({
            badge: document.getElementById('manual-post-validation-badge')?.textContent,
            msg: document.getElementById('manual-post-validation-msg')?.textContent,
            shellHasInvalid: document.getElementById('manual-post-editor-shell')?.classList.contains('is-invalid'),
          }));

          // Large multi-section payload (40+ lines) + Validate/Format + Send POST
          const largePayload = {
            device_id: 'WLI_LAB_NODE_LARGE_01',
            sequence_id: 2048,
            timestamp: Math.floor(Date.now() / 1000),
            water_level_cm: 128.4,
            water_level_percentage: 85.6,
            raw_voltage: 3.92,
            pressure_bar: 0.126,
            sensor_status: 'NORMAL',
            latitude: 22.5726,
            longitude: 88.3639,
            gps_valid: true,
            battery_voltage: 12.74,
            alarm_status: 'NONE',
            signal_csq: 27,
            coach_id: 'pano_coach_07',
            train_number: '12841',
            calibration: {
              zero_offset_v: 0.502,
              full_scale_v: 4.501,
              tank_height_cm: 150.0,
              tank_capacity_liters: 1800,
              adc_samples: 32,
              temperature_comp: true,
            },
            modem: {
              module: 'EC200U-CN',
              operator: 'Jio 4G',
              rsrp_dbm: -84,
              sinr_db: 14.2,
              tls_version: 'TLSv1.2',
            },
            diagnostics: {
              uptime_sec: 86420,
              free_heap_bytes: 24576,
              reset_reason: 'POWER_ON',
              ble_connected: false,
              modbus_crc_errors: 0,
            },
          };

          await page.locator('#manual-post-json-editor').fill(JSON.stringify(largePayload));
          await page.locator('#manual-post-validate-btn').click();
          const formattedCheck = await page.evaluate(() => ({
            badge: document.getElementById('manual-post-validation-badge')?.textContent,
            msg: document.getElementById('manual-post-validation-msg')?.textContent,
            lineCount: (document.getElementById('manual-post-line-numbers')?.textContent || '').split('\n').length,
            isScrollable: (document.getElementById('manual-post-json-editor')?.scrollHeight || 0) > (document.getElementById('manual-post-json-editor')?.clientHeight || 0),
          }));

          await page.locator('#manual-post-send-btn').click();
          await page.waitForTimeout(900);
          const postCheck = await page.evaluate(() => ({
            postStatus: document.getElementById('manual-post-result-status')?.textContent,
            waterCm: document.getElementById('metric-water-cm')?.textContent,
            waterPct: document.getElementById('metric-water-pct')?.textContent,
            varTableRows: document.querySelectorAll('#variable-table-body tr').length,
            historyRows: document.querySelectorAll('#history-table-body tr').length,
          }));

          // 4. File Upload check (POST /api/telemetry/upload)
          const uploadPayload = JSON.stringify({
            device_id: 'WLI_UPLOAD_NODE_02',
            timestamp: Math.floor(Date.now() / 1000),
            water_level_cm: 96.2,
            water_level_percentage: 64.1,
            raw_voltage: 3.12,
            battery_voltage: 12.55,
            sensor_status: 'NORMAL',
            alarm_status: 'NONE',
          }, null, 2);

          await page.locator('#file-upload-input').setInputFiles({
            name: 'test_telemetry_batch.json',
            mimeType: 'application/json',
            buffer: Buffer.from(uploadPayload, 'utf-8'),
          });
          await page.waitForTimeout(300);
          await page.locator('#file-upload-submit-btn').click();
          await page.waitForTimeout(800);
          const uploadCheck = await page.evaluate(() => ({
            fileName: document.getElementById('file-upload-name')?.textContent,
            uploadStatus: document.getElementById('file-upload-result-status')?.textContent,
          }));

          // Test Reset Sample restores clean sample & hides old result
          await page.locator('#manual-post-reset-btn').click();
          const afterSampleReset = await page.evaluate(() => ({
            hasSampleId: (document.getElementById('manual-post-json-editor')?.value || '').includes('WLI_LAB_NODE_01'),
            resultHidden: document.getElementById('manual-post-result-container')?.style.display === 'none',
          }));

          // Re-fill large formatted payload so workbench screenshots showcase syntax highlighting + line numbers nicely!
          await page.locator('#manual-post-json-editor').fill(JSON.stringify(largePayload, null, 2));
          await page.locator('#manual-post-validate-btn').click();

          console.log('[4] VALIDATION, LARGE PAYLOAD, POST & UPLOAD:', JSON.stringify({
            invalidState,
            formattedCheck,
            postCheck,
            uploadCheck,
            afterSampleReset,
          }));

          // 5. Capture focused workbench screenshot at 1920x1080 + multi-viewport sweep
          fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
          fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

          await page.locator('.workbench-grid').scrollIntoViewIfNeeded();
          await page.waitForTimeout(250);
          await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'https_lab_workbench_1920x1080.png'), fullPage: false });
          await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'https_lab_workbench_1920x1080.png'), fullPage: false });

          // Scroll back to top for standard viewport screenshots
          await page.evaluate(() => window.scrollTo(0, 0));
          const viewportResults = [];

          for (const vp of VIEWPORTS) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.waitForTimeout(200);
            const metrics = await page.evaluate(() => ({
              scrollWidth: document.documentElement.scrollWidth,
              innerWidth: window.innerWidth,
              containerWidth: Math.round(document.querySelector('.container')?.getBoundingClientRect().width || 0),
              editorHeight: Math.round(document.getElementById('manual-post-editor-shell')?.getBoundingClientRect().height || 0),
              noBodyOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
            }));
            viewportResults.push({ viewport: vp.name, ...metrics });

            if (['Desktop_1920x1080', 'Desktop_1366x768', 'Tablet_768x1024', 'Mobile_390x844'].includes(vp.name)) {
              const fileName = `https_lab_${vp.name.toLowerCase()}.png`;
              await page.screenshot({ path: path.join(SCREENSHOTS_DIR, fileName), fullPage: false });
              await page.screenshot({ path: path.join(ARTIFACTS_DIR, fileName), fullPage: false });

              if (vp.name === 'Tablet_768x1024' || vp.name === 'Mobile_390x844') {
                await page.locator('.panel-manual-post').scrollIntoViewIfNeeded();
                await page.waitForTimeout(200);
                const wbName = `https_lab_workbench_${vp.name.toLowerCase()}.png`;
                await page.screenshot({ path: path.join(SCREENSHOTS_DIR, wbName), fullPage: false });
                await page.screenshot({ path: path.join(ARTIFACTS_DIR, wbName), fullPage: false });
                await page.evaluate(() => window.scrollTo(0, 0));
              }
            }
          }
          console.log('[5] RESPONSIVE MATRIX (11 VIEWPORTS):');
          viewportResults.forEach((r) => console.log('   ', JSON.stringify(r)));
        } else {
          // Edge verification
          await page.goto(baseUrl, { waitUntil: 'networkidle' });
          await page.waitForTimeout(400);
          const edgeRes = await page.evaluate(() => ({
            status: document.getElementById('app-status')?.textContent,
            initialZoom: document.getElementById('zoom-level-display')?.textContent,
            editorHeight: Math.round(document.getElementById('manual-post-editor-shell')?.getBoundingClientRect().height || 0),
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
          }));
          console.log('[EDGE CHECK]:', JSON.stringify(edgeRes));
        }
      } finally {
        await browser.close();
      }
    }

    console.log('\n[6] TOTAL UNCAUGHT PAGE ERRORS:', pageErrors.length);
    if (pageErrors.length > 0) {
      pageErrors.forEach((e) => console.error('   ERR:', e));
      process.exitCode = 1;
    }
  } finally {
    serverProc.kill();
  }
})();
