// scripts/test_electron_browser.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

async function runAudit() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  console.log('Loading http://127.0.0.1:3001 ...');
  await win.loadURL('http://127.0.0.1:3001');

  // Wait for React to mount
  await new Promise((r) => setTimeout(r, 2000));

  const title = await win.getTitle();
  console.log('Page Title:', title);

  const screens = [
    'dashboard',
    'trains',
    'watertank',
    'devices',
    'location',
    'alerts',
    'history',
    'reports',
    'settings',
    'users',
    'logs',
  ];

  const results = {};

  for (const s of screens) {
    // Navigate by clicking the sidebar item or setting state
    await win.webContents.executeJavaScript(`
      (() => {
        // Find button or nav link with text or icon for screen: ${s}
        const buttons = Array.from(document.querySelectorAll('button, div, span'));
        // Try finding matching nav item in sidebar
        const navMap = {
          dashboard: 'Dashboard',
          trains: 'Train Management',
          watertank: 'All Tanks',
          devices: 'Devices',
          location: 'Location & GPS',
          alerts: 'Alerts',
          history: 'History',
          reports: 'Reports',
          settings: 'Settings',
          users: 'User Management',
          logs: 'System Logs'
        };
        const targetText = navMap['${s}'];
        for (const el of buttons) {
          if (el.textContent && el.textContent.trim() === targetText) {
            el.click();
            return 'Clicked ' + targetText;
          }
        }
        return 'Not found: ' + targetText;
      })()
    `);

    await new Promise((r) => setTimeout(r, 1200));

    // Capture text content
    const textContent = await win.webContents.executeJavaScript(`
      document.body.innerText
    `);

    // Capture screenshot
    const image = await win.capturePage();
    const screenshotPath = path.join(
      __dirname,
      '..',
      'WLI_DOCS',
      'audit_screenshots',
      `audit_awaiting_${s}.png`
    );
    fs.writeFileSync(screenshotPath, image.toPNG());

    // Check for demo markers
    const hasFakeCoords = textContent.includes('27.8500') || textContent.includes('77.8000') || textContent.includes('28.6139');
    const hasFakeLevel = textContent.includes('68.4%') || textContent.includes('68.4 %');
    const hasFakeVoltage = textContent.includes('12.60 V');
    const hasWaiting = textContent.includes('Waiting for Telemetry') || textContent.includes('Awaiting Telemetry') || textContent.includes('GPS data unavailable') || textContent.includes('N/A');

    results[s] = {
      screenshot: screenshotPath,
      hasFakeCoords,
      hasFakeLevel,
      hasFakeVoltage,
      hasWaiting,
      snippet: textContent.slice(0, 300).replace(/\n+/g, ' ')
    };
    console.log(`[Screen: ${s}] Checked. Fake coords: ${hasFakeCoords}, Fake level: ${hasFakeLevel}, Empty state handled: ${hasWaiting}`);
  }

  const resultsPath = path.join(__dirname, '..', 'WLI_DOCS', 'audit_screenshots', 'test_b_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log('Test B audit complete. Results saved to:', resultsPath);

  app.quit();
}

app.whenReady().then(runAudit).catch((err) => {
  console.error('Audit run failed:', err);
  app.exit(1);
});

