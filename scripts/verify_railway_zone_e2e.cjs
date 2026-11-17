// scripts/verify_railway_zone_e2e.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');
const { chromium } = require('playwright');

const API_PORT = 8016;
const WEB_PORT = 3016;
const BACKEND_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const BACKEND_DIR = path.resolve(__dirname, '../backend');
const DIST_DIR = path.resolve(__dirname, '../dist');
const PYTHON_EXE = path.join(BACKEND_DIR, 'venv', 'Scripts', 'python.exe');
const SCREENSHOT_DIR = 'C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots/railway_zone_verification';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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

function createStaticServer() {
  return http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(DIST_DIR, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function httpJson(method, urlPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BACKEND_URL}${urlPath}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForBackend() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await httpJson('GET', '/api/v1/health');
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Backend server failed to become healthy within 20s');
}

async function main() {
  console.log('=====================================================');
  console.log('[TEST] Starting Railway Zone E2E Verification Suite');
  console.log('=====================================================');

  // 1. Start live backend server
  console.log(`[1] Launching backend server on port ${API_PORT}...`);
  const backendProc = cp.spawn(
    PYTHON_EXE,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(API_PORT), '--log-level', 'warning'],
    { cwd: BACKEND_DIR, stdio: ['ignore', 'ignore', 'pipe'] }
  );
  backendProc.stderr.on('data', (d) => {
    const s = d.toString();
    if (/ERROR|CRITICAL|Traceback/i.test(s)) process.stderr.write('[UVICORN] ' + s);
  });

  const staticServer = createStaticServer();
  await new Promise((resolve) => staticServer.listen(WEB_PORT, '127.0.0.1', resolve));
  console.log(`[2] Static distribution server running on ${WEB_URL}`);

  try {
    await waitForBackend();
    console.log('[3] Backend health check PASSED');

    // Login as admin
    const loginRes = await httpJson('POST', '/api/v1/auth/login', { username: '@admin', password: 'Admin@123' });
    assert.strictEqual(loginRes.status, 200, 'Admin login failed');
    const token = loginRes.data.access_token;

    // Launch Playwright Chrome
    console.log('[4] Launching Playwright Chromium browser...');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Pre-seed token and set API base in localStorage
    await page.addInitScript(({ token, backendUrl }) => {
      localStorage.setItem('panorama_token', token);
      localStorage.setItem('panorama_demo_user', JSON.stringify({
        username: 'admin',
        role: 'ADMIN',
        full_name: 'System Administrator',
        designation: 'Senior SCADA Engineer',
      }));
      localStorage.setItem('panorama_user_role', 'ADMIN');
      localStorage.setItem('panorama_backend_url', `${backendUrl}/api/v1`);
    }, { token, backendUrl: BACKEND_URL });

    // Clean up test train 15120 if already exists
    await httpJson('DELETE', '/api/v1/trains/15120', null, token);
    await httpJson('DELETE', '/api/v1/trains/15102', null, token);

    // Navigate to Train Management
    console.log('[5] Navigating to Train Management (/#/trains)...');
    await page.goto(`${WEB_URL}/#/trains`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('  Current URL:', page.url());
    const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').substring(0, 300);
    console.log('  Body snippet:', bodyText);

    // ------------------------------------------------------------------
    // TEST 1: Open Add Train Modal & Inspect Railway Zone
    // ------------------------------------------------------------------
    console.log('[TEST 1] Opening Add Train to Fleet modal...');
    const addBtn = page.locator('[data-testid="open-add-train-btn"]').first();
    await addBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addBtn.click();

    await page.waitForSelector('[data-testid="add-train-modal"]', { timeout: 5000 });
    console.log('  ✓ Add Train Modal opened');

    // Check Railway Zone field
    const zoneInput = page.locator('[data-testid="train-zone-input"]');
    await zoneInput.waitFor({ state: 'visible' });
    const placeholder = await zoneInput.getAttribute('placeholder');
    console.log(`  ✓ Railway Zone input placeholder: "${placeholder}"`);
    assert(!placeholder.toLowerCase().includes('not in api'), `Placeholder should not contain 'not in api', got: ${placeholder}`);
    assert(placeholder.includes('Optional'), `Placeholder should indicate optional field, got: ${placeholder}`);

    // Verify "Not in API" is completely absent from modal text
    const modalText = await page.locator('[data-testid="add-train-modal"]').innerText();
    assert(!modalText.toLowerCase().includes('not in api'), `Modal text must NOT contain 'not in api', got: ${modalText}`);
    console.log('  ✓ Confirmed: "Not in API" text is completely removed from the component!');

    // ------------------------------------------------------------------
    // TEST 2: Verify train 15120 (RailRadar provider - no zone in external API)
    // ------------------------------------------------------------------
    console.log('[TEST 2] Verifying train 15120 (external API without zone)...');
    const trainNumInput = page.locator('[data-testid="train-number-input"]');
    await trainNumInput.fill('15120');

    const verifyBtn = page.locator('[data-testid="verify-train-btn"]');
    await verifyBtn.click();

    await page.waitForSelector('[data-testid="train-lookup-status"]:has-text("successfully verified")', { timeout: 10000 });
    console.log('  ✓ Train 15120 verified');

    // Confirm that after verification, "Not in API" is STILL NOT shown
    const postVerifyModalText = await page.locator('[data-testid="add-train-modal"]').innerText();
    assert(!postVerifyModalText.toLowerCase().includes('not in api'), 'Post-verification modal must NOT contain "not in api"');
    console.log('  ✓ Confirmed: Post-verification status displays NO "Not in API" message!');

    // Check that Railway Zone is available as an editable optional field
    assert(await zoneInput.isEditable(), 'Railway Zone input must remain editable as an optional local field');
    console.log('  ✓ Railway Zone input is fully editable');

    // Enter custom Railway Zone "NR"
    await zoneInput.fill('NR');
    console.log('  ✓ Entered custom Railway Zone: "NR"');

    // Save screenshot
    const shot1 = path.join(SCREENSHOT_DIR, '01_add_train_modal_railway_zone.png');
    await page.screenshot({ path: shot1 });
    console.log(`  ✓ Saved screenshot: ${shot1}`);

    // Submit Add Train
    console.log('[TEST 3] Submitting new train 15120...');
    const confirmBtn = page.locator('[data-testid="confirm-add-train-btn"]');
    await confirmBtn.click();

    // Wait for modal to close
    await page.waitForSelector('[data-testid="add-train-modal"]', { state: 'detached', timeout: 8000 });
    console.log('  ✓ Train 15120 submitted and modal closed');

    // ------------------------------------------------------------------
    // TEST 4: Check PostgreSQL Persistence of Railway Zone
    // ------------------------------------------------------------------
    console.log('[TEST 4] Verifying PostgreSQL / Backend persistence of Railway Zone...');
    const dbCheck = await httpJson('GET', '/api/v1/trains', null, token);
    assert.strictEqual(dbCheck.status, 200);
    const train15120 = dbCheck.data.find((t) => t.train_number === '15120');
    assert(train15120, 'Train 15120 missing from backend DB!');
    console.log(`  ✓ Backend Train Record: train_number=${train15120.train_number}, railway_zone=${train15120.railway_zone}, region=${train15120.region}`);
    assert.strictEqual(train15120.railway_zone, 'NR', `Expected railway_zone="NR" in DB, got: ${train15120.railway_zone}`);

    // Verify displayed in Train Management UI
    await page.waitForTimeout(500);
    const row15120 = page.locator('[data-testid="train-row-15120"]');
    await row15120.waitFor({ state: 'visible', timeout: 5000 });
    const rowText = await row15120.innerText();
    console.log(`  ✓ Train row UI text: "${rowText.replace(/\n/g, ' ')}"`);
    assert(rowText.includes('NR'), `Train row should display Railway Zone 'NR', got: ${rowText}`);

    const shot2 = path.join(SCREENSHOT_DIR, '02_train_list_with_railway_zone.png');
    await page.screenshot({ path: shot2 });
    console.log(`  ✓ Saved screenshot: ${shot2}`);

    // ------------------------------------------------------------------
    // TEST 5: Test Editing Existing Train's Railway Zone
    // ------------------------------------------------------------------
    console.log('[TEST 5] Testing editing existing train configuration...');
    // Click Edit button inside row 15120
    const editBtn = row15120.locator('button[title*="Edit"], button[title*="edit"]').first();
    await editBtn.click();

    // Wait for Edit modal to appear
    await page.waitForSelector('h3:has-text("Edit Train Configuration")', { timeout: 5000 });
    console.log('  ✓ Edit Train Configuration modal opened');

    // Verify Railway Zone input is present in Edit modal with existing value "NR"
    const editZoneInput = page.locator('input[placeholder*="NR, WR, SR, ER"]').first();
    await editZoneInput.waitFor({ state: 'visible', timeout: 5000 });
    const currentEditZoneVal = await editZoneInput.inputValue();
    console.log(`  ✓ Edit modal Railway Zone current value: "${currentEditZoneVal}"`);
    assert.strictEqual(currentEditZoneVal, 'NR', `Expected Edit modal to prefill "NR", got: ${currentEditZoneVal}`);

    // Change Railway Zone to "NER"
    await editZoneInput.fill('NER');
    console.log('  ✓ Changed Railway Zone to "NER"');

    const shot3 = path.join(SCREENSHOT_DIR, '03_edit_train_modal.png');
    await page.screenshot({ path: shot3 });
    console.log(`  ✓ Saved screenshot: ${shot3}`);

    // Submit edit form
    const saveEditBtn = page.locator('button[type="submit"]:has-text("Save Changes"), button[type="submit"]:has-text("Update")').first();
    await saveEditBtn.click();
    await page.waitForTimeout(600);
    console.log('  ✓ Clicked Save Changes');

    // Verify DB update
    const dbCheckUpdated = await httpJson('GET', '/api/v1/trains', null, token);
    const updated15120 = dbCheckUpdated.data.find((t) => t.train_number === '15120');
    assert(updated15120, 'Train 15120 missing after update!');
    console.log(`  ✓ Updated DB Record: train_number=${updated15120.train_number}, railway_zone=${updated15120.railway_zone}`);
    assert.strictEqual(updated15120.railway_zone, 'NER', `Expected railway_zone to be updated to "NER" in DB, got: ${updated15120.railway_zone}`);

    // Verify UI updated
    await page.waitForTimeout(400);
    const updatedRowText = await row15120.innerText();
    console.log(`  ✓ Updated Train row UI text: "${updatedRowText.replace(/\n/g, ' ')}"`);
    assert(updatedRowText.includes('NER'), `Updated row must display 'NER', got: ${updatedRowText}`);

    const shot4 = path.join(SCREENSHOT_DIR, '04_train_updated_with_new_zone.png');
    await page.screenshot({ path: shot4 });
    console.log(`  ✓ Saved screenshot: ${shot4}`);

    // ------------------------------------------------------------------
    // TEST 6: Add Train without Railway Zone (Optional Field Verification)
    // ------------------------------------------------------------------
    console.log('[TEST 6] Adding train without specifying Railway Zone (optional check)...');
    await addBtn.click();
    await page.waitForSelector('[data-testid="add-train-modal"]', { timeout: 5000 });

    await trainNumInput.fill('15102');
    await verifyBtn.click();
    await page.waitForSelector('[data-testid="train-lookup-status"]:has-text("successfully verified")', { timeout: 10000 });

    // Leave or clear Railway Zone
    await zoneInput.fill('');
    console.log('  ✓ Railway Zone left empty');

    // Assert form allows submit and is NOT blocked
    const confirmAddBtn = page.locator('[data-testid="confirm-add-train-btn"]');
    assert(await confirmAddBtn.isEnabled(), 'Confirm button must be enabled even when Railway Zone is blank');

    await confirmAddBtn.click();
    await page.waitForSelector('[data-testid="add-train-modal"]', { state: 'detached', timeout: 8000 });
    console.log('  ✓ Train 15102 added without Railway Zone');

    const shot5 = path.join(SCREENSHOT_DIR, '05_train_15102_added_optional_zone.png');
    await page.screenshot({ path: shot5 });
    console.log(`  ✓ Saved screenshot: ${shot5}`);

    // Clean up test records
    await httpJson('DELETE', '/api/v1/trains/15120', null, token);
    await httpJson('DELETE', '/api/v1/trains/15102', null, token);
    console.log('  ✓ Cleaned up test trains');

    await browser.close();

    console.log('\n=====================================================');
    console.log('[SUCCESS] ALL RAILWAY ZONE ACCEPTANCE CRITERIA PASSED!');
    console.log('  1. "Not in API" message removed completely from component & DOM.');
    console.log('  2. Railway Zone field available as optional with clean placeholder.');
    console.log('  3. Railway Zone is non-mandatory and submits cleanly when blank.');
    console.log('  4. Railway Zone saved and verified in PostgreSQL database.');
    console.log('  5. Existing trains can edit and update Railway Zone seamlessly.');
    console.log('  6. Verified in browser with screenshots.');
    console.log('=====================================================\n');
  } finally {
    staticServer.close();
    backendProc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('[E2E TEST ERROR]', err);
  process.exit(1);
});
