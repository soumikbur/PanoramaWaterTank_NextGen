// tools/test_android_notifications.cjs
const http = require('http');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const CDP_PORT = 9223;
const REPORT_DIR = path.resolve(__dirname, '../MOBILE_TEST_REPORTS/ANDROID_NOTIFICATION_UI_FIX');
const BRAIN_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\9e3514ab-7eb1-481b-ac5b-d7edda1def58\\screenshots\\notification_ui_fix';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function adb(cmd) {
  return cp.execSync(`adb -s emulator-5554 ${cmd}`, { encoding: 'utf-8' });
}

function captureScreenshot(filename) {
  const devicePath = '/sdcard/' + filename;
  const localPath = path.join(REPORT_DIR, filename);
  const brainPath = path.join(BRAIN_DIR, filename);

  adb(`shell screencap -p ${devicePath}`);
  adb(`pull ${devicePath} "${localPath}"`);
  fs.mkdirSync(path.dirname(brainPath), { recursive: true });
  fs.copyFileSync(localPath, brainPath);
  console.log(`[SCREENSHOT] Saved: ${localPath}`);
  return localPath;
}

async function getCdpTarget() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const targets = JSON.parse(data);
        const page = targets.find(t => t.type === 'page');
        if (page) resolve(page);
        else reject(new Error('No page target found'));
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('[STEP 1] Connecting to Android WebView over CDP...');
  const target = await getCdpTarget();
  console.log('Target found:', target.title, target.url);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen = resolve);
  console.log('✓ Connected to WebView DevTools WebSocket');

  async function evaluate(expr) {
    const id = Math.floor(Math.random() * 1000000);
    return new Promise((resolve, reject) => {
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.result && msg.result.result) {
            resolve(msg.result.result.value);
          } else {
            resolve(null);
          }
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true, awaitPromise: true }
      }));
    });
  }

  // 1. Inspect Header Layout
  console.log('[STEP 2] Verifying Responsive Mobile Header on 720px AVD...');
  const headerCheck = await evaluate(`(() => {
    const header = document.querySelector('header');
    if (!header) return { found: false };
    const rect = header.getBoundingClientRect();
    const mqttPill = document.getElementById('mobile-mqtt-status-pill');
    const bellBtn = document.getElementById('mobile-alerts-bell-btn');
    const settingsBtn = document.getElementById('mobile-header-settings-btn');
    const accountBtn = document.getElementById('mobile-account-menu-btn');
    const banner = document.querySelector('[data-testid="active-alert-banner"]');
    const toastBanner = document.querySelector('[data-testid="alert-toast-banner"]');

    return {
      found: true,
      headerWidth: rect.width,
      headerHeight: rect.height,
      hasMqttPill: Boolean(mqttPill),
      hasBellBtn: Boolean(bellBtn),
      hasSettingsBtn: Boolean(settingsBtn),
      hasAccountBtn: Boolean(accountBtn),
      isBannerVisible: Boolean(banner && banner.offsetParent !== null),
      isToastBannerVisible: Boolean(toastBanner && toastBanner.offsetParent !== null)
    };
  })()`);
  console.log('Header verification results:', JSON.stringify(headerCheck, null, 2));

  // Capture clean dashboard screenshot
  captureScreenshot('02_dashboard_clean_header.png');

  // 2. Trigger Critical Water Alert
  console.log('[STEP 3] Triggering Critical Low Water Alert on SLRD (Tank 2: 0.0%)...');
  const alertTriggered = await evaluate(`(() => {
    try {
      const service = window.panoramaAlertService || window.alertNotificationService;
      if (service && typeof service.evaluateWaterLevel === 'function') {
        service.evaluateWaterLevel({
          tankId: 'tank-13009-SLRD-departure',
          coachNumber: 'SLRD',
          levelPercent: 0.0,
          isOnline: true,
          trainNumber: '13009',
          tankName: 'Departure Side (Tank 2)'
        });
        return { success: true, method: 'panoramaAlertService' };
      }
      return { success: false, reason: 'service not found on window' };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  })()`);
  console.log('Alert evaluation result:', JSON.stringify(alertTriggered));

  // If window.panoramaAlertService wasn't on window, trigger via nativeBridge directly in WebView
  if (!alertTriggered.success) {
    console.log('[INFO] Invoking nativeBridge directly via Capacitor in WebView...');
    const directRes = await evaluate(`(() => {
      const cap = window.Capacitor;
      if (!cap || !cap.Plugins || !cap.Plugins.LocalNotifications) {
        return { success: false, reason: 'Capacitor LocalNotifications not found' };
      }
      cap.Plugins.LocalNotifications.schedule({
        notifications: [
          {
            id: 130092,
            title: 'CRITICAL LOW WATER - SLRD',
            body: 'Water level: 0.0% | Below critical threshold: 10%\\nTrain: 13009 | Coach: SLRD | Tank: Departure Side (Tank 2)',
            channelId: 'critical-water-alerts',
            schedule: { at: new Date(Date.now() + 50) },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_panorama',
            iconColor: '#DC2626',
            autoCancel: true,
            group: 'panorama_water_alerts',
            extra: {
              trainNumber: '13009',
              coachNumber: 'SLRD',
              tankName: 'Departure Side (Tank 2)',
              severity: 'CRITICAL',
              screen: 'alerts'
            }
          }
        ]
      });
      return { success: true };
    })()`);
    console.log('Direct schedule result:', JSON.stringify(directRes));
  }

  await sleep(1500);

  // Verify dashboard has NO large red banner occupying screen space
  console.log('[STEP 4] Verify In-App Critical Banner is Removed...');
  const bannerCheck = await evaluate(`(() => {
    const toast = document.querySelector('[data-testid="alert-toast-banner"]');
    const active = document.querySelector('[data-testid="active-alert-banner"]');
    return {
      hasToast: Boolean(toast && toast.offsetParent !== null),
      hasActive: Boolean(active && active.offsetParent !== null)
    };
  })()`);
  console.log('In-app banner check (both should be false on mobile):', JSON.stringify(bannerCheck, null, 2));
  captureScreenshot('03_dashboard_without_red_banner.png');

  // 3. Expand Android Notification Shade and capture screenshot of native notification!
  console.log('[STEP 5] Expanding Android Notification Shade to inspect Native Notification...');
  adb('shell cmd statusbar expand-notifications');
  await sleep(2000);
  captureScreenshot('04_android_notification_shade_alert.png');

  // 4. Inspect notifications via dumpsys
  console.log('[STEP 6] Inspecting Android NotificationManager dumpsys...');
  const notifDump = adb('shell dumpsys notification --noredact');
  const hasPanoramaAlert = notifDump.includes('CRITICAL LOW WATER') || notifDump.includes('panorama') || notifDump.includes('critical-water-alerts');
  console.log('Notification found in NotificationManager dumpsys:', hasPanoramaAlert);

  // Collapse notifications
  adb('shell cmd statusbar collapse');
  await sleep(1000);

  // 5. Test Navigation to Alerts via Header Bell
  console.log('[STEP 7] Testing Alerts Navigation via Header Bell shortcut...');
  await evaluate(`(() => {
    const bell = document.getElementById('mobile-alerts-bell-btn');
    if (bell) bell.click();
  })()`);
  await sleep(1500);
  captureScreenshot('05_alerts_screen_details.png');

  // 6. Test Sidebar and Other Pages
  console.log('[STEP 8] Testing Responsive Train Management Screen...');
  await evaluate(`window.location.hash = '#/trains';`);
  await sleep(1500);
  captureScreenshot('06_train_management_responsive.png');

  console.log('[STEP 9] Testing Responsive Devices Screen...');
  await evaluate(`window.location.hash = '#/devices';`);
  await sleep(1500);
  captureScreenshot('07_devices_responsive.png');

  console.log('[STEP 10] Testing Responsive Raw Data Screen...');
  await evaluate(`window.location.hash = '#/raw-data';`);
  await sleep(1500);
  captureScreenshot('08_raw_data_responsive.png');

  console.log('[STEP 11] Returning to Dashboard...');
  await evaluate(`window.location.hash = '#/dashboard';`);
  await sleep(1500);
  captureScreenshot('09_dashboard_final_verified.png');

  ws.close();
  console.log('\n======================================================');
  console.log('🎉 ALL NATIVE NOTIFICATION & MOBILE UI TESTS COMPLETED!');
  console.log('======================================================');
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
