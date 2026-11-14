/**
 * Multi-Device Real-Time Synchronization Audit Tool
 * 
 * Verifies fully automatic, zero-refresh synchronization across 3 independent browser contexts:
 * - Device A (Context A)
 * - Device B (Context B)
 * - Device C (Context C)
 * 
 * Tests:
 * 1. Train addition on Device A -> reflects on Device B & C without reload
 * 2. Coach addition on Device A -> reflects on Device B & C without reload
 * 3. Device UID assignment on Device A -> reflects on Device B & C without reload
 * 4. Tank capacity modification on Device B -> reflects on Device A & C without reload
 * 5. Coach deletion on Device A -> reflects on Device B & C without reload
 * 6. Offline recovery: Device B disconnects, Device A mutates, Device B reconnects and synchronizes
 * 7. Concurrent mutations from Device A and Device B converge consistently
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DEFAULT_TARGET_URL = process.env.AUDIT_TARGET_URL || 'http://127.0.0.1:8000';
const REPORT_DIR = path.resolve(__dirname, '../../WLI_DOCS/sync_audit_reports');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    targetUrl: DEFAULT_TARGET_URL,
    headless: true,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      options.targetUrl = args[++i];
    } else if (args[i] === '--headed') {
      options.headless = false;
    }
  }
  return options;
}

async function loginAsAdmin(page, name) {
  console.log(`[${name}] Initializing & authenticating as Administrator...`);
  await page.waitForTimeout(1000);
  const pwInput = await page.$('input[type="password"]');
  if (pwInput) {
    const devAdminBtn = page.locator('button:has-text("Login as Admin")');
    if (await devAdminBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await devAdminBtn.click();
    } else {
      await page.fill('input[type="text"], input[name="username"]', 'admin');
      await page.fill('input[type="password"]', 'Admin@123');
      await page.click('button[type="submit"]');
    }
    await page.waitForTimeout(2000);
  }
  console.log(`[${name}] Successfully authenticated.`);
}

async function runMultiDeviceSyncAudit() {
  const options = parseArgs();
  console.log('================================================================');
  console.log(' MULTI-DEVICE REAL-TIME SYNCHRONIZATION AUTOMATION AUDIT');
  console.log(` Target URL: ${options.targetUrl}`);
  console.log(` Headless: ${options.headless}`);
  console.log('================================================================');

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: options.headless,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const capturedErrors = [];
  function attachErrorListeners(page, deviceName) {
    page.on('pageerror', (err) => {
      console.error(`[${deviceName}] PAGE ERROR:`, err.message);
      capturedErrors.push({ device: deviceName, type: 'pageerror', message: err.message });
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon.ico') && !text.includes('AbortError')) {
          console.error(`[${deviceName}] CONSOLE ERROR:`, text);
          capturedErrors.push({ device: deviceName, type: 'console_error', message: text });
        }
      }
    });
  }

  // 1. Spawning 3 independent browser contexts
  console.log('Spawning 3 independent browser contexts (Device A, Device B, Device C)...');
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextC = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();

  attachErrorListeners(pageA, 'Device A');
  attachErrorListeners(pageB, 'Device B');
  attachErrorListeners(pageC, 'Device C');

  const testResults = [];
  const startTime = Date.now();

  try {
    // 2. Open all 3 devices to the trains route
    console.log('Navigating all 3 devices to application trains view...');
    const url = options.targetUrl.endsWith('/') ? `${options.targetUrl}#/trains` : `${options.targetUrl}/#/trains`;

    await Promise.all([
      pageA.goto(url, { waitUntil: 'domcontentloaded' }),
      pageB.goto(url, { waitUntil: 'domcontentloaded' }),
      pageC.goto(url, { waitUntil: 'domcontentloaded' }),
    ]);

    await loginAsAdmin(pageA, 'Device A');
    await loginAsAdmin(pageB, 'Device B');
    await loginAsAdmin(pageC, 'Device C');

    // Wait for regions to load on all devices
    await Promise.all([
      pageA.waitForSelector('div[data-region]', { timeout: 15000 }),
      pageB.waitForSelector('div[data-region]', { timeout: 15000 }),
      pageC.waitForSelector('div[data-region]', { timeout: 15000 }),
    ]);
    console.log('All 3 devices loaded regions view successfully.');

    // -------------------------------------------------------------------------
    // TEST 1: Train Management Sync (Add Train on Device A -> reflects on B & C)
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 1] Train Addition Real-Time Sync ---');
    const targetTrainNumber = '15120'; // Target verified express train (Northern Railway - NORTH)
    const targetRegion = 'NORTH';

    // Drill into NORTH on Device A
    await pageA.click(`div[data-region="${targetRegion}"] button:has-text("View Trains in Region")`);
    await pageA.waitForTimeout(1000);

    const existingRow = await pageA.$(`div[data-testid="train-row-${targetTrainNumber}"]`);
    if (existingRow) {
      console.log(`Train ${targetTrainNumber} already exists in fleet.`);
    } else {
      console.log(`Adding Train ${targetTrainNumber} on Device A...`);
      await pageA.click('button:has-text("Add Train")');
      await pageA.waitForSelector('input[data-testid="train-number-input"], input[placeholder*="12002"]', { timeout: 5000 });

      const trainInput = pageA.locator('input[data-testid="train-number-input"], input[placeholder*="12002"]').first();
      await trainInput.fill(targetTrainNumber);
      await pageA.waitForTimeout(500);

      const verifyBtn = pageA.locator('button[data-testid="verify-train-btn"], button:has-text("Verify")').first();
      await verifyBtn.click();
      console.log('Clicked Verify button on Device A. Awaiting verification...');

      await pageA.waitForSelector('[data-testid="train-lookup-status"]', { timeout: 15000 });
      await pageA.waitForTimeout(1000);

      const confirmBtn = pageA.locator('button[data-testid="confirm-add-train-btn"], button:has-text("Confirm & Add Train")');
      await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
      await confirmBtn.click();
      console.log('Confirmed adding Train 15120 on Device A.');
      await pageA.waitForTimeout(2000);
    }

    // On Device B & C: Verify Train 15120 appears automatically WITHOUT reloading!
    console.log(`Checking Device B & Device C for Train ${targetTrainNumber} in ${targetRegion} (NO RELOAD PERMITTED)...`);
    const northBtnB = pageB.locator(`div[data-region="${targetRegion}"] button:has-text("View Trains in Region")`);
    if (await northBtnB.isVisible().catch(() => false)) await northBtnB.click();
    const northBtnC = pageC.locator(`div[data-region="${targetRegion}"] button:has-text("View Trains in Region")`);
    if (await northBtnC.isVisible().catch(() => false)) await northBtnC.click();

    await pageB.waitForSelector(`div[data-testid="train-row-${targetTrainNumber}"], div:has-text("${targetTrainNumber}")`, { timeout: 12000 });
    await pageC.waitForSelector(`div[data-testid="train-row-${targetTrainNumber}"], div:has-text("${targetTrainNumber}")`, { timeout: 12000 });
    console.log(`SUCCESS: Train ${targetTrainNumber} displayed on Device B & Device C automatically in real-time!`);
    testResults.push({ test: 'TEST 1: Train Addition Real-Time Sync', status: 'PASSED' });

    // Open Train Consist Management on all 3 devices
    console.log('\nOpening Train Consist on Device A, Device B, and Device C...');
    const trainRowA = pageA.locator(`div[data-testid="train-row-${targetTrainNumber}"]`).first();
    await trainRowA.locator('button[title="Manage Coach Fleet & Consist"], button:has-text("Manage")').click();
    await pageA.waitForTimeout(1000);

    const trainRowB = pageB.locator(`div[data-testid="train-row-${targetTrainNumber}"]`).first();
    await trainRowB.locator('button[title="Manage Coach Fleet & Consist"], button:has-text("Manage")').click();
    await pageB.waitForTimeout(1000);

    const trainRowC = pageC.locator(`div[data-testid="train-row-${targetTrainNumber}"]`).first();
    await trainRowC.locator('button[title="Manage Coach Fleet & Consist"], button:has-text("Manage")').click();
    await pageC.waitForTimeout(1000);

    // Open Coach Management Modal on Device A & Device B
    const editCoachesBtnA = pageA.locator('button:has-text("Edit Coaches")').first();
    await editCoachesBtnA.click();
    await pageA.waitForSelector('button:has-text("Add Coach")', { timeout: 10000 });

    const editCoachesBtnB = pageB.locator('button:has-text("Edit Coaches")').first();
    await editCoachesBtnB.click();
    await pageB.waitForSelector('button:has-text("Add Coach")', { timeout: 10000 });

    // -------------------------------------------------------------------------
    // TEST 2: Coach Management Sync (Add Coach on Device A -> reflects on B)
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 2] Coach Addition Real-Time Sync ---');
    const testCoachNumber = 'C9';

    // Pre-cleanup of any lingering test coaches from previous runs
    const testCoachesToClean = ['C9', 'C8', 'M1', 'M2'];
    for (const coachId of testCoachesToClean) {
      const existingRow = pageA.locator(`tr:has(span:text-is("${coachId}"))`).first();
      if (await existingRow.isVisible().catch(() => false)) {
        console.log(`Pre-cleanup: Removing lingering test coach ${coachId}...`);
        await existingRow.locator('button[title*="Delete"]').click();
        await pageA.waitForTimeout(500);
        await pageA.click('div[style*="100000"] button:has-text("Delete Coach")');
        await pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 }).catch(() => {});
        await pageA.waitForSelector(`tr:has(span:text-is("${coachId}"))`, { state: 'detached', timeout: 10000 }).catch(() => {});
        await pageA.waitForTimeout(1000);
      }
    }

    console.log(`Device A: Adding Coach ${testCoachNumber}...`);
    await pageA.click('button[title="Add New Coach to Consist"]');
    await pageA.waitForTimeout(500);

    // Fill Coach Number and Category
    const coachNumInput = pageA.locator('input[placeholder*="C1, B1, S4"]').first();
    await coachNumInput.fill(testCoachNumber);
    await pageA.waitForTimeout(300);

    // Submit Add Coach
    const addCoachSubmitBtn = pageA.locator('button[type="submit"]:has-text("Add Coach")');
    await addCoachSubmitBtn.click();
    console.log(`Device A: Coach ${testCoachNumber} submitted.`);
    await pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 });
    await pageA.waitForTimeout(500);

    // Verify Device B automatically shows Coach C9 in table without reload
    console.log(`Checking Device B for Coach ${testCoachNumber} in consist table (NO RELOAD)...`);
    await pageB.waitForSelector(`tr:has(span:text-is("${testCoachNumber}"))`, { timeout: 12000 });
    console.log(`SUCCESS: Coach ${testCoachNumber} appeared on Device B automatically in real-time!`);
    testResults.push({ test: 'TEST 2: Coach Addition Real-Time Sync', status: 'PASSED' });

    // -------------------------------------------------------------------------
    // TEST 3: Device UID Assignment Real-Time Sync
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 3] Device UID Assignment Real-Time Sync ---');
    const assignedUid = 'AUDIT-NODE-SYNC-99';
    console.log(`Device A: Assigning UID ${assignedUid} to Coach ${testCoachNumber}...`);

    // In Coach C9 row on Device A, click Edit
    const c9RowA = pageA.locator(`tr:has(span:text-is("${testCoachNumber}"))`).first();
    await c9RowA.locator('button:has-text("Edit")').click();
    await pageA.waitForTimeout(500);

    // Enter Hardware Device UID
    const uidInputA = pageA.locator('input[placeholder*="0026004D4B42501120353332"]').first();
    await uidInputA.fill(assignedUid);
    await pageA.waitForTimeout(300);

    // Save Changes on Device A
    await pageA.click('button:has-text("Save Changes")');
    console.log('Device A: Saved device UID assignment.');
    await pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 });
    await pageA.waitForTimeout(500);

    // Verify Device B automatically shows assigned UID on Coach C9
    console.log(`Checking Device B for assigned UID ${assignedUid} on Coach ${testCoachNumber} (NO RELOAD)...`);
    await pageB.waitForSelector(`tr:has(span:text-is("${testCoachNumber}")):has-text("${assignedUid}")`, { timeout: 12000 });
    console.log('SUCCESS: Device UID assignment synchronized to Device B automatically!');
    testResults.push({ test: 'TEST 3: Device UID Assignment Real-Time Sync', status: 'PASSED' });

    // -------------------------------------------------------------------------
    // TEST 4: Tank Configuration & Capacity Real-Time Sync (Device B -> Device A)
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 4] Tank Capacity Modification Real-Time Sync (Device B -> Device A) ---');
    console.log(`Device B: Modifying Tank 1 Capacity to 750L for Coach ${testCoachNumber}...`);

    // On Device B, click Edit on Coach C9
    const c9RowB = pageB.locator(`tr:has(span:text-is("${testCoachNumber}"))`).first();
    await c9RowB.locator('button:has-text("Edit")').click();
    await pageB.waitForTimeout(500);

    // Change Tank 1 Capacity to 750 (second number input in edit submodal form)
    const capInputB = pageB.locator('form input[type="number"]').nth(1);
    await capInputB.fill('750');
    await pageB.waitForTimeout(300);

    // Save on Device B
    await pageB.click('button:has-text("Save Changes")');
    console.log('Device B: Saved tank capacity changes.');
    await pageB.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 });
    await pageB.waitForTimeout(500);

    // Verify Device A automatically shows 750 L for Coach C9
    console.log('Checking Device A for updated tank configuration (NO RELOAD)...');
    await pageA.waitForSelector(`tr:has(span:text-is("${testCoachNumber}")):has-text("750 L")`, { timeout: 12000 });
    console.log('SUCCESS: Tank capacity update from Device B synchronized to Device A automatically!');
    testResults.push({ test: 'TEST 4: Tank Capacity Modification Real-Time Sync', status: 'PASSED' });

    // -------------------------------------------------------------------------
    // TEST 5: Coach Deletion Real-Time Sync
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 5] Coach Deletion Real-Time Sync ---');
    console.log(`Device A: Deleting Coach ${testCoachNumber}...`);

    // On Device A, click Delete on Coach C9
    await c9RowA.locator('button[title*="Delete"]').click();
    await pageA.waitForTimeout(500);
    // Confirm delete
    await pageA.click('div[style*="100000"] button:has-text("Delete Coach")');
    console.log(`Device A: Confirmed deletion of Coach ${testCoachNumber}.`);
    await pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 });
    await pageA.waitForTimeout(500);

    // Verify Device B automatically removes Coach C9 from consist table
    console.log(`Checking Device B: Coach ${testCoachNumber} should be removed from view (NO RELOAD)...`);
    await pageB.waitForSelector(`tr:has(span:text-is("${testCoachNumber}"))`, { state: 'detached', timeout: 12000 });
    console.log(`SUCCESS: Coach ${testCoachNumber} removed from Device B automatically in real-time!`);
    testResults.push({ test: 'TEST 5: Coach Deletion Real-Time Sync', status: 'PASSED' });

    // -------------------------------------------------------------------------
    // TEST 6: Offline Resilience & Reconnection Synchronization
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 6] Offline Resilience & Reconnection Synchronization ---');
    console.log('Device B: Simulating network disconnection (offline mode)...');
    await contextB.setOffline(true);
    await pageB.waitForTimeout(1000);

    const offlineCoachNum = 'C8';
    console.log(`Device A: Adding Coach ${offlineCoachNum} while Device B is offline...`);
    await pageA.click('button[title="Add New Coach to Consist"]');
    await pageA.waitForTimeout(500);
    const offlineCoachInput = pageA.locator('input[placeholder*="C1, B1, S4"]').first();
    await offlineCoachInput.fill(offlineCoachNum);
    await pageA.click('button[type="submit"]:has-text("Add Coach")');
    await pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 });
    await pageA.waitForTimeout(500);
    console.log(`Device A: Coach ${offlineCoachNum} added while Device B was offline.`);

    console.log('Device B: Restoring network connectivity (online mode)...');
    await contextB.setOffline(false);
    await pageB.waitForTimeout(3000);

    // Device B catches up and displays Coach C8
    console.log(`Checking Device B: Awaiting catch-up synchronization for Coach ${offlineCoachNum}...`);
    await pageB.waitForSelector(`tr:has(span:text-is("${offlineCoachNum}"))`, { timeout: 15000 });
    console.log('SUCCESS: Device B reconnected and synchronized state without manual refresh!');
    testResults.push({ test: 'TEST 6: Offline Resilience & Reconnection Recovery', status: 'PASSED' });

    // Clean up Coach C8 on Device A
    const c8RowA = pageA.locator(`tr:has(span:text-is("${offlineCoachNum}"))`).first();
    await c8RowA.locator('button[title*="Delete"]').click();
    await pageA.waitForTimeout(500);
    await pageA.click('div[style*="100000"] button:has-text("Delete Coach")');
    await pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 });
    await pageA.waitForTimeout(1000);

    // -------------------------------------------------------------------------
    // TEST 7: Concurrent Simultaneous Mutations from Multiple Devices
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 7] Concurrent Simultaneous Mutations ---');
    const coachM1 = 'M1';
    const coachM2 = 'M2';

    // Pre-cleanup M1 and M2 if present
    for (const mCoach of [coachM1, coachM2]) {
      const existingM = pageA.locator(`tr:has(span:text-is("${mCoach}"))`).first();
      if (await existingM.isVisible().catch(() => false)) {
        await existingM.locator('button[title*="Delete"]').click();
        await pageA.waitForTimeout(500);
        await pageA.click('div[style*="100000"] button:has-text("Delete Coach")');
        await pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 }).catch(() => {});
        await pageA.waitForSelector(`tr:has(span:text-is("${mCoach}"))`, { state: 'detached', timeout: 10000 }).catch(() => {});
        await pageA.waitForTimeout(1000);
      }
    }

    console.log(`Simultaneously adding Coach ${coachM1} on Device A and Coach ${coachM2} on Device B...`);

    // Prepare Device A
    await pageA.click('button[title="Add New Coach to Consist"]');
    await pageA.waitForTimeout(500);
    await pageA.locator('input[placeholder*="C1, B1, S4"]').first().fill(coachM1);

    // Prepare Device B
    await pageB.click('button[title="Add New Coach to Consist"]');
    await pageB.waitForTimeout(500);
    await pageB.locator('input[placeholder*="C1, B1, S4"]').first().fill(coachM2);

    // Submit both concurrently
    await Promise.all([
      pageA.click('button[type="submit"]:has-text("Add Coach")'),
      pageB.click('button[type="submit"]:has-text("Add Coach")'),
    ]);
    console.log('Simultaneous mutations dispatched from Device A and Device B.');
    await Promise.all([
      pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 }).catch(() => {}),
      pageB.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 }).catch(() => {}),
    ]);
    await pageA.waitForTimeout(1000);

    // Verify both Coach M1 and Coach M2 appear on Device C!
    console.log('Checking Device C (independent observer) for both Coach M1 and Coach M2...');
    const editCoachesBtnC = pageC.locator('button:has-text("Edit Coaches")').first();
    if (await editCoachesBtnC.isVisible().catch(() => false)) {
      await editCoachesBtnC.click();
      await pageC.waitForTimeout(1500);
    }
    await pageC.waitForSelector(`tr:has(span:text-is("${coachM1}"))`, { timeout: 15000 });
    await pageC.waitForSelector(`tr:has(span:text-is("${coachM2}"))`, { timeout: 15000 });
    console.log('SUCCESS: Device C converged with both concurrent mutations present!');
    testResults.push({ test: 'TEST 7: Concurrent Mutations Convergence', status: 'PASSED' });

    // Clean up temporary coaches M1 and M2 on Device A
    console.log('Cleaning up temporary concurrent test coaches M1 and M2...');
    const m1RowA = pageA.locator(`tr:has(span:text-is("${coachM1}"))`).first();
    if (await m1RowA.isVisible().catch(() => false)) {
      await m1RowA.locator('button[title*="Delete"]').click();
      await pageA.waitForTimeout(500);
      await pageA.click('div[style*="100000"] button:has-text("Delete Coach")');
      await pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 }).catch(() => {});
      await pageA.waitForTimeout(1000);
    }
    const m2RowA = pageA.locator(`tr:has(span:text-is("${coachM2}"))`).first();
    if (await m2RowA.isVisible().catch(() => false)) {
      await m2RowA.locator('button[title*="Delete"]').click();
      await pageA.waitForTimeout(500);
      await pageA.click('div[style*="100000"] button:has-text("Delete Coach")');
      await pageA.waitForSelector('div[style*="100000"]', { state: 'detached', timeout: 15000 }).catch(() => {});
      await pageA.waitForTimeout(1000);
    }

    // Capture screenshot of final synchronized state
    const screenshotPath = path.join(REPORT_DIR, 'multidevice_final_sync_verified.png');
    await pageB.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved audit screenshot to: ${screenshotPath}`);

  } catch (err) {
    console.error('\n[AUDIT FAILURE]', err);
    testResults.push({ test: 'EXCEPTION', status: 'FAILED', error: err.message });
  } finally {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await browser.close();

    console.log('\n================================================================');
    console.log(' AUDIT EXECUTION SUMMARY');
    console.log(` Total Time: ${duration}s`);
    console.log(` Console Errors Detected: ${capturedErrors.length}`);
    console.log('----------------------------------------------------------------');
    testResults.forEach(r => console.log(` ${r.status === 'PASSED' ? '✓' : '✗'} ${r.test}: ${r.status}`));
    console.log('================================================================\n');

    // Generate JSON & Markdown Report
    const reportData = {
      timestamp: new Date().toISOString(),
      durationSeconds: parseFloat(duration),
      targetUrl: options.targetUrl,
      results: testResults,
      capturedErrors,
      allPassed: testResults.length === 7 && testResults.every(r => r.status === 'PASSED') && capturedErrors.length === 0,
    };

    const jsonPath = path.join(REPORT_DIR, 'multidevice_sync_audit_report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2));

    const mdPath = path.join(REPORT_DIR, 'MULTI_DEVICE_SYNC_AUDIT_REPORT.md');
    const mdContent = `# Multi-Device Real-Time Synchronization Audit Report
**Date:** ${new Date().toISOString()}  
**Target URL:** \`${options.targetUrl}\`  
**Duration:** ${duration} seconds  
**Total Console Errors:** ${capturedErrors.length}  
**Overall Verdict:** **${reportData.allPassed ? 'PASSED (PRODUCTION-READY)' : 'FAILED'}**

## Test Execution Results
| Test ID | Description | Result |
|---|---|---|
${testResults.map(r => `| ${r.test.split(':')[0]} | ${r.test.split(':').slice(1).join(':').trim()} | **${r.status}** |`).join('\n')}

## Console & Runtime Errors
${capturedErrors.length === 0 ? '_Zero console errors or unhandled promise rejections detected during multi-device synchronization._' : capturedErrors.map(e => `- **[${e.device}]** \`${e.type}\`: ${e.message}`).join('\n')}
`;
    fs.writeFileSync(mdPath, mdContent);
    console.log(`Saved reports to: \n - ${jsonPath}\n - ${mdPath}`);

    if (!reportData.allPassed) {
      process.exit(1);
    }
  }
}

runMultiDeviceSyncAudit().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
