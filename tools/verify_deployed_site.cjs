const { chromium } = require('playwright');
const path = require('path');

async function testDeployedSite() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  console.log('Navigating to live deployment: https://soumikbur.github.io/PanoramaWaterTank_NextGen/#/trains ...');
  await page.goto('https://soumikbur.github.io/PanoramaWaterTank_NextGen/#/trains', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Auto login if on login screen
  const loginInput = await page.$('input[type="password"]');
  if (loginInput) {
    console.log('Logging in as Admin on deployed site...');
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

  // Navigate to Train Management
  await page.goto('https://soumikbur.github.io/PanoramaWaterTank_NextGen/#/trains', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Wait for regions to be visible
  await page.waitForSelector('div[data-region]', { timeout: 10000 });
  const regionsSummary = await page.$$eval('div[data-region]', els => els.map(e => ({
    region: e.getAttribute('data-region'),
    text: e.innerText.replace(/\n+/g, ' ')
  })));
  console.log('Regions summary on deployed site:', JSON.stringify(regionsSummary, null, 2));

  const screenshotPath = path.resolve(__dirname, '../tools/deployed_train_details_verified.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Saved screenshot of initial trains screen to:', screenshotPath);

  // Drill into Western Railway if regions view is active
  const westCardBtn = page.locator('div[data-region="WEST"] button:has-text("View Trains in Region")');
  if (await westCardBtn.isVisible().catch(() => false)) {
    console.log('Drilling into Western Railway (WEST)...');
    await westCardBtn.click();
    await page.waitForTimeout(1500);
  }

  // Check the table row button text: should be "Manage", NOT "Consist"
  const manageButtons = page.locator('button[title="Manage Coach Fleet & Consist"]');
  await manageButtons.first().waitFor({ state: 'visible', timeout: 10000 });
  const oldConsistButtons = page.locator('table button:has-text("Consist")');
  console.log('Manage buttons count:', await manageButtons.count());
  console.log('Table Consist buttons count (expected 0):', await oldConsistButtons.count());

  // Click Manage button on the first train
  console.log('Clicking Manage button...');
  await manageButtons.first().click();
  await page.waitForTimeout(2000);

  // Verify Coach Consist button is absent from Train Details header
  const headerCoachConsist = page.locator('div:has-text("Status:") ~ div button:has-text("Coach Consist")');
  const anyCoachConsistInDetails = page.locator('button:has-text("Coach Consist")');
  const countInDetails = await anyCoachConsistInDetails.count();
  console.log('Coach Consist buttons visible in Train Details header (expected 0):', countInDetails);

  // Verify other 3 buttons are visible
  const editCoachesBtn = page.locator('button:has-text("Edit Coaches")').first();
  const inspectBtn = page.locator('button:has-text("Inspect in Water Tank Monitor")');
  const backBtn = page.locator('button:has-text("Back to Trains")');
  console.log('Edit Coaches button visible:', await editCoachesBtn.isVisible());
  console.log('Inspect in Water Tank Monitor button visible:', await inspectBtn.isVisible());
  console.log('Back to Trains button visible:', await backBtn.isVisible());

  // Capture screenshot of Train Details page
  const detailsScreenshotPath = path.resolve(__dirname, '../tools/deployed_train_details_verified.png');
  await page.screenshot({ path: detailsScreenshotPath, fullPage: true });
  console.log('Saved screenshot to:', detailsScreenshotPath);

  await browser.close();
  console.log('--- DEPLOYMENT VERIFICATION COMPLETE ---');
}

testDeployedSite().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
