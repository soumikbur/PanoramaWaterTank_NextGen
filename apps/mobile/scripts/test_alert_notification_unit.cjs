// apps/mobile/scripts/test_alert_notification_unit.cjs
const esbuild = require('esbuild');
const path = require('path');
const assert = require('assert');

async function runUnitTests() {
  console.log('[TEST] Compiling alertNotificationService.ts with esbuild...');
  const res = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src/services/alertNotificationService.ts')],
    bundle: false,
    format: 'cjs',
    write: false,
    target: 'node18',
  });

  const code = res.outputFiles[0].text;

  // Mock localStorage for node environment
  const mockStorage = new Map();
  global.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
  };

  // Evaluate compiled module
  const moduleExports = {};
  const moduleContext = {
    exports: moduleExports,
    console,
    Date,
    Set,
    Map,
    localStorage: global.localStorage,
    JSON,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
  };

  const fn = new Function('exports', 'module', 'localStorage', code);
  const mod = { exports: moduleExports };
  fn(moduleExports, mod, global.localStorage);

  const service = mod.exports.alertNotificationService;
  assert(service, 'alertNotificationService instance should exist');

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

  unsub();
  console.log('\n[ALL UNIT TESTS PASSED] 11/11 assertions successfully verified!\n');
}

runUnitTests().catch((err) => {
  console.error('[TEST-FAILED]', err);
  process.exit(1);
});
