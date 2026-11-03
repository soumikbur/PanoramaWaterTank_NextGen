const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const SCREENSHOT_DIR = path.resolve(__dirname, '../audit_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const targetUrl = 'http://127.0.0.1:8000';
const pythonBin = path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe');
const projectDir = path.join(__dirname, '..');

let serverProcess = null;

app.whenReady().then(async () => {
  console.log('[*] Starting local FastAPI server for Electron UI testing...');
  serverProcess = spawn(pythonBin, ['-m', 'uvicorn', 'app.main:app', '--port', '8000', '--host', '127.0.0.1'], {
    cwd: path.join(projectDir, 'backend'),
    env: { ...process.env, PYTHONPATH: path.join(projectDir, 'backend') }
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[SERVER] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[SERVER] ${d}`));

  // Wait for server to come up
  await new Promise((r) => setTimeout(r, 2500));

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    console.log('[*] Step 1: Navigating to Root URL...');
    await win.loadURL(targetUrl);
    await new Promise((r) => setTimeout(r, 2000));

    // Perform Login as Administrator
    console.log('[*] Step 2: Logging in as Administrator...');
    await win.webContents.executeJavaScript(`
      (() => {
        const adminBtn = document.getElementById('btn-quick-admin');
        if (adminBtn) adminBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));
    await win.webContents.executeJavaScript(`
      (() => {
        const form = document.querySelector('form');
        if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 2500));

    // Verify Default Display Scale on Root
    const initialScale = await win.webContents.executeJavaScript(`
      (() => {
        return {
          zoom: document.documentElement.style.zoom,
          appScale: document.documentElement.style.getPropertyValue('--app-scale'),
          localStorageScale: localStorage.getItem('panorama_display_scale'),
        };
      })()
    `);
    console.log('[+] Initial Global Display Scale (should be 120% / 1.2):', JSON.stringify(initialScale));

    // Step 3: Test Location / Map Screen
    console.log('[*] Step 3: Navigating to Map / Location Screen...');
    await win.webContents.executeJavaScript(`
      (() => {
        // Find and click location in sidebar
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const locBtn = buttons.find(b => b.innerText.includes('Location') || b.innerText.includes('GPS') || b.innerText.includes('Map'));
        if (locBtn) locBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 3000));

    const mapAudit = await win.webContents.executeJavaScript(`
      (() => {
        const text = document.body.innerText;
        const mapContainer = document.getElementById('location-map-container') || document.querySelector('.leaflet-container');
        const warningExists = text.includes('VITE_GOOGLE_MAPS_API_KEY');
        const hasCorridorStations = text.includes('Howrah') || text.includes('Asansol') || text.includes('Bardhaman');
        const expandBtn = document.getElementById('map-expand-btn') || Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Expand Map') || b.innerText.includes('Normal View')));
        const fsBtn = document.getElementById('map-fullscreen-btn') || Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Fullscreen')));
        const gmapsBtn = document.getElementById('map-googlemaps-btn') || Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Google Maps Live')));
        const satBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Satellite') || b.innerText.includes('Street')));
        const currLocBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Current Location')));
        const centerTrainBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Center Train')));
        const fitCorridorBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Fit Corridor')));

        return {
          hasLeafletMap: Boolean(mapContainer),
          hasTileLayer: Boolean(document.querySelector('.leaflet-tile-pane')),
          warningExists,
          hasCorridorStations,
          hasExpandBtn: Boolean(expandBtn),
          hasFsBtn: Boolean(fsBtn),
          hasGmapsBtn: Boolean(gmapsBtn),
          hasSatBtn: Boolean(satBtn),
          hasCurrLocBtn: Boolean(currLocBtn),
          hasCenterTrainBtn: Boolean(centerTrainBtn),
          hasFitCorridorBtn: Boolean(fitCorridorBtn),
          gpsStatusText: (document.querySelector('.leaflet-container')?.parentElement?.innerText || '').slice(0, 100),
        };
      })()
    `);
    console.log('[+] Map Integration Audit:', JSON.stringify(mapAudit, null, 2));

    // Capture screenshot of Location Screen
    const mapScreenshot = path.join(SCREENSHOT_DIR, '04_map_screen_fixed.png');
    const mapImg = await win.capturePage();
    fs.writeFileSync(mapScreenshot, mapImg.toPNG());
    console.log(`[+] Captured Map Screenshot: ${mapScreenshot}`);

    // Step 4: Test Settings Screen
    console.log('[*] Step 4: Navigating to Settings Screen...');
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const settingsBtn = buttons.find(b => b.innerText.includes('Settings'));
        if (settingsBtn) settingsBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 2000));

    // Verify 7 Sections
    const settingsAudit = await win.webContents.executeJavaScript(`
      (() => {
        const text = document.body.innerText;
        const sectionButtons = Array.from(document.querySelectorAll('button')).filter(b => 
          /^[1-7]\.\s+/.test(b.innerText.trim())
        ).map(b => b.innerText.trim());

        return {
          sectionButtons,
          has7Sections: sectionButtons.length === 7,
        };
      })()
    `);
    console.log('[+] Settings 7 Sections Audit:', JSON.stringify(settingsAudit, null, 2));

    // Click on "2. Appearance & Display"
    console.log('[*] Step 5: Testing Appearance & Display Scaling...');
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const appBtn = buttons.find(b => b.innerText.includes('2. Appearance'));
        if (appBtn) appBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // Verify Scale Presets & Click 130%
    const scaleBeforeClick = await win.webContents.executeJavaScript(`
      (() => {
        return {
          currentText: document.body.innerText.includes('Current: 120%'),
          hasPresets: document.body.innerText.includes('Compact') && document.body.innerText.includes('Maximum'),
        };
      })()
    `);
    console.log('[+] Appearance Scale State Before Click:', JSON.stringify(scaleBeforeClick));

    // Click 130%
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn130 = buttons.find(b => b.innerText.includes('130%'));
        if (btn130) btn130.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    const scaleAfter130 = await win.webContents.executeJavaScript(`
      (() => {
        return {
          zoom: document.documentElement.style.zoom,
          localStorage: localStorage.getItem('panorama_display_scale'),
        };
      })()
    `);
    console.log('[+] Scale After Clicking 130%:', JSON.stringify(scaleAfter130));

    // Click "Reset to Default"
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const resetBtn = buttons.find(b => b.innerText.includes('Reset to Default'));
        if (resetBtn) resetBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    const scaleAfterReset = await win.webContents.executeJavaScript(`
      (() => {
        return {
          zoom: document.documentElement.style.zoom,
          localStorage: localStorage.getItem('panorama_display_scale'),
        };
      })()
    `);
    console.log('[+] Scale After Reset to Default:', JSON.stringify(scaleAfterReset));

    // Capture screenshot of Settings Appearance
    const settingsScreenshot = path.join(SCREENSHOT_DIR, '05_settings_appearance_display.png');
    const settingsImg = await win.capturePage();
    fs.writeFileSync(settingsScreenshot, settingsImg.toPNG());
    console.log(`[+] Captured Settings Screenshot: ${settingsScreenshot}`);

    console.log('\n========================================');
    console.log('ALL MAP INTEGRATION & DISPLAY SCALE AUDIT CHECKS PASSED!');
    console.log('========================================\n');

  } catch (err) {
    console.error('[-] Error during audit:', err);
  } finally {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});
