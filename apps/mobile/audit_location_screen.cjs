const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUDIT_OUT_DIR = path.resolve(__dirname, '../../WLI_DOCS/audit_screenshots');
if (!fs.existsSync(AUDIT_OUT_DIR)) {
  fs.mkdirSync(AUDIT_OUT_DIR, { recursive: true });
}

const RESOLUTIONS = [
  { width: 1920, height: 1080, name: '1920x1080_fullhd' },
  { width: 1600, height: 900, name: '1600x900_desktop' },
  { width: 1366, height: 768, name: '1366x768_laptop' },
];

const consoleErrors = [];
const consoleWarns = [];

app.whenReady().then(async () => {
  console.log('[*] Starting Location & GPS Screen Comprehensive Browser Audit...');

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

  try {
    const targetUrl = 'http://127.0.0.1:3001';
    console.log(`[*] Loading target URL: ${targetUrl}...`);
    await win.loadURL(targetUrl);

    // Wait for hydration & login
    await new Promise((r) => setTimeout(r, 2000));

    // Ensure logged in and on 'location' screen
    await win.webContents.executeJavaScript(`
      (() => {
        // Find and click Location in sidebar
        const btn = document.querySelector('button[data-screen="location"]');
        if (btn) {
          btn.click();
          console.log('[TEST] Clicked button[data-screen="location"]');
        } else {
          const navItems = Array.from(document.querySelectorAll('button'));
          const loc = navItems.find(b => b.textContent && b.textContent.includes('Location'));
          if (loc) loc.click();
        }
      })()
    `);

    await new Promise((r) => setTimeout(r, 2500));

    // 1. Audit Table and Map Elements
    const auditData = await win.webContents.executeJavaScript(`
      (() => {
        const tableRows = document.querySelectorAll('tbody tr');
        const stationCodes = Array.from(tableRows).map(r => {
          const cells = r.querySelectorAll('td');
          return cells.length >= 3 ? cells[1].textContent.trim() : '';
        });

        const mapCanvas = document.querySelector('.leaflet-container');
        const tiles = document.querySelectorAll('.leaflet-tile-loaded');
        const markers = document.querySelectorAll('.station-marker, .custom-train-marker');
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());

        return {
          rowCount: tableRows.length,
          stationCodes,
          hasMap: !!mapCanvas,
          tileCount: tiles.length,
          markerCount: markers.length,
          availableButtons: buttons
        };
      })()
    `);

    console.log('[✓] Location Page Elements Audit:', JSON.stringify(auditData, null, 2));

    // 2. Test Interactions: Click Station Marker & Locate on Map
    console.log('[*] Testing interaction: Click Locate Map on Bardhaman (BWN)...');
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = document.querySelectorAll('tbody tr');
        for (const row of rows) {
          if (row.textContent.includes('BWN') || row.textContent.includes('Bardhaman')) {
            const btn = row.querySelector('button');
            if (btn) btn.click();
            break;
          }
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    // 3. Test Interaction: Satellite Layer Toggle
    console.log('[*] Testing interaction: Toggle Satellite Layer...');
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const satBtn = buttons.find(b => b.textContent.includes('Satellite') || b.textContent.includes('Street'));
        if (satBtn) satBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    // 4. Test Interaction: Toggle Expand Map
    console.log('[*] Testing interaction: Toggle Expand Map...');
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const expBtn = buttons.find(b => b.textContent.includes('Expand Map'));
        if (expBtn) expBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    // Return to Normal view for standard multi-resolution captures
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const normalBtn = buttons.find(b => b.textContent.includes('Normal'));
        if (normalBtn) normalBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // 5. Capture at all requested desktop resolutions
    for (const res of RESOLUTIONS) {
      console.log(`[*] Capturing screenshot at ${res.width}x${res.height} (${res.name})...`);
      win.setSize(res.width, res.height);
      await new Promise((r) => setTimeout(r, 1000));

      const image = await win.capturePage();
      const filename = `location_rebuilt_${res.name}.png`;
      const outPath = path.join(AUDIT_OUT_DIR, filename);
      fs.writeFileSync(outPath, image.toPNG());
      console.log(`[✓] Saved: ${outPath}`);
    }

    console.log('[*] Total Console Errors:', consoleErrors.length);
    console.log('[*] Audit completed successfully!');
    app.quit();
  } catch (err) {
    console.error('[!] Audit runner exception:', err);
    app.exit(1);
  }
});
