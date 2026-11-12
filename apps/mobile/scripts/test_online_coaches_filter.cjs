const esbuild = require('esbuild');
const path = require('path');
const assert = require('assert');

async function loadTsModule(relPath) {
  const res = await esbuild.build({
    entryPoints: [path.resolve(__dirname, relPath)],
    bundle: true,
    format: 'cjs',
    write: false,
    target: 'node18',
  });
  const mod = { exports: {} };
  const fn = new Function('exports', 'module', 'require', 'localStorage', res.outputFiles[0].text);
  fn(mod.exports, mod, require, global.localStorage);
  return mod.exports;
}

async function run() {
  const mockStorage = new Map();
  global.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
  };

  console.log('[TEST] Compiling tankStatusService.ts & alertNotificationService.ts with esbuild...');
  const tankSvc = await loadTsModule('../src/services/tankStatusService.ts');
  const alertSvcMod = await loadTsModule('../src/services/alertNotificationService.ts');
  const alertSvc = alertSvcMod.alertNotificationService;

  const toasts = [];
  const unsub = alertSvc.onToast((t) => toasts.push(t));
  alertSvc.clearHistory();

  const baseNow = Date.now();

  // 1. All coaches offline -> Empty listing under 'ALL' & 'ONLINE', accurate summary counters
  {
    const consist = tankSvc.computeConsistData({
      trainNumber: '225256',
      totalCoaches: 24,
      managedDevices: [],
      liveTelemetry: null,
      mqttStatus: 'CONNECTED',
      timeoutSeconds: 120,
      now: baseNow,
    });
    assert.strictEqual(consist.metrics.totalCoaches, 24);
    assert.strictEqual(consist.metrics.onlineCoaches, 0);
    assert.strictEqual(consist.metrics.offlineCoaches, 24);
    assert.strictEqual(tankSvc.filterConsistCoaches(consist.coaches, 'ALL').length, 0);
    assert.strictEqual(tankSvc.filterConsistCoaches(consist.coaches, 'ONLINE').length, 0);
    assert.strictEqual(tankSvc.filterConsistCoaches(consist.coaches, 'OFFLINE').length, 24);
    assert.strictEqual(tankSvc.filterConsistTanks(consist.tanks, 'ALL').length, 0);
    console.log('  PASS 1: All coaches offline -> default online listing empty, summary counters accurate.');
  }

  // 2. One coach online (C1) -> Only C1 appears
  {
    const consist = tankSvc.computeConsistData({
      trainNumber: '225256',
      totalCoaches: 24,
      managedDevices: [
        {
          uid: 'DEV-C1',
          trainNumber: '225256',
          coachNumber: 'C1',
          assignmentStatus: 'ENGAGED',
          registrationStatus: 'REGISTERED',
          isOnline: true,
          lastSeenTimestamp: baseNow - 5000,
          tank1Level: 72.0,
          tank2Level: 65.0,
        },
      ],
      liveTelemetry: null,
      mqttStatus: 'CONNECTED',
      timeoutSeconds: 120,
      now: baseNow,
    });
    const defaultCoaches = tankSvc.filterConsistCoaches(consist.coaches, 'ALL');
    const defaultTanks = tankSvc.filterConsistTanks(consist.tanks, 'ALL');
    assert.strictEqual(consist.metrics.onlineCoaches, 1);
    assert.strictEqual(consist.metrics.offlineCoaches, 23);
    assert.strictEqual(defaultCoaches.length, 1);
    assert.strictEqual(defaultCoaches[0].coachNumber, 'C1');
    assert.strictEqual(defaultTanks.length, 2);
    assert.ok(defaultTanks.every((t) => t.coachNumber === 'C1' && t.isOnline));
    console.log('  PASS 2: Single online coach -> only C1 and its 2 tanks shown.');
  }

  // 3. Multiple coaches online (C1, C5 low level, C12) -> Only connected coaches appear + search works within filter
  {
    const devices = [
      { uid: 'DEV-C1', coachNumber: 'C1', t1: 70, t2: 60 },
      { uid: 'DEV-C5', coachNumber: 'C5', t1: 14, t2: 50 },
      { uid: 'DEV-C12', coachNumber: 'C12', t1: 85, t2: 90 },
    ].map((d) => ({
      uid: d.uid,
      trainNumber: '225256',
      coachNumber: d.coachNumber,
      assignmentStatus: 'ENGAGED',
      registrationStatus: 'REGISTERED',
      isOnline: true,
      lastSeenTimestamp: baseNow - 10000,
      tank1Level: d.t1,
      tank2Level: d.t2,
    }));

    const consist = tankSvc.computeConsistData({
      trainNumber: '225256',
      totalCoaches: 24,
      managedDevices: devices,
      liveTelemetry: null,
      mqttStatus: 'CONNECTED',
      timeoutSeconds: 120,
      now: baseNow,
    });

    const onlineCoaches = tankSvc.filterConsistCoaches(consist.coaches, 'ALL');
    assert.strictEqual(consist.metrics.onlineCoaches, 3);
    assert.strictEqual(consist.metrics.offlineCoaches, 21);
    assert.deepStrictEqual(onlineCoaches.map((c) => c.coachNumber), ['C1', 'C5', 'C12']);
    assert.strictEqual(tankSvc.filterConsistCoaches(consist.coaches, 'ALL', 'C5').length, 1);
    // Searching an offline coach under default online filter must return 0
    assert.strictEqual(tankSvc.filterConsistCoaches(consist.coaches, 'ALL', 'C2').length, 0);
    // Searching C2 under explicit OFFLINE filter returns offline coaches containing "C2" (C2, C20..C24)
    const offlineC2 = tankSvc.filterConsistCoaches(consist.coaches, 'OFFLINE', 'C2');
    assert.strictEqual(offlineC2.length, 6);
    assert.ok(offlineC2.some((c) => c.coachNumber === 'C2'));
    assert.strictEqual(tankSvc.filterConsistCoaches(consist.coaches, 'OFFLINE', 'C19').length, 1);
    // LOW_LEVEL shows only online low-level tank (C5 T1 = 14%)
    const lowTanks = tankSvc.filterConsistTanks(consist.tanks, 'LOW_LEVEL');
    assert.strictEqual(lowTanks.length, 1);
    assert.strictEqual(lowTanks[0].coachNumber, 'C5');
    console.log('  PASS 3 & 6: Multiple online coaches + scoped search + LOW_LEVEL filtering verified.');
  }

  // 4 & 5. Coach disconnects on timeout -> removed, alert generated once; reconnects -> restored, alert resolved
  {
    const devicesBeforeDisconnect = [
      {
        uid: 'DEV-C5',
        trainNumber: '225256',
        coachNumber: 'C5',
        assignmentStatus: 'ENGAGED',
        registrationStatus: 'REGISTERED',
        isOnline: true,
        lastSeenTimestamp: baseNow - 10000,
        tank1Level: 50,
        tank2Level: 50,
      },
    ];
    const onlineState = tankSvc.computeConsistData({
      trainNumber: '225256',
      totalCoaches: 24,
      managedDevices: devicesBeforeDisconnect,
      liveTelemetry: null,
      mqttStatus: 'CONNECTED',
      timeoutSeconds: 120,
      now: baseNow,
    });
    assert.strictEqual(tankSvc.filterConsistCoaches(onlineState.coaches, 'ALL').length, 1);

    // Evaluate initial online state
    alertSvc.evaluateDeviceConnectivity({ deviceId: 'DEV-C5', coachNumber: 'C5', isOnline: true });
    const toastCountOnline = toasts.length;

    // Advance time past 120s timeout so C5 disconnects
    const disconnectedState = tankSvc.computeConsistData({
      trainNumber: '225256',
      totalCoaches: 24,
      managedDevices: devicesBeforeDisconnect,
      liveTelemetry: null,
      mqttStatus: 'CONNECTED',
      timeoutSeconds: 120,
      now: baseNow + 150000,
    });
    assert.strictEqual(disconnectedState.metrics.onlineCoaches, 0);
    assert.strictEqual(disconnectedState.metrics.offlineCoaches, 24);
    assert.strictEqual(tankSvc.filterConsistCoaches(disconnectedState.coaches, 'ALL').length, 0);

    alertSvc.evaluateDeviceConnectivity({ deviceId: 'DEV-C5', coachNumber: 'C5', isOnline: false });
    alertSvc.evaluateDeviceConnectivity({ deviceId: 'DEV-C5', coachNumber: 'C5', isOnline: false }); // duplicate call
    assert.strictEqual(toasts.length, toastCountOnline + 1, 'Exactly one offline alert should be emitted');
    assert.strictEqual(toasts[toasts.length - 1].severity, 'WARNING');

    // Reconnect C5
    const reconnectNow = baseNow + 200000;
    const reconnectedState = tankSvc.computeConsistData({
      trainNumber: '225256',
      totalCoaches: 24,
      managedDevices: [
        {
          ...devicesBeforeDisconnect[0],
          lastSeenTimestamp: reconnectNow - 1000,
        },
      ],
      liveTelemetry: null,
      mqttStatus: 'CONNECTED',
      timeoutSeconds: 120,
      now: reconnectNow,
    });
    assert.strictEqual(reconnectedState.metrics.onlineCoaches, 1);
    assert.strictEqual(tankSvc.filterConsistCoaches(reconnectedState.coaches, 'ALL').length, 1);

    alertSvc.evaluateDeviceConnectivity({ deviceId: 'DEV-C5', coachNumber: 'C5', isOnline: true });
    assert.strictEqual(toasts.length, toastCountOnline + 2, 'Exactly one recovery alert should be emitted');
    assert.strictEqual(toasts[toasts.length - 1].severity, 'NORMAL');
    console.log('  PASS 4 & 5: Disconnect removal + deduped alert & reconnect restoration + resolution verified.');
  }

  unsub();
  console.log('\nALL ONLINE COACH FILTERING & CONNECTIVITY TRANSITION TESTS PASSED!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
