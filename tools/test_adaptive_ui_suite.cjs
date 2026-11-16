const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const OUTPUT_DIR = path.resolve(__dirname, '../MOBILE_TEST_REPORTS/ADAPTIVE_UI');
const BRAIN_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\9e3514ab-7eb1-481b-ac5b-d7edda1def58\\screenshots\\adaptive_ui';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(BRAIN_DIR, { recursive: true });

const testMatrix = [
  { name: '01_compact_320x640', width: 320, height: 640, dpr: 2, category: 'compact', desc: 'Compact Android (320x640)' },
  { name: '02_small_360x720', width: 360, height: 720, dpr: 2, category: 'standard', desc: 'Small Android (360x720)' },
  { name: '03_standard_360x800', width: 360, height: 800, dpr: 3, category: 'standard', desc: 'Standard Android (360x800)' },
  { name: '04_large_390x844', width: 390, height: 844, dpr: 3, category: 'large', desc: 'Standard Large Android (390x844)' },
  { name: '05_pixel7_412x915', width: 412, height: 915, dpr: 2.625, category: 'large', desc: 'Pixel 7 / Large Android (412x915)' },
  { name: '06_xlarge_432x960', width: 432, height: 960, dpr: 2.5, category: 'xlarge', desc: 'Extra-Large Android (432x960)' },
  { name: '07_tablet_768x1024', width: 768, height: 1024, dpr: 2, category: 'tablet', desc: 'Android Tablet (768x1024)' },
  { name: '08_desktop_1440x900', width: 1440, height: 900, dpr: 1, isDesktop: true, desc: 'Desktop SCADA Web (1440x900)' }
];

async function main() {
  console.log('===========================================================');
  console.log('🚀 STARTING COMPREHENSIVE ADAPTIVE UI SCALING TEST SUITE');
  console.log('===========================================================\n');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--allow-file-access-from-files'],
    headless: true
  });

  const fileUrl = 'file:///' + path.resolve(__dirname, '../dist/index.html').replace(/\\/g, '/');
  const results = [];

  for (const item of testMatrix) {
    console.log(`[TEST] Testing ${item.desc}...`);
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      deviceScaleFactor: item.dpr
    });

    if (!item.isDesktop) {
      // Emulate Capacitor Android environment for mobile device tests
      await page.addInitScript(() => {
        window.__PANORAMA_FORCE_CAPACITOR_ANDROID__ = true;
        window.Capacitor = {
          isNativePlatform: () => true,
          getPlatform: () => 'android',
          platform: 'android',
          Plugins: {}
        };
      });
    }

    await page.goto(`${fileUrl}#/dashboard`, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const metrics = await page.evaluate((isDesktop) => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
      const clientWidth = doc.clientWidth;
      const header = document.querySelector('header');
      const headerOverflow = header ? header.scrollWidth > header.clientWidth : false;
      const style = window.getComputedStyle(doc);

      return {
        platform: doc.getAttribute('data-platform'),
        deviceCategory: doc.getAttribute('data-android-device'),
        orientation: doc.getAttribute('data-android-orientation'),
        scrollWidth,
        clientWidth,
        hasHorizontalScroll: scrollWidth > clientWidth + 1,
        headerOverflow,
        isDesktopClean: isDesktop ? (doc.getAttribute('data-platform') === null) : true,
        pagePaddingX: style.getPropertyValue('--android-page-padding-x').trim(),
        cardPadding: style.getPropertyValue('--android-card-padding').trim(),
        cardGap: style.getPropertyValue('--android-card-gap').trim(),
        sectionGap: style.getPropertyValue('--android-section-gap').trim(),
        btnHeight: style.getPropertyValue('--android-btn-height').trim(),
        headerHeight: style.getPropertyValue('--android-header-height').trim(),
        fontPageTitle: style.getPropertyValue('--android-font-page-title').trim(),
        fontBody: style.getPropertyValue('--android-font-body').trim()
      };
    }, item.isDesktop);

    const shotPath = path.join(OUTPUT_DIR, `${item.name}.png`);
    const brainShot = path.join(BRAIN_DIR, `${item.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    fs.copyFileSync(shotPath, brainShot);

    const passed = (!metrics.hasHorizontalScroll) && (!metrics.headerOverflow) && metrics.isDesktopClean;
    const testRes = {
      device: item.desc,
      dimensions: `${item.width}x${item.height} @ ${item.dpr}x`,
      category: metrics.deviceCategory || (item.isDesktop ? 'desktop' : 'unknown'),
      hasHorizontalScroll: metrics.hasHorizontalScroll,
      headerOverflow: metrics.headerOverflow,
      pagePaddingX: metrics.pagePaddingX || 'N/A',
      cardPadding: metrics.cardPadding || 'N/A',
      cardGap: metrics.cardGap || 'N/A',
      btnHeight: metrics.btnHeight || 'N/A',
      headerHeight: metrics.headerHeight || 'N/A',
      status: passed ? 'PASSED' : 'FAILED',
      screenshot: `${item.name}.png`
    };
    results.push(testRes);

    console.log(`  -> Status: ${testRes.status} | Category: ${testRes.category} | H-Scroll: ${metrics.hasHorizontalScroll} | Padding: ${testRes.pagePaddingX} | Header: ${testRes.headerHeight}`);
    await page.close();
  }

  await browser.close();

  // Now capture live emulator screenshot
  console.log('\n[EMULATOR] Capturing live low-resource AVD screenshot...');
  try {
    const emuShotName = '09_live_avd_adaptive_dashboard.png';
    const emuLocal = path.join(OUTPUT_DIR, emuShotName);
    const emuBrain = path.join(BRAIN_DIR, emuShotName);
    cp.execSync('adb -s emulator-5554 shell screencap -p /sdcard/adaptive_ui.png');
    cp.execSync(`adb -s emulator-5554 pull /sdcard/adaptive_ui.png "${emuLocal}"`);
    fs.copyFileSync(emuLocal, emuBrain);
    console.log(`✓ Live AVD Screenshot captured: ${emuLocal}`);
  } catch (e) {
    console.warn('Live emulator screenshot warning:', e.message);
  }

  console.log('\n===========================================================');
  console.log('SUMMARY RESULTS:');
  console.log(JSON.stringify(results, null, 2));
  console.log('===========================================================');

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'adaptive_ui_test_results.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  );
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
