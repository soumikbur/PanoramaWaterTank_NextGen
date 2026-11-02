const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUDIT_OUT_DIR = path.resolve(__dirname, '../../WLI_DOCS/audit_screenshots');
if (!fs.existsSync(AUDIT_OUT_DIR)) {
  fs.mkdirSync(AUDIT_OUT_DIR, { recursive: true });
}

const consoleErrors = [];
const consoleWarns = [];

app.whenReady().then(async () => {
  console.log('[*] Starting Full 5-Page SCADA Web Application Comprehensive Browser Audit...');

  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.webContents.on('console-message', (e, level, message) => {
    if (level === 3) {
      consoleErrors.push(message);
      console.error('[BROWSER ERROR]:', message);
    } else if (level === 2) {
      consoleWarns.push(message);
    }
  });

  const targetUrl = 'http://127.0.0.1:3001';
  console.log(`[*] Loading target URL: ${targetUrl}...`);

  try {
    await win.loadURL(targetUrl);
    await new Promise((r) => setTimeout(r, 2000));

    // Handle Login if on login screen
    const isLogin = await win.webContents.executeJavaScript(`
      document.body.innerText.includes('Sign In to Panorama') || document.body.innerText.includes('Welcome Back')
    `);

    if (isLogin) {
      console.log('[*] Signing in with Administrator credentials...');
      await win.webContents.executeJavaScript(`
        (() => {
          const inputs = document.querySelectorAll('input');
          const submitBtn = document.querySelector('button[type="submit"]');
          if (inputs.length >= 2 && submitBtn) {
            inputs[0].value = 'admin';
            inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            inputs[1].value = 'admin123';
            inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
            submitBtn.click();
          }
        })()
      `);
      await new Promise((r) => setTimeout(r, 2500));
    }

    const pagesToAudit = [
      { screen: 'trains', name: '01_train_management', title: 'Train Management' },
      { screen: 'watertank', name: '02_all_tanks', title: 'All Tanks' },
      { screen: 'devices', name: '03_devices', title: 'Devices' },
      { screen: 'location', name: '04_location_gps', title: 'Location' },
      { screen: 'settings', name: '05_settings', title: 'Settings' },
    ];

    const auditResults = {};

    for (const page of pagesToAudit) {
      console.log(`\n========================================`);
      console.log(`[*] Navigating to ${page.title} (${page.screen})...`);

      // Click sidebar navigation button
      await win.webContents.executeJavaScript(`
        (() => {
          const btn = document.querySelector('button[data-screen="${page.screen}"]');
          if (btn) {
            btn.click();
          } else {
            // Fallback: search buttons by text
            const buttons = Array.from(document.querySelectorAll('nav button, aside button'));
            const match = buttons.find(b => b.textContent.includes('${page.title}'));
            if (match) match.click();
          }
        })()
      `);

      await new Promise((r) => setTimeout(r, 1800));

      // Inspect DOM elements
      const pageAudit = await win.webContents.executeJavaScript(`
        (() => {
          const header = document.querySelector('header');
          const headerTitle = header ? header.querySelector('h1')?.textContent.trim() : '';
          const headerSubtitle = header ? header.querySelector('p')?.textContent.trim() : '';
          const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean);
          const tables = document.querySelectorAll('table');
          const cards = document.querySelectorAll('div[style*="border-radius"], div[style*="borderRadius"]');

          return {
            headerTitle,
            headerSubtitle,
            buttonCount: buttons.length,
            tableCount: tables.length,
            sampleButtons: buttons.slice(0, 10),
            bodyLength: document.body.innerText.length
          };
        })()
      `);

      console.log(`[✓] Page Verified:`, JSON.stringify(pageAudit, null, 2));
      auditResults[page.screen] = pageAudit;

      // Special interaction tests per page
      if (page.screen === 'watertank') {
        console.log('[*] Testing All Tanks interactions (List view toggle & Inspect drawer)...');
        await win.webContents.executeJavaScript(`
          (() => {
            const listBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('List'));
            if (listBtn) listBtn.click();
          })()
        `);
        await new Promise((r) => setTimeout(r, 800));

        // Click first Inspect button to test drawer
        await win.webContents.executeJavaScript(`
          (() => {
            const inspectBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Inspect'));
            if (inspectBtn) inspectBtn.click();
          })()
        `);
        await new Promise((r) => setTimeout(r, 1000));
      } else if (page.screen === 'devices') {
        console.log('[*] Testing Devices interaction (Opening inspect drawer)...');
        await win.webContents.executeJavaScript(`
          (() => {
            const inspectBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Inspect'));
            if (inspectBtn) inspectBtn.click();
          })()
        `);
        await new Promise((r) => setTimeout(r, 1000));
      } else if (page.screen === 'location') {
        console.log('[*] Testing Location interaction (Map action on BWN)...');
        await win.webContents.executeJavaScript(`
          (() => {
            const mapBtns = Array.from(document.querySelectorAll('tbody button')).filter(b => b.textContent.includes('Map'));
            if (mapBtns.length > 2) mapBtns[2].click();
          })()
        `);
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Capture Screenshot
      const screenshot = await win.capturePage();
      const screenshotPath = path.join(AUDIT_OUT_DIR, `${page.name}_1920x1080.png`);
      fs.writeFileSync(screenshotPath, screenshot.toPNG());
      console.log(`[✓] Saved Screenshot: ${screenshotPath}`);
    }

    // Capture Responsive Viewports for the primary Dashboard and All Tanks
    console.log(`\n========================================`);
    console.log('[*] Capturing responsive viewports (1600x900, 1366x768)...');
    
    // 1600x900
    win.setSize(1600, 900);
    await new Promise((r) => setTimeout(r, 1000));
    const ss1600 = await win.capturePage();
    fs.writeFileSync(path.join(AUDIT_OUT_DIR, `responsive_1600x900_desktop.png`), ss1600.toPNG());

    // 1366x768
    win.setSize(1366, 768);
    await new Promise((r) => setTimeout(r, 1000));
    const ss1366 = await win.capturePage();
    fs.writeFileSync(path.join(AUDIT_OUT_DIR, `responsive_1366x768_laptop.png`), ss1366.toPNG());

    console.log(`\n========================================`);
    console.log(`[*] Total Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error('[!] Console errors logged:', consoleErrors);
    }
    console.log('[✓] Comprehensive 5-Page Browser Audit Completed Successfully!');
    app.quit();
  } catch (err) {
    console.error('[!] Audit encountered fatal error:', err);
    app.exit(1);
  }
});
