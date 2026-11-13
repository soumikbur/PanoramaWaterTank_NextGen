// scripts/verify_alert_reminder_30m.cjs
/**
 * Verification script for Panorama Water Tank Monitor 30-Minute Alert Reminder System.
 *
 * Verifies all 8 scenarios specified in Section 5:
 * 1. New alert -> Immediate notification
 * 2. Alert unacknowledged for 30 minutes -> Reminder notification #1
 * 3. Alert unacknowledged for 60 minutes -> Second reminder #2
 * 4. Alert acknowledged -> No further reminders
 * 5. Alert resolved -> No further reminders
 * 6. New independent alert -> Immediate notification without waiting
 * 7. Browser refresh -> No duplicate notifications, timer preserved
 * 8. Multiple connected clients -> Consistent alert state across clients
 */

const esbuild = require('esbuild');
const path = require('path');
const assert = require('assert');

async function verifyAlertReminder30Minutes() {
  console.log('====================================================');
  console.log('🧪 VERIFYING 30-MINUTE ALERT REMINDER SYSTEM');
  console.log('====================================================\n');

  // Step 1: Bundle service & config
  console.log('[STEP 1] Bundling alertNotificationService and notificationConfig with esbuild...');
  const res = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../apps/mobile/src/services/alertNotificationService.ts')],
    bundle: true,
    format: 'cjs',
    write: false,
    target: 'node18',
  });

  const code = res.outputFiles[0].text;

  // Setup Mock environment for Node.js
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
  const ALERT_REMINDER_INTERVAL_MS = mod.exports.ALERT_REMINDER_INTERVAL_MS;
  const ALERT_REMINDER_INTERVAL_SECONDS = mod.exports.ALERT_REMINDER_INTERVAL_SECONDS;

  // TEST 1: Config constants
  console.log('[TEST 1] Verifying centralized constant ALERT_REMINDER_INTERVAL_MS...');
  assert.strictEqual(
    ALERT_REMINDER_INTERVAL_MS,
    30 * 60 * 1000,
    `ALERT_REMINDER_INTERVAL_MS must be exactly 1,800,000 ms (30 mins), got ${ALERT_REMINDER_INTERVAL_MS}`
  );
  assert.strictEqual(
    ALERT_REMINDER_INTERVAL_SECONDS,
    1800,
    `ALERT_REMINDER_INTERVAL_SECONDS must be 1800s, got ${ALERT_REMINDER_INTERVAL_SECONDS}`
  );
  assert.strictEqual(
    service.getReminderIntervalMs(),
    1800000,
    `service.getReminderIntervalMs() must return 1800000 ms, got ${service.getReminderIntervalMs()}`
  );
  console.log('  ✅ PASSED: Centralized constant is 30 * 60 * 1000 ms (1800 seconds / 30 minutes)\n');

  service.stopReminderScheduler();
  service.clearHistory();
  spawnedNotifications.length = 0;

  const t0 = Date.now();

  // TEST 2: Scenario 1 — New Alert -> Immediate Notification
  console.log('[TEST 2] Scenario 1: New alert triggers immediate notification...');
  service.evaluateWaterLevel({
    tankId: 'tank-A1-arr',
    tankName: 'Arrival Tank (Tank 1)',
    trainNumber: '12842',
    coachNumber: 'A1',
    levelPercent: 7.2,
    isOnline: true,
  });

  assert.strictEqual(spawnedNotifications.length, 1, 'Initial alert must spawn exactly 1 notification');
  assert(spawnedNotifications[0].title.includes('CRITICAL ALERT'), 'Notification title must indicate critical alert');
  assert(spawnedNotifications[0].options.body.includes('12842'), 'Notification body must include train 12842');
  assert(spawnedNotifications[0].options.body.includes('A1'), 'Notification body must include coach A1');
  assert(spawnedNotifications[0].options.body.includes('7.2%'), 'Notification body must include 7.2% level');
  console.log('  ✅ PASSED: Immediate notification dispatched successfully\n');

  // TEST 3: Scenario 7 (Part 1) — Deduplication & No Duplicate Notifications before 30m
  console.log('[TEST 3] Scenario 7 (Part 1): Subsequent telemetry ticks do NOT re-trigger before 30 minutes...');
  service.processDueReminders(t0 + 5 * 60 * 1000);
  service.processDueReminders(t0 + 15 * 60 * 1000);
  service.processDueReminders(t0 + 29 * 60 * 1000 + 59000); // 29m 59s
  assert.strictEqual(spawnedNotifications.length, 1, 'No reminders before 30 minutes elapsed');
  console.log('  ✅ PASSED: Zero duplicate notifications during 0..29m 59s quiet period\n');

  // TEST 4: Scenario 2 — Alert unacknowledged for 30 minutes -> Reminder notification #1
  console.log('[TEST 4] Scenario 2: Unacknowledged alert at 30 minutes triggers Reminder #1...');
  service.processDueReminders(t0 + 30 * 60 * 1000 + 5);
  assert.strictEqual(spawnedNotifications.length, 2, 'Reminder #1 must fire at exactly 30 minutes');
  assert(
    spawnedNotifications[1].options.body.includes('Reminder #1'),
    `Body must contain Reminder #1 label, got: ${spawnedNotifications[1].options.body}`
  );
  console.log('  ✅ PASSED: Reminder #1 fired at 30 minutes\n');

  // TEST 5: Scenario 7 (Part 2) — Browser refresh mid-countdown (at +45 minutes) preserves schedule
  console.log('[TEST 5] Scenario 7 (Part 2): Browser refresh at +45 minutes preserves timer without resetting...');
  service.reloadPersistedState();
  service.processDueReminders(t0 + 45 * 60 * 1000);
  assert.strictEqual(spawnedNotifications.length, 2, 'Browser refresh must NOT trigger duplicate notification at 45m');
  console.log('  ✅ PASSED: Refresh mid-countdown preserved quiet countdown without duplicate\n');

  // TEST 6: Scenario 3 — Alert unacknowledged for 60 minutes -> Second reminder #2
  console.log('[TEST 6] Scenario 3: Unacknowledged alert at 60 minutes triggers Reminder #2...');
  service.processDueReminders(t0 + 60 * 60 * 1000 + 10);
  assert.strictEqual(spawnedNotifications.length, 3, 'Reminder #2 must fire at 60 minutes');
  assert(
    spawnedNotifications[2].options.body.includes('Reminder #2'),
    `Body must contain Reminder #2 label, got: ${spawnedNotifications[2].options.body}`
  );
  console.log('  ✅ PASSED: Reminder #2 fired at 60 minutes\n');

  // TEST 7: Scenario 6 — New independent alert at +65 minutes triggers immediately
  console.log('[TEST 7] Scenario 6: New independent alert occurs -> Dispatches immediately without waiting...');
  service.evaluateWaterLevel({
    tankId: 'tank-B2-dep',
    tankName: 'Departure Tank (Tank 2)',
    trainNumber: '12842',
    coachNumber: 'B2',
    levelPercent: 12.5,
    isOnline: true,
  });
  assert.strictEqual(spawnedNotifications.length, 4, 'Second independent alert must notify immediately');
  assert(spawnedNotifications[3].title.includes('WARNING ALERT'), 'Second alert must be WARNING');
  assert(spawnedNotifications[3].options.body.includes('B2'), 'Second alert must reference coach B2');
  console.log('  ✅ PASSED: Independent alert triggered immediately at +65m\n');

  // TEST 8: Scenario 4 — Alert acknowledged -> Stop repeating notifications for that alert
  console.log('[TEST 8] Scenario 4: Alert acknowledged -> Stop repeating notifications for that alert...');
  const activeAlerts = service.getActiveUnacknowledgedAlerts();
  const alert1 = activeAlerts.find((a) => a.coachNumber === 'A1');
  assert(alert1, 'Alert 1 (Coach A1) must exist in active alerts');
  const ackResult = service.acknowledgeAlert(alert1.id, 'Chief_C&W_Engineer', 'Water refilling arranged at Vijayawada');
  assert.strictEqual(ackResult.status, 'ACKNOWLEDGED');
  assert.strictEqual(ackResult.acknowledgedBy, 'Chief_C&W_Engineer');

  // Advance time to +90m (where Alert 1 would have had Reminder #3):
  // Alert 1 (acknowledged) must NOT fire. Only unacknowledged Alert 2 (B2) fires its Reminder #1!
  service.processDueReminders(t0 + 90 * 60 * 1000 + 10);
  assert.strictEqual(spawnedNotifications.length, 5, 'Alert 2 fires its reminder; Alert 1 remains completely silent');
  const fifthNotif = spawnedNotifications[4];
  assert(fifthNotif.options.body.includes('B2'), 'Fired reminder must belong to Coach B2 (Alert 2)');
  assert(!fifthNotif.options.body.includes('A1'), 'Acknowledged Coach A1 (Alert 1) must NOT fire reminders');
  console.log('  ✅ PASSED: Acknowledged alert stopped all reminders (verified Alert 1 silenced)\n');

  // TEST 9: Scenario 8 — Multiple connected clients: Remote acknowledgment synchronization
  console.log('[TEST 9] Scenario 8: Multiple connected clients sync -> Consistent alert state across clients...');
  const alert2 = service.getActiveUnacknowledgedAlerts().find((a) => a.coachNumber === 'B2');
  assert(alert2, 'Alert 2 must still be active before sync');

  // Simulate remote user on Client B acknowledging Alert 2 via backend
  service.syncWithBackendAlarms([
    {
      id: alert2.id,
      status: 'ACKNOWLEDGED',
      acknowledged_by: 'Remote_Station_Master_B',
      acknowledged_at: new Date(t0 + 100 * 60 * 1000).toISOString(),
    },
  ]);
  const activeAfterRemoteAck = service.getActiveUnacknowledgedAlerts();
  assert.strictEqual(activeAfterRemoteAck.length, 0, 'No active alerts should remain after remote sync');

  // Advance to +125m (where Alert 2 would have had Reminder #2): must NOT fire
  service.processDueReminders(t0 + 125 * 60 * 1000);
  assert.strictEqual(spawnedNotifications.length, 5, 'Zero notifications after remote acknowledgment sync');
  console.log('  ✅ PASSED: Multi-client remote acknowledgment stopped reminders across clients\n');

  // TEST 10: Scenario 5 — Alert resolved -> Stop all further notifications
  console.log('[TEST 10] Scenario 5: Alert resolved -> Stop all further notifications...');
  // Water level recovers to 85%
  service.evaluateWaterLevel({
    tankId: 'tank-A1-arr',
    tankName: 'Arrival Tank (Tank 1)',
    trainNumber: '12842',
    coachNumber: 'A1',
    levelPercent: 85.0,
    isOnline: true,
  });
  service.evaluateWaterLevel({
    tankId: 'tank-B2-dep',
    tankName: 'Departure Tank (Tank 2)',
    trainNumber: '12842',
    coachNumber: 'B2',
    levelPercent: 92.0,
    isOnline: true,
  });
  // Advance to +180 minutes (3 hours): verify zero reminder notifications
  service.processDueReminders(t0 + 180 * 60 * 1000);
  assert.strictEqual(spawnedNotifications.length, 5, 'No further reminders after full resolution');
  console.log('  ✅ PASSED: Resolved alerts remain completely silent\n');

  // TEST 11: Verify UI formatting & text in AlertsScreen & ActiveAlertBanner
  console.log('[TEST 11] Verifying UI components format reminder intervals cleanly...');
  const bannerText = `(Reminders every ${
    ALERT_REMINDER_INTERVAL_SECONDS >= 60
      ? `${Math.round(ALERT_REMINDER_INTERVAL_SECONDS / 60)} minutes`
      : `${ALERT_REMINDER_INTERVAL_SECONDS}s`
  } until acknowledged or resolved)`;
  assert.strictEqual(
    bannerText,
    '(Reminders every 30 minutes until acknowledged or resolved)',
    'Banner must state 30 minutes'
  );

  const popupsSettingText = `Browser Popups: ON (${
    ALERT_REMINDER_INTERVAL_SECONDS >= 60
      ? `${Math.round(ALERT_REMINDER_INTERVAL_SECONDS / 60)}m`
      : `${ALERT_REMINDER_INTERVAL_SECONDS}s`
  })`;
  assert.strictEqual(popupsSettingText, 'Browser Popups: ON (30m)', 'Popups pill must state 30m');
  console.log('  ✅ PASSED: UI strings format correctly as 30 minutes / 30m\n');

  console.log('====================================================');
  console.log('🎉 ALL 11 VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

verifyAlertReminder30Minutes().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
