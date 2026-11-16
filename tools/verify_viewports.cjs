const { chromium } = require('playwright');
const path = require('path');

const viewports = [
  { width: 360, height: 800, name: '360px (Small Android)' },
  { width: 375, height: 667, name: '375px (iPhone SE)' },
  { width: 390, height: 844, name: '390px (iPhone 12/13/14)' },
  { width: 412, height: 915, name: '412px (Pixel / Galaxy)' },
  { width: 720, height: 1280, name: '720px (AVD Low Resource)' }
];

const routes = [
  '#/dashboard',
  '#/trains',
  '#/all-tanks',
  '#/devices',
  '#/raw-data',
  '#/location',
  '#/alerts',
  '#/history',
  '#/reports',
  '#/settings'
];

async function checkViewports() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const fileUrl = 'file:///' + path.resolve(__dirname, '../dist/index.html').replace(/\\/g, '/');
  
  console.log('Testing viewports against dist build:', fileUrl);
  let allPassed = true;

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    for (const route of routes) {
      await page.goto(`${fileUrl}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(500);

      const metrics = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientWidth = docEl.clientWidth;
        const header = document.querySelector('header');
        let headerOverflow = false;
        if (header) {
          headerOverflow = header.scrollWidth > header.clientWidth;
        }
        return {
          scrollWidth,
          clientWidth,
          hasHorizontalScroll: scrollWidth > clientWidth + 1,
          headerOverflow
        };
      });

      if (metrics.hasHorizontalScroll || metrics.headerOverflow) {
        console.error(`❌ [FAIL] ${vp.name} on ${route}: scrollWidth=${metrics.scrollWidth}, clientWidth=${metrics.clientWidth}, headerOverflow=${metrics.headerOverflow}`);
        allPassed = false;
      } else {
        // console.log(`✓ [PASS] ${vp.name} on ${route}`);
      }
    }
    await page.close();
  }

  await browser.close();
  if (allPassed) {
    console.log('🎉 ALL VIEWPORTS (360px - 720px) PASSED WITH ZERO HORIZONTAL OVERFLOW ACROSS ALL 10 ROUTES!');
  } else {
    process.exit(1);
  }
}

checkViewports().catch(e => {
  console.error('Error during viewport verification:', e);
  process.exit(1);
});
