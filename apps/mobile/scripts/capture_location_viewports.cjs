// apps/mobile/scripts/capture_location_viewports.cjs
/**
 * Automated Multi-Viewport Screenshot Capture & Layout Audit
 * for Panorama Water Tank SCADA Mobile Location Screen
 *
 * Captures 8 viewports:
 * 1. 320x640 (small mobile)
 * 2. 360x800 (standard Android)
 * 3. 375x812 (iPhone X/11/12 mini)
 * 4. 390x844 (iPhone 13/14)
 * 5. 430x932 (iPhone 14/15 Pro Max)
 * 6. 768x1024 (iPad portrait)
 * 7. 1366x768 (standard laptop)
 * 8. 1920x1080 (full HD SCADA workstation)
 *
 * Plus 2 interaction states on mobile:
 * - Layers Menu Open
 * - Station Card Selection Overlay
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8770;
const DIST_DIR = path.resolve(__dirname, '../dist');
const OUTPUT_DIR = path.resolve('C:/Users/soumi/.gemini/antigravity/brain/02d4ebd6-2deb-462f-b938-3b5741021d98/screenshots');

const VIEWPORTS = [
  { name: '01_mobile_320x640', width: 320, height: 640, label: 'Small Mobile' },
  { name: '02_mobile_360x800', width: 360, height: 800, label: 'Standard Android' },
  { name: '03_mobile_375x812', width: 375, height: 812, label: 'iPhone X/11/12 Mini' },
  { name: '04_mobile_390x844', width: 390, height: 844, label: 'iPhone 13/14' },
  { name: '05_mobile_430x932', width: 430, height: 932, label: 'iPhone 14/15 Pro Max' },
  { name: '06_tablet_768x1024', width: 768, height: 1024, label: 'iPad Portrait' },
  { name: '07_desktop_1366x768', width: 1366, height: 768, label: 'Standard Laptop' },
  { name: '08_desktop_1920x1080', width: 1920, height: 1080, label: 'Full HD SCADA Workstation' },
];

// Mock Corridor Stations & Train Telemetry
const MOCK_STATIONS = [
  { id: 'hwh', name: 'Howrah Junction', code: 'HWH', latitude: 22.5839, longitude: 88.3426, route_order: 0, water_refill_available: true, water_capacity_liters: 50000, operational_status: 'Operational', last_verified: '05 Sep 2026', is_source: true },
  { id: 'kqu', name: 'Kamarkundu', code: 'KQU', latitude: 22.8272, longitude: 88.1969, route_order: 1, water_refill_available: false, water_capacity_liters: 0, operational_status: 'No Facility', last_verified: '05 Sep 2026' },
  { id: 'bwn', name: 'Bardhaman Junction', code: 'BWN', latitude: 23.2324, longitude: 87.8615, route_order: 2, water_refill_available: true, water_capacity_liters: 25000, operational_status: 'Operational', last_verified: '05 Sep 2026' },
  { id: 'pan', name: 'Panagarh', code: 'PAN', latitude: 23.4518, longitude: 87.4382, route_order: 3, water_refill_available: false, water_capacity_liters: 0, operational_status: 'No Facility', last_verified: '05 Sep 2026' },
  { id: 'dgr', name: 'Durgapur', code: 'DGR', latitude: 23.5014, longitude: 87.3119, route_order: 4, water_refill_available: true, water_capacity_liters: 20000, operational_status: 'Operational', last_verified: '05 Sep 2026' },
  { id: 'rng', name: 'Raniganj', code: 'RNG', latitude: 23.6186, longitude: 87.1358, route_order: 5, water_refill_available: false, water_capacity_liters: 0, operational_status: 'No Facility', last_verified: '05 Sep 2026' },
  { id: 'asn', name: 'Asansol Junction', code: 'ASN', latitude: 23.6871, longitude: 86.9746, route_order: 6, water_refill_available: true, water_capacity_liters: 30000, operational_status: 'Operational', last_verified: '05 Sep 2026', is_destination: true }
];

const MOCK_LOCATIONS = [
  {
    train_number: '225256',
    train_name: 'Eastern Express Fleet',
    current_latitude: 23.2324,
    current_longitude: 87.8615,
    current_speed_kmh: 88.5,
    current_altitude: 42.0,
    heading_degrees: 315,
    satellites: 9,
    has_gps: true,
    coach_number: 'C1',
    is_simulated: false,
    last_update: new Date().toISOString()
  }
];

function createServer() {
  const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/v1/auth/me' || pathname === '/api/auth/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'usr-admin-01',
        username: '@admin',
        full_name: 'System Administrator',
        role: 'ADMIN',
        is_active: true,
        must_change_password: false,
      }));
      return;
    }

    if (pathname === '/api/v1/auth/login' || pathname === '/api/auth/login') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'demo_token_admin',
        token_type: 'bearer',
        user: {
          id: 'usr-admin-01',
          username: 'admin',
          full_name: 'System Administrator',
          role: 'ADMIN',
          is_active: true,
        }
      }));
      return;
    }

    if (pathname === '/api/v1/location/corridor' || pathname === '/api/v1/corridor/stations' || pathname === '/api/corridor-stations') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(MOCK_STATIONS));
      return;
    }

    if (pathname === '/api/v1/location' || pathname.startsWith('/api/v1/location?') || pathname === '/api/locations') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(MOCK_LOCATIONS));
      return;
    }

    if (pathname === '/api/v1/tanks/live' || pathname === '/api/tanks/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tanks: [
          { id: 'T-101', name: 'Coach A1 Water Tank', level: 78.4, capacity: 500, status: 'NORMAL', waterLevel: 78.4 }
        ],
        timestamp: new Date().toISOString()
      }));
      return;
    }

    if (pathname === '/api/v1/alerts/active' || pathname === '/api/alerts/active') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    if (pathname === '/api/v1/health' || pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'HEALTHY', timestamp: new Date().toISOString() }));
      return;
    }

    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  return server;
}

const runnerScript = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const PORT = ${PORT};
const OUTPUT_DIR = '${OUTPUT_DIR.replace(/\\/g, '/')}';
const VIEWPORTS = ${JSON.stringify(VIEWPORTS)};

app.whenReady().then(async () => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const win = new BrowserWindow({
    width: 390,
    height: 844,
    show: false,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  try {
    console.log('[*] Setting authentication and loading Application...');
    await win.loadURL('http://127.0.0.1:' + PORT + '/');
    await win.webContents.executeJavaScript(\`
      localStorage.setItem('panorama_token', 'demo_token_admin');
      localStorage.setItem('panorama_user', JSON.stringify({
        id: 'usr-admin-01',
        username: 'admin',
        full_name: 'System Administrator',
        role: 'ADMIN',
        is_active: true,
      }));
      localStorage.setItem('panorama_display_preferences_admin', JSON.stringify({
        scale: '100%',
        fontSize: 'small',
        layoutDensity: 'COMFORTABLE',
        contrastMode: 'STANDARD'
      }));
    \`);

    // Navigate to Location & GPS screen via URL hash route
    console.log('[*] Navigating to Location & GPS (#/location)...');
    await win.loadURL('http://127.0.0.1:' + PORT + '/#/location');
    await new Promise(r => setTimeout(r, 2200));

    const auditResults = [];

    // Capture each viewport
    for (const vp of VIEWPORTS) {
      console.log('[*] Testing Viewport: ' + vp.label + ' (' + vp.width + 'x' + vp.height + ')...');
      win.setContentSize(vp.width, vp.height);
      await new Promise(r => setTimeout(r, 1200));

      // Trigger Leaflet invalidateSize
      await win.webContents.executeJavaScript(\`
        (() => {
          window.dispatchEvent(new Event('resize'));
        })()
      \`);
      await new Promise(r => setTimeout(r, 800));

      const metrics = await win.webContents.executeJavaScript(\`
        (() => {
          const mapWrapper = document.getElementById('location-map-wrapper');
          const mapContainer = document.getElementById('location-map-container');
          const fabStack = document.querySelector('.location-fab-stack');
          const desktopToolbar = document.querySelector('.location-desktop-toolbar');
          const layersToggle = document.getElementById('map-layers-toggle-btn');
          const fullscreenBtn = document.getElementById('map-fullscreen-btn');
          const stationCards = document.querySelectorAll('.location-corridor-cards-mobile > div');
          const tableRows = document.querySelectorAll('tbody tr');

          const mapHeight = mapWrapper ? mapWrapper.offsetHeight : 0;
          const mapWidth = mapWrapper ? mapWrapper.offsetWidth : 0;
          const vpHeight = window.innerHeight;
          const vpWidth = window.innerWidth;
          const coveragePct = vpHeight > 0 ? ((mapHeight / vpHeight) * 100).toFixed(1) : '0';
          const hasHScroll = document.documentElement.scrollWidth > window.innerWidth + 2;

          return {
            mapHeight,
            mapWidth,
            vpHeight,
            vpWidth,
            coveragePct: Number(coveragePct),
            hasHScroll,
            hasFabStack: Boolean(fabStack),
            hasDesktopToolbar: Boolean(desktopToolbar),
            hasLayersToggle: Boolean(layersToggle),
            hasFullscreenBtn: Boolean(fullscreenBtn),
            stationCardsCount: stationCards.length,
            tableRowsCount: tableRows.length
          };
        })()
      \`);

      const screenshot = await win.webContents.capturePage();
      const filePath = path.join(OUTPUT_DIR, 'location_' + vp.name + '.png');
      fs.writeFileSync(filePath, screenshot.toPNG());
      console.log('  [CAPTURED] ' + filePath);
      console.log('  [METRICS] Map size: ' + metrics.mapWidth + 'x' + metrics.mapHeight + 'px (' + metrics.coveragePct + '% of viewport). Horizontal scroll: ' + (metrics.hasHScroll ? 'YES (OVERFLOW!)' : 'NONE (PASS)'));

      auditResults.push({ viewport: vp, metrics, filePath });
    }

    // Interaction 1: Open Layers Popover on mobile (390x844)
    console.log('[*] Testing Mobile Interaction: Layers Popover...');
    win.setContentSize(390, 844);
    await new Promise(r => setTimeout(r, 800));

    await win.webContents.executeJavaScript(\`
      (() => {
        window.dispatchEvent(new Event('resize'));
      })()
    \`);
    await new Promise(r => setTimeout(r, 400));

    await win.webContents.executeJavaScript(\`
      (() => {
        const toggle = document.getElementById('map-layers-toggle-btn');
        if (toggle) toggle.click();
      })()
    \`);
    await new Promise(r => setTimeout(r, 800));

    const layersShot = await win.webContents.capturePage();
    const layersPath = path.join(OUTPUT_DIR, 'location_09_mobile_390x844_layers_popover.png');
    fs.writeFileSync(layersPath, layersShot.toPNG());
    console.log('  [CAPTURED] ' + layersPath);

    // Interaction 2: Select Bardhaman Station on mobile (390x844)
    console.log('[*] Testing Mobile Interaction: Station Card Selection...');
    await win.webContents.executeJavaScript(\`
      (() => {
        // Close layers popover by clicking outside or toggle
        const toggle = document.getElementById('map-layers-toggle-btn');
        if (toggle) toggle.click();
      })()
    \`);
    await new Promise(r => setTimeout(r, 400));

    await win.webContents.executeJavaScript(\`
      (() => {
        const cards = document.querySelectorAll('.location-corridor-cards-mobile > div');
        for (const card of cards) {
          if (card.textContent.includes('BWN') || card.textContent.includes('Bardhaman')) {
            card.click();
            break;
          }
        }
      })()
    \`);
    await new Promise(r => setTimeout(r, 1000));

    const cardSelectShot = await win.webContents.capturePage();
    const cardSelectPath = path.join(OUTPUT_DIR, 'location_10_mobile_390x844_station_selected.png');
    fs.writeFileSync(cardSelectPath, cardSelectShot.toPNG());
    console.log('  [CAPTURED] ' + cardSelectPath);

    console.log('\\n======================================================');
    console.log(' MULTI-VIEWPORT AUDIT REPORT');
    console.log('======================================================');
    let allPassed = true;
    for (const r of auditResults) {
      const isMobile = r.viewport.width < 768;
      const coveragePass = isMobile ? (r.metrics.coveragePct >= 55) : true;
      const hScrollPass = !r.metrics.hasHScroll;
      const passed = coveragePass && hScrollPass;
      if (!passed) allPassed = false;

      console.log((passed ? '[PASS] ' : '[FAIL] ') + r.viewport.label + ' (' + r.viewport.width + 'x' + r.viewport.height + '):' +
        ' Map=' + r.metrics.mapWidth + 'x' + r.metrics.mapHeight + ' (' + r.metrics.coveragePct + '%), ' +
        ' Overflow=' + (r.metrics.hasHScroll ? 'FAIL' : 'OK') + ', ' +
        ' Cards=' + r.metrics.stationCardsCount + ', Table=' + r.metrics.tableRowsCount);
    }
    console.log('======================================================');
    console.log(allPassed ? '[SUCCESS] ALL 8 VIEWPORTS PASSED WITH ZERO OVERFLOW!' : '[WARN] SOME VIEWPORTS HAVE ISSUES');

    app.quit();
  } catch (err) {
    console.error('[ERROR during viewport capture]:', err);
    app.exit(1);
  }
});
`;

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`[*] Mock Server listening on http://localhost:${PORT}`);

  const tempRunnerPath = path.resolve(__dirname, 'temp_viewport_runner.cjs');
  fs.writeFileSync(tempRunnerPath, runnerScript);

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = cp.spawn(electronPath, [tempRunnerPath], {
    stdio: 'inherit',
    env,
  });

  child.on('close', (code) => {
    try {
      fs.unlinkSync(tempRunnerPath);
    } catch (e) {}
    server.close(() => {
      console.log('[*] Test server closed.');
      process.exit(code || 0);
    });
  });
}

main().catch((err) => {
  console.error('[FATAL]:', err);
  process.exit(1);
});
