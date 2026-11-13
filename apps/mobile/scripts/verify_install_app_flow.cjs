// apps/mobile/scripts/verify_install_app_flow.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8000';
const SCREENSHOT_DIR = 'C:\\Users\\soumi\\.gemini\\antigravity\\brain\\02d4ebd6-2deb-462f-b938-3b5741021d98\\screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function saveShot(win, name) {
  await win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  await sleep(400);
  const img = await win.webContents.capturePage();
  const outPath = path.join(SCREENSHOT_DIR, name);
  fs.writeFileSync(outPath, img.toPNG());
  console.log('[SCREENSHOT]', outPath);
  return outPath;
}

async function loginAsAdmin(win) {
  await win.loadURL(BASE_URL);
  await sleep(2000);
  const alreadyLoggedIn = await win.webContents.executeJavaScript(`
    Boolean(localStorage.getItem('panorama_token'))
  `);
  if (!alreadyLoggedIn) {
    await win.webContents.executeJavaScript(`
      (async () => {
        const res = await window.fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: '@admin', password: 'Admin@123' })
        });
        const data = await res.json();
        localStorage.setItem('panorama_token', data.access_token);
        localStorage.setItem('panorama_user', JSON.stringify(data.user));
      })()
    `);
    await win.loadURL(BASE_URL);
    await sleep(2000);
  }
}

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.whenReady().then(async () => {
  console.log('=== TEST SUITE: INSTALL APP INTERFACE & CAPACITOR GUARD ===');

  // -------------------------------------------------------------------------
  // TEST 1: Standard Desktop Browser Mode
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Testing Standard Desktop Browser Mode ---');
  const desktopWin = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
    },
  });

  await loginAsAdmin(desktopWin);

  // 1.1 Verify Desktop Header Install App Button
  const desktopBtnInfo = await desktopWin.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('header-install-app-btn');
      if (!btn) return null;
      return {
        id: btn.id,
        text: btn.innerText.trim(),
        visible: btn.offsetParent !== null
      };
    })()
  `);
  console.log('[+] Desktop Header Install App button:', JSON.stringify(desktopBtnInfo));
  assert(desktopBtnInfo && desktopBtnInfo.visible, 'Desktop header install app button must be visible');
  assert(desktopBtnInfo.text.includes('Install App'), 'Button text must include "Install App"');

  // 1.2 Click Install App Button to open modal
  console.log('[+] Clicking Install App button...');
  await desktopWin.webContents.executeJavaScript(`
    document.getElementById('header-install-app-btn').click();
  `);
  await sleep(600);

  // 1.3 Inspect Modal
  const modalInspection = await desktopWin.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { found: false };

      const allButtons = Array.from(modal.querySelectorAll('button')).map(b => b.innerText.trim());
      const allText = modal.innerText;

      // Check tabs
      const tabElements = Array.from(modal.querySelectorAll('[role="tab"]'));
      const tabs = tabElements.map(b => b.innerText.trim().replace(/\s+/g, ' '));

      // Check for removed components
      const hasQrCodeImage = Boolean(modal.querySelector('svg[aria-label*="QR"], svg.lucide-qr-code, [data-testid="qr-code"]'));
      const hasQrHeading = allText.toLowerCase().includes('scan with mobile to download directly');
      const hasQrInstructions = allText.toLowerCase().includes('open your phone camera') || allText.toLowerCase().includes('scan with mobile');
      const hasCopyLinkBtn = allButtons.some(t => t.toLowerCase().includes('copy direct apk link') || t.toLowerCase().includes('copy apk link'));
      const hasPwaTab = tabs.some(t => t.toLowerCase().includes('web app') || t.toLowerCase().includes('pwa'));

      // Check for Android official elements
      const hasDownloadApkBtn = Boolean(modal.querySelector('#modal-download-apk-btn') || allButtons.some(t => t.includes('Download Android APK')));
      const hasApkSpecs = allText.includes('panorama-water-tank-v2.0.0.apk') || allText.includes('APK');
      const hasSteps = allText.includes('Installation Instructions') || allText.includes('Download Android APK') || allText.includes('Step-by-Step Installation');

      return {
        found: true,
        tabs,
        hasPwaTab,
        hasQrCodeImage,
        hasQrHeading,
        hasQrInstructions,
        hasCopyLinkBtn,
        hasDownloadApkBtn,
        hasApkSpecs,
        hasSteps
      };
    })()
  `);
  console.log('[+] Modal inspection (Android tab):', JSON.stringify(modalInspection, null, 2));

  assert(modalInspection.found, 'Install App modal must be open');
  assert(!modalInspection.hasPwaTab, 'Web App (PWA) tab must NOT be present');
  assert.strictEqual(modalInspection.tabs.length, 2, 'There must be EXACTLY two tabs');
  assert(modalInspection.tabs.some(t => t.includes('Android')), 'Android tab must be present');
  assert(modalInspection.tabs.some(t => t.includes('iOS')), 'iOS tab must be present');
  assert(!modalInspection.hasQrCodeImage, 'QR code image/SVG must NOT be present');
  assert(!modalInspection.hasQrHeading, 'QR code heading "Scan with Mobile to Download Directly" must NOT be present');
  assert(!modalInspection.hasQrInstructions, 'QR scanning instructions must NOT be present');
  assert(!modalInspection.hasCopyLinkBtn, 'Copy Direct APK Link button must NOT be present');
  assert(modalInspection.hasDownloadApkBtn, 'Official APK download button must be present');

  await saveShot(desktopWin, 'install_app_modal_android_tab.png');

  // 1.4 Switch to iOS / Safari tab
  console.log('[+] Switching to iOS / Safari tab...');
  await desktopWin.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('[role="dialog"]');
      const iosBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('iOS') || b.innerText.includes('Safari'));
      if (iosBtn) iosBtn.click();
    })()
  `);
  await sleep(500);

  const iosInspection = await desktopWin.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return null;
      const text = modal.innerText;
      return {
        hasSafariInstruction: text.includes('Safari') || text.includes('Apple iOS'),
        hasAddToHomeScreen: text.includes('Add to Home Screen'),
        hasShareIcon: text.includes('Share')
      };
    })()
  `);
  console.log('[+] iOS tab inspection:', JSON.stringify(iosInspection));
  assert(iosInspection.hasSafariInstruction, 'iOS tab must mention Safari or Apple iOS');
  assert(iosInspection.hasAddToHomeScreen, 'iOS tab must mention "Add to Home Screen"');

  await saveShot(desktopWin, 'install_app_modal_ios_tab.png');

  // Close modal
  await desktopWin.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('[role="dialog"]');
      const closeBtn = modal.querySelector('button[aria-label*="Close"]') || modal.querySelector('button:has(svg.lucide-x)');
      if (closeBtn) closeBtn.click();
    })()
  `);
  await sleep(400);

  // -------------------------------------------------------------------------
  // TEST 2: Responsive Mobile Browser View
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Testing Responsive Mobile Browser View ---');
  desktopWin.setSize(390, 844);
  await sleep(1000);

  const mobileBtnInfo = await desktopWin.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('mobile-install-app-btn');
      return {
        exists: Boolean(btn),
        visible: btn ? btn.offsetParent !== null : false
      };
    })()
  `);
  console.log('[+] Mobile Header Install App button:', JSON.stringify(mobileBtnInfo));
  assert(mobileBtnInfo.exists && mobileBtnInfo.visible, 'Mobile header install button must exist and be visible in mobile viewport');

  await desktopWin.webContents.executeJavaScript(`
    document.getElementById('mobile-install-app-btn').click();
  `);
  await sleep(600);

  await saveShot(desktopWin, 'install_app_modal_mobile_viewport.png');

  // Close modal
  await desktopWin.webContents.executeJavaScript(`
    (() => {
      const modal = document.querySelector('[role="dialog"]');
      const closeBtn = modal.querySelector('button[aria-label*="Close"]') || modal.querySelector('button:has(svg.lucide-x)');
      if (closeBtn) closeBtn.click();
    })()
  `);
  await sleep(400);

  // -------------------------------------------------------------------------
  // TEST 3: Capacitor Native Simulation
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Testing Capacitor Native Build Simulation ---');
  const preloadPath = path.resolve(__dirname, 'capacitor_preload_mock.cjs');
  fs.writeFileSync(preloadPath, `
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      platform: 'android',
      Plugins: {}
    };
  `);

  const capWin = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      preload: preloadPath
    },
  });

  await loginAsAdmin(capWin);

  const capInspection = await capWin.webContents.executeJavaScript(`
    (() => {
      const desktopBtn = document.getElementById('header-install-app-btn');
      const mobileBtn = document.getElementById('mobile-install-app-btn');
      const modal = document.querySelector('[role="dialog"]');

      return {
        hasCapacitorObject: Boolean(window.Capacitor && window.Capacitor.isNativePlatform()),
        desktopInstallBtnPresent: Boolean(desktopBtn),
        mobileInstallBtnPresent: Boolean(mobileBtn),
        modalPresent: Boolean(modal)
      };
    })()
  `);
  console.log('[+] Capacitor Native inspection:', JSON.stringify(capInspection, null, 2));

  assert(capInspection.hasCapacitorObject, 'Capacitor object must be detected in native mode');
  assert(!capInspection.desktopInstallBtnPresent, 'Desktop Install App button must NOT be rendered in Capacitor Native');
  assert(!capInspection.mobileInstallBtnPresent, 'Mobile Install App button must NOT be rendered in Capacitor Native');
  assert(!capInspection.modalPresent, 'Modal must NOT be rendered in Capacitor Native');

  await saveShot(capWin, 'capacitor_native_header_no_install_btn.png');

  capWin.destroy();
  desktopWin.destroy();

  // Clean up preload script
  try {
    fs.unlinkSync(preloadPath);
  } catch (e) {}

  console.log('\n=============================================================');
  console.log('[SUCCESS] ALL INSTALL APP & CAPACITOR GUARD TESTS PASSED!');
  console.log('=============================================================');
  app.quit();
  process.exit(0);
}).catch(err => {
  console.error('[FAILED] Test error:', err);
  app.quit();
  process.exit(1);
});
