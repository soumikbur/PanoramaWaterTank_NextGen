/**
 * Comprehensive Browser Audit Runner for Panorama Water Tank NextGen
 * Uses the project's native Electron/Chromium runtime to test, navigate,
 * capture screenshots, and audit console/network events at multiple viewport resolutions.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const AUDIT_OUT_DIR = path.resolve(__dirname, '../../WLI_DOCS/audit_screenshots');
if (!fs.existsSync(AUDIT_OUT_DIR)) {
  fs.mkdirSync(AUDIT_OUT_DIR, { recursive: true });
}

const RESOLUTIONS = [
  { width: 1920, height: 1080, name: '1920x1080_fullhd' },
  { width: 1600, height: 900, name: '1600x900_desktop' },
  { width: 1366, height: 768, name: '1366x768_laptop' },
  { width: 1280, height: 720, name: '1280x720_hd' },
  { width: 768, height: 1024, name: '768x1024_tablet' }
];

const SCREENS = [
  'trains',
  'dashboard',
  'watertank',
  'devices',
  'location',
  'alerts',
  'history',
  'reports',
  'settings',
  'users',
  'logs'
];

const consoleLogs = [];
const errors = [];

app.whenReady().then(async () => {
  console.log('[*] Starting Panorama NextGen Automated Browser Quality Audit...');

  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const entry = `[LVL:${level}] ${message} (${sourceId}:${line})`;
    consoleLogs.push(entry);
    if (level >= 2 || message.toLowerCase().includes('error')) {
      errors.push(entry);
      console.warn(`[BROWSER ERROR] ${entry}`);
    } else {
      console.log(`[BROWSER LOG] ${entry}`);
    }
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    const err = `[LOAD FAIL] Code ${code}: ${desc} at ${url}`;
    errors.push(err);
    console.error(err);
  });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    console.log('[*] Loading Application at http://127.0.0.1:3001/ ...');
    await win.loadURL('http://127.0.0.1:3001/');
    await sleep(2500); // Allow initial REST, Leaflet tiles, and WebSocket handshake

    // PASS 1: Screen-by-Screen Navigation Audit (1920x1080)
    console.log('\n=== PASS 1: FUNCTIONAL & STRUCTURAL SCREEN AUDIT (1920x1080) ===');
    for (const screen of SCREENS) {
      console.log(`[*] Auditing Screen: [${screen}] ...`);
      // Trigger navigation via React AppContext
      await win.webContents.executeJavaScript(`
        (() => {
          // Find sidebar button for screen or click navigation button
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
          const btn = buttons.find(b => b.innerText && b.innerText.toLowerCase().includes('${screen.toLowerCase()}'));
          if (btn) btn.click();
        })();
      `);
      await sleep(1500);

      // Capture screenshot
      const image = await win.capturePage();
      const filename = path.join(AUDIT_OUT_DIR, `pass1_screen_${screen}.png`);
      fs.writeFileSync(filename, image.toPNG());
      console.log(`[+] Captured: ${filename} (${(image.toPNG().length / 1024).toFixed(1)} KB)`);
    }

    // PASS 2: Responsive Viewport Multi-Resolution Audit
    console.log('\n=== PASS 2: RESPONSIVE VIEWPORT & VISUAL AUDIT ===');
    for (const res of RESOLUTIONS) {
      console.log(`[*] Testing Viewport: ${res.name} (${res.width}x${res.height}) ...`);
      win.setSize(res.width, res.height);
      await sleep(1200);

      // Test Location & GPS screen at this resolution
      await win.webContents.executeJavaScript(`
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => b.innerText && b.innerText.includes('Location'));
          if (btn) btn.click();
        })();
      `);
      await sleep(1200);

      const imageLoc = await win.capturePage();
      const fileLoc = path.join(AUDIT_OUT_DIR, `pass2_location_${res.name}.png`);
      fs.writeFileSync(fileLoc, imageLoc.toPNG());

      // Test Settings screen at this resolution
      await win.webContents.executeJavaScript(`
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => b.innerText && b.innerText.includes('Settings'));
          if (btn) btn.click();
        })();
      `);
      await sleep(1200);

      const imageSettings = await win.capturePage();
      const fileSettings = path.join(AUDIT_OUT_DIR, `pass2_settings_${res.name}.png`);
      fs.writeFileSync(fileSettings, imageSettings.toPNG());
      console.log(`[+] Captured ${res.name} Location & Settings screenshots.`);
    }

    // PASS 3: Interactive Features & Regression Audit
    console.log('\n=== PASS 3: INTERACTIVE FEATURES & REGRESSION AUDIT ===');
    
    // Test 3.1: Sidebar Collapse & Expand
    console.log('[*] Testing Sidebar Collapse and Expand...');
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const collapseBtn = buttons.find(b => b.innerText && (b.innerText.includes('Collapse') || b.innerText.includes('«')));
        if (collapseBtn) collapseBtn.click();
      })();
    `);
    await sleep(1000);
    let img = await win.capturePage();
    fs.writeFileSync(path.join(AUDIT_OUT_DIR, 'pass3_sidebar_collapsed.png'), img.toPNG());

    // Re-expand
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const expandBtn = buttons.find(b => b.innerText && b.innerText.includes('»'));
        if (expandBtn) expandBtn.click();
      })();
    `);
    await sleep(800);

    // Test 3.2: Settings Test MQTT button click
    console.log('[*] Testing Settings Test MQTT Action in UI...');
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const testBtn = buttons.find(b => b.innerText && b.innerText.includes('Test MQTT Broker'));
        if (testBtn) testBtn.click();
      })();
    `);
    await sleep(1200);
    img = await win.capturePage();
    fs.writeFileSync(path.join(AUDIT_OUT_DIR, 'pass3_settings_mqtt_tested.png'), img.toPNG());

    // Write Audit Summary JSON
    const auditSummary = {
      timestamp: new Date().toISOString(),
      url: 'http://127.0.0.1:3001/',
      passesCompleted: 3,
      resolutionsTested: RESOLUTIONS.map(r => `${r.width}x${r.height}`),
      screensTested: SCREENS,
      totalConsoleLogs: consoleLogs.length,
      totalErrorsLogged: errors.length,
      errors: errors,
      screenshotsSaved: fs.readdirSync(AUDIT_OUT_DIR).length,
    };

    fs.writeFileSync(
      path.join(AUDIT_OUT_DIR, 'audit_results.json'),
      JSON.stringify(auditSummary, null, 2)
    );

    console.log('\n[+] Browser Quality Audit Completed Successfully!');
    console.log(`[+] Screenshots and summary saved to ${AUDIT_OUT_DIR}`);
    console.log(`[+] Total Console Logs: ${consoleLogs.length}`);
    console.log(`[+] Total Errors Logged: ${errors.length}`);
  } catch (err) {
    console.error('[-] Error during audit execution:', err);
  } finally {
    app.quit();
  }
});

