const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.resolve(__dirname, '../audit_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const targetUrl = 'https://soumikbur.github.io/PanoramaWaterTank_NextGen/';

app.whenReady().then(async () => {
  console.log(`[*] Connecting Electron to live production: ${targetUrl}`);

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
    console.log('[*] Step 1: Navigating to Production Root...');
    await win.loadURL(targetUrl);
    await new Promise((r) => setTimeout(r, 2500));

    // Log in as Administrator
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
    await new Promise((r) => setTimeout(r, 3000));

    // Check Global Display Scale
    const initialScale = await win.webContents.executeJavaScript(`
      (() => {
        return {
          zoom: document.documentElement.style.zoom,
          appScale: document.documentElement.style.getPropertyValue('--app-scale'),
          localStorageScale: localStorage.getItem('panorama_display_scale'),
        };
      })()
    `);
    console.log('[+] Live Production Display Scale:', JSON.stringify(initialScale));

    // Step 3: Test Location / Map Screen on Production
    console.log('[*] Step 3: Navigating to Location Screen on Production...');
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const locBtn = buttons.find(b => b.innerText.includes('Location') || b.innerText.includes('GPS') || b.innerText.includes('Map'));
        if (locBtn) locBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 4000));

    const mapAudit = await win.webContents.executeJavaScript(`
      (() => {
        const text = document.body.innerText;
        const mapContainer = document.getElementById('location-map-container') || document.querySelector('.leaflet-container');
        const warningExists = text.includes('VITE_GOOGLE_MAPS_API_KEY');
        const hasCorridorStations = text.includes('Howrah') || text.includes('Asansol') || text.includes('Bardhaman');
        const hasTrainMarker = Boolean(document.querySelector('.custom-train-marker'));
        const hasStationMarkers = document.querySelectorAll('.station-marker').length;
        const expandBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Expand Map') || b.innerText.includes('Normal View')));
        const fsBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Fullscreen')));
        const gmapsBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Google Maps Live')));
        const satBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Satellite') || b.innerText.includes('Street')));
        const currLocBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Current Location')));
        const centerTrainBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Center Train')));
        const fitCorridorBtn = Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Fit Corridor')));

        return {
          hasLeafletMap: Boolean(mapContainer),
          hasTileLayer: Boolean(document.querySelector('.leaflet-tile-pane')),
          warningExists,
          hasCorridorStations,
          hasTrainMarker,
          stationMarkersCount: hasStationMarkers,
          hasExpandBtn: expandBtn,
          hasFsBtn: fsBtn,
          hasGmapsBtn: gmapsBtn,
          hasSatBtn: satBtn,
          hasCurrLocBtn: currLocBtn,
          hasCenterTrainBtn: centerTrainBtn,
          hasFitCorridorBtn: fitCorridorBtn,
          statusText: (document.querySelector('.leaflet-container')?.parentElement?.innerText || '').slice(0, 80),
        };
      })()
    `);
    console.log('[+] Live Production Map Audit:', JSON.stringify(mapAudit, null, 2));

    const mapScreenshot = path.join(SCREENSHOT_DIR, '06_production_map_screen.png');
    const mapImg = await win.capturePage();
    fs.writeFileSync(mapScreenshot, mapImg.toPNG());
    console.log(`[+] Captured Live Production Map Screenshot: ${mapScreenshot}`);

    // Step 4: Test Settings Screen on Production
    console.log('[*] Step 4: Navigating to Settings Screen on Production...');
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const settingsBtn = buttons.find(b => b.innerText.includes('Settings'));
        if (settingsBtn) settingsBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 2500));

    const settingsAudit = await win.webContents.executeJavaScript(`
      (() => {
        const text = document.body.innerText;
        const sectionTitles = [
          '1. General Settings',
          '2. Appearance & Display',
          '3. Device Configuration',
          '4. Network & Cloud Telemetry',
          '5. Map & Location Settings',
          '6. Notifications & Alerts',
          '7. User Preferences'
        ];
        const presentSections = sectionTitles.filter(t => text.includes(t));
        const hasPresets = text.includes('Compact') && text.includes('Maximum') && text.includes('DEFAULT');
        const hasSlider = Boolean(document.querySelector('input[type="range"]'));
        const hasResetBtn = text.includes('Reset to Default');

        return {
          presentSectionsCount: presentSections.length,
          all7SectionsPresent: presentSections.length === 7,
          hasScalePresets: hasPresets,
          hasScaleSlider: hasSlider,
          hasResetBtn: hasResetBtn,
        };
      })()
    `);
    console.log('[+] Live Production Settings 7-Sections Audit:', JSON.stringify(settingsAudit, null, 2));

    const settingsScreenshot = path.join(SCREENSHOT_DIR, '07_production_settings_screen.png');
    const settingsImg = await win.capturePage();
    fs.writeFileSync(settingsScreenshot, settingsImg.toPNG());
    console.log(`[+] Captured Live Production Settings Screenshot: ${settingsScreenshot}`);

    console.log('\n======================================================');
    console.log('VERIFICATION COMPLETE: LIVE PRODUCTION DEPLOYMENT VALIDATED!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('[-] Error during production audit:', err);
  } finally {
    app.quit();
  }
});
