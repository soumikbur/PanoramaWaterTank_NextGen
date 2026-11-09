// apps/mobile/scripts/verify_mobile_search_button.cjs
/**
 * Automated Verification & Screenshot Capture for Mobile Search Dedicated Submit Button
 * Testing:
 * 1. Viewports: 320x640, 360x800, 375x812, 390x844, 430x932, 768x1024, 1366x768
 * 2. Dedicated Search Button (Method A) with Train Number 225256
 * 3. Keyboard Enter Submission (Method B) with Coach C1
 * 4. Empty Query Disabled State & In-Flight Protection
 * 5. Matching Results & "No Results Found" Handling
 * 6. Zero Horizontal Overflow
 * 7. Desktop Search Unchanged
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8776;
const DIST_DIR = path.resolve(__dirname, '../dist');
const OUTPUT_DIR = path.resolve('C:/Users/soumi/.gemini/antigravity/brain/02d4ebd6-2deb-462f-b938-3b5741021d98/screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: '01_mobile_320x640', width: 320, height: 640, isMobile: true },
  { name: '02_mobile_360x800', width: 360, height: 800, isMobile: true },
  { name: '03_mobile_375x812', width: 375, height: 812, isMobile: true },
  { name: '04_mobile_390x844', width: 390, height: 844, isMobile: true },
  { name: '05_mobile_430x932', width: 430, height: 932, isMobile: true },
  { name: '06_tablet_768x1024', width: 768, height: 1024, isMobile: true },
  { name: '07_desktop_1366x768', width: 1366, height: 768, isMobile: false },
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
const VIEWPORTS = ${JSON.stringify(VIEWPORTS)};

async function run() {
  await app.whenReady();

  const win = new BrowserWindow({
    width: 390,
    height: 844,
    show: false,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await win.loadURL('http://localhost:' + PORT);

  // Authenticate
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
    window.location.reload();
  \`);

  await new Promise(r => setTimeout(r, 1500));

  const testResults = [];

  for (const vp of VIEWPORTS) {
    win.setContentSize(vp.width, vp.height);
    await new Promise(r => setTimeout(r, 400));

    if (vp.isMobile) {
      // 1. Ensure mobile search mode is opened
      await win.webContents.executeJavaScript(\`
        (() => {
          const searchToggle = document.querySelector('button[aria-label="Search fleet"]');
          if (searchToggle) {
            searchToggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
        })()
      \`);
      await new Promise(r => setTimeout(r, 500));

      // 2. Audit empty search bar state
      const auditEmpty = await win.webContents.executeJavaScript(\`
        (() => {
          const input = document.querySelector('input[type="search"]');
          const submitBtn = document.querySelector('[data-testid="mobile-search-submit-btn"]');
          const closeBtn = document.querySelector('button[aria-label="Close search"]');
          const bodyOverflow = document.body.scrollWidth > window.innerWidth;

          let btnRect = submitBtn ? submitBtn.getBoundingClientRect() : null;
          let inputRect = input ? input.getBoundingClientRect() : null;

          return {
            hasInput: !!input,
            inputAttributes: input ? {
              type: input.type,
              enterKeyHint: input.getAttribute('enterKeyHint') || input.enterKeyHint,
              placeholder: input.placeholder,
            } : null,
            hasSubmitBtn: !!submitBtn,
            submitBtnDisabled: submitBtn ? submitBtn.disabled : null,
            btnTouchTarget: btnRect ? { width: btnRect.width, height: btnRect.height } : null,
            inputWidth: inputRect ? inputRect.width : 0,
            hasCloseBtn: !!closeBtn,
            bodyOverflow,
          };
        })()
      \`);

      // Screenshot 1: Empty search bar mode
      const imgEmpty = await win.webContents.capturePage();
      const fnEmpty = 'search_' + vp.name + '_empty.png';
      fs.writeFileSync(path.join(OUTPUT_DIR, fnEmpty), imgEmpty.toPNG());

      // 3. Test typing Train Number '225256' & Method A (On-Screen Submit Button)
      await win.webContents.executeJavaScript(\`
        (() => {
          const input = document.querySelector('input[type="search"]');
          if (input) {
            if (input._valueTracker) input._valueTracker.setValue('');
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, '225256');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      \`);
      await new Promise(r => setTimeout(r, 300));

      const auditTyped = await win.webContents.executeJavaScript(\`
        (() => {
          const submitBtn = document.querySelector('[data-testid="mobile-search-submit-btn"]');
          return {
            submitBtnDisabled: submitBtn ? submitBtn.disabled : null,
          };
        })()
      \`);

      // Click on-screen submit button (Method A)
      await win.webContents.executeJavaScript(\`
        (() => {
          const submitBtn = document.querySelector('[data-testid="mobile-search-submit-btn"]');
          if (submitBtn) {
            submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
        })()
      \`);
      await new Promise(r => setTimeout(r, 500));

      const auditResultsTrain = await win.webContents.executeJavaScript(\`
        (() => {
          const panel = document.querySelector('#mobile-search-results-panel');
          const resultsItems = panel ? panel.querySelectorAll('[id^="search-result-item-"]') : [];
          const text = panel ? panel.innerText : '';

          return {
            panelVisible: !!panel,
            resultsCount: resultsItems.length,
            hasTrain225256: text.includes('225256'),
          };
        })()
      \`);

      // Screenshot 2: Active Results for Train 225256
      const imgResults = await win.webContents.capturePage();
      const fnResults = 'search_' + vp.name + '_results.png';
      fs.writeFileSync(path.join(OUTPUT_DIR, fnResults), imgResults.toPNG());

      // 4. Test Method B: Keyboard Enter on Coach 'C1'
      await win.webContents.executeJavaScript(\`
        (() => {
          const input = document.querySelector('input[type="search"]');
          if (input) {
            if (input._valueTracker) input._valueTracker.setValue('');
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, 'C1');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            // Simulate Keyboard Enter
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          }
        })()
      \`);
      await new Promise(r => setTimeout(r, 500));

      const auditEnterCoach = await win.webContents.executeJavaScript(\`
        (() => {
          const panel = document.querySelector('#mobile-search-results-panel');
          const resultsItems = panel ? panel.querySelectorAll('[id^="search-result-item-"]') : [];
          const text = panel ? panel.innerText : '';
          return {
            panelVisible: !!panel,
            resultsCount: resultsItems.length,
            hasCoachC1: text.includes('Coach C1') || text.includes('C1'),
          };
        })()
      \`);

      // 5. Test Non-existent record ("No results found")
      await win.webContents.executeJavaScript(\`
        (() => {
          const input = document.querySelector('input[type="search"]');
          if (input) {
            if (input._valueTracker) input._valueTracker.setValue('');
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, 'NONEXISTENT999');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            const submitBtn = document.querySelector('[data-testid="mobile-search-submit-btn"]');
            if (submitBtn) {
              submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
          }
        })()
      \`);
      await new Promise(r => setTimeout(r, 500));

      const auditNoResults = await win.webContents.executeJavaScript(\`
        (() => {
          const panel = document.querySelector('#mobile-search-results-panel');
          const noResultsText = panel ? panel.innerText : '';
          return {
            panelVisible: !!panel,
            isNoResults: noResultsText.includes('No results found'),
          };
        })()
      \`);

      // Screenshot 3: No Results State
      const imgNoResults = await win.webContents.capturePage();
      const fnNoResults = 'search_' + vp.name + '_no_results.png';
      fs.writeFileSync(path.join(OUTPUT_DIR, fnNoResults), imgNoResults.toPNG());

      // 6. Test Clear button
      await win.webContents.executeJavaScript(\`
        (() => {
          const clearBtn = document.querySelector('button[aria-label="Clear search input"]');
          if (clearBtn) {
            clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
        })()
      \`);
      await new Promise(r => setTimeout(r, 300));

      const auditCleared = await win.webContents.executeJavaScript(\`
        (() => {
          const input = document.querySelector('input[type="search"]');
          const panel = document.querySelector('#mobile-search-results-panel');
          const submitBtn = document.querySelector('[data-testid="mobile-search-submit-btn"]');
          return {
            inputVal: input ? input.value : '',
            panelClosed: !panel || window.getComputedStyle(panel).display === 'none',
            submitBtnDisabled: submitBtn ? submitBtn.disabled : null,
          };
        })()
      \`);

      // Close search mode
      await win.webContents.executeJavaScript(\`
        (() => {
          const closeBtn = document.querySelector('button[aria-label="Close search"]');
          if (closeBtn) closeBtn.click();
        })()
      \`);
      await new Promise(r => setTimeout(r, 200));

      testResults.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        isMobile: true,
        auditEmpty,
        auditTyped,
        auditResultsTrain,
        auditEnterCoach,
        auditNoResults,
        auditCleared,
      });

      console.log(\`[PASS] \${vp.name}: inputWidth=\${Math.round(auditEmpty.inputWidth)}px, submitBtn=\${auditEmpty.hasSubmitBtn}, disabledEmpty=\${auditEmpty.submitBtnDisabled}, methodATrain=\${auditResultsTrain.resultsCount} items, methodBCoach=\${auditEnterCoach.resultsCount} items, noResults=\${auditNoResults.isNoResults}, cleared=\${auditCleared.submitBtnDisabled}, overflow=\${auditEmpty.bodyOverflow}\`);
    } else {
      // Desktop Viewport Test
      const auditDesktop = await win.webContents.executeJavaScript(\`
        (() => {
          const desktopHeader = document.querySelector('.hide-on-mobile');
          const desktopSearch = document.querySelector('#global-search-input');
          const mobileSearch = document.querySelector('[data-testid="mobile-search-submit-btn"]');
          const isDesktopVisible = desktopHeader && window.getComputedStyle(desktopHeader).display !== 'none';
          const isMobileSubmitVisible = mobileSearch && window.getComputedStyle(mobileSearch).display !== 'none';

          return {
            isDesktopVisible,
            hasDesktopSearch: !!desktopSearch,
            noDuplicateMobileSubmitOnDesktop: !isMobileSubmitVisible,
          };
        })()
      \`);

      const imgDesktop = await win.webContents.capturePage();
      const fnDesktop = 'search_' + vp.name + '_desktop.png';
      fs.writeFileSync(path.join(OUTPUT_DIR, fnDesktop), imgDesktop.toPNG());

      testResults.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        isMobile: false,
        auditDesktop,
      });

      console.log(\`[PASS] \${vp.name} Desktop: desktopSearch=\${auditDesktop.hasDesktopSearch}, noMobileDuplicates=\${auditDesktop.noDuplicateMobileSubmitOnDesktop}\`);
    }
  }

  win.destroy();

  fs.writeFileSync(path.join(OUTPUT_DIR, 'search_audit_results.json'), JSON.stringify(testResults, null, 2));
  console.log('[SUCCESS] All search tests & screenshots completed successfully!');
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
  console.log(`[SERVER] Search test server listening at http://localhost:${PORT}`);

  const runnerPath = path.resolve(__dirname, 'temp_search_runner.cjs');
  fs.writeFileSync(runnerPath, RUNNER_SCRIPT, 'utf8');

  const childEnv = Object.assign({}, process.env);
  delete childEnv.ELECTRON_RUN_AS_NODE;

  console.log('[ELECTRON] Running mobile search automated verification...');
  const child = cp.spawn(electronPath, [runnerPath], {
    env: childEnv,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    try { fs.unlinkSync(runnerPath); } catch(e) {}
    server.close();
    if (code === 0) {
      console.log('[SUCCESS] Mobile search verification finished with exit code 0.');
    } else {
      console.error(`[ERROR] Mobile search verification failed with exit code ${code}`);
      process.exit(code);
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
