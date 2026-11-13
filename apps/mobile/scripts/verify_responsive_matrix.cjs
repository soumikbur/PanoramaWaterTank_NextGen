// apps/mobile/scripts/verify_responsive_matrix.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const userDataPath = path.join(os.tmpdir(), 'electron-resp-suite-' + Date.now());
app.setPath('userData', userDataPath);

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8000';
const SCREENSHOT_DIR = 'C:\\Users\\soumi\\.gemini\\antigravity\\brain\\02d4ebd6-2deb-462f-b938-3b5741021d98\\screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function saveShot(win, name) {
  await win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  await sleep(300);
  const img = await win.webContents.capturePage();
  const outPath = path.join(SCREENSHOT_DIR, name);
  fs.writeFileSync(outPath, img.toPNG());
  console.log('[SCREENSHOT SAVED]', outPath);
  return outPath;
}

async function loginAsAdmin(win) {
  await win.loadURL(BASE_URL);
  await sleep(1500);

  console.log('[AUTH] Logging in as @admin...');
  await win.webContents.executeJavaScript(`
    (async () => {
      const res = await window.fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '@admin', password: 'Admin@123' })
      });
      const data = await res.json();
      localStorage.setItem('panorama_token', data.access_token);
      localStorage.setItem('panorama_user', JSON.stringify(data.user));
    })()
  `);
  
  await win.loadURL(BASE_URL);
  await sleep(2500);

  const authenticated = await win.webContents.executeJavaScript(`
    Boolean(document.querySelector('header'))
  `);
  console.log('[AUTH] Authenticated and Header present:', authenticated);
}

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

const VIEWPORT_MATRIX = [
  { width: 1920, height: 1080, name: '1920x1080 Full HD Desktop', expectedGridCols: 4, isMobile: false },
  { width: 1600, height: 900,  name: '1600x900 Large Desktop',   expectedGridCols: 4, isMobile: false },
  { width: 1440, height: 900,  name: '1440x900 Standard Desktop', expectedGridCols: [2, 3, 4], isMobile: false },
  { width: 1366, height: 768,  name: '1366x768 Standard Laptop',  expectedGridCols: [2, 3, 4], isMobile: false },
  { width: 1280, height: 720,  name: '1280x720 Small Laptop',     expectedGridCols: [2, 3, 4], isMobile: false },
  { width: 1024, height: 768,  name: '1024x768 Compact Desktop',  expectedGridCols: 2, isMobile: false },
  { width: 768,  height: 1024, name: '768x1024 Tablet Portrait',  expectedGridCols: 2, isMobile: false },
  { width: 480,  height: 960,  name: '480x960 Compact Phablet',   expectedGridCols: 1, isMobile: true },
  { width: 390,  height: 844,  name: '390x844 iPhone Mobile',     expectedGridCols: 1, isMobile: true },
  { width: 360,  height: 800,  name: '360x800 Android Mobile',    expectedGridCols: 1, isMobile: true },
  { width: 320,  height: 700,  name: '320x700 Small Mobile',      expectedGridCols: 1, isMobile: true },
];

const ZOOM_LEVELS = [0.8, 1.0, 1.25, 1.5];

app.whenReady().then(async () => {
  console.log('================================================================');
  console.log('=== FULL-SCALE RESPONSIVE & UI/UX VERIFICATION TEST SUITE ===');
  console.log('================================================================');

  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
    },
  });

  const testResults = [];

  try {
    await loginAsAdmin(win);
    console.log('[AUTH] Admin authenticated successfully.');

    // =========================================================================
    // PART 1: 11 VIEWPORTS RESPONSIVE AUDIT
    // =========================================================================
    console.log('\n--- PART 1: 11 VIEWPORTS AUDIT ---');

    for (const vp of VIEWPORT_MATRIX) {
      console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height})...`);
      win.setContentSize(vp.width, vp.height);
      await sleep(700);

      // Check horizontal overflow & basic layout properties
      const layoutData = await win.webContents.executeJavaScript(`
        (() => {
          const docEl = document.documentElement;
          const body = document.body;
          const winWidth = window.innerWidth;
          const docScrollW = docEl.scrollWidth;
          const bodyScrollW = body.scrollWidth;
          const hasHorizontalOverflow = docScrollW > winWidth + 2 || bodyScrollW > winWidth + 2;

          // Header checks
          const header = document.querySelector('header');
          const headerWidth = header ? header.getBoundingClientRect().width : 0;

          // Desktop controls
          const desktopSettingsBtn = document.getElementById('header-settings-btn');
          const desktopLogoutBtn = document.getElementById('header-signout-btn');
          const desktopSearch = document.querySelector('.header-search-container');
          
          let desktopSettingsVisible = false;
          let desktopLogoutVisible = false;
          let desktopSettingsInBounds = false;
          let desktopLogoutInBounds = false;

          if (desktopSettingsBtn) {
            const rect = desktopSettingsBtn.getBoundingClientRect();
            desktopSettingsVisible = rect.width > 0 && rect.height > 0 && desktopSettingsBtn.offsetParent !== null;
            desktopSettingsInBounds = rect.right <= winWidth + 2 && rect.left >= 0;
          }

          if (desktopLogoutBtn) {
            const rect = desktopLogoutBtn.getBoundingClientRect();
            desktopLogoutVisible = rect.width > 0 && rect.height > 0 && desktopLogoutBtn.offsetParent !== null;
            desktopLogoutInBounds = rect.right <= winWidth + 2 && rect.left >= 0;
          }

          // Mobile controls
          const mobileSettingsBtn = document.getElementById('mobile-header-settings-btn');
          const mobileAccountBtn = document.getElementById('mobile-account-menu-btn');
          const mobileHamburger = document.querySelector('header button[aria-label="Toggle menu"], header button svg.lucide-menu');

          let mobileSettingsVisible = false;
          let mobileAccountBtnVisible = false;

          if (mobileSettingsBtn) {
            const rect = mobileSettingsBtn.getBoundingClientRect();
            mobileSettingsVisible = rect.width > 0 && rect.height > 0 && mobileSettingsBtn.offsetParent !== null;
          }
          if (mobileAccountBtn) {
            const rect = mobileAccountBtn.getBoundingClientRect();
            mobileAccountBtnVisible = rect.width > 0 && rect.height > 0 && mobileAccountBtn.offsetParent !== null;
          }

          // Sidebar checks
          const sidebar = document.querySelector('aside.sidebar-desktop');
          let sidebarWidth = 0;
          let sidebarDisplay = 'none';
          if (sidebar) {
            const sRect = sidebar.getBoundingClientRect();
            sidebarWidth = Math.round(sRect.width);
            sidebarDisplay = window.getComputedStyle(sidebar).display;
          }

          return {
            winWidth,
            docScrollW,
            bodyScrollW,
            hasHorizontalOverflow,
            headerWidth,
            desktopSettingsVisible,
            desktopLogoutVisible,
            desktopSettingsInBounds,
            desktopLogoutInBounds,
            mobileSettingsVisible,
            mobileAccountBtnVisible,
            hasMobileHamburger: Boolean(mobileHamburger),
            sidebarWidth,
            sidebarDisplay
          };
        })()
      `);

      // Test mobile account menu if on mobile viewport
      let mobileMenuTested = false;
      if (vp.isMobile) {
        mobileMenuTested = await win.webContents.executeJavaScript(`
          (async () => {
            const btn = document.getElementById('mobile-account-menu-btn');
            if (!btn) return false;
            btn.click();
            await new Promise(r => setTimeout(r, 200));
            const dropdown = document.getElementById('mobile-account-dropdown');
            const settingsBtn = document.getElementById('mobile-menu-settings-btn');
            const logoutBtn = document.getElementById('mobile-menu-logout-btn');
            const isOpen = dropdown && dropdown.offsetParent !== null;
            const hasSettings = settingsBtn && settingsBtn.offsetParent !== null;
            const hasLogout = logoutBtn && logoutBtn.offsetParent !== null;
            // Close menu
            btn.click();
            await new Promise(r => setTimeout(r, 100));
            return isOpen && hasSettings && hasLogout;
          })()
        `);
      }

      // Test Railway Regions Grid by navigating to Train Management screen
      await win.webContents.executeJavaScript(`
        (() => {
          // If window.panoramaNavigate exists, use it
          if (window.panoramaNavigate) {
            window.panoramaNavigate('trains');
          } else {
            window.location.hash = '#/trains';
            const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
            const trainsBtn = buttons.find(b => b.textContent && (b.textContent.includes('Train Fleet') || b.textContent.includes('Train Management')));
            if (trainsBtn) trainsBtn.click();
          }
        })()
      `);
      await sleep(600);

      const gridInfo = await win.webContents.executeJavaScript(`
        (() => {
          const grid = document.querySelector('.railway-regions-grid');
          if (!grid) return { found: false, cols: 0 };
          const style = window.getComputedStyle(grid);
          const colString = style.gridTemplateColumns || '';
          const cols = colString.split(' ').filter(c => c.trim().length > 0).length;
          return { found: true, cols, colString };
        })()
      `);

      // Return to Dashboard screen
      await win.webContents.executeJavaScript(`
        (() => {
          if (window.panoramaNavigate) {
            window.panoramaNavigate('dashboard');
          } else {
            window.location.hash = '#/dashboard';
            const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
            const dashBtn = buttons.find(b => b.textContent && b.textContent.includes('Dashboard'));
            if (dashBtn) dashBtn.click();
          }
        })()
      `);
      await sleep(500);

      // Verify grid column count
      let gridValid = false;
      if (Array.isArray(vp.expectedGridCols)) {
        gridValid = vp.expectedGridCols.includes(gridInfo.cols);
      } else {
        gridValid = gridInfo.cols === vp.expectedGridCols;
      }

      // Check settings & logout access
      const settingsAccessible = vp.isMobile ? layoutData.mobileSettingsVisible : (layoutData.desktopSettingsVisible && layoutData.desktopSettingsInBounds);
      const logoutAccessible = vp.isMobile ? mobileMenuTested : (layoutData.desktopLogoutVisible && layoutData.desktopLogoutInBounds);

      const pass = !layoutData.hasHorizontalOverflow && settingsAccessible && logoutAccessible && gridValid;

      const result = {
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        hasOverflow: layoutData.hasHorizontalOverflow,
        scrollWidth: layoutData.docScrollW,
        settingsAccessible,
        logoutAccessible,
        gridCols: gridInfo.cols,
        expectedCols: vp.expectedGridCols,
        gridValid,
        sidebarWidth: layoutData.sidebarWidth,
        sidebarDisplay: layoutData.sidebarDisplay,
        pass
      };

      testResults.push(result);

      console.log(`  -> Overflow: ${layoutData.hasHorizontalOverflow ? 'FAIL (Overflow detected!)' : 'PASS (Clean, no overflow)'} (scrollWidth: ${layoutData.docScrollW}px vs win: ${vp.width}px)`);
      console.log(`  -> Settings accessible: ${settingsAccessible ? 'PASS' : 'FAIL'}`);
      console.log(`  -> Logout accessible: ${logoutAccessible ? 'PASS' : 'FAIL'}`);
      console.log(`  -> Railway grid cols: ${gridInfo.cols} (expected ${JSON.stringify(vp.expectedGridCols)}) -> ${gridValid ? 'PASS' : 'FAIL'}`);
      console.log(`  -> Sidebar width: ${layoutData.sidebarWidth}px (display: ${layoutData.sidebarDisplay})`);
      console.log(`  -> Overall Viewport Status: ${pass ? 'PASSED' : 'FAILED'}`);

      const shotName = `resp_${vp.width}x${vp.height}.png`;
      await saveShot(win, shotName);
    }

    // =========================================================================
    // PART 2: ZOOM LEVELS AUDIT (1366x768 & 1280x720)
    // =========================================================================
    console.log('\n--- PART 2: ZOOM LEVELS AUDIT ---');
    const zoomResults = [];

    const zoomViewports = [
      { width: 1366, height: 768, name: '1366x768 Standard Laptop' },
      { width: 1280, height: 720, name: '1280x720 Small Laptop' }
    ];

    for (const zvp of zoomViewports) {
      win.setContentSize(zvp.width, zvp.height);
      await sleep(500);

      for (const zoom of ZOOM_LEVELS) {
        console.log(`Testing ${zvp.name} at Zoom ${(zoom * 100).toFixed(0)}%...`);
        win.webContents.setZoomFactor(zoom);
        await sleep(600);

        const zoomCheck = await win.webContents.executeJavaScript(`
          (() => {
            const winWidth = window.innerWidth;
            const docScrollW = document.documentElement.scrollWidth;
            const settingsBtn = document.getElementById('header-settings-btn');
            const logoutBtn = document.getElementById('header-signout-btn');
            
            let settingsOk = false;
            let logoutOk = false;
            if (settingsBtn) {
              const r = settingsBtn.getBoundingClientRect();
              settingsOk = r.width > 0 && r.right <= winWidth + 5;
            }
            if (logoutBtn) {
              const r = logoutBtn.getBoundingClientRect();
              logoutOk = r.width > 0 && r.right <= winWidth + 5;
            }
            return {
              winWidth,
              docScrollW,
              settingsOk,
              logoutOk,
              hasOverflow: docScrollW > winWidth + 5
            };
          })()
        `);

        const zoomPass = zoomCheck.settingsOk && zoomCheck.logoutOk && !zoomCheck.hasOverflow;
        zoomResults.push({
          viewport: zvp.name,
          zoom: `${(zoom * 100).toFixed(0)}%`,
          settingsOk: zoomCheck.settingsOk,
          logoutOk: zoomCheck.logoutOk,
          hasOverflow: zoomCheck.hasOverflow,
          pass: zoomPass
        });

        console.log(`  -> Settings OK: ${zoomCheck.settingsOk}, Logout OK: ${zoomCheck.logoutOk}, Overflow: ${zoomCheck.hasOverflow ? 'FAIL' : 'PASS'} -> ${zoomPass ? 'PASS' : 'FAIL'}`);
        await saveShot(win, `resp_zoom_${zvp.width}x${zvp.height}_${(zoom * 100).toFixed(0)}pct.png`);
      }

      // Reset zoom factor
      win.webContents.setZoomFactor(1.0);
      await sleep(300);
    }

    // =========================================================================
    // PART 3: SUMMARY REPORT
    // =========================================================================
    console.log('\n================================================================');
    console.log('=== RESPONSIVE TESTING SUMMARY ===');
    console.log('================================================================');
    console.table(testResults.map(r => ({
      Viewport: r.viewport,
      'No Overflow': !r.hasOverflow ? 'PASS' : 'FAIL',
      'Settings Visible': r.settingsAccessible ? 'PASS' : 'FAIL',
      'Logout Visible': r.logoutAccessible ? 'PASS' : 'FAIL',
      'Grid Cols': `${r.gridCols} (${r.gridValid ? 'PASS' : 'FAIL'})`,
      Result: r.pass ? 'PASSED' : 'FAILED'
    })));

    console.log('\n=== ZOOM TESTING SUMMARY ===');
    console.table(zoomResults.map(r => ({
      Viewport: r.viewport,
      Zoom: r.zoom,
      'Settings In View': r.settingsOk ? 'PASS' : 'FAIL',
      'Logout In View': r.logoutOk ? 'PASS' : 'FAIL',
      'No Overflow': !r.hasOverflow ? 'PASS' : 'FAIL',
      Result: r.pass ? 'PASSED' : 'FAILED'
    })));

    const allPassed = testResults.every(r => r.pass) && zoomResults.every(r => r.pass);
    console.log(`\nFinal Test Verdict: ${allPassed ? 'ALL TESTS PASSED' : 'FAILURES OCCURRED'}`);
    win.destroy();
    app.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Test execution error:', err);
    if (!win.isDestroyed()) win.destroy();
    app.exit(1);
  }
});
