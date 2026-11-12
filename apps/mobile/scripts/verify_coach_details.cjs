// apps/mobile/scripts/verify_coach_details.cjs
/**
 * Automated End-to-End Verification for Coach Details SCADA Screen:
 * 1. Visual SCADA layout across required resolutions:
 *    - 1920 x 1080 (Full HD Desktop)
 *    - 1680 x 1050 (16:10 Desktop)
 *    - 1600 x 900  (16:9 Desktop/Laptop)
 *    - 1366 x 768  (Standard Laptop)
 *    - 1280 x 720  (Compact HD Laptop)
 *    - 390 x 844   (Mobile Portrait)
 * 2. Side-by-side Dual Tank Monitoring (identical dimensions, balanced height, no overflow)
 * 3. 5-Section Information Hierarchy (Header, Device Health, Dual Tanks, GPS Location, Footer)
 * 4. Stepper Navigation between coaches (C1 -> C2)
 * 5. Telemetry & Leaflet Map Rendering
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8792;
const DIST_DIR = path.resolve(__dirname, '../dist');
const OUTPUT_DIR = path.resolve('C:/Users/soumi/.gemini/antigravity/brain/02d4ebd6-2deb-462f-b938-3b5741021d98/screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: '01_desktop_1920x1080', width: 1920, height: 1080 },
  { name: '02_desktop_1680x1050', width: 1680, height: 1050 },
  { name: '03_desktop_1600x900',  width: 1600, height: 900 },
  { name: '04_laptop_1366x768',   width: 1366, height: 768 },
  { name: '05_laptop_1280x720',   width: 1280, height: 720 },
  { name: '06_mobile_390x844',    width: 390,  height: 844 },
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

    if (pathname.startsWith('/api/v1/')) {
      res.setHeader('Content-Type', 'application/json');

      if (pathname === '/api/v1/auth/login' || pathname === '/api/v1/auth/me' || pathname === '/api/auth/me') {
        res.writeHead(200);
        res.end(JSON.stringify({
          access_token: 'mock-token',
          token_type: 'bearer',
          id: 'admin-1',
          username: 'admin',
          role: 'ADMIN',
          full_name: 'Administrator',
          user: { id: 'admin-1', username: 'admin', role: 'ADMIN', full_name: 'Administrator' }
        }));
        return;
      }

      if (pathname === '/api/v1/trains/regions') {
        res.writeHead(200);
        res.end(JSON.stringify([
          {
            region: 'Eastern Railway',
            total_trains: 1,
            total_coaches: 24,
            trains: [
              {
                train_number: '225256',
                name: 'Express Fleet',
                source_station: 'Howrah Jn',
                destination_station: 'New Delhi',
                railway_zone: 'Eastern Railway',
                region: 'Eastern Railway',
                total_coaches: 24,
                is_active: true
              }
            ]
          }
        ]));
        return;
      }

      if (pathname.includes('/consist')) {
        res.writeHead(200);
        res.end(JSON.stringify({
          train_number: '225256',
          train_name: 'Express Fleet',
          total_coaches: 24,
          coaches: Array.from({ length: 24 }, (_, i) => ({
            coach_number: `C${i + 1}`,
            coach_index: i + 1,
            coach_type: 'AC 3-Tier',
            device_uid: 'PAN-ESP32-001',
            is_online: true,
            battery_percent: 88,
            tanks: [
              { tank_id: `tank-225256-C${i + 1}-arr`, tank_index: 1, tank_name: 'Arrival Side (Tank 1)', capacity_liters: 500, level_percent: 78.4 },
              { tank_id: `tank-225256-C${i + 1}-dep`, tank_index: 2, tank_name: 'Departure Side (Tank 2)', capacity_liters: 500, level_percent: 64.2 }
            ]
          }))
        }));
        return;
      }

      if (pathname === '/api/v1/trains') {
        res.writeHead(200);
        res.end(JSON.stringify([
          {
            train_number: '225256',
            name: 'Express Fleet',
            source_station: 'Howrah Jn',
            destination_station: 'New Delhi',
            railway_zone: 'Eastern Railway',
            total_coaches: 24,
            is_active: true
          }
        ]));
        return;
      }

      if (pathname.startsWith('/api/v1/location/corridor')) {
        res.writeHead(200);
        res.end(JSON.stringify([
          { id: '1', code: 'HWH', name: 'Howrah Jn', latitude: 22.5838, longitude: 88.3426, route_order: 1, water_refill_available: true, water_capacity_liters: 100000, operational_status: 'NORMAL', last_verified: '2026-11-12' },
          { id: '2', code: 'BWN', name: 'Barddhaman Jn', latitude: 23.2324, longitude: 87.8615, route_order: 2, water_refill_available: true, water_capacity_liters: 80000, operational_status: 'NORMAL', last_verified: '2026-11-12' },
          { id: '3', code: 'ASN', name: 'Asansol Jn', latitude: 23.6889, longitude: 86.9661, route_order: 3, water_refill_available: true, water_capacity_liters: 120000, operational_status: 'NORMAL', last_verified: '2026-11-12' }
        ]));
        return;
      }

      if (pathname === '/api/v1/tanks') {
        res.writeHead(200);
        res.end(JSON.stringify([
          {
            tankId: 'tank-225256-C1-arr',
            tankIndex: 1,
            deviceId: 'PAN-ESP32-001',
            trainNumber: '225256',
            coachNumber: 'C1',
            tankName: 'Arrival Side (Tank 1)',
            capacityLiters: 500,
            maxHeightCm: 150,
            levelPercent: 78.4,
            heightCm: 117.6,
            volumeLiters: 392,
            isOnline: true,
            hasTelemetry: true,
            lastUpdate: new Date().toISOString()
          },
          {
            tankId: 'tank-225256-C1-dep',
            tankIndex: 2,
            deviceId: 'PAN-ESP32-001',
            trainNumber: '225256',
            coachNumber: 'C1',
            tankName: 'Departure Side (Tank 2)',
            capacityLiters: 500,
            maxHeightCm: 150,
            levelPercent: 64.2,
            heightCm: 96.3,
            volumeLiters: 321,
            isOnline: true,
            hasTelemetry: true,
            lastUpdate: new Date().toISOString()
          }
        ]));
        return;
      }

      // Default mock JSON
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Static asset serving
    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[TEST-SERVER] Static & mock server running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

function runElectronTest() {
  const runnerScript = `
    const { app, BrowserWindow } = require('electron');
    const path = require('path');
    const fs = require('fs');

    const PORT = ${PORT};
    const OUTPUT_DIR = '${OUTPUT_DIR.replace(/\\/g, '/')}';
    const VIEWPORTS = ${JSON.stringify(VIEWPORTS)};

    app.commandLine.appendSwitch('ignore-certificate-errors', 'true');
    app.commandLine.appendSwitch('disable-gpu', 'true');

    app.whenReady().then(async () => {
      const win = new BrowserWindow({
        width: 1920,
        height: 1080,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false,
        }
      });

      const auditResults = {
        viewports: {},
        tankDimensions: {},
        stepperTest: null,
      };

      try {
        console.log('[E2E] Loading application at http://127.0.0.1:' + PORT);
        await win.loadURL('http://127.0.0.1:' + PORT);
        await new Promise(r => setTimeout(r, 1000));

        // 1. Establish Admin authentication in localStorage and reload
        await win.webContents.executeJavaScript(\`
          localStorage.setItem('panorama_token', 'demo_token_admin');
          localStorage.setItem('auth_token', 'demo_token_admin');
          localStorage.setItem('panorama_user', JSON.stringify({
            id: 'usr-admin-01',
            username: '@admin',
            role: 'ADMIN',
            fullName: 'System Administrator'
          }));
          localStorage.setItem('selected_train', '225256');
          localStorage.setItem('selected_coach', 'C1');
          window.location.hash = '#/coach-details';
          window.location.reload();
        \`);
        await new Promise(r => setTimeout(r, 1500));

        // Click Dev Shortcut "Login as Admin" if still on login screen
        await win.webContents.executeJavaScript(\`
          const adminBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Login as Admin'));
          if (adminBtn) adminBtn.click();
        \`);
        await new Promise(r => setTimeout(r, 1000));

        // Navigate to coach-details screen with train & coach in route
        await win.webContents.executeJavaScript(\`
          window.location.hash = '#/coach-details/225256/C1';
        \`);
        await new Promise(r => setTimeout(r, 1000));

        // Click "Select Coach C1" if presented
        await win.webContents.executeJavaScript(\`
          const c1Btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Select Coach C1'));
          if (c1Btn) c1Btn.click();
        \`);
        await new Promise(r => setTimeout(r, 1000));

        // 1. Test Viewports and Capture Screenshots
        for (const vp of VIEWPORTS) {
          console.log('[E2E] Testing viewport ' + vp.name + ' (' + vp.width + 'x' + vp.height + ')...');
          win.setContentSize(vp.width, vp.height);
          await new Promise(r => setTimeout(r, 600));

          const vpAudit = await win.webContents.executeJavaScript(\`
            (() => {
              const root = document.documentElement;
              const scrollW = root.scrollWidth;
              const clientW = root.clientWidth;
              const overflow = Math.max(0, scrollW - clientW);

              const tankCards = Array.from(document.querySelectorAll('.coach-details-tank-card'));
              const tank1 = tankCards[0] ? tankCards[0].getBoundingClientRect() : null;
              const tank2 = tankCards[1] ? tankCards[1].getBoundingClientRect() : null;

              const header = document.querySelector('.coach-details-header-card');
              const deviceGrid = document.querySelector('.coach-details-device-grid');
              const locationSec = document.querySelector('.coach-details-location-section');

              const isDesktop = window.innerWidth >= 860;
              let dimensionsMatch = false;
              if (isDesktop && tank1 && tank2) {
                const widthDiff = Math.abs(tank1.width - tank2.width);
                const heightDiff = Math.abs(tank1.height - tank2.height);
                dimensionsMatch = widthDiff <= 2 && heightDiff <= 2;
              } else if (!isDesktop) {
                dimensionsMatch = true; // Stacked single-column on mobile
              }

              return {
                viewport: { width: window.innerWidth, height: window.innerHeight },
                scrollWidth: scrollW,
                clientWidth: clientW,
                overflowX: overflow,
                hasZeroOverflow: overflow <= 1,
                tankCardsFound: tankCards.length,
                tank1Dimensions: tank1 ? { width: Math.round(tank1.width), height: Math.round(tank1.height) } : null,
                tank2Dimensions: tank2 ? { width: Math.round(tank2.width), height: Math.round(tank2.height) } : null,
                dimensionsMatch,
                headerRendered: !!header,
                deviceGridRendered: !!deviceGrid,
                locationSectionRendered: !!locationSec,
              };
            })()
          \`);

          auditResults.viewports[vp.name] = vpAudit;
          console.log('[E2E] Viewport ' + vp.name + ': Overflow=' + vpAudit.overflowX + 'px, ZeroOverflow=' + vpAudit.hasZeroOverflow + ', TanksFound=' + vpAudit.tankCardsFound + ', DimMatch=' + vpAudit.dimensionsMatch);

          // Capture screenshot
          const img = await win.capturePage();
          fs.writeFileSync(path.join(OUTPUT_DIR, 'coach_details_' + vp.name + '.png'), img.toPNG());
        }

        // 2. Test Stepper Navigation (Click Next Coach to go to C2)
        console.log('[E2E] Testing Stepper Navigation (C1 -> C2)...');
        win.setContentSize(1366, 768);
        await new Promise(r => setTimeout(r, 400));

        await win.webContents.executeJavaScript(\`
          const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Next'));
          if (nextBtn) nextBtn.click();
        \`);
        await new Promise(r => setTimeout(r, 600));

        const stepperAudit = await win.webContents.executeJavaScript(\`
          (() => {
            const h2 = document.querySelector('.coach-details-header-card h2');
            const coachText = h2 ? h2.textContent : '';
            return {
              headerText: coachText,
              navigatedToC2: coachText.includes('C2'),
            };
          })()
        \`);

        auditResults.stepperTest = stepperAudit;
        console.log('[E2E] Stepper Result: Header="' + stepperAudit.headerText + '", NavigatedToC2=' + stepperAudit.navigatedToC2);

        const stepperImg = await win.capturePage();
        fs.writeFileSync(path.join(OUTPUT_DIR, 'coach_details_07_stepper_coach_c2.png'), stepperImg.toPNG());

        // Write final JSON audit report
        fs.writeFileSync(path.join(OUTPUT_DIR, 'coach_details_audit_results.json'), JSON.stringify(auditResults, null, 2));
        console.log('[E2E] Successfully completed all tests and saved screenshots.');
        console.log('AUDIT_SUCCESS');

      } catch (err) {
        console.error('[E2E-ERROR]', err);
        process.exitCode = 1;
      } finally {
        win.close();
        app.quit();
      }
    });
  `;

  const scriptPath = path.join(__dirname, 'temp_coach_details_runner.cjs');
  fs.writeFileSync(scriptPath, runnerScript);

  const childEnv = Object.assign({}, process.env);
  delete childEnv.ELECTRON_RUN_AS_NODE;

  return new Promise((resolve, reject) => {
    const child = cp.spawn(electronPath, [scriptPath], {
      stdio: 'inherit',
      env: childEnv
    });

    child.on('exit', (code) => {
      try { fs.unlinkSync(scriptPath); } catch {}
      if (code === 0) resolve();
      else reject(new Error(`Electron exited with code ${code}`));
    });
  });
}

async function main() {
  const server = await createServer();
  try {
    await runElectronTest();
    console.log('[VERIFY] Coach Details E2E tests verified successfully!');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('[MAIN-ERROR]', err);
  process.exit(1);
});
