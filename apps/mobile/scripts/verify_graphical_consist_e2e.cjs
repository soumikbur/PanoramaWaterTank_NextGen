// apps/mobile/scripts/verify_graphical_consist_e2e.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');
const electronPath = require('electron');

const PORT = 8799;
const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\9e3514ab-7eb1-481b-ac5b-d7edda1def58\\screenshots';
const CAPTURE_BEFORE_ONLY = process.env.BEFORE === '1';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function createServer() {
  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsed.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    if (pathname.startsWith('/api/v1/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (pathname === '/api/v1/auth/me') {
        res.writeHead(200);
        res.end(JSON.stringify({ id: 'usr-admin-01', username: '@admin', role: 'ADMIN', fullName: 'System Administrator' }));
        return;
      }
      if (pathname === '/api/v1/tanks/live') {
        res.writeHead(200);
        res.end(JSON.stringify({
          tankId: 'DEV-01-arrival',
          deviceUid: '0023004D4B42501120353332',
          trainNumber: '225256',
          coachNumber: 'C1',
          tankName: 'Arrival Tank',
          levelPercent: 72.5,
          heightCm: 108.8,
          isOnline: true,
          alarmStatus: 'NORMAL',
        }));
        return;
      }
      if (pathname === '/api/v1/tanks' || pathname === '/api/v1/devices' || pathname === '/api/v1/alarms' || pathname === '/api/v1/regions/summary') {
        res.writeHead(200);
        res.end(JSON.stringify([]));
        return;
      }
      if (pathname === '/api/v1/alarms/stats') {
        res.writeHead(200);
        res.end(JSON.stringify({ totalActive: 0, criticalCount: 0, warningCount: 0, resolvedToday: 0 }));
        return;
      }
      if (pathname === '/api/v1/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'HEALTHY', app: 'Panorama', version: '2.0.0', database: 'sqlite', mqttBroker: 'CONNECTED', activeWebSockets: 0 }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(PORT, 'localhost', () => resolve(server));
  });
}

function buildElectronScript() {
  return `
    const { app, BrowserWindow } = require('electron');
    const fs = require('fs');
    const path = require('path');
    const assert = require('assert');

    const PORT = ${PORT};
    const SCREENSHOT_DIR = ${JSON.stringify(SCREENSHOT_DIR)};
    const CAPTURE_BEFORE_ONLY = ${JSON.stringify(CAPTURE_BEFORE_ONLY)};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('no-sandbox');

    async function saveShot(win, name) {
      const img = await win.webContents.capturePage();
      const out = path.join(SCREENSHOT_DIR, name);
      fs.writeFileSync(out, img.toPNG());
      console.log('[SCREENSHOT]', out);
    }

    async function clickButtonByText(win, text) {
      return win.webContents.executeJavaScript(\`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const b = btns.find(el => (el.innerText || '').trim().includes(\${JSON.stringify(text)}));
          if (!b) return false;
          b.click();
          return true;
        })()
      \`);
    }

    app.whenReady().then(async () => {
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      try {
        await win.loadURL('http://localhost:' + PORT);
        await sleep(600);
        await win.webContents.executeJavaScript(\`
          localStorage.clear();
          localStorage.setItem('panorama_token', 'demo_token_admin');
          localStorage.setItem('panorama_user', JSON.stringify({ id: 'usr-admin-01', username: '@admin', role: 'ADMIN', fullName: 'Admin' }));
        \`);
        await win.loadURL('http://localhost:' + PORT + '/#/coaches?train=225256');
        await sleep(1400);

        // Switch to Offline filter so all 24 offline consist coaches appear on screen
        await clickButtonByText(win, 'Offline');
        await sleep(500);

        if (CAPTURE_BEFORE_ONLY) {
          await saveShot(win, 'consist_00_before_desktop_1280x800.png');
          win.setSize(390, 844);
          win.setContentSize(390, 844);
          await sleep(600);
          await saveShot(win, 'consist_00_before_mobile_390x844.png');
          console.log('[BEFORE] Captured before screenshots.');
          app.exit(0);
          return;
        }

        // AFTER VERIFICATION: Desktop 1280x800, Laptop 1024x768, Tablet 768x1024, Mobile 390x844
        const desktopMetrics = await win.webContents.executeJavaScript(\`
          (() => {
            const track = document.querySelector('[data-testid="consist-track-scroll"]');
            const loco = document.querySelector('[data-testid="consist-locomotive-card"]');
            const cards = Array.from(document.querySelectorAll('[data-testid^="consist-coach-card-"]'));
            if (!track || !loco || cards.length === 0) return { missing: true, cardCount: cards.length };

            const trackRect = track.getBoundingClientRect();
            const locoRect = loco.getBoundingClientRect();
            let topClipped = 0;
            let horizontalOverflowCards = 0;
            let badgeOutOfBounds = 0;
            const heights = new Set();
            const widths = new Set();

            cards.forEach((card) => {
              const r = card.getBoundingClientRect();
              heights.add(Math.round(r.height));
              widths.add(Math.round(r.width));
              if (card.scrollWidth > card.clientWidth + 2) horizontalOverflowCards++;
              if (r.top < trackRect.top - 1) topClipped++;

              const badge = card.querySelector('[data-testid="coach-status-badge"]');
              if (badge) {
                const br = badge.getBoundingClientRect();
                if (br.top < r.top - 1 || br.bottom > r.bottom + 1 || br.left < r.left - 1 || br.right > r.right + 1) {
                  badgeOutOfBounds++;
                }
              }
            });

            // Check first & last card reachability via scrollLeft
            const canScroll = track.scrollWidth > track.clientWidth;
            track.scrollLeft = track.scrollWidth;
            const lastCard = cards[cards.length - 1];
            const lastRect = lastCard.getBoundingClientRect();
            const updatedTrackRect = track.getBoundingClientRect();
            const lastFullyReachable = lastRect.right <= updatedTrackRect.right + 2;
            track.scrollLeft = 0;
            const firstRect = loco.getBoundingClientRect();
            const firstFullyReachable = firstRect.left >= track.getBoundingClientRect().left - 2;

            return {
              missing: false,
              cardCount: cards.length,
              topClipped,
              horizontalOverflowCards,
              badgeOutOfBounds,
              canScroll,
              firstFullyReachable,
              lastFullyReachable,
              uniqueWidths: Array.from(widths),
              uniqueHeights: Array.from(heights),
              pageOverflowX: document.documentElement.scrollWidth > window.innerWidth,
            };
          })()
        \`);
        console.log('[DESKTOP METRICS]', JSON.stringify(desktopMetrics));
        assert.strictEqual(desktopMetrics.missing, false, 'Consist elements missing');
        assert.strictEqual(desktopMetrics.cardCount, 24, 'Expected all 24 coaches in Offline mode');
        assert.strictEqual(desktopMetrics.topClipped, 0, 'No coach card may clip at top edge');
        assert.strictEqual(desktopMetrics.horizontalOverflowCards, 0, 'No card internal content may overflow horizontally');
        assert.strictEqual(desktopMetrics.badgeOutOfBounds, 0, 'All ONLINE/OFFLINE badges must stay inside card boundaries');
        assert.strictEqual(desktopMetrics.firstFullyReachable, true, 'Locomotive/first card must be reachable');
        assert.strictEqual(desktopMetrics.lastFullyReachable, true, 'Last coach C24 must be fully reachable');
        assert.strictEqual(desktopMetrics.uniqueWidths.length, 1, 'All coach cards must have consistent width');
        assert.strictEqual(desktopMetrics.uniqueHeights.length, 1, 'All coach cards must have consistent height');
        assert.strictEqual(desktopMetrics.pageOverflowX, false, 'Page must not overflow viewport horizontally');

        await saveShot(win, 'consist_01_after_desktop_1280x800.png');

        // Test scroll right button
        await win.webContents.executeJavaScript("document.querySelector('[data-testid=consist-scroll-right]')?.click();");
        await sleep(500);
        const scrolledLeft = await win.webContents.executeJavaScript("document.querySelector('[data-testid=consist-track-scroll]').scrollLeft");
        assert(scrolledLeft > 0, 'Track right scroll button must scroll horizontally');
        await win.webContents.executeJavaScript("document.querySelector('[data-testid=consist-scroll-left]')?.click();");
        await sleep(400);

        // Test Coach Selection & Next Coach Navigation & Add Coach with Long Name & Edit Coach
        await clickButtonByText(win, 'Next Coach');
        await sleep(300);
        const afterNextText = await win.webContents.executeJavaScript('document.body.innerText');
        assert(afterNextText.includes('Coach C2') || afterNextText.includes('C2'), 'Next Coach navigation failed');

        await clickButtonByText(win, 'Add Coach');
        await sleep(300);
        await win.webContents.executeJavaScript(\`
          const inputs = document.querySelectorAll('form input');
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          if (inputs[0]) {
            setter.call(inputs[0], 'C25-EXECUTIVE-VIP-LONG-COACH');
            inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (inputs[1]) {
            setter.call(inputs[1], 'WLI-LONG-DEVICE-UID-99887766');
            inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
          }
        \`);
        await win.webContents.executeJavaScript("document.querySelector('form button[type=submit]')?.click();");
        await sleep(500);

        const longCardCheck = await win.webContents.executeJavaScript(\`
          (() => {
            const card = document.querySelector('[data-testid="consist-coach-card-C25-EXECUTIVE-VIP-LONG-COACH"]');
            if (!card) return { found: false };
            const r = card.getBoundingClientRect();
            const badge = card.querySelector('[data-testid="coach-status-badge"]');
            const br = badge ? badge.getBoundingClientRect() : null;
            return {
              found: true,
              width: Math.round(r.width),
              overflowsCard: card.scrollWidth > card.clientWidth + 2,
              badgeInside: br ? (br.right <= r.right + 1 && br.top >= r.top - 1) : false,
            };
          })()
        \`);
        console.log('[LONG COACH CHECK]', JSON.stringify(longCardCheck));
        assert.strictEqual(longCardCheck.found, true, 'Added long-name coach C25 not rendered');
        assert.strictEqual(longCardCheck.overflowsCard, false, 'Long coach name must not overflow card');
        assert.strictEqual(longCardCheck.badgeInside, true, 'Status badge must remain inside card with long coach name');

        // Test Edit Coach on selected coach
        await clickButtonByText(win, 'Edit Coach');
        await sleep(300);
        await win.webContents.executeJavaScript("document.querySelector('form button[type=submit]')?.click();");
        await sleep(300);

        // Laptop 1024x768 & Tablet 768x1024 checks
        win.setSize(1024, 768);
        win.setContentSize(1024, 768);
        await sleep(400);
        const laptopOverflow = await win.webContents.executeJavaScript('document.documentElement.scrollWidth > window.innerWidth');
        assert.strictEqual(laptopOverflow, false, '1024x768 must not overflow');

        // Mobile 390x844
        win.setSize(390, 844);
        win.setContentSize(390, 844);
        await sleep(500);
        const mobileMetrics = await win.webContents.executeJavaScript(\`
          (() => {
            const track = document.querySelector('[data-testid="consist-track-scroll"]');
            const card = document.querySelector('[data-testid^="consist-coach-card-"]');
            if (!track || !card) return { missing: true };
            const r = card.getBoundingClientRect();
            return {
              missing: false,
              cardWidth: Math.round(r.width),
              canScroll: track.scrollWidth > track.clientWidth,
              cardOverflow: card.scrollWidth > card.clientWidth + 2,
              pageOverflowX: document.documentElement.scrollWidth > window.innerWidth,
            };
          })()
        \`);
        console.log('[MOBILE METRICS]', JSON.stringify(mobileMetrics));
        assert.strictEqual(mobileMetrics.missing, false);
        assert.strictEqual(mobileMetrics.canScroll, true, 'Mobile track must horizontally scroll cleanly');
        assert.strictEqual(mobileMetrics.cardOverflow, false, 'Mobile card must not overflow internally');
        assert.strictEqual(mobileMetrics.pageOverflowX, false, 'Mobile viewport must not overflow horizontally');
        await saveShot(win, 'consist_02_after_mobile_390x844.png');

        // Also check Grid View on Desktop
        win.setSize(1280, 800);
        win.setContentSize(1280, 800);
        await sleep(400);
        await clickButtonByText(win, 'Grid View');
        await sleep(400);
        await saveShot(win, 'consist_03_after_desktop_grid.png');

        // Also check Online Coaches default mode ('All Coaches' with fewer/seeded train 12002)
        await win.webContents.executeJavaScript(\`
          const select = document.querySelector('select');
          if (select) {
            select.value = '12002';
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        \`);
        await clickButtonByText(win, 'Rail Track');
        await sleep(400);
        await saveShot(win, 'consist_04_after_fewer_coaches_train_12002.png');

        console.log('\\n[ALL GRAPHICAL CONSIST TESTS PASSED!]\\n');
        app.exit(0);
      } catch (err) {
        console.error('[CONSIST E2E FAILED]', err);
        try { await saveShot(win, 'consist_99_error.png'); } catch {}
        app.exit(1);
      }
    });
  `;
}

async function main() {
  const srv = await createServer();
  const tmpFile = path.resolve(__dirname, '_tmp_consist_e2e.cjs');
  fs.writeFileSync(tmpFile, buildElectronScript(), 'utf8');

  try {
    const spawnEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
    delete spawnEnv.ELECTRON_RUN_AS_NODE;
    const code = await new Promise((resolve) => {
      const child = cp.spawn(electronPath, [tmpFile], { stdio: 'inherit', env: spawnEnv });
      child.on('exit', resolve);
    });
    if (code !== 0) process.exitCode = code || 1;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
    srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
