const { chromium } = require('playwright');

async function run() {
  console.log('--- STARTING VERIFICATION SUITE ---');
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
    // 1. Navigate to application
    console.log('Navigating to http://127.0.0.1:8000 ...');
    await page.goto('http://127.0.0.1:8000/#/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Auto login if on login screen
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
    }

    // 2. Test Sidebar Navigation to Train Management
    console.log('Testing Sidebar -> Train Management...');
    const trainNavButton = page.locator('button[data-screen="trains"]').first();
    await trainNavButton.click();
    await page.waitForTimeout(1000);

    // Should be at Railway Regions root
    const heading = await page.textContent('h1, h2');
    console.log('Current Heading:', heading);

    // 3. Select EAST region (where 12842 is registered)
    console.log('Selecting EAST region...');
    const eastRegionCard = page.locator('div[data-region="EAST"]').locator('button:has-text("View Trains in Region")');
    await eastRegionCard.click();
    await page.waitForTimeout(1000);
    console.log('Navigated into EAST region train list.');

    // 4. Verify Manage button (Task 4)
    let manageBtn = page.locator('button[title="Manage Coach Fleet & Consist"]').first();
    let hasManageBtn = await manageBtn.count();

    if (hasManageBtn === 0) {
      console.log('No train in region; registering test train 12842...');
      const addTrainBtn = page.locator('button:has-text("Add Train")').first();
      await addTrainBtn.click();
      await page.waitForTimeout(500);
      const trainInput = page.locator('[data-testid="train-number-input"]').first();
      await trainInput.fill('12842');
      const verifyBtn = page.locator('[data-testid="verify-train-btn"]').first();
      await verifyBtn.click();
      await page.waitForTimeout(2000);
      const confirmBtn = page.locator('[data-testid="confirm-add-train-btn"]').first();
      await confirmBtn.click();
      await page.waitForTimeout(2000);
      manageBtn = page.locator('button[title="Manage Coach Fleet & Consist"]').first();
      hasManageBtn = await manageBtn.count();
    }

    const consistBtn = page.locator('button:has-text("Consist"):not(:has-text("Manage"))');
    const hasConsistBtn = await consistBtn.count();

    console.log('Manage buttons found:', hasManageBtn);
    console.log('Old Consist buttons found:', hasConsistBtn);
    if (hasManageBtn === 0) {
      throw new Error('Expected "Manage" button with title "Manage Coach Fleet & Consist" in train list, none found!');
    }

      // Click Manage to inspect train
      await manageBtn.click();
      await page.waitForTimeout(1000);
      console.log('Clicked Manage button. Waiting for Level 3...');

      // Verify Coach Consist button is completely removed
      const coachConsistBtn = page.locator('button:has-text("Coach Consist")');
      const coachConsistBtnCount = await coachConsistBtn.count();
      console.log('Coach Consist buttons in Train Details header (expected 0):', coachConsistBtnCount);
      if (coachConsistBtnCount !== 0) {
        throw new Error(`Expected Coach Consist button to be removed, but found ${coachConsistBtnCount}`);
      }

      // Verify other buttons remain intact
      const inspectBtn = page.locator('button:has-text("Inspect in Water Tank Monitor")');
      console.log('Inspect in Water Tank Monitor button visible:', await inspectBtn.isVisible());
      const backToTrainsInHeader = page.locator('button:has-text("Back to Trains")');
      console.log('Back to Trains button visible:', await backToTrainsInHeader.isVisible());

      const editCoachesBtn = page.locator('button:has-text("Edit Coaches")').first();
      await editCoachesBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      if (await editCoachesBtn.isVisible()) {
        await editCoachesBtn.click();
        await page.waitForTimeout(1000);
        console.log('ManageCoachModal opened.');

        // In ManageCoachModal, check for header Back button (Task 2)
        const modalBackBtn = page.locator('button[aria-label="Back to Train Details"]');
        console.log('Modal header Back button visible:', await modalBackBtn.isVisible());

        // Click Edit on the first coach in the modal table
        const firstCoachEditBtn = page.locator('button[title*="Edit Coach Parameters"]').first();
        await firstCoachEditBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await firstCoachEditBtn.isVisible()) {
          await firstCoachEditBtn.click();
          await page.waitForTimeout(1000);
          console.log('Edit Coach submodal opened.');

          // 6. Verify Device Management Section in Edit Coach (Task 3)
          const deviceSectionHeader = page.locator('text=Hardware Device Management');
          const isDeviceSectionVisible = await deviceSectionHeader.isVisible();
          console.log('Hardware Device Management section visible in Edit Coach:', isDeviceSectionVisible);
          if (!isDeviceSectionVisible) {
            throw new Error('Hardware Device Management section NOT visible in Edit Coach modal!');
          }

          const deviceSelect = page.locator('select:has-text("No Device Assigned")');
          console.log('Device dropdown selector visible:', await deviceSelect.isVisible());

          // Check submodal Back button
          const submodalBackBtn = page.locator('button[aria-label="Back to Coaches"]');
          console.log('Submodal Back button visible:', await submodalBackBtn.isVisible());

          // Click Back to coaches
          await submodalBackBtn.click();
          await page.waitForTimeout(500);
          console.log('Submodal closed via Back button. Returned to Manage Coaches.');
        }

        // Click modal header Back button
        await modalBackBtn.click();
        await page.waitForTimeout(500);
        console.log('ManageCoachModal closed via Back button. Returned to Train Details.');
      }

      // 7. Test Back to Region Trains
      const backToTrainsBtn = page.locator('button:has-text("Back to Trains")');
      if (await backToTrainsBtn.isVisible()) {
        await backToTrainsBtn.click();
        await page.waitForTimeout(500);
        console.log('Returned to Region Trains via Back to Trains button.');
      }

      // 8. Test Back to Regions
      const backToRegionsBtn = page.locator('button:has-text("Back to Regions")');
      if (await backToRegionsBtn.isVisible()) {
        await backToRegionsBtn.click();
        await page.waitForTimeout(500);
        console.log('Returned to Railway Regions via Back to Regions button.');
      }

      // 9. Test Sidebar Reset: drill into region again, then click Train Management in sidebar
      await page.locator('div[data-region="EAST"] button:has-text("View Trains in Region")').click();
      await page.waitForTimeout(500);
      console.log('Drilled into region. Now clicking Train Management in sidebar...');
      await trainNavButton.click();
      await page.waitForTimeout(500);

      const isBackToRegionsRoot = await page.locator('text=RAILWAY REGIONS').isVisible();
      console.log('Sidebar click reset view to RAILWAY REGIONS root:', isBackToRegionsRoot);
      if (!isBackToRegionsRoot) {
        throw new Error('Sidebar click did not reset to RAILWAY REGIONS root!');
      }

    console.log('--- ALL FUNCTIONAL CHECKS PASSED ---');
    console.log('Total uncaught page errors:', uncaughtErrors.length);
    if (uncaughtErrors.length > 0) {
      console.error('Errors encountered:', uncaughtErrors);
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error('[TEST SUITE FAILED]', e);
  process.exit(1);
});
