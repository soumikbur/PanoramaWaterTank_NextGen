// scripts/audit_stm32_architecture.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'audit_screenshots', 'stm32_architecture');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runAudit() {
  console.log('[AUDIT] Initializing Electron audit for STM32 architecture and UI presentation...');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const consoleErrors = [];
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 3) {
      console.error(`[BROWSER ERROR] ${message} (${sourceId}:${line})`);
      consoleErrors.push(message);
    }
  });

  const targetUrl = process.env.TEST_TARGET_URL || 'http://127.0.0.1:3001';
  console.log(`[AUDIT] Loading ${targetUrl} ...`);
  await win.loadURL(targetUrl);

  const waitFor = async (fn, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const res = await win.webContents.executeJavaScript(`(${fn.toString()})()`);
      if (res) return res;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };

  // Wait for initial render
  await waitFor(() => {
    const isSpinner = document.body.innerText.includes('Initializing Panorama SCADA Console');
    const hasPassword = Boolean(document.querySelector('input[type="password"]'));
    const hasNav = Boolean(document.getElementById('nav-location'));
    return !isSpinner && (hasPassword || hasNav);
  });

  // Neutralize blocking window.alert
  await win.webContents.executeJavaScript('(() => { window.alert = (msg) => console.log("[WINDOW ALERT]", msg); return null; })()');

  // Check login
  const isLoginPage = await win.webContents.executeJavaScript(`
    Boolean(document.querySelector('input[type="password"]'))
  `);

  if (isLoginPage) {
    console.log('[AUDIT] Logging in as Administrator...');
    await win.webContents.executeJavaScript(`
      (() => {
        const userInputs = document.querySelectorAll('input');
        if (userInputs[0]) {
          userInputs[0].value = 'admin';
          userInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (userInputs[1]) {
          userInputs[1].value = 'admin123';
          userInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        }
        const submitBtn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Sign In') || b.textContent.includes('Log In')));
        if (submitBtn) submitBtn.click();
      })()
    `);
    await waitFor(() => Boolean(document.getElementById('nav-location') || Array.from(document.querySelectorAll('button, span, div')).find(el => el.textContent && el.textContent.trim() === 'Dashboard')));
  }

  const screens = [
    { id: 'dashboard', name: 'Dashboard', navId: 'nav-dashboard', label: 'Dashboard' },
    { id: 'trains', name: 'Train Management', navId: 'nav-trains', label: 'Train Management' },
    { id: 'watertank', name: 'All Tanks', navId: 'nav-watertank', label: 'All Tanks' },
    { id: 'devices', name: 'Devices', navId: 'nav-devices', label: 'Devices' },
    { id: 'location', name: 'Location & GPS', navId: 'nav-location', label: 'Location & GPS' },
    { id: 'alerts', name: 'Alerts', navId: 'nav-alerts', label: 'Alerts' },
    { id: 'history', name: 'History', navId: 'nav-history', label: 'History' },
    { id: 'reports', name: 'Reports', navId: 'nav-reports', label: 'Reports' },
    { id: 'settings', name: 'Settings', navId: 'nav-settings', label: 'Settings' },
    { id: 'users', name: 'User Management', navId: 'nav-users', label: 'User Management' },
    { id: 'logs', name: 'System Logs', navId: 'nav-logs', label: 'System Logs' },
  ];

  const forbiddenTerms = [
    'ESP32',
    'ESP-32',
    'ESP32-S3',
    'ESP32S3',
    'ESP-IDF',
    'BME280',
    'PGA Gain',
    'A_air',
    'GPIO',
    'EEPROM Backup',
  ];

  const auditReport = [];

  for (const s of screens) {
    console.log(`[AUDIT] Auditing page: ${s.name} ...`);

    // Click nav button using data-screen attribute
    const clickResult = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('button[data-screen="${s.id}"]');
        if (btn) {
          btn.click();
          return 'Clicked data-screen: ' + btn.getAttribute('data-screen');
        }
        const textBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.trim() === '${s.label}');
        if (textBtn) {
          textBtn.click();
          return 'Clicked by text: ' + textBtn.textContent.trim();
        }
        return 'Button not found for ${s.id}';
      })()
    `);
    console.log(`[AUDIT] ${s.name} nav result: ${clickResult}`);

    await new Promise((r) => setTimeout(r, 1200));

    // Special action for Devices page: inspect device drawer
    if (s.id === 'devices') {
      await win.webContents.executeJavaScript(`
        (() => {
          const inspectBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Inspect');
          if (inspectBtn) inspectBtn.click();
        })()
      `);
      await new Promise((r) => setTimeout(r, 600));
    }

    const pageText = await win.webContents.executeJavaScript('document.body.innerText');
    const foundForbidden = forbiddenTerms.filter((term) => pageText.toLowerCase().includes(term.toLowerCase()));

    // Capture screenshot
    const img = await win.capturePage();
    const screenshotPath = path.join(SCREENSHOT_DIR, `${s.id}_audit.png`);
    fs.writeFileSync(screenshotPath, img.toPNG());

    auditReport.push({
      page: s.name,
      violations: foundForbidden,
      passed: foundForbidden.length === 0,
      textLength: pageText.length,
    });

    if (foundForbidden.length > 0) {
      console.warn(`[AUDIT WARNING] Page '${s.name}' contains obsolete terms:`, foundForbidden);
    } else {
      console.log(`[AUDIT PASS] Page '${s.name}' is free of obsolete low-level hardware terms.`);
    }

    // Close drawer if opened
    if (s.id === 'devices') {
      await win.webContents.executeJavaScript(`
        (() => {
          const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Close') || b.textContent.includes('Dismiss')));
          if (closeBtn) closeBtn.click();
        })()
      `);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  console.log('\n[AUDIT SUMMARY REPORT]');
  console.table(auditReport);

  const totalViolations = auditReport.reduce((acc, r) => acc + r.violations.length, 0);
  console.log('[AUDIT] Total violations detected:', totalViolations);
  console.log('[AUDIT] Total console errors:', consoleErrors.length);

  if (totalViolations > 0) {
    throw new Error(`Audit failed: ${totalViolations} obsolete hardware references still detected!`);
  }

  console.log('[AUDIT] ALL 11 PAGES PASSED THE STM32 ARCHITECTURE AUDIT WITH ZERO VIOLATIONS!');
  app.quit();
}

app.whenReady().then(runAudit).catch((err) => {
  console.error('[AUDIT FATAL ERROR]', err);
  app.exit(1);
});
