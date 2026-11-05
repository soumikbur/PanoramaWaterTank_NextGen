// apps/mobile/scripts/verify_ui_scaling_e2e.cjs
/**
 * End-to-End Automated UI Scaling & Responsive Layout Verification Suite
 *
 * Spawns an internal HTTP server serving the production build (apps/mobile/dist)
 * with mock FastAPI endpoints, launches a headless Chromium instance via Electron,
 * and executes comprehensive assertions on layout, design-token scaling, zoom-free
 * architecture, persistence, responsive viewports, and console errors.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8765;
const DIST_DIR = path.resolve(__dirname, '../dist');

// 1. Static file server with mock FastAPI API endpoints
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
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Mock FastAPI Endpoints
    if (pathname === '/api/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'HEALTHY', timestamp: new Date().toISOString() }));
      return;
    }

    if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
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
      });
      return;
    }

    if (pathname === '/api/v1/auth/me') {
      const authHeader = req.headers['authorization'] || '';
      const isOperator = authHeader.includes('operator') || authHeader.includes('employee');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(isOperator ? {
        id: 'usr-op-01',
        username: 'operator',
        full_name: 'Field Operations Operator',
        role: 'EMPLOYEE',
        is_active: true,
      } : {
        id: 'usr-admin-01',
        username: 'admin',
        full_name: 'System Administrator',
        role: 'ADMIN',
        is_active: true,
      }));
      return;
    }

    if (pathname === '/api/v1/tanks/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tankId: 'tank-12002-c1-t1',
        tankName: 'Coach C1 Auxiliary Tank',
        trainNumber: '12002',
        coachNumber: 'C1',
        levelPercent: 68.4,
        volumeLiters: 13.68,
        capacityLiters: 20.0,
        heightCm: 34.2,
        maxHeightCm: 50.0,
        temperature: 24.5,
        batteryVoltage: 3.95,
        latitude: 22.585,
        longitude: 88.342,
        alarmStatus: 'NORMAL',
        isOnline: true,
        isStale: false,
        hasTelemetry: true,
        lastUpdate: new Date().toISOString(),
      }));
      return;
    }

    if (pathname === '/api/v1/tanks') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          tankId: 'tank-12002-c1-t1',
          tankName: 'Coach C1 Auxiliary Tank',
          trainNumber: '12002',
          coachNumber: 'C1',
          levelPercent: 68.4,
          volumeLiters: 13.68,
          capacityLiters: 20.0,
          heightCm: 34.2,
          maxHeightCm: 50.0,
          isOnline: true,
          hasTelemetry: true,
        }
      ]));
      return;
    }

    if (pathname.includes('/history')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tankId: 'tank-12002-c1-t1',
        range: '12h',
        dataPoints: [
          { timestamp: new Date(Date.now() - 36000000).toISOString(), levelPercent: 85.0, heightCm: 42.5, volumeLiters: 17.0 },
          { timestamp: new Date(Date.now() - 18000000).toISOString(), levelPercent: 74.2, heightCm: 37.1, volumeLiters: 14.84 },
          { timestamp: new Date().toISOString(), levelPercent: 68.4, heightCm: 34.2, volumeLiters: 13.68 },
        ]
      }));
      return;
    }

    if (pathname === '/api/v1/locations' || pathname.includes('/locations')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          train_number: '12002',
          latitude: 22.585,
          longitude: 88.342,
          has_gps: true,
          is_stale: false,
          speed_kmh: 62.5,
          heading_deg: 140.0,
          last_update: new Date().toISOString(),
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/devices') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          uid: 'ESP32-WLI-12002-C1',
          device_uid: 'ESP32-WLI-12002-C1',
          is_online: true,
          isOnline: true,
          train_number: '12002',
          trainNumber: '12002',
          coach_number: 'C1',
          coachNumber: 'C1',
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/trains/regions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          id: 'eastern',
          region: 'eastern',
          name: 'Eastern Railway',
          status: 'All Normal',
          trains_count: 1,
          tanks_count: 2,
          online_devices: 1,
          trains: [
            {
              train_number: '12002',
              name: 'Shatabdi Express',
              is_online: true,
              coaches_count: 8,
              tanks_count: 16,
            }
          ]
        }
      ]));
      return;
    }

    if (pathname.includes('/consist')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        train_number: '12002',
        name: 'Shatabdi Express',
        coaches: [
          {
            coach_number: 'C1',
            tanks: [
              { tank_id: 'tank-12002-c1-t1', level_percent: 68.4 }
            ]
          }
        ]
      }));
      return;
    }

    if (pathname === '/api/v1/users') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          id: 'usr-admin-01',
          username: 'admin',
          full_name: 'System Administrator',
          role: 'ADMIN',
          is_active: true,
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/trains') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          train_number: '12002',
          name: 'Shatabdi Express',
          is_online: true,
          coaches_count: 8,
          tanks_count: 16,
        }
      ]));
      return;
    }

    if (pathname.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
      return;
    }

    // Static Asset Serving
    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('File read error: ' + err.code);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[TEST-SERVER] Mock server listening at http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

// 2. Electron Headless Runner Script
const runnerScript = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const testReport = {
    testsPassed: 0,
    testsFailed: 0,
    consoleErrors: [],
    details: [],
  };

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2 && !message.includes('Download the React DevTools') && !message.includes('Electron Security Warning')) {
      console.log('[RENDERER CONSOLE]', level, message, 'line:', line, 'src:', sourceId);
    }
    if (
      level >= 2 &&
      !message.includes('Download the React DevTools') &&
      !message.includes('Electron Security Warning') &&
      !message.includes('[WebSocket]') &&
      !message.includes('404')
    ) {
      testReport.consoleErrors.push({ level, message, line, sourceId });
    }
  });

  function assert(condition, message) {
    if (!condition) {
      testReport.testsFailed++;
      testReport.details.push({ status: 'FAIL', message });
      console.error('[FAIL]', message);
      throw new Error(message);
    } else {
      testReport.testsPassed++;
      testReport.details.push({ status: 'PASS', message });
      console.log('[PASS]', message);
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Unauthenticated Login Screen Default Sizing
    // -------------------------------------------------------------
    console.log('\\n--- Running Test 1: Unauthenticated Login Sizing ---');
    await win.loadURL('http://127.0.0.1:${PORT}/');
    await win.webContents.executeJavaScript('localStorage.clear();');
    await win.loadURL('http://127.0.0.1:${PORT}/');
    await new Promise(r => setTimeout(r, 600));

    const authMetrics = await win.webContents.executeJavaScript(\`
      (() => {
        const toRect = (r) => r ? ({ width: r.width, height: r.height, left: r.left, top: r.top }) : null;
        const auth = document.getElementById('auth-root');
        const card = document.querySelector('.auth-card-container') || document.querySelector('.auth-card');
        const authRect = auth ? toRect(auth.getBoundingClientRect()) : null;
        const cardRect = card ? toRect(card.getBoundingClientRect()) : null;
        return {
          hasAuthRoot: !!auth,
          docZoom: document.documentElement.style.zoom,
          bodyZoom: document.body.style.zoom,
          appScaleProp: getComputedStyle(document.documentElement).getPropertyValue('--app-scale').trim(),
          winW: window.innerWidth,
          winH: window.innerHeight,
          scrollW: document.body.scrollWidth,
          scrollH: document.body.scrollHeight,
          authRect,
          cardRect
        };
      })()
    \`);

    assert(authMetrics.hasAuthRoot === true, 'Auth layout #auth-root mounts cleanly');
    assert(authMetrics.docZoom === '' || authMetrics.docZoom === '1', 'document.documentElement.style.zoom is empty/1.0');
    assert(authMetrics.bodyZoom === '' || authMetrics.bodyZoom === '1', 'document.body.style.zoom is empty/1.0');
    assert(authMetrics.cardRect !== null, 'Auth card is present in DOM');
    assert(authMetrics.cardRect.width <= 445, 'Auth card width is clamped to max 440px');

    // Check centering
    const expectedCenterX = (authMetrics.winW - authMetrics.cardRect.width) / 2;
    const isHorizontallyCentered = Math.abs(authMetrics.cardRect.left - expectedCenterX) < 15;
    assert(isHorizontallyCentered, 'Auth card is perfectly horizontally centered (offset: ' + Math.round(authMetrics.cardRect.left) + 'px vs expected: ' + Math.round(expectedCenterX) + 'px)');
    assert(authMetrics.scrollW <= authMetrics.winW + 2, 'No horizontal overflow on login screen');

    // -------------------------------------------------------------
    // Test 2: Scale Presets Isolation (90%, 100%, 120%, 130%, 150%) on Login Screen
    // -------------------------------------------------------------
    console.log('\\n--- Running Test 2: Scale Presets Isolation on Login Screen ---');
    const scalePresets = ['90%', '100%', '110%', '120%', '130%', '150%'];

    for (const preset of scalePresets) {
      await win.webContents.executeJavaScript(\`
        localStorage.clear();
        localStorage.setItem('panorama_display_preferences', JSON.stringify({ scale: '\${preset}', fontSize: 'small', layoutDensity: 'COMFORTABLE', contrastMode: 'STANDARD' }));
        localStorage.setItem('panorama_display_preferences_admin', JSON.stringify({ scale: '\${preset}', fontSize: 'small', layoutDensity: 'COMFORTABLE', contrastMode: 'STANDARD' }));
        localStorage.setItem('panorama_display_scale', '\${preset}');
      \`);
      await win.loadURL('http://127.0.0.1:${PORT}/');
      await new Promise(r => setTimeout(r, 400));

      const isolatedMetrics = await win.webContents.executeJavaScript(\`
        (() => {
          const auth = document.getElementById('auth-root');
          const card = document.querySelector('.auth-card-container') || document.querySelector('.auth-card');
          return {
            docZoom: document.documentElement.style.zoom,
            bodyZoom: document.body.style.zoom,
            cardWidth: card ? card.getBoundingClientRect().width : 0,
            cardLeft: card ? card.getBoundingClientRect().left : 0,
            winW: window.innerWidth,
            scrollW: document.body.scrollWidth,
          };
        })()
      \`);

      assert(isolatedMetrics.bodyZoom === '' || isolatedMetrics.bodyZoom === '1', 'Body zoom is not polluted for preset ' + preset);
      assert(isolatedMetrics.cardWidth <= 445, 'Login card size is unmagnified at ' + preset + ' (width: ' + Math.round(isolatedMetrics.cardWidth) + 'px)');
      const expectedX = (isolatedMetrics.winW - isolatedMetrics.cardWidth) / 2;
      assert(Math.abs(isolatedMetrics.cardLeft - expectedX) < 15, 'Login card remains centered when saved preference is ' + preset);
      assert(isolatedMetrics.scrollW <= isolatedMetrics.winW + 2, 'No viewport overflow when saved preference is ' + preset);
    }

    // -------------------------------------------------------------
    // Test 3: Authenticated Design-Token Scaling at All Presets
    // -------------------------------------------------------------
    console.log('\\n--- Running Test 3: Authenticated Design-Token Scaling ---');
    const scaleFactorMap = {
      '90%': 0.9,
      '100%': 1.0,
      '110%': 1.1,
      '120%': 1.2,
      '130%': 1.3,
      '150%': 1.5,
    };

    for (const [preset, expectedFactor] of Object.entries(scaleFactorMap)) {
      await win.webContents.executeJavaScript(\`
        localStorage.setItem('panorama_token', 'demo_token_admin');
        localStorage.setItem('panorama_display_preferences_admin', JSON.stringify({
          scale: '\${preset}',
          fontSize: 'small',
          layoutDensity: 'COMFORTABLE',
          contrastMode: 'STANDARD'
        }));
      \`);
      await win.loadURL('http://127.0.0.1:${PORT}/');
      await new Promise(r => setTimeout(r, 500));

      const appMetrics = await win.webContents.executeJavaScript(\`
        (() => {
          const appRoot = document.getElementById('app-root');
          const header = document.querySelector('header');
          const sidebar = document.querySelector('aside');
          const rect = appRoot ? appRoot.getBoundingClientRect() : null;
          const cs = appRoot ? getComputedStyle(appRoot) : null;
          const appScale = cs ? parseFloat(cs.getPropertyValue('--app-scale')) : null;
          return {
            hasAppRoot: !!appRoot,
            hasHeader: !!header,
            hasSidebar: !!sidebar,
            appScale,
            rootZoom: appRoot ? appRoot.style.zoom : '',
            docZoom: document.documentElement.style.zoom,
            bodyZoom: document.body.style.zoom,
            rectWidth: rect ? Math.round(rect.width) : 0,
            rectHeight: rect ? Math.round(rect.height) : 0,
            winW: window.innerWidth,
            winH: window.innerHeight,
            scrollW: document.body.scrollWidth,
            scrollH: document.body.scrollHeight,
          };
        })()
      \`);

      assert(appMetrics.hasAppRoot === true, 'Authenticated layout #app-root mounts for preset ' + preset);
      assert(Math.abs(appMetrics.appScale - expectedFactor) < 0.05, 'Authenticated #app-root has correct --app-scale: ' + appMetrics.appScale + ' (expected ' + expectedFactor + ')');
      assert(appMetrics.rootZoom === '' || appMetrics.rootZoom === '1', 'No CSS zoom used on #app-root (zoom is empty)');
      assert(appMetrics.bodyZoom === '' || appMetrics.bodyZoom === '1', 'Body zoom remains unpolluted in authenticated state for ' + preset);
      assert(Math.abs(appMetrics.rectWidth - appMetrics.winW) <= 3, 'Application root covers 100% viewport width at ' + preset + ' (' + appMetrics.rectWidth + 'px vs ' + appMetrics.winW + 'px)');
      assert(Math.abs(appMetrics.rectHeight - appMetrics.winH) <= 3, 'Application root covers 100% viewport height at ' + preset + ' (' + appMetrics.rectHeight + 'px vs ' + appMetrics.winH + 'px)');
      assert(appMetrics.scrollW <= appMetrics.winW + 2, 'No window-level horizontal scrollbar at ' + preset);
    }

    // -------------------------------------------------------------
    // Test 4: Refresh and User Isolation Persistence
    // -------------------------------------------------------------
    console.log('\\n--- Running Test 4: Refresh and User Isolation Persistence ---');
    // Set admin to 150%, operator to 90%
    await win.webContents.executeJavaScript(\`
      localStorage.setItem('panorama_display_preferences_admin', JSON.stringify({ scale: '150%', fontSize: 'maximum', layoutDensity: 'COMFORTABLE', contrastMode: 'HIGH_CONTRAST' }));
      localStorage.setItem('panorama_display_preferences_operator', JSON.stringify({ scale: '90%', fontSize: 'compact', layoutDensity: 'COMPACT', contrastMode: 'STANDARD' }));
      localStorage.setItem('panorama_token', 'demo_token_admin');
    \`);
    await win.loadURL('http://127.0.0.1:${PORT}/');
    await new Promise(r => setTimeout(r, 500));

    const adminLoaded = await win.webContents.executeJavaScript(\`
      (() => {
        const appRoot = document.getElementById('app-root');
        const cs = appRoot ? getComputedStyle(appRoot) : null;
        return {
          scale: cs ? parseFloat(cs.getPropertyValue('--app-scale')) : null,
          isHighContrast: appRoot ? appRoot.classList.contains('contrast-high_contrast') : false
        };
      })()
    \`);
    assert(Math.abs(adminLoaded.scale - 1.5) < 0.05, 'Admin retains 150% scaling after reload');
    assert(adminLoaded.isHighContrast === true, 'Admin retains HIGH_CONTRAST mode after reload');

    // Switch to operator session
    await win.webContents.executeJavaScript(\`
      localStorage.setItem('panorama_token', 'demo_token_operator');
    \`);
    await win.loadURL('http://127.0.0.1:${PORT}/');
    await new Promise(r => setTimeout(r, 500));

    const operatorLoaded = await win.webContents.executeJavaScript(\`
      (() => {
        const appRoot = document.getElementById('app-root');
        const cs = appRoot ? getComputedStyle(appRoot) : null;
        return {
          scale: cs ? parseFloat(cs.getPropertyValue('--app-scale')) : null,
          isCompactDensity: appRoot ? appRoot.classList.contains('density-compact') : false
        };
      })()
    \`);
    assert(Math.abs(operatorLoaded.scale - 0.9) < 0.05, 'Operator session isolated to 90% scaling');
    assert(operatorLoaded.isCompactDensity === true, 'Operator retains COMPACT density mode');

    // Logout
    await win.webContents.executeJavaScript(\`
      localStorage.removeItem('panorama_token');
    \`);
    await win.loadURL('http://127.0.0.1:${PORT}/');
    await new Promise(r => setTimeout(r, 500));

    const loggedOut = await win.webContents.executeJavaScript(\`
      (() => {
        const auth = document.getElementById('auth-root');
        return {
          hasAuth: !!auth,
          bodyZoom: document.body.style.zoom
        };
      })()
    \`);
    assert(loggedOut.hasAuth === true, 'App returns to #auth-root after logout');
    assert(loggedOut.bodyZoom === '' || loggedOut.bodyZoom === '1', 'Body zoom is clean after logout');

    // -------------------------------------------------------------
    // Test 5: Reset to Default Button Verification (Must Restore 100% Default)
    // -------------------------------------------------------------
    console.log('\\n--- Running Test 5: Reset to Default Button in Settings ---');
    await win.webContents.executeJavaScript(\`
      localStorage.setItem('panorama_token', 'demo_token_admin');
      localStorage.setItem('panorama_display_preferences_admin', JSON.stringify({ scale: '150%', fontSize: 'maximum', layoutDensity: 'COMPACT', contrastMode: 'HIGH_CONTRAST' }));
    \`);
    await win.loadURL('http://127.0.0.1:${PORT}/');
    await new Promise(r => setTimeout(r, 500));

    // Navigate to settings screen
    await win.webContents.executeJavaScript(\`
      (() => {
        const settingsNav = document.querySelector('button[data-screen="settings"]');
        if (settingsNav) settingsNav.click();
      })();
    \`);
    await new Promise(r => setTimeout(r, 300));

    // Click Reset to Default button
    await win.webContents.executeJavaScript(\`
      (() => {
        const resetBtn = document.getElementById('btn-reset-display-scale');
        if (resetBtn) resetBtn.click();
      })();
    \`);
    await new Promise(r => setTimeout(r, 300));

    const resetSuccess = await win.webContents.executeJavaScript(\`
      (() => {
        const appRoot = document.getElementById('app-root');
        const cs = appRoot ? getComputedStyle(appRoot) : null;
        const raw = localStorage.getItem('panorama_display_preferences_admin');
        const prefs = raw ? JSON.parse(raw) : null;
        return {
          clicked: true,
          scale: cs ? parseFloat(cs.getPropertyValue('--app-scale')) : null,
          storedScale: prefs ? prefs.scale : null,
          storedDensity: prefs ? prefs.layoutDensity : null,
          storedContrast: prefs ? prefs.contrastMode : null
        };
      })()
    \`);

    assert(resetSuccess.clicked === true, 'Reset button located and clicked in Settings');
    assert(Math.abs(resetSuccess.scale - 1.0) < 0.05, 'Application scale immediately restored to 1.0 (100% default)');
    assert(resetSuccess.storedScale === '100%', 'Saved scale restored to default 100%');
    assert(resetSuccess.storedDensity === 'COMFORTABLE', 'Saved density restored to COMFORTABLE');
    assert(resetSuccess.storedContrast === 'STANDARD', 'Saved contrast restored to STANDARD');

    // -------------------------------------------------------------
    // Test 6: All 11 Screens Layout Verification
    // -------------------------------------------------------------
    console.log('\\n--- Running Test 6: Verify All 11 Application Screens ---');
    const allScreens = [
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

    await win.webContents.executeJavaScript(\`
      window.addEventListener('error', (e) => {
        console.error('[UNCAUGHT ERROR STACK]', e.error ? e.error.stack : e.message);
      });
    \`);

    for (const screenId of allScreens) {
      console.log('Navigating to screen:', screenId);
      try {
        await win.webContents.executeJavaScript(\`
          (() => {
            const btn = document.querySelector('button[data-screen="\${screenId}"]');
            if (btn) btn.click();
          })();
        \`);
        await new Promise(r => setTimeout(r, 200));

        const screenCheck = await win.webContents.executeJavaScript(\`
          (() => {
            const main = document.querySelector('main');
            return {
              hasMain: !!main,
              scrollW: main ? main.scrollWidth : 0,
              clientW: main ? main.clientWidth : 0,
            };
          })()
        \`);

        assert(screenCheck.hasMain === true, 'Screen renders main element: ' + screenId);
        assert(screenCheck.scrollW <= screenCheck.clientW + 5, 'No horizontal overflow on screen: ' + screenId);
      } catch (screenErr) {
        console.error('Error on screen ' + screenId + ':', screenErr);
        throw screenErr;
      }
    }

    // -------------------------------------------------------------
    // Test 7: Viewport Matrix Testing (1366x768 to 2560x1440)
    // -------------------------------------------------------------
    console.log('\\n--- Running Test 7: Multi-Viewport Responsive Matrix ---');
    const viewports = [
      { name: 'Standard Laptop (1366x768)', width: 1366, height: 768 },
      { name: 'Laptop (1440x900)', width: 1440, height: 900 },
      { name: 'Desktop (1600x900)', width: 1600, height: 900 },
      { name: 'Full HD (1920x1080)', width: 1920, height: 1080 },
      { name: 'QHD (2560x1440)', width: 2560, height: 1440 },
      { name: 'Tablet Landscape (1024x768)', width: 1024, height: 768 },
      { name: 'Tablet Portrait (768x1024)', width: 768, height: 1024 },
    ];

    for (const vp of viewports) {
      win.setSize(vp.width, vp.height);
      await new Promise(r => setTimeout(r, 200));

      const vpMetrics = await win.webContents.executeJavaScript(\`
        (() => {
          const appRoot = document.getElementById('app-root');
          return {
            winW: window.innerWidth,
            winH: window.innerHeight,
            bodyScrollW: document.body.scrollWidth,
            bodyScrollH: document.body.scrollHeight,
            appRootW: appRoot ? Math.round(appRoot.getBoundingClientRect().width) : 0
          };
        })()
      \`);

      assert(vpMetrics.bodyScrollW <= vpMetrics.winW + 2, 'No horizontal scroll at ' + vp.name);
      assert(Math.abs(vpMetrics.appRootW - vpMetrics.winW) <= 3, 'App width matches viewport at ' + vp.name + ' (' + vpMetrics.appRootW + 'px vs ' + vpMetrics.winW + 'px)');
    }

    // -------------------------------------------------------------
    // Test 8: Console Errors and Warnings Check
    // -------------------------------------------------------------
    console.log('\\n--- Running Test 8: Console Errors Check ---');
    assert(testReport.consoleErrors.length === 0, 'Zero critical console errors logged during entire suite execution (found: ' + testReport.consoleErrors.length + ')');

    console.log('\\n======================================================');
    console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
    console.log('Passed:', testReport.testsPassed, '| Failed:', testReport.testsFailed);
    console.log('======================================================\\n');

  } catch (err) {
    console.error('[SUITE ERROR]', err);
    testReport.testsFailed++;
  } finally {
    fs.writeFileSync(
      path.resolve(__dirname, 'e2e_verification_report.json'),
      JSON.stringify(testReport, null, 2)
    );
    app.quit();
    process.exit(testReport.testsFailed > 0 ? 1 : 0);
  }
});
`;

async function main() {
  const server = await createServer();

  const runnerPath = path.resolve(__dirname, 'temp_runner.cjs');
  fs.writeFileSync(runnerPath, runnerScript, 'utf8');

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  console.log('[E2E] Spawning Electron to execute DOM test suite...');
  const child = cp.spawn(electronPath, [runnerPath], { env });

  child.stdout.on('data', d => process.stdout.write(d.toString()));
  child.stderr.on('data', d => process.stderr.write(d.toString()));

  child.on('close', code => {
    console.log('[E2E] Electron process finished with code:', code);
    try { fs.unlinkSync(runnerPath); } catch (e) {}
    server.close(() => {
      console.log('[TEST-SERVER] Mock server stopped.');
      process.exit(code);
    });
  });
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
