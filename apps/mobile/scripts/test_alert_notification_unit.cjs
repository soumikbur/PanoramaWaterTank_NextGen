// apps/mobile/scripts/test_alert_notification_unit.cjs
const esbuild = require('esbuild');
const path = require('path');
const assert = require('assert');

async function runUnitTests() {
  console.log('[TEST] Compiling alertNotificationService.ts with esbuild...');
  const res = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src/services/alertNotificationService.ts')],
    bundle: true,
    format: 'cjs',
    write: false,
    target: 'node18',
  });

  const code = res.outputFiles[0].text;

  // Mock localStorage & window.Notification for node environment
  const mockStorage = new Map();
  global.localStorage = {
    getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
  };

  const spawnedNotifications = [];
  class MockNotification {
    constructor(title, options) {
      this.title = title;
      this.options = options;
      this.onclick = null;
      this.close = () => {};
      spawnedNotifications.push({ title, options });
    }
    static requestPermission() {
      return Promise.resolve(MockNotification.permission);
    }
  }
  MockNotification.permission = 'granted';
  global.Notification = MockNotification;
  global.window = {
    Notification: MockNotification,
    focus: () => {},
  };

  const fn = new Function('exports', 'module', 'localStorage', 'window', 'Notification', code);
  const mod = { exports: {} };
  fn(mod.exports, mod, global.localStorage, global.window, global.Notification);

  const service = mod.exports.alertNotificationService;
  assert(service, 'alertNotificationService instance should exist');
  service.stopReminderScheduler();
  service.clearHistory();

  console.log('[TEST 1] Testing water level alert evaluation & deduplication...');
  let toastCount = 0;
  const toasts = [];
  const unsub = service.onToast((t) => {
    toastCount++;
    toasts.push(t);
  });

  // T1: 8.5% level (below 10% critical) -> Should trigger CRITICAL alert
  service.evaluateWaterLevel({
    tankId: 'tank-test-1',
    coachNumber: 'C1',
    levelPercent: 8.5,
    isOnline: true,
  });

  assert.strictEqual(toastCount, 1, 'Should trigger 1 critical toast');
  assert.strictEqual(toasts[0].severity, 'CRITICAL', 'First toast should be CRITICAL');
  assert.strictEqual(toasts[0].coachNumber, 'C1');
  console.log('  ✓ Critical alert triggered: ' + toasts[0].title);

  // T2: Subsequent identical reading (8.5%) -> Should be suppressed by deduplication
  for (let i = 0; i < 5; i++) {
    service.evaluateWaterLevel({
      tankId: 'tank-test-1',
      coachNumber: 'C1',
      levelPercent: 8.5,
      isOnline: true,
    });
  }
  assert.strictEqual(toastCount, 1, 'Deduplication failed: Duplicate identical readings triggered toasts');
  console.log('  ✓ Deduplication verified: 5 consecutive identical readings triggered 0 extra toasts');

  // T3: Transition to 15.0% (below 20% warning) -> Should trigger WARNING alert
  service.evaluateWaterLevel({
    tankId: 'tank-test-1',
    coachNumber: 'C1',
    levelPercent: 15.0,
    isOnline: true,
  });
  assert.strictEqual(toastCount, 2, 'Should trigger second toast on state change to WARNING');
  assert.strictEqual(toasts[1].severity, 'WARNING');
  console.log('  ✓ Warning alert triggered: ' + toasts[1].title);

  // T4: Subsequent identical warning reading (15.0%) -> Suppressed
  service.evaluateWaterLevel({
    tankId: 'tank-test-1',
    coachNumber: 'C1',
    levelPercent: 15.0,
    isOnline: true,
  });
  assert.strictEqual(toastCount, 2, 'Deduplication failed for warning state');
  console.log('  ✓ Deduplication verified for warning state');

  // T5: Recovery to 65.0% (>= 20% normal) -> Should trigger NORMAL recovery notification
  service.evaluateWaterLevel({
    tankId: 'tank-test-1',
    coachNumber: 'C1',
    levelPercent: 65.0,
    isOnline: true,
  });
  assert.strictEqual(toastCount, 3, 'Should trigger recovery toast on state change to NORMAL');
  assert.strictEqual(toasts[2].severity, 'NORMAL');
  assert.strictEqual(toasts[2].title.includes('Recovered'), true);
  console.log('  ✓ Recovery alert triggered: ' + toasts[2].title);

  // T6: Subsequent nominal reading (70.0%) -> Suppressed
  service.evaluateWaterLevel({
    tankId: 'tank-test-1',
    coachNumber: 'C1',
    levelPercent: 70.0,
    isOnline: true,
  });
  assert.strictEqual(toastCount, 3, 'Nominal reading should not trigger duplicate toast');
  console.log('  ✓ Nominal readings remain quiet');

  // T7: Sensor Health Evaluation & Deduplication
  console.log('[TEST 2] Testing sensor fault & recovery...');
  service.evaluateSensorHealth({
    sensorId: 'sensor-1',
    coachNumber: 'C1',
    isValid: false,
    sensorName: 'Arrival Hydrostatic Sensor',
  });
  assert.strictEqual(toastCount, 4, 'Sensor fault should trigger toast');
  assert.strictEqual(toasts[3].severity, 'CRITICAL');
  console.log('  ✓ Sensor fault triggered: ' + toasts[3].title);

  // Duplicate sensor fault
  service.evaluateSensorHealth({
    sensorId: 'sensor-1',
    coachNumber: 'C1',
    isValid: false,
    sensorName: 'Arrival Hydrostatic Sensor',
  });
  assert.strictEqual(toastCount, 4, 'Duplicate sensor fault should be suppressed');

  // Sensor restored
  service.evaluateSensorHealth({
    sensorId: 'sensor-1',
    coachNumber: 'C1',
    isValid: true,
    sensorName: 'Arrival Hydrostatic Sensor',
  });
  assert.strictEqual(toastCount, 5, 'Sensor recovery should trigger toast');
  assert.strictEqual(toasts[4].severity, 'NORMAL');
  console.log('  ✓ Sensor recovery triggered: ' + toasts[4].title);

  // T8: Device Connectivity Evaluation & Deduplication
  console.log('[TEST 3] Testing device offline & reconnection...');
  service.evaluateDeviceConnectivity({
    deviceId: 'device-wli-1',
    coachNumber: 'C1',
    isOnline: false,
  });
  assert.strictEqual(toastCount, 6, 'Device offline should trigger toast');
  assert.strictEqual(toasts[5].severity, 'WARNING');
  console.log('  ✓ Device offline triggered: ' + toasts[5].title);

  // Duplicate offline
  service.evaluateDeviceConnectivity({
    deviceId: 'device-wli-1',
    coachNumber: 'C1',
    isOnline: false,
  });
  assert.strictEqual(toastCount, 6, 'Duplicate device offline should be suppressed');

  // Device reconnected
  service.evaluateDeviceConnectivity({
    deviceId: 'device-wli-1',
    coachNumber: 'C1',
    isOnline: true,
  });
  assert.strictEqual(toastCount, 7, 'Device online should trigger recovery toast');
  assert.strictEqual(toasts[6].severity, 'NORMAL');
  console.log('  ✓ Device reconnection triggered: ' + toasts[6].title);

  // T9: Category Toggle Check
  console.log('[TEST 4] Testing category toggles...');
  service.setConfig({ lowWaterEnabled: false });
  service.evaluateWaterLevel({
    tankId: 'tank-test-2',
    coachNumber: 'C2',
    levelPercent: 5.0,
    isOnline: true,
  });
  assert.strictEqual(toastCount, 7, 'Disabled low water category should not trigger toasts');
  service.setConfig({ lowWaterEnabled: true });
  console.log('  ✓ Category toggle suppression verified');

  // T10: Master Toggle Check
  console.log('[TEST 5] Testing master toggle...');
  service.setConfig({ masterEnabled: false });
  service.evaluateSensorHealth({
    sensorId: 'sensor-2',
    coachNumber: 'C2',
    isValid: false,
    sensorName: 'Departure Sensor',
  });
  assert.strictEqual(toastCount, 7, 'Master disabled should suppress all alerts');
  service.setConfig({ masterEnabled: true });
  console.log('  ✓ Master toggle suppression verified');

  // T11: History and Clear History
  console.log('[TEST 6] Testing history tracking & clearing...');
  const history = service.getHistory();
  assert(history.length >= 7, 'History should contain recorded events');
  console.log('  ✓ History recorded ' + history.length + ' events');

  service.clearHistory();
  const clearedHistory = service.getHistory();
  assert.strictEqual(clearedHistory.length, 0, 'History should be empty after clearHistory()');
  console.log('  ✓ History cleared successfully');

  // T12: Browser Popup Notifications + 30s Automatic Reminders + Ack + Recovery + Persistence + Multi-Alert
  console.log('[TEST 7] Testing persistent 30s browser reminder engine...');
  spawnedNotifications.length = 0;
  assert.strictEqual(service.getReminderIntervalMs(), 30000, 'Default reminder interval must be 30000ms (30s)');

  const t0 = Date.now();
  service.evaluateWaterLevel({
    tankId: 't-rem-1',
    tankName: 'Arrival Side (Tank 1)',
    trainNumber: '12841',
    coachNumber: 'C1',
    levelPercent: 6.5,
    isOnline: true,
  });

  assert.strictEqual(spawnedNotifications.length, 1, 'Initial alert should trigger 1 browser notification');
  const firstNotif = spawnedNotifications[0];
  assert(firstNotif.title.includes('CRITICAL ALERT'), 'Title must include CRITICAL ALERT');
  assert(firstNotif.options.body.includes('12841'), 'Body must include Train ID');
  assert(firstNotif.options.body.includes('C1'), 'Body must include Coach ID');
  assert(firstNotif.options.body.includes('Arrival Side (Tank 1)'), 'Body must include Tank name');
  assert(firstNotif.options.body.includes('6.5%'), 'Body must include current water level');

  // Polling same level does not trigger duplicate notification before 30s
  service.evaluateWaterLevel({
    tankId: 't-rem-1',
    tankName: 'Arrival Side (Tank 1)',
    trainNumber: '12841',
    coachNumber: 'C1',
    levelPercent: 6.5,
    isOnline: true,
  });
  service.processDueReminders(t0 + 15000);
  assert.strictEqual(spawnedNotifications.length, 1, 'No reminder before 30s elapsed');

  // 30s mark -> first reminder fires
  service.processDueReminders(t0 + 30005);
  assert.strictEqual(spawnedNotifications.length, 2, 'Reminder #1 must fire at 30s');
  assert(spawnedNotifications[1].options.body.includes('Reminder #1'), 'Body must mark Reminder #1');

  // Simulate browser refresh mid-countdown (at +45s) and verify next reminder fires at +60s, not +75s
  service.reloadPersistedState();
  service.evaluateWaterLevel({
    tankId: 't-rem-1',
    tankName: 'Arrival Side (Tank 1)',
    trainNumber: '12841',
    coachNumber: 'C1',
    levelPercent: 6.5,
    isOnline: true,
  });
  assert.strictEqual(spawnedNotifications.length, 2, 'Reload + polling must NOT re-trigger duplicate initial popup');
  service.processDueReminders(t0 + 45000);
  assert.strictEqual(spawnedNotifications.length, 2, 'No reminder at 45s after reload');
  service.processDueReminders(t0 + 60010);
  assert.strictEqual(spawnedNotifications.length, 3, 'Reminder #2 must fire at 60s even after reload');

  // Independent second alert on different coach at +65s
  service.evaluateWaterLevel({
    tankId: 't-rem-2',
    tankName: 'Departure Side (Tank 2)',
    trainNumber: '12841',
    coachNumber: 'C4',
    levelPercent: 14.0,
    isOnline: true,
  });
  assert.strictEqual(spawnedNotifications.length, 4, 'Second coach alert fires independently');

  // Acknowledge first alert with user '@admin' -> stops A reminders, leaves B active
  const alert1 = service.getActiveUnacknowledgedAlerts().find((a) => a.tankId === 't-rem-1');
  assert(alert1, 'Alert 1 should be active');
  const acked = service.acknowledgeAlert(alert1.id, '@admin', 'Refill dispatched');
  assert.strictEqual(acked.status, 'ACKNOWLEDGED');
  assert.strictEqual(acked.acknowledgedBy, '@admin');
  assert(acked.acknowledgedAt, 'Acknowledged timestamp should be recorded');

  // Advance to +95s: only alert 2 should remind; alert 1 must remain silent
  service.processDueReminders(t0 + 96000);
  assert.strictEqual(spawnedNotifications.length, 5, 'Only unacknowledged Alert 2 should remind');
  assert(spawnedNotifications[4].options.body.includes('C4'), 'Reminder must belong to Coach C4');

  // Recover second alert (>= 20%) -> stops its reminders immediately
  service.evaluateWaterLevel({
    tankId: 't-rem-2',
    tankName: 'Departure Side (Tank 2)',
    trainNumber: '12841',
    coachNumber: 'C4',
    levelPercent: 45.0,
    isOnline: true,
  });
  const remainingActive = service.getActiveUnacknowledgedAlerts();
  assert.strictEqual(remainingActive.length, 0, 'No active unacknowledged alerts should remain');
  service.processDueReminders(t0 + 130000);
  assert.strictEqual(spawnedNotifications.length, 5, 'No further reminders after acknowledge & recovery');

  // Permission denied fallback: does not throw or spawn Notification, still logs in-app toast & managed alert
  MockNotification.permission = 'denied';
  service.evaluateBrokerConnectivity({ isConnected: false, reason: 'Broker socket dropped' });
  assert.strictEqual(spawnedNotifications.length, 5, 'Denied permission must not call Notification');
  assert.strictEqual(service.getActiveUnacknowledgedAlerts().length, 1, 'Broker offline alert still tracked in-app');
  service.evaluateBrokerConnectivity({ isConnected: true });
  assert.strictEqual(service.getActiveUnacknowledgedAlerts().length, 0, 'Broker reconnect resolves alert');
  console.log('  ✓ 30s reminders, multi-alert, reload persistence, ack, recovery & denied fallback verified');

  unsub();
  service.clearHistory();
  console.log('\n[ALL UNIT TESTS PASSED] All assertions successfully verified!\n');
}

runUnitTests().catch((err) => {
  console.error('[TEST-FAILED]', err);
  process.exit(1);
});

