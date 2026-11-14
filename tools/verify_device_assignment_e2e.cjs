const { chromium } = require('playwright');

async function testDeviceAssignment() {
  console.log('--- STARTING DEVICE ASSIGNMENT TEST ---');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  const uncaughtErrors = [];
  page.on('pageerror', (err) => {
    console.error('[PAGE ERROR]', err.message);
    uncaughtErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('[BROWSER CONSOLE ERROR]', msg.text());
    }
  });

  try {
    // 1. Navigate to trains screen
    console.log('1. Navigating to http://127.0.0.1:8000/#/trains ...');
    await page.goto('http://127.0.0.1:8000/#/trains', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Login as admin if needed
    if (page.url().includes('login') || (await page.$('input[type="password"]'))) {
      console.log('Logging in as admin...');
      const devAdminBtn = page.locator('button:has-text("Login as Admin")');
      if (await devAdminBtn.isVisible()) {
        await devAdminBtn.click();
      } else {
        await page.fill('input[type="text"], input[name="username"]', 'admin');
        await page.fill('input[type="password"]', 'Admin@123');
        await page.click('button[type="submit"]');
      }
      await page.waitForTimeout(2000);
      await page.goto('http://127.0.0.1:8000/#/trains', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
    }

    // 2. Select EAST region
    const eastRegionCard = page.locator('div[data-region="EAST"]').locator('button:has-text("View Trains in Region")');
    await eastRegionCard.click();
    await page.waitForTimeout(1000);

    // 3. Open Train Manage -> Level 3
    const manageBtn = page.locator('button[title="Manage Coach Fleet & Consist"]').first();
    await manageBtn.click();
    await page.waitForTimeout(1000);

    // 4. Click Edit Coaches to open ManageCoachModal
    const editCoachesBtn = page.locator('button:has-text("Edit Coaches")').first();
    await editCoachesBtn.click();
    await page.waitForTimeout(1000);
    console.log('ManageCoachModal opened.');

    // 5. Click the interactive ASSIGNED DEVICE button on the first coach
    const assignedDeviceBtn = page.locator('td button:has-text("Unassigned")').first();
    console.log('Interactive Assigned Device button visible:', await assignedDeviceBtn.isVisible());
    await assignedDeviceBtn.click();
    await page.waitForTimeout(1000);
    console.log('Edit Coach modal opened via Assigned Device chip.');

    // 6. Enter MCU UID: 0026004D4B42501120353332
    const targetUid = '0026004D4B42501120353332';
    const uidInput = page.locator('input[placeholder*="0026004D4B42501120353332"]').first();
    await uidInput.fill(targetUid);
    console.log(`Filled MCU UID: ${targetUid}`);

    // 7. Click Save Changes
    const saveChangesBtn = page.locator('button:has-text("Save Changes")').first();
    await saveChangesBtn.click();
    await page.waitForTimeout(1500);
    console.log('Saved coach changes.');

    // 8. Verify the table now shows the assigned UID
    const coachRow = page.locator(`td:has-text("${targetUid}")`).first();
    const isUidDisplayed = await coachRow.isVisible();
    console.log(`Target UID displayed in coach fleet table: ${isUidDisplayed}`);
    if (!isUidDisplayed) {
      throw new Error('Assigned UID not visible in table after saving!');
    }

    // 9. Hard refresh page and verify persistence across reload
    console.log('9. Reloading page to verify persistence...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Navigate back to train manage modal
    await eastRegionCard.click();
    await page.waitForTimeout(1000);
    await manageBtn.click();
    await page.waitForTimeout(1000);
    await editCoachesBtn.click();
    await page.waitForTimeout(1000);

    const coachRowAfterReload = page.locator(`td:has-text("${targetUid}")`).first();
    const persistsAfterReload = await coachRowAfterReload.isVisible();
    console.log(`Target UID persists after reload: ${persistsAfterReload}`);
    if (!persistsAfterReload) {
      throw new Error('Assigned UID did not persist across reload!');
    }

    // Capture screenshot of successful persistence
    await page.screenshot({ path: 'WLI_DOCS/browser_debug_logs/verified_device_assignment.png' });
    console.log('Captured screenshot to WLI_DOCS/browser_debug_logs/verified_device_assignment.png');

    console.log('--- DEVICE ASSIGNMENT TEST COMPLETED SUCCESSFULLY ---');
    console.log('Total uncaught errors:', uncaughtErrors.length);
  } finally {
    await browser.close();
  }
}

testDeviceAssignment().catch((err) => {
  console.error('[TEST FAILED]', err);
  process.exit(1);
});
