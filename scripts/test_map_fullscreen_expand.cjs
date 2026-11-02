// scripts/test_map_fullscreen_expand.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const ARTIFACTS_DIR = path.join(__dirname, '..', 'test_artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function runTest() {
  console.log('[TEST] Initializing Electron test runner for Map Controls...');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const consoleErrors = [];
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 3) {
      consoleErrors.push(message);
    }
  });

  const targetUrl = process.env.TEST_TARGET_URL || 'http://127.0.0.1:3001';
  console.log(`[TEST] Loading ${targetUrl} ...`);
  await win.loadURL(targetUrl);

  const waitFor = async (fn, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const res = await win.webContents.executeJavaScript(`(${fn.toString()})()`);
      if (res) return res;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };

  // Wait for initial render: either login page or dashboard shell
  console.log('[TEST] Waiting for application shell or login page...');
  await waitFor(() => Boolean(document.querySelector('input[type="password"]') || document.getElementById('nav-location') || document.body.innerText.includes('Panorama')));

  // Check if LoginScreen is active; if so, perform login
  const isLoginPage = await win.webContents.executeJavaScript(`
    Boolean(document.querySelector('input[type="password"]'))
  `);

  if (isLoginPage) {
    console.log('[TEST] Login form detected. Logging in as Administrator...');
    await win.webContents.executeJavaScript(`
      (() => {
        const adminBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Admin Quick Fill') || b.textContent.includes('Admin')));
        if (adminBtn) {
          adminBtn.click();
        } else {
          const userInputs = document.querySelectorAll('input');
          if (userInputs[0]) userInputs[0].value = 'admin';
          if (userInputs[1]) userInputs[1].value = 'admin123';
          userInputs[0]?.dispatchEvent(new Event('input', { bubbles: true }));
          userInputs[1]?.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const submitBtn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sign In') || b.textContent.includes('Log In'));
        if (submitBtn) submitBtn.click();
      })()
    `);

    // Wait for login transition to dashboard
    await waitFor(() => Boolean(document.getElementById('nav-location') || Array.from(document.querySelectorAll('button, span, div')).find(el => el.textContent && el.textContent.trim() === 'Location & GPS')));
  }

  // Navigate to Location & GPS screen
  console.log('[TEST] Navigating to Location & GPS screen...');
  const navResult = await win.webContents.executeJavaScript(`
    (() => {
      const locBtn = document.getElementById('nav-location') ||
        Array.from(document.querySelectorAll('button, div, span, a')).find(el => el.textContent && el.textContent.trim() === 'Location & GPS');
      if (locBtn) {
        locBtn.click();
        return 'Navigated to Location & GPS';
      }
      return 'Location button not found';
    })()
  `);
  console.log('[TEST] Navigation result:', navResult);

  // Wait for map wrapper to initialize
  await waitFor(() => Boolean(document.getElementById('location-map-wrapper') && document.getElementById('map-expand-btn') && document.getElementById('map-fullscreen-btn')));
  await new Promise((r) => setTimeout(r, 1000));

  // 1. Audit initial normal state
  const normalState = await win.webContents.executeJavaScript(`
    (() => {
      const wrapper = document.getElementById('location-map-wrapper');
      const expandBtn = document.getElementById('map-expand-btn');
      const fsBtn = document.getElementById('map-fullscreen-btn');
      const mapContainer = document.getElementById('location-map-container');
      const rect = wrapper ? wrapper.getBoundingClientRect() : null;
      return {
        hasWrapper: Boolean(wrapper),
        hasExpandBtn: Boolean(expandBtn),
        hasFsBtn: Boolean(fsBtn),
        hasMapContainer: Boolean(mapContainer),
        expandText: expandBtn ? expandBtn.innerText.trim() : null,
        fsText: fsBtn ? fsBtn.innerText.trim() : null,
        width: rect ? rect.width : 0,
        height: rect ? rect.height : 0,
        position: wrapper ? window.getComputedStyle(wrapper).position : null,
        zIndex: wrapper ? window.getComputedStyle(wrapper).zIndex : null,
      };
    })()
  `);

  console.log('[TEST] Initial Normal State:', JSON.stringify(normalState, null, 2));
  if (!normalState.hasExpandBtn || !normalState.hasFsBtn) {
    throw new Error('Expand Map or Fullscreen button missing from map toolbar!');
  }

  // Save screenshot 1: Normal View
  let img = await win.capturePage();
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'map_1_normal.png'), img.toPNG());
  console.log('[TEST] Saved screenshot: map_1_normal.png');

  // 2. Test Expand Map
  console.log('[TEST] Clicking #map-expand-btn to Expand Map...');
  await win.webContents.executeJavaScript(`
    document.getElementById('map-expand-btn')?.click();
  `);
  await new Promise((r) => setTimeout(r, 600));

  const expandedState = await win.webContents.executeJavaScript(`
    (() => {
      const wrapper = document.getElementById('location-map-wrapper');
      const expandBtn = document.getElementById('map-expand-btn');
      const rect = wrapper ? wrapper.getBoundingClientRect() : null;
      return {
        expandText: expandBtn ? expandBtn.innerText.trim() : null,
        width: rect ? rect.width : 0,
        height: rect ? rect.height : 0,
        position: wrapper ? window.getComputedStyle(wrapper).position : null,
      };
    })()
  `);
  console.log('[TEST] Expanded Map State:', JSON.stringify(expandedState, null, 2));

  if (expandedState.height <= normalState.height) {
    throw new Error(`Map did not expand vertically! Previous: ${normalState.height}px, Now: ${expandedState.height}px`);
  }

  img = await win.capturePage();
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'map_2_expanded.png'), img.toPNG());
  console.log('[TEST] Saved screenshot: map_2_expanded.png');

  // 3. Test Fullscreen View
  console.log('[TEST] Clicking #map-fullscreen-btn to enter Fullscreen...');
  await win.webContents.executeJavaScript(`
    document.getElementById('map-fullscreen-btn')?.click();
  `);
  await new Promise((r) => setTimeout(r, 600));

  const fullscreenState = await win.webContents.executeJavaScript(`
    (() => {
      const wrapper = document.getElementById('location-map-wrapper');
      const fsBtn = document.getElementById('map-fullscreen-btn');
      const rect = wrapper ? wrapper.getBoundingClientRect() : null;
      const comp = wrapper ? window.getComputedStyle(wrapper) : null;
      return {
        fsText: fsBtn ? fsBtn.innerText.trim() : null,
        width: rect ? rect.width : 0,
        height: rect ? rect.height : 0,
        position: comp ? comp.position : null,
        zIndex: comp ? comp.zIndex : null,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      };
    })()
  `);
  console.log('[TEST] Fullscreen State:', JSON.stringify(fullscreenState, null, 2));

  if (fullscreenState.position !== 'fixed' || parseInt(fullscreenState.zIndex) < 9999) {
    throw new Error(`Fullscreen wrapper styling incorrect! Position: ${fullscreenState.position}, zIndex: ${fullscreenState.zIndex}`);
  }

  img = await win.capturePage();
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'map_3_fullscreen.png'), img.toPNG());
  console.log('[TEST] Saved screenshot: map_3_fullscreen.png');

  // 4. Test Exit Fullscreen via Escape key
  console.log('[TEST] Sending Escape key event to exit Fullscreen...');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await new Promise((r) => setTimeout(r, 600));

  const afterEscState = await win.webContents.executeJavaScript(`
    (() => {
      const wrapper = document.getElementById('location-map-wrapper');
      const fsBtn = document.getElementById('map-fullscreen-btn');
      const comp = wrapper ? window.getComputedStyle(wrapper) : null;
      return {
        fsText: fsBtn ? fsBtn.innerText.trim() : null,
        position: comp ? comp.position : null,
        zIndex: comp ? comp.zIndex : null,
      };
    })()
  `);
  console.log('[TEST] After Escape State:', JSON.stringify(afterEscState, null, 2));

  if (afterEscState.position === 'fixed') {
    throw new Error('Map wrapper remained fixed after pressing Escape!');
  }

  img = await win.capturePage();
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'map_4_after_esc.png'), img.toPNG());
  console.log('[TEST] Saved screenshot: map_4_after_esc.png');

  // 5. Test Fullscreen Exit via Button Click
  console.log('[TEST] Testing Exit Fullscreen via button click...');
  await win.webContents.executeJavaScript(`
    document.getElementById('map-fullscreen-btn')?.click();
  `);
  await new Promise((r) => setTimeout(r, 400));
  // Click again to exit
  await win.webContents.executeJavaScript(`
    document.getElementById('map-fullscreen-btn')?.click();
  `);
  await new Promise((r) => setTimeout(r, 600));

  const afterExitBtnState = await win.webContents.executeJavaScript(`
    (() => {
      const wrapper = document.getElementById('location-map-wrapper');
      const fsBtn = document.getElementById('map-fullscreen-btn');
      const comp = wrapper ? window.getComputedStyle(wrapper) : null;
      return {
        fsText: fsBtn ? fsBtn.innerText.trim() : null,
        position: comp ? comp.position : null,
      };
    })()
  `);
  console.log('[TEST] After Exit Button State:', JSON.stringify(afterExitBtnState, null, 2));

  img = await win.capturePage();
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'map_5_after_exit_button.png'), img.toPNG());
  console.log('[TEST] Saved screenshot: map_5_after_exit_button.png');

  // 6. Test collapsing back to normal view
  console.log('[TEST] Clicking #map-expand-btn to return to Normal View...');
  await win.webContents.executeJavaScript(`
    document.getElementById('map-expand-btn')?.click();
  `);
  await new Promise((r) => setTimeout(r, 600));

  const finalNormalState = await win.webContents.executeJavaScript(`
    (() => {
      const wrapper = document.getElementById('location-map-wrapper');
      const expandBtn = document.getElementById('map-expand-btn');
      const rect = wrapper ? wrapper.getBoundingClientRect() : null;
      return {
        expandText: expandBtn ? expandBtn.innerText.trim() : null,
        height: rect ? rect.height : 0,
      };
    })()
  `);
  console.log('[TEST] Final Normal State:', JSON.stringify(finalNormalState, null, 2));

  img = await win.capturePage();
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'map_6_back_to_normal.png'), img.toPNG());
  console.log('[TEST] Saved screenshot: map_6_back_to_normal.png');

  console.log('[TEST] All automated checks completed successfully!');
  console.log('[TEST] Console error count:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('[TEST] Console errors detected:', consoleErrors);
  }

  app.quit();
}

app.whenReady().then(runTest).catch((err) => {
  console.error('[TEST FATAL ERROR]', err);
  app.exit(1);
});
