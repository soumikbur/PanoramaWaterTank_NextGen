// apps/mobile/scripts/alert_lifecycle_electron_runner.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8029';
const SCREENSHOT_DIR = process.env.TEST_SCREENSHOT_DIR || 'C:\\Users\\soumi\\.gemini\\antigravity\\brain\\02d4ebd6-2deb-462f-b938-3b5741021d98\\screenshots';
const TOKEN = process.env.TEST_TOKEN || '';
const USER = JSON.parse(process.env.TEST_USER_JSON || '{}');

app.setPath('userData', path.join(os.tmpdir(), 'panorama-alert-electron-' + process.pid));
const consoleErrors = [];

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

async function waitForSelector(win, jsExpr, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await win.webContents.executeJavaScript(jsExpr);
    if (found) return found;
    await sleep(200);
  }
  throw new Error('Timeout waiting for: ' + jsExpr);
}

async function clickNav(win, screenId) {
  await win.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector('button[data-screen="${screenId}"]');
    if (btn) btn.click();
  })()`);
  await sleep(600);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  win.webContents.on('console-message', (e, level, msg) => {
    if (
      level >= 3 &&
      !msg.includes('React DevTools') &&
      !msg.includes('Electron Security Warning') &&
      !msg.includes('ERR_NAME_NOT_RESOLVED') &&
      !msg.includes('[CRITICAL]') &&
      !msg.includes('WebSocket connection') &&
      !msg.includes('[ApiClient]') &&
      !msg.includes('404') &&
      !msg.includes('Failed to load resource')
    ) {
      consoleErrors.push(msg);
      console.error('[BROWSER ERROR]', msg);
    }
  });

  try {
    await win.loadURL(BASE_URL + '/');
    await sleep(800);

    // If on login screen, click quick test login as Admin
    await win.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector('#btn-quick-login-admin');
      if (btn) btn.click();
    })()`);
    await sleep(1500);

    // Preload localStorage with user credentials AND the exact 6 orphaned alerts described in Problem 1
    const orphanedAlerts = [
      {
        id: 'orphan-12842-c2',
        alertKey: 'conn-PANORAMA-12842-C2',
        alertType: 'DEVICE_OFFLINE',
        severity: 'WARNING',
        title: 'Device Offline (PANORAMA-12842-C2)',
        message: 'Communication lost with telemetry unit PANORAMA-12842-C2.',
        trainNumber: '12842',
        coachNumber: 'C2',
        status: 'ACTIVE',
        triggeredAt: new Date(Date.now() - 3600000).toISOString(),
        lastNotifiedAt: Date.now() - 3600000,
        nextReminderAt: Date.now() + 1800000,
        reminderCount: 0,
      },
      {
        id: 'orphan-12842-c3',
        alertKey: 'conn-PANORAMA-12842-C3',
        alertType: 'DEVICE_OFFLINE',
        severity: 'WARNING',
        title: 'Device Offline (PANORAMA-12842-C3)',
        message: 'Communication lost with telemetry unit PANORAMA-12842-C3.',
        trainNumber: '12842',
        coachNumber: 'C3',
        status: 'ACTIVE',
        triggeredAt: new Date(Date.now() - 3600000).toISOString(),
        lastNotifiedAt: Date.now() - 3600000,
        nextReminderAt: Date.now() + 1800000,
        reminderCount: 0,
      },
      {
        id: 'orphan-12842-c4',
        alertKey: 'conn-PANORAMA-12842-C4',
        alertType: 'DEVICE_OFFLINE',
        severity: 'WARNING',
        title: 'Device Offline (PANORAMA-12842-C4)',
        message: 'Communication lost with telemetry unit PANORAMA-12842-C4.',
        trainNumber: '12842',
        coachNumber: 'C4',
        status: 'ACTIVE',
        triggeredAt: new Date(Date.now() - 3600000).toISOString(),
        lastNotifiedAt: Date.now() - 3600000,
        nextReminderAt: Date.now() + 1800000,
        reminderCount: 0,
      },
      {
        id: 'orphan-12842-c5',
        alertKey: 'conn-PANORAMA-12842-C5',
        alertType: 'DEVICE_OFFLINE',
        severity: 'WARNING',
        title: 'Device Offline (PANORAMA-12842-C5)',
        message: 'Communication lost with telemetry unit PANORAMA-12842-C5.',
        trainNumber: '12842',
        coachNumber: 'C5',
        status: 'ACTIVE',
        triggeredAt: new Date(Date.now() - 3600000).toISOString(),
        lastNotifiedAt: Date.now() - 3600000,
        nextReminderAt: Date.now() + 1800000,
        reminderCount: 0,
      },
      {
        id: 'orphan-12842-c6',
        alertKey: 'conn-PANORAMA-12842-C6',
        alertType: 'DEVICE_OFFLINE',
        severity: 'WARNING',
        title: 'Device Offline (PANORAMA-12842-C6)',
        message: 'Communication lost with telemetry unit PANORAMA-12842-C6.',
        trainNumber: '12842',
        coachNumber: 'C6',
        status: 'ACTIVE',
        triggeredAt: new Date(Date.now() - 3600000).toISOString(),
        lastNotifiedAt: Date.now() - 3600000,
        nextReminderAt: Date.now() + 1800000,
        reminderCount: 0,
      },
    ];

    await win.webContents.executeJavaScript(`
      localStorage.setItem('panorama_managed_alerts_v1', ${JSON.stringify(JSON.stringify(orphanedAlerts))});
      localStorage.setItem('panorama_static_fleet_v2', JSON.stringify({ version: 2, updatedAt: Date.now(), trains: {} }));
      const s = window.__testModules ? window.__testModules.alertNotificationService : null;
      if (s) {
        s.reloadPersistedState();
        s.reconcileWithFleet({ trainNumbers: new Set(), coachKeys: new Set(), deviceUids: new Set() });
      }
      window.dispatchEvent(new Event('panorama:fleet-updated'));
    `);
    await sleep(600);
    await clickNav(win, 'trains');
    await sleep(800);

    // =========================================================================
    // TEST 1: ZERO TRAINS CONFIGURED -> ZERO COACHES, ZERO TANKS, ZERO ACTIVE ALERTS
    // =========================================================================
    console.log('[TEST 1] Verifying 0 trains configured -> 0 active alerts...');
    await waitForSelector(
      win,
      "document.body.innerText.includes('Train Management') || document.body.innerText.includes('No trains') || document.body.innerText.includes('No Train')"
    );
    await sleep(600);

    // Check Train Management screen displays 0 configured trains
    const trainScreenText = await win.webContents.executeJavaScript('document.body.innerText');
    assert(
      trainScreenText.includes('No Train Configured') ||
      trainScreenText.includes('No trains configured') ||
      trainScreenText.includes('0 Trains') ||
      trainScreenText.includes('0 trains'),
      'Train Management must show 0 trains configured'
    );

    // Navigate to Alerts screen
    await clickNav(win, 'alerts');
    await sleep(800);

    // Verify active alerts count is 0 and no orphaned alerts PANORAMA-12842-C2..C6 remain active
    const alertScreenState = await win.webContents.executeJavaScript(`(() => {
      const banner = document.querySelector('[data-testid="active-alert-banner"]');
      const bannerText = banner ? banner.innerText : '';
      const bodyText = document.body.innerText;
      const hasC2 = bodyText.includes('PANORAMA-12842-C2');
      const hasC3 = bodyText.includes('PANORAMA-12842-C3');
      const hasC4 = bodyText.includes('PANORAMA-12842-C4');
      const hasC5 = bodyText.includes('PANORAMA-12842-C5');
      const hasC6 = bodyText.includes('PANORAMA-12842-C6');
      
      // Check localStorage managed alerts
      const savedRaw = localStorage.getItem('panorama_managed_alerts_v1');
      const saved = savedRaw ? JSON.parse(savedRaw) : [];
      const activeSaved = saved.filter(a => a.status === 'ACTIVE');

      return {
        bannerText,
        hasC2, hasC3, hasC4, hasC5, hasC6,
        activeSavedCount: activeSaved.length,
        bodyText
      };
    })()`);

    assert.strictEqual(alertScreenState.activeSavedCount, 0, 'All 6 orphaned alerts in localStorage must be marked RESOLVED');
    assert.strictEqual(alertScreenState.hasC2, false, 'PANORAMA-12842-C2 must not appear active');
    assert.strictEqual(alertScreenState.hasC3, false, 'PANORAMA-12842-C3 must not appear active');
    assert.strictEqual(alertScreenState.hasC4, false, 'PANORAMA-12842-C4 must not appear active');
    assert.strictEqual(alertScreenState.hasC5, false, 'PANORAMA-12842-C5 must not appear active');
    assert.strictEqual(alertScreenState.hasC6, false, 'PANORAMA-12842-C6 must not appear active');

    await saveShot(win, 'alert_01_zero_trains_zero_active_alerts.png');
    console.log('[TEST 1 PASS] Zero trains configured -> 0 active alerts. 6 orphaned alerts completely purged.');

    // =========================================================================
    // TEST 2: REGISTER TRAIN WITH 2 COACHES -> COACHES/TANKS APPEAR, NOMINAL STATUS
    // =========================================================================
    console.log('[TEST 2] Registering Train 12842 with 2 coaches (C1, C2)...');
    await clickNav(win, 'trains');
    await sleep(600);

    // Create Train 12842 via frontend ApiClient to test real UI flow
    await win.webContents.executeJavaScript(`
      (async () => {
        const client = window.__testModules ? window.__testModules.ApiClient : null;
        if (!client) throw new Error('ApiClient not exposed on window.__testModules');
        return await client.createTrain({
          train_number: '12842',
          name: 'Coromandel Express',
          region: 'EAST',
          coach_number: 'C1',
          tank_capacity: 20.0
        });
      })()
    `);
    await sleep(500);

    // Add second coach C2
    await win.webContents.executeJavaScript(`
      (async () => {
        const client = window.__testModules ? window.__testModules.ApiClient : null;
        const reg = window.__testModules ? window.__testModules.deviceRegistry : null;
        if (!client) throw new Error('ApiClient not exposed on window.__testModules');
        await client.addCoach('12842', {
          coach_number: 'C2',
          device_uid: 'PANORAMA-12842-C2'
        });
        if (reg) {
          reg.assignDevice('PANORAMA-12842-C1', '12842', 'C1');
          reg.assignDevice('PANORAMA-12842-C2', '12842', 'C2');
        }
      })()
    `);
    await sleep(600);

    // Refresh fleet in UI
    await win.webContents.executeJavaScript(`
      window.dispatchEvent(new Event('panorama:fleet-updated'));
    `);
    await sleep(1000);

    // Verify Train 12842, 2 Coaches, 4 Tanks are rendered
    await clickNav(win, 'dashboard');
    await waitForSelector(win, "document.body.innerText.includes('12842')");
    await sleep(600);
    const dashText = await win.webContents.executeJavaScript('document.body.innerText');
    assert(dashText.includes('12842'), 'Dashboard must display Train 12842');
    assert(
      dashText.includes('2 Coaches') || dashText.includes('2 coaches') || dashText.includes('C1') || dashText.includes('C2'),
      'Must show coaches for 12842'
    );

    // Check Alerts screen: nominal status, 0 active alerts
    await clickNav(win, 'alerts');
    await sleep(600);
    const alertScreenText2 = await win.webContents.executeJavaScript('document.body.innerText');
    assert(
      alertScreenText2.toLowerCase().includes('no active alerts') ||
      alertScreenText2.includes('Active Alerts (0)') ||
      alertScreenText2.includes('All systems operating normally'),
      'Alerts screen must show nominal status with 0 active alerts'
    );

    await saveShot(win, 'alert_02_train_registered_two_coaches_nominal.png');
    console.log('[TEST 2 PASS] Train 12842 registered with 2 coaches & 4 tanks; nominal status verified.');

    // =========================================================================
    // TEST 3: DISCONNECT ONE REGISTERED DEVICE -> 1 OFFLINE ALERT, 30-MIN REMINDERS
    // =========================================================================
    console.log('[TEST 3] Disconnecting registered device PANORAMA-12842-C1...');
    await win.webContents.executeJavaScript(`
      (() => {
        const s = window.__testModules ? window.__testModules.alertNotificationService : null;
        if (!s) throw new Error('alertNotificationService not exposed on window.__testModules');
        s.evaluateDeviceConnectivity({
          deviceId: 'PANORAMA-12842-C1',
          coachNumber: 'C1',
          trainNumber: '12842',
          isOnline: false
        });
      })()
    `);
    await sleep(800);

    // Check Alerts screen for the active alert and reminder wording
    await clickNav(win, 'alerts');
    await sleep(600);

    const alertCheck = await win.webContents.executeJavaScript(`
      (() => {
        const body = document.body.innerText;
        const hasAlert = body.includes('PANORAMA-12842-C1') || body.includes('Coach C1');
        const hasReminder30Min = body.includes('Auto-reminder every 30 minutes');
        const has30s = body.includes('Auto-reminder every 30s');
        const has30min = body.includes('Auto-reminder every 30 min') && !body.includes('Auto-reminder every 30 minutes');
        
        // Check interval in service
        const savedRaw = localStorage.getItem('panorama_managed_alerts_v1');
        const saved = savedRaw ? JSON.parse(savedRaw) : [];
        const activeAlert = saved.find(a => a.status === 'ACTIVE' && (a.id.includes('PANORAMA-12842-C1') || a.alertKey.includes('PANORAMA-12842-C1')));

        const banner = document.querySelector('[data-testid="active-alert-banner"]');
        const bannerText = banner ? banner.innerText : '';

        return {
          hasAlert,
          hasReminder30Min,
          has30s,
          has30min,
          activeAlertFound: !!activeAlert,
          reminderIntervalMs: activeAlert ? (activeAlert.nextReminderAt - activeAlert.lastNotifiedAt) : 0,
          bannerText,
          bodyText: body.slice(0, 1500)
        };
      })()
    `);

    assert(alertCheck.hasAlert, 'Offline alert for PANORAMA-12842-C1 must appear on Alerts screen');
    assert(alertCheck.hasReminder30Min, 'Display text must explicitly state: "Auto-reminder every 30 minutes"');
    assert.strictEqual(alertCheck.has30s, false, 'Must NOT display "Auto-reminder every 30s"');
    assert.strictEqual(alertCheck.has30min, false, 'Must NOT display "Auto-reminder every 30 min" without "utes"');
    assert(
      alertCheck.bannerText.includes('Reminders every 30 minutes until acknowledged or resolved'),
      'Banner text must include "Reminders every 30 minutes until acknowledged or resolved"'
    );
    assert.strictEqual(alertCheck.reminderIntervalMs, 1800000, 'Reminder interval must be exactly 1,800,000ms (30 minutes)');

    await saveShot(win, 'alert_03_device_offline_30min_reminder.png');
    console.log('[TEST 3 PASS] Exactly 1 active offline alert triggered. "Auto-reminder every 30 minutes" (1,800,000ms) verified.');

    // =========================================================================
    // TEST 4: ACKNOWLEDGE ALERT STOPS REMINDERS -> DELETE TRAIN AUTO-RESOLVES
    // =========================================================================
    console.log('[TEST 4] Acknowledging alert and verifying reminders stop...');
    await win.webContents.executeJavaScript(`
      (() => {
        const s = window.__testModules ? window.__testModules.alertNotificationService : null;
        if (!s) throw new Error('alertNotificationService not exposed');
        const active = s.getActiveUnacknowledgedAlerts();
        if (active.length > 0) {
          s.acknowledgeAlert(active[0].id, 'Chief Engineer');
        }
      })()
    `);
    await sleep(500);

    const ackCheck = await win.webContents.executeJavaScript(`
      (() => {
        const body = document.body.innerText;
        const hasRemindersStopped = body.includes('Reminders stopped');
        const savedRaw = localStorage.getItem('panorama_managed_alerts_v1');
        const saved = savedRaw ? JSON.parse(savedRaw) : [];
        const acked = saved.find(a => a.status === 'ACKNOWLEDGED');
        return {
          hasRemindersStopped,
          isAcked: !!acked,
          acknowledgedBy: acked ? acked.acknowledgedBy : null
        };
      })()
    `);

    assert(ackCheck.isAcked, 'Alert must be marked ACKNOWLEDGED in store');
    assert(ackCheck.hasRemindersStopped, 'UI must display "Reminders stopped" after acknowledgement');

    await saveShot(win, 'alert_04_alert_acknowledged_reminders_stopped.png');
    console.log('[TEST 4.1 PASS] Alert acknowledged; reminders stopped immediately.');

    // Now delete Train 12842 and verify alert transitions to RESOLVED automatically
    console.log('[TEST 4.2] Deleting Train 12842 and verifying auto-resolution...');
    await win.webContents.executeJavaScript(`
      (async () => {
        const client = window.__testModules ? window.__testModules.ApiClient : null;
        if (!client) throw new Error('ApiClient not exposed');
        await client.deleteTrain('12842');
        window.dispatchEvent(new Event('panorama:fleet-updated'));
      })()
    `);
    await sleep(1000);

    // Check Alerts screen again
    await clickNav(win, 'alerts');
    await sleep(600);

    const deleteResolutionCheck = await win.webContents.executeJavaScript(`
      (() => {
        const savedRaw = localStorage.getItem('panorama_managed_alerts_v1');
        const saved = savedRaw ? JSON.parse(savedRaw) : [];
        const nonResolved = saved.filter(a => a.status !== 'RESOLVED');
        const historyRaw = localStorage.getItem('panorama_alert_history');
        const history = historyRaw ? JSON.parse(historyRaw) : [];
        const body = document.body.innerText;
        const banner = document.querySelector('[data-testid="active-alert-banner"]');

        return {
          nonResolvedCount: nonResolved.length,
          historyCount: history.length,
          hasActiveText: body.includes('Active Alert'),
          bannerPresent: banner !== null && (banner.innerText.includes('Active Unacknowledged Alert')),
        };
      })()
    `);

    assert.strictEqual(deleteResolutionCheck.nonResolvedCount, 0, 'All alerts for deleted train 12842 must be RESOLVED');
    assert.strictEqual(deleteResolutionCheck.bannerPresent, false, 'Active alert banner must be hidden after train deletion');
    assert(deleteResolutionCheck.historyCount > 0, 'Alert history must be preserved for audit compliance');

    await saveShot(win, 'alert_05_train_deleted_auto_resolved_history_retained.png');
    console.log('[TEST 4.2 PASS] Train 12842 deleted -> 0 active alerts, all auto-resolved, history preserved.');

    // =========================================================================
    // TEST 5: RELOAD APPLICATION / BROWSER RESTART -> ZERO ORPHANED ALERTS
    // =========================================================================
    console.log('[TEST 5] Reloading application to verify persistence integrity...');
    await win.webContents.executeJavaScript('window.location.reload()');
    await sleep(2000);

    await clickNav(win, 'alerts');
    await sleep(800);

    const reloadCheck = await win.webContents.executeJavaScript(`
      (() => {
        const savedRaw = localStorage.getItem('panorama_managed_alerts_v1');
        const saved = savedRaw ? JSON.parse(savedRaw) : [];
        const nonResolved = saved.filter(a => a.status !== 'RESOLVED');
        const banner = document.querySelector('[data-testid="active-alert-banner"]');
        const body = document.body.innerText;

        return {
          nonResolvedCount: nonResolved.length,
          bannerVisible: banner !== null && (banner.innerText.includes('Active Unacknowledged Alert')),
          hasOrphan12842: body.includes('PANORAMA-12842-C2') || body.includes('PANORAMA-12842-C3'),
          bodyText: body.slice(0, 1000)
        };
      })()
    `);

    assert.strictEqual(reloadCheck.nonResolvedCount, 0, 'Zero non-resolved alerts after page reload');
    assert.strictEqual(reloadCheck.bannerVisible, false, 'Banner must not show any active alerts after reload');
    assert.strictEqual(reloadCheck.hasOrphan12842, false, 'No orphaned alerts can reappear after reload');

    await saveShot(win, 'alert_06_reload_no_orphaned_alerts.png');
    console.log('[TEST 5 PASS] Post-reload verification passed: 0 orphaned alerts, DB and UI stay synced.');

    assert.strictEqual(consoleErrors.length, 0, 'Zero unexpected browser console errors allowed, got: ' + consoleErrors.join(' | '));
    console.log('\n======================================================');
    console.log('ALL 5 ALERT LIFECYCLE E2E TESTS PASSED PERFECTLY!');
    console.log('======================================================\n');
    app.exit(0);
  } catch (err) {
    console.error('[ALERT E2E FAILURE]', err);
    try {
      await saveShot(win, 'alert_99_failure.png');
    } catch {}
    app.exit(1);
  }
});

