/**
 * Panorama SCADA — Comprehensive Multi-Resolution Responsive Audit
 * 
 * Tests layout integrity, overflow, header/nav responsiveness across 10 official viewports:
 * 320x568, 375x667, 390x844, 430x932, 768x1024, 1024x768, 1280x720, 1366x768, 1440x900, 1920x1080
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'Mobile XS (SE)', width: 320, height: 568 },
  { name: 'Mobile S (iPhone 8)', width: 375, height: 667 },
  { name: 'Mobile M (iPhone 12/13/14)', width: 390, height: 844 },
  { name: 'Mobile L (iPhone 14/15 Pro Max)', width: 430, height: 932 },
  { name: 'Tablet Portrait (iPad Mini)', width: 768, height: 1024 },
  { name: 'Tablet Landscape (iPad)', width: 1024, height: 768 },
  { name: 'Laptop HD (720p)', width: 1280, height: 720 },
  { name: 'Laptop Standard (1366x768)', width: 1366, height: 768 },
  { name: 'Desktop WXGA+ (1440x900)', width: 1440, height: 900 },
  { name: 'Desktop FHD (1080p)', width: 1920, height: 1080 },
];

const TARGET_URL = process.argv[2] || 'https://soumikbur.github.io/PanoramaWaterTank_NextGen/';
const OUT_DIR = path.resolve(__dirname, '../../WLI_DOCS/browser_debug_logs/responsive');

async function runResponsiveAudit() {
  console.log('='.repeat(70));
  console.log('PANORAMA SCADA — MULTI-VIEWPORT RESPONSIVE AUDIT');
  console.log(`Target URL:  ${TARGET_URL}`);
  console.log(`Viewports:   ${VIEWPORTS.length} configurations`);
  console.log(`Screenshot:  ${OUT_DIR}`);
  console.log('='.repeat(70));

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  console.log('\n[SETUP] Initializing session & authenticating as Administrator...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const quickAdmin = page.locator('#btn-quick-login-admin');
  if (await quickAdmin.count() > 0) {
    await quickAdmin.click();
  } else {
    await page.fill('input[type="text"]', '@admin');
    await page.fill('input[type="password"]', 'Admin@123');
    await page.click('button[type="submit"]');
  }
  await page.waitForTimeout(3000);

  for (const vp of VIEWPORTS) {
    console.log(`\nTesting Viewport: [${vp.name}] ${vp.width}x${vp.height}...`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(1000);

    const metrics = await page.evaluate(() => {
      const docEl = document.documentElement;
      const body = document.body;
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      const hasHorizScroll = docEl.scrollWidth > winW || body.scrollWidth > winW;
      const horizDiff = Math.max(docEl.scrollWidth - winW, body.scrollWidth - winW);

      const header = document.querySelector('header');
      const headerVisible = header ? header.offsetHeight > 0 : false;
      const sidebar = document.querySelector('aside, [role="navigation"]');

      return {
        winW,
        winH,
        docScrollW: docEl.scrollWidth,
        bodyScrollW: body.scrollWidth,
        hasHorizScroll,
        horizDiff: Math.max(0, horizDiff),
        headerVisible,
        bodyTextLen: body.innerText.length,
      };
    });

    const filename = `vp_${vp.width}x${vp.height}.png`;
    const shotPath = path.join(OUT_DIR, filename);
    await page.screenshot({ path: shotPath, fullPage: false });

    // In modern responsive design, a layout passes if horizDiff <= 2 (allowing rounding pixel diff)
    const passed = metrics.horizDiff <= 2 && metrics.headerVisible && metrics.bodyTextLen > 500;
    const statusMark = passed ? '✅ PASS' : '❌ FAIL';

    console.log(`  ${statusMark} - Scroll diff: ${metrics.horizDiff}px, Header: ${metrics.headerVisible ? 'OK' : 'MISSING'}, Text: ${metrics.bodyTextLen} chars`);

    results.push({
      ...vp,
      ...metrics,
      passed,
      screenshot: filename,
    });
  }

  await browser.close();

  // Generate Markdown report
  const mdContent = `# Panorama SCADA — Responsive Layout & Viewport Verification Report

**Target URL:** ${TARGET_URL}  
**Date:** ${new Date().toISOString()}  
**Evaluator:** Google Chrome CDP Automated Engine  
**Total Viewports Tested:** ${VIEWPORTS.length}  
**Overall Result:** ${results.every(r => r.passed) ? '✅ ALL 10 VIEWPORTS PASSED' : '⚠️ SOME VIEWPORTS HAVE ISSUES'}  

---

## Viewport Verification Matrix

| Viewport Name | Target Dimensions | Actual Window | Horizontal Overflow | Header Status | Result | Screenshot |
|---|---|---|---|---|---|---|
${results.map(r => `| **${r.name}** | ${r.width} × ${r.height} | ${r.winW} × ${r.winH} | ${r.horizDiff === 0 ? 'None (0px)' : `${r.horizDiff}px`} | ${r.headerVisible ? '✅ Visible' : '❌ Hidden'} | ${r.passed ? '✅ PASS' : '❌ FAIL'} | [\`${r.screenshot}\`](${r.screenshot}) |`).join('\n')}

---

*Report generated automatically by tools/browser_audit/responsive_audit.cjs*
`;

  const reportPath = path.join(OUT_DIR, 'RESPONSIVE_AUDIT_REPORT.md');
  fs.writeFileSync(reportPath, mdContent, 'utf-8');
  console.log(`\n[COMPLETE] Responsive audit report written to: ${reportPath}`);

  const allPassed = results.every(r => r.passed);
  console.log(`Responsive Overall Status: ${allPassed ? 'ALL PASSED (10/10)' : 'ISSUES DETECTED'}\n`);
  return { allPassed, results };
}

if (require.main === module) {
  runResponsiveAudit()
    .then(r => process.exit(r.allPassed ? 0 : 1))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { runResponsiveAudit, VIEWPORTS };
