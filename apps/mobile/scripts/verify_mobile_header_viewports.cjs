// apps/mobile/scripts/verify_mobile_header_viewports.cjs
/**
 * Automated Multi-Screen & Multi-Viewport Verification & Screenshot Capture
 * for the Redesigned Mobile Header:
 * Structure: [Hamburger] [Panorama Logo] [Current Section Name] [Search] [Live Status] [Notifications]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8774;
const DIST_DIR = path.resolve(__dirname, '../dist');
const OUTPUT_DIR = path.resolve('C:/Users/soumi/.gemini/antigravity/brain/02d4ebd6-2deb-462f-b938-3b5741021d98/screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const SCREENS = [
  { id: 'dashboard', expectedTitle: 'Dashboard', label: 'Dashboard' },
  { id: 'trains', expectedTitle: 'Train Management', label: 'Train_Management' },
  { id: 'watertank', expectedTitle: 'All Tanks', label: 'All_Tanks' },
  { id: 'devices', expectedTitle: 'Devices', label: 'Devices' },
  { id: 'location', expectedTitle: 'Location', label: 'Location' },
  { id: 'alerts', expectedTitle: 'Alerts', label: 'Alerts' },
  { id: 'history', expectedTitle: 'History', label: 'History' },
  { id: 'reports', expectedTitle: 'Reports', label: 'Reports' },
];

const VIEWPORTS = [
  { name: 'mobile_320x640', width: 320, height: 640, isMobile: true },
  { name: 'mobile_360x800', width: 360, height: 800, isMobile: true },
  { name: 'mobile_390x844', width: 390, height: 844, isMobile: true },
  { name: 'mobile_430x932', width: 430, height: 932, isMobile: true },
  { name: 'desktop_1366x768', width: 1366, height: 768, isMobile: false },
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
        email: 'admin@railway.gov.in',
        is_active: true,
      }));
      return;
    }

    if (pathname.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', data: [] }));
      return;
    }

    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  return server;
}

// Electron runner script
const RUNNER_SCRIPT = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');

const PORT = ${PORT};
const OUTPUT_DIR = ${JSON.stringify(OUTPUT_DIR)};
const SCREENS = ${JSON.stringify(SCREENS)};
const VIEWPORTS = ${JSON.stringify(VIEWPORTS)};

async function run() {
  await app.whenReady();

  const results = [];

  const win = new BrowserWindow({
    width: 320,
    height: 640,
    show: false,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await win.loadURL('http://localhost:' + PORT);

  // Seed authentication & preferences
  await win.webContents.executeJavaScript(\`
    localStorage.setItem('panorama_token', 'demo_token_admin');
    localStorage.setItem('panorama_user', JSON.stringify({
      id: 'usr-admin-01',
      username: '@admin',
      full_name: 'System Administrator',
      role: 'ADMIN',
      email: 'admin@railway.gov.in',
      is_active: true
    }));
    localStorage.setItem('panorama_display_preferences', JSON.stringify({
      zoom: '100%',
      density: 'comfortable',
      contrast: 'standard',
      theme: 'light'
    }));
    window.location.reload();
  \`);

  // Wait for app load
  await new Promise(r => setTimeout(r, 1500));

  for (const vp of VIEWPORTS) {
    win.setContentSize(vp.width, vp.height);
    await new Promise(r => setTimeout(r, 400));

    for (const scr of SCREENS) {
      // Switch screen via AppRouter / hash
      await win.webContents.executeJavaScript(\`
        (() => {
          window.location.hash = '#/\${scr.id}';
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        })()
      \`);

      await new Promise(r => setTimeout(r, 350));

      // Audit header elements in current viewport
      const audit = await win.webContents.executeJavaScript(\`
        (() => {
          const isMobileVp = window.innerWidth < 1024;
          const mobileHeader = document.querySelector('.show-on-mobile-flex');
          const desktopHeader = document.querySelector('.hide-on-mobile');
          const sectionTitleEl = document.querySelector('[data-testid="mobile-header-section-name"]');
          
          let mobileSectionTitle = sectionTitleEl ? sectionTitleEl.textContent.trim() : '';
          let mobileLogoImg = mobileHeader ? mobileHeader.querySelector('img[alt="Panorama"]') : null;
          let mobileMenuBtn = mobileHeader ? mobileHeader.querySelector('button[aria-label="Open Navigation Menu"]') : null;
          let mobileSearchBtn = mobileHeader ? mobileHeader.querySelector('button[aria-label="Search fleet"]') : null;
          let mobileAlertsBtn = mobileHeader ? mobileHeader.querySelector('button[aria-label="View Alerts"]') : null;
          let hasOldBrandingText = false;
          if (mobileHeader) {
            const text = mobileHeader.innerText || '';
            hasOldBrandingText = text.includes('PANORAMA WATER') || text.includes('TANK MONITOR');
          }

          let desktopTitle = '';
          if (desktopHeader) {
            const dtEl = desktopHeader.querySelector('[data-testid="header-page-title"]');
            desktopTitle = dtEl ? dtEl.textContent.trim() : '';
          }

          const bodyOverflowX = document.body.scrollWidth > window.innerWidth;

          return {
            isMobileVp,
            innerWidth: window.innerWidth,
            mobileHeaderVisible: mobileHeader ? window.getComputedStyle(mobileHeader).display !== 'none' : false,
            desktopHeaderVisible: desktopHeader ? window.getComputedStyle(desktopHeader).display !== 'none' : false,
            mobileSectionTitle,
            desktopTitle,
            hasLogo: !!mobileLogoImg,
            hasMenu: !!mobileMenuBtn,
            hasSearch: !!mobileSearchBtn,
            hasAlerts: !!mobileAlertsBtn,
            hasOldBrandingText,
            bodyOverflowX,
          };
        })()
      \`);

      // Capture screenshot
      const image = await win.webContents.capturePage();
      const filename = 'header_' + vp.name + '_' + scr.label + '.png';
      const filepath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filepath, image.toPNG());

      results.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        screen: scr.id,
        expectedTitle: scr.expectedTitle,
        audit,
        screenshot: filename,
      });

      console.log(\`[AUDIT] \${vp.name} - \${scr.id}: mobileTitle="\${audit.mobileSectionTitle}", desktopTitle="\${audit.desktopTitle}", brandingText=\${audit.hasOldBrandingText}, logo=\${audit.hasLogo}, shot=\${filename}\`);
    }
  }

  win.destroy();

  fs.writeFileSync(path.join(OUTPUT_DIR, 'header_audit_results.json'), JSON.stringify(results, null, 2));
  console.log('[AUDIT] All viewports and screens completed. Audit saved.');
  app.quit();
}

run().catch(err => {
  console.error('[FATAL]', err);
  app.exit(1);
});
`;

async function main() {
  const server = createServer();
  await new Promise(r => server.listen(PORT, r));
  console.log(`[SERVER] Static server listening at http://localhost:${PORT}`);

  const runnerPath = path.resolve(__dirname, 'temp_header_runner.cjs');
  fs.writeFileSync(runnerPath, RUNNER_SCRIPT, 'utf8');

  const childEnv = Object.assign({}, process.env);
  delete childEnv.ELECTRON_RUN_AS_NODE;

  console.log('[ELECTRON] Spawning Electron to verify header across screens & viewports...');
  const child = cp.spawn(electronPath, [runnerPath], {
    env: childEnv,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    try { fs.unlinkSync(runnerPath); } catch(e) {}
    server.close();
    if (code === 0) {
      console.log('[SUCCESS] Header verification finished with exit code 0.');
    } else {
      console.error(`[ERROR] Header verification failed with exit code ${code}`);
      process.exit(code);
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
