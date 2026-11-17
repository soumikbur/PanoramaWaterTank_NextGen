const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve('PanoramaWaterTank_NextGen/node_modules/playwright'));

(async () => {
  const targetUrl = 'https://soumikbur.github.io/PanoramaWaterTank_NextGen/https/';
  console.log(`[*] Launching headless Chromium to test live URL: ${targetUrl}`);

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  console.log('[*] Navigating to target URL...');
  const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  console.log(`[+] Response status: ${response.status()}`);

  // Wait 2 seconds for initial live clock and polling handlers
  await page.waitForTimeout(2000);

  // Evaluate UI state
  const uiState = await page.evaluate(() => {
    return {
      title: document.title,
      headerTitle: document.querySelector('.header-title h1')?.textContent,
      liveClock: document.getElementById('header-live-clock')?.textContent,
      appStatus: document.getElementById('app-status')?.textContent,
      serverUrl: document.getElementById('server-url')?.textContent,
      backendAvail: document.getElementById('backend-availability')?.textContent,
      deviceCommStatus: document.getElementById('device-comm-status')?.textContent,
      protocolBadge: document.getElementById('protocol-badge')?.textContent,
      apiEndpointInput: document.getElementById('api-endpoint-input')?.value,
      apiEndpointStatus: document.getElementById('api-endpoint-status')?.textContent,
      authTokenStatus: document.getElementById('auth-token-status')?.textContent,
      cardsCount: document.querySelectorAll('.card').length
    };
  });

  console.log('[+] UI Evaluation Results:');
  console.log(JSON.stringify(uiState, null, 2));

  // Ensure output directories exist
  const screenshotsDir = path.resolve('PanoramaWaterTank_NextGen/screenshots');
  const artifactsDir = path.resolve('C:/Users/User/.gemini/antigravity/brain/68ab95fd-172f-4f69-b69d-846a6b611df0');

  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });

  const screenshotPathLocal = path.resolve(screenshotsDir, 'live_github_pages_dashboard.png');
  const screenshotPathArtifact = path.resolve(artifactsDir, 'live_github_pages_dashboard.png');

  console.log('[*] Capturing full-page screenshot...');
  await page.screenshot({ path: screenshotPathLocal, fullPage: true });
  await page.screenshot({ path: screenshotPathArtifact, fullPage: true });

  console.log(`[+] Screenshots saved to:`);
  console.log(`    - ${screenshotPathLocal}`);
  console.log(`    - ${screenshotPathArtifact}`);

  console.log(`\n[*] Page errors encountered (${pageErrors.length}):`);
  pageErrors.forEach(err => console.log(`    ERR: ${err}`));

  console.log(`\n[*] Recent console events (${consoleLogs.length}):`);
  consoleLogs.slice(-10).forEach(log => console.log(`    [${log.type}] ${log.text}`));

  await browser.close();
  console.log('[*] Browser test completed successfully.');
})();
