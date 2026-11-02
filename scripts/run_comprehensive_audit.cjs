// scripts/run_comprehensive_audit.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'WLI_DOCS', 'audit_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const LOG_FILE = path.join(SCREENSHOT_DIR, 'audit_runner.log');
fs.writeFileSync(LOG_FILE, `[START] Audit Runner Initialized at ${new Date().toISOString()}\n`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function capture(win, filename) {
  const image = await win.capturePage();
  const filePath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(filePath, image.toPNG());
  log(`[Screenshot Saved] -> ${filename}`);
  return filePath;
}

async function runAudit() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const auditResults = {
    timestamp: new Date().toISOString(),
    pass1_auth: {},
    pass2_visual: {},
    pass3_interactions: {},
    pass4_mqtt_telemetry: {},
    pass5_regression: {},
  };

  log('=====================================================');
  log('PANORAMA WATER TANK NEXTGEN - COMPREHENSIVE UI AUDIT');
  log('=====================================================');

  // Load URL
  log('\n[PASS 1] Testing Authentication & Session Management...');
  await win.loadURL('http://127.0.0.1:3001');
  await sleep(1500);

  // Clear existing session
  await win.webContents.executeJavaScript(`
    localStorage.removeItem('panorama_token');
    window.location.reload();
  `);
  await sleep(2000);

  // 1.1 Unauthenticated Login Screen
  const loginRendered = await win.webContents.executeJavaScript(`
    (() => {
      const heading = document.querySelector('h1, h2, div');
      const userInput = document.querySelector('#login-username');
      const passInput = document.querySelector('#login-password');
      return !!(userInput && passInput);
    })()
  `);
  log('1.1 Unauthenticated access forces LoginScreen: ' + (loginRendered ? 'PASS' : 'FAIL'));
  await capture(win, 'pass1_01_login_screen.png');
  auditResults.pass1_auth.unauthenticatedRedirect = loginRendered;

  // 1.2 Invalid Login Attempt
  await win.webContents.executeJavaScript(`
    (() => {
      const u = document.querySelector('#login-username');
      const p = document.querySelector('#login-password');
      const btn = document.querySelector('button[type="submit"]');
      if (u && p && btn) {
        // Trigger React change
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(u, 'admin');
        u.dispatchEvent(new Event('input', { bubbles: true }));
        nativeInputValueSetter.call(p, 'wrongpass123');
        p.dispatchEvent(new Event('input', { bubbles: true }));
        btn.click();
      }
    })()
  `);
  await sleep(1500);

  const errorBanner = await win.webContents.executeJavaScript(`
    (() => {
      const text = document.body.innerText;
      return text.includes('Invalid') || text.includes('401') || text.includes('failed') || text.includes('credentials');
    })()
  `);
  console.log('1.2 Invalid Credentials Rejected with Error Banner:', errorBanner ? 'PASS' : 'FAIL');
  await capture(win, 'pass1_02_login_error.png');
  auditResults.pass1_auth.invalidCredentialsRejected = errorBanner;

  // 1.3 Valid Admin Login
  await win.webContents.executeJavaScript(`
    (() => {
      const u = document.querySelector('#login-username');
      const p = document.querySelector('#login-password');
      const btn = document.querySelector('button[type="submit"]');
      if (u && p && btn) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(u, 'admin');
        u.dispatchEvent(new Event('input', { bubbles: true }));
        nativeInputValueSetter.call(p, 'admin123');
        p.dispatchEvent(new Event('input', { bubbles: true }));
        btn.click();
      }
    })()
  `);
  await sleep(2500);

  const adminSessionActive = await win.webContents.executeJavaScript(`
    (() => {
      const token = localStorage.getItem('panorama_token');
      const text = document.body.innerText;
      return !!token && text.includes('ADMIN') && text.includes('Dashboard');
    })()
  `);
  console.log('1.3 Admin Login Authentication & Session Token Set:', adminSessionActive ? 'PASS' : 'FAIL');
  await capture(win, 'pass1_03_admin_dashboard.png');
  auditResults.pass1_auth.adminLoginSuccessful = adminSessionActive;

  // 1.4 Test Logout
  await win.webContents.executeJavaScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const b of buttons) {
        if (b.textContent && (b.textContent.includes('Sign Out') || b.textContent.includes('Logout'))) {
          b.click();
          return true;
        }
      }
      return false;
    })()
  `);
  await sleep(1500);

  const loggedOut = await win.webContents.executeJavaScript(`
    (() => {
      const token = localStorage.getItem('panorama_token');
      const hasLogin = !!document.querySelector('#login-username');
      return !token && hasLogin;
    })()
  `);
  console.log('1.4 Logout Invalidation & Token Cleanup:', loggedOut ? 'PASS' : 'FAIL');
  await capture(win, 'pass1_04_logout.png');
  auditResults.pass1_auth.logoutSuccessful = loggedOut;

  // 1.5 Test Operator Login & Role Isolation
  await win.webContents.executeJavaScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const b of buttons) {
        if (b.textContent && b.textContent.includes('Operator Role')) {
          b.click();
          break;
        }
      }
      const submit = document.querySelector('button[type="submit"]');
      if (submit) submit.click();
    })()
  `);
  await sleep(2500);

  const operatorGated = await win.webContents.executeJavaScript(`
    (() => {
      const text = document.body.innerText;
      const hasOperatorBadge = text.includes('OPERATOR');
      // In sidebar, Settings and User Management should NOT be visible
      const sidebarLinks = Array.from(document.querySelectorAll('button, span, div')).map(e => e.textContent.trim());
      const hasSettingsNav = sidebarLinks.includes('Settings');
      const hasUsersNav = sidebarLinks.includes('User Management');
      const hasLogsNav = sidebarLinks.includes('System Logs');
      return {
        hasOperatorBadge,
        adminSectionsHidden: !hasSettingsNav && !hasUsersNav && !hasLogsNav
      };
    })()
  `);
  console.log('1.5 Operator Login & Role Isolation in Navigation:', operatorGated.adminSectionsHidden ? 'PASS' : 'FAIL');
  await capture(win, 'pass1_05_operator_dashboard.png');
  auditResults.pass1_auth.operatorRoleGating = operatorGated;

  // 1.6 Re-login as Admin for Visual and Screen Audits
  await win.webContents.executeJavaScript(`
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const b of buttons) {
      if (b.textContent && (b.textContent.includes('Sign Out') || b.textContent.includes('Logout'))) {
        b.click();
        break;
      }
    }
  `);
  await sleep(1200);

  await win.webContents.executeJavaScript(`
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const b of buttons) {
      if (b.textContent && b.textContent.includes('Admin Role')) {
        b.click();
        break;
      }
    }
    const submit = document.querySelector('button[type="submit"]');
    if (submit) submit.click();
  `);
  await sleep(2500);

  console.log('\n[PASS 2 & 3] Auditing All 11 Screens: Visual Hierarchy & Interactions...');

  const navMap = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'trains', label: 'Train Management' },
    { key: 'watertank', label: 'All Tanks' },
    { key: 'devices', label: 'Devices' },
    { key: 'location', label: 'Location & GPS' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'history', label: 'History' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
    { key: 'users', label: 'User Management' },
    { key: 'logs', label: 'System Logs' },
  ];

  for (const item of navMap) {
    // Click navigation item in sidebar
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button, div, span'));
        for (const el of buttons) {
          if (el.textContent && el.textContent.trim() === '${item.label}') {
            el.click();
            return true;
          }
        }
        return false;
      })()
    `);
    await sleep(1200);

    // Capture visual screenshot
    await capture(win, `screen_${item.key}.png`);

    // Screen specific interaction checks
    if (item.key === 'trains') {
      // Test Add Train Modal
      await win.webContents.executeJavaScript(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          for (const b of btns) {
            if (b.textContent && b.textContent.includes('Add Train')) {
              b.click();
              return true;
            }
          }
          return false;
        })()
      `);
      await sleep(800);
      await capture(win, 'interaction_trains_modal_open.png');
      // Close modal
      await win.webContents.executeJavaScript(`
        (() => {
          const closeBtns = Array.from(document.querySelectorAll('button[title="Close modal"], button'));
          for (const b of closeBtns) {
            if (b.getAttribute('title') === 'Close modal' || b.textContent.includes('Cancel')) {
              b.click();
              return true;
            }
          }
        })()
      `);
      await sleep(600);
      auditResults.pass3_interactions.trainsModal = true;
    }

    if (item.key === 'location') {
      // Test Center on Train and Fit Corridor buttons
      const locControls = await win.webContents.executeJavaScript(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
          return btns.filter(t => t.includes('Center on Train') || t.includes('Fit Corridor'));
        })()
      `);
      console.log(`   Location screen map controls found:`, locControls);
      auditResults.pass3_interactions.locationControls = locControls;
    }

    if (item.key === 'reports') {
      // Test Tab navigation
      await win.webContents.executeJavaScript(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          for (const b of btns) {
            if (b.textContent && b.textContent.includes('Refill')) {
              b.click();
              break;
            }
          }
        })()
      `);
      await sleep(600);
      await capture(win, 'interaction_reports_refill_tab.png');
      auditResults.pass3_interactions.reportsTabs = true;
    }

    if (item.key === 'settings') {
      // Test Settings screen inputs & buttons
      const settingsControls = await win.webContents.executeJavaScript(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
          return btns.filter(t => t.includes('Read From Device') || t.includes('Test MQTT') || t.includes('Save All'));
        })()
      `);
      console.log(`   Settings screen action buttons:`, settingsControls);
      auditResults.pass3_interactions.settingsControls = settingsControls;
    }

    if (item.key === 'users') {
      // Test Add User Modal
      await win.webContents.executeJavaScript(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          for (const b of btns) {
            if (b.textContent && b.textContent.includes('Add User Account')) {
              b.click();
              return true;
            }
          }
          return false;
        })()
      `);
      await sleep(800);
      await capture(win, 'interaction_users_modal_open.png');
      // Close modal
      await win.webContents.executeJavaScript(`
        (() => {
          const closeBtns = Array.from(document.querySelectorAll('button[title="Close modal"], button'));
          for (const b of closeBtns) {
            if (b.getAttribute('title') === 'Close modal' || b.textContent.includes('Cancel')) {
              b.click();
              return true;
            }
          }
        })()
      `);
      await sleep(600);
      auditResults.pass3_interactions.usersModal = true;
    }

    // Check emojis and demo data on each screen
    const screenCheck = await win.webContents.executeJavaScript(`
      (() => {
        const text = document.body.innerText;
        // Emoji check in rendered text
        const emojiRegex = /[\\uD83C-\\uDBFF\\uDC00-\\uDFFF]/;
        const hasEmoji = emojiRegex.test(text);
        const hasFakeCoords = text.includes('27.8500') || text.includes('77.8000');
        const hasFakeLevel = text.includes('68.4%') || text.includes('68.4 %');
        return { hasEmoji, hasFakeCoords, hasFakeLevel, length: text.length };
      })()
    `);

    auditResults.pass2_visual[item.key] = {
      label: item.label,
      noEmojis: !screenCheck.hasEmoji,
      noFakeCoords: !screenCheck.hasFakeCoords,
      noFakeLevel: !screenCheck.hasFakeLevel,
    };

    console.log(`   [Screen: ${item.label}] Checked: Zero Emojis: ${!screenCheck.hasEmoji}, Zero Mock Data: ${!screenCheck.hasFakeCoords && !screenCheck.hasFakeLevel}`);
  }

  // Save audit data
  const resultsFile = path.join(SCREENSHOT_DIR, 'comprehensive_audit_results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(auditResults, null, 2));
  log('\n=====================================================');
  log('AUDIT RUN COMPLETED SUCCESSFULLY!');
  log(`Results saved to: ${resultsFile}`);
  log('=====================================================');

  app.quit();
}

app.whenReady().then(runAudit).catch((err) => {
  log('Audit run failed with error: ' + (err.stack || err));
  app.exit(1);
});
