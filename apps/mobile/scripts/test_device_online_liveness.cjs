/**
 * Unit verification suite for real TypeScript device liveness, MQTT topic/payload
 * ingestion, watchdog STALE/OFFLINE transitions, and SLRD height-to-level math.
 */
const assert = require('assert');
const path = require('path');
const esbuild = require('esbuild');
const vm = require('vm');

function loadTsModule(relPath) {
  const entry = path.resolve(__dirname, '..', relPath);
  const res = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', res.outputFiles[0].text);
  fn(mod.exports, require, mod, entry, path.dirname(entry));
  return mod.exports;
}

// Minimal browser storage + navigator stub so singleton constructors initialize cleanly in Node
const storeMap = new Map();
const navStub = { hardwareConcurrency: 4, userAgent: 'node-test', onLine: true };
try {
  Object.defineProperty(global, 'navigator', { value: navStub, configurable: true, writable: true });
} catch {}
global.window = {
  location: { hostname: 'localhost', href: 'http://localhost/' },
  navigator: navStub,
  addEventListener: () => {},
  localStorage: {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
  },
};
global.localStorage = global.window.localStorage;

const registryMod = loadTsModule('src/services/deviceRegistry.ts');
const tankMod = loadTsModule('src/services/tankStatusService.ts');
const mqttMod = loadTsModule('src/services/mqttService.ts');

// 1. Canonical UID normalization & validation
assert.strictEqual(registryMod.getCanonicalUid(' 0023004d4b42501120353332 '), '0023004D4B42501120353332');
assert.strictEqual(registryMod.isGenuineHardwareUid('0023004d4b42501120353332'), true);

// 2. 3-state device connectivity resolution (ONLINE -> STALE -> OFFLINE)
const now = 1_000_000;
const timeoutMs = 10_000;
assert.strictEqual(registryMod.resolveDeviceConnectivityState(now - 2_000, timeoutMs, false, now), 'ONLINE');
assert.strictEqual(registryMod.resolveDeviceConnectivityState(now - 12_000, timeoutMs, false, now), 'STALE');
assert.strictEqual(registryMod.resolveDeviceConnectivityState(now - 25_000, timeoutMs, false, now), 'OFFLINE');
assert.strictEqual(registryMod.resolveDeviceConnectivityState(now - 2_000, timeoutMs, true, now), 'OFFLINE');
assert.strictEqual(registryMod.resolveDeviceConnectivityState(0, timeoutMs, false, now), 'OFFLINE');

// 3. Simulator 17-field payload parsing on /sensor/topic/soumik vs retained config rejection
const mqtt = mqttMod.mqttService;
assert.strictEqual(mqttMod.DEFAULT_MQTT_TOPIC, '0023004D4B42501120353332');
assert.strictEqual(mqttMod.DEFAULT_SIMULATOR_TOPIC, '/sensor/topic/soumik');

const configRetained = mqtt.handleIncomingPayload(
  JSON.stringify({ chno: 'WB11R2262', trno: '0101010101', wak: 180, wtrhig: 100, ser: '0' }),
  '0023004D4B42501120353332'
);
assert.strictEqual(configRetained, null, 'Control/config-only retained packet must not mark device online');

const simPayload = {
  uid: '0023004d4b42501120353332',
  lat: 22.557559,
  long: 88.352439,
  speed: 1.5,
  time: '18:28:52',
  cm1: 93.5,
  cm2: 0.0,
  wlp1: 93.5,
  wlp2: 0.0,
  wlv1: true,
  wlv2: true,
  bat: 47.8,
  temp: 22.5,
  press: 1.014,
  chno: 'WB11R2262',
  trno: '0101010101',
};
const parsed = mqtt.handleIncomingPayload(JSON.stringify(simPayload), '/sensor/topic/soumik');
assert.ok(parsed, 'Simulator telemetry on /sensor/topic/soumik must parse cleanly');
assert.strictEqual(parsed.uid, '0023004D4B42501120353332');
assert.strictEqual(parsed.cm1, 93.5);
assert.strictEqual(parsed.cm2, 0.0);
assert.strictEqual(parsed.bat, 47.8);
assert.strictEqual(parsed.temp, 22.5);
assert.strictEqual(parsed.press, 1.014);
assert.strictEqual(parsed.isStale, false);
assert.strictEqual(mqtt.getLatestTelemetryForUid('0023004d4b42501120353332').uid, '0023004D4B42501120353332');

// 4. Newly discovered device path + non-destructive remote reconciliation & markAllOffline
const reg = registryMod.deviceRegistry;
reg.recordDiscoveredDevice({ ...parsed, uid: 'AABBCCDD1122334455667788' });
const discovered = reg.getDeviceByUid('AABBCCDD1122334455667788');
assert.strictEqual(discovered.isOnline, true);
assert.strictEqual(discovered.connectivityState, 'ONLINE');

reg.registerDevice('0023004D4B42501120353332', { trainNumber: '12249', coachNumber: 'SLRD' });
reg.recordDiscoveredDevice(parsed);
const afterLive = reg.getDeviceByUid('0023004D4B42501120353332');
assert.strictEqual(afterLive.isOnline, true);
assert.strictEqual(afterLive.connectivityState, 'ONLINE');
const savedTs = afterLive.lastSeenTimestamp;
assert.ok(savedTs > 0);

// Simulate watchdog STALE event -> must become STALE without zeroing lastSeenTimestamp
reg.recordDiscoveredDevice({ ...parsed, isStale: true });
const afterStale = reg.getDeviceByUid('0023004D4B42501120353332');
assert.strictEqual(afterStale.isOnline, false);
assert.strictEqual(afterStale.isStale, true);
assert.strictEqual(afterStale.connectivityState, 'STALE');
assert.strictEqual(afterStale.lastSeenTimestamp, savedTs);

// Remote backend returning null last_seen_at must NOT wipe local telemetry
reg.reconcileRemoteDevices([
  { uid: '0023004D4B42501120353332', train_number: '12249', coach_number: 'SLRD', is_online: false, last_seen_at: null },
]);
const afterReconcile = reg.getDeviceByUid('0023004D4B42501120353332');
assert.strictEqual(afterReconcile.lastSeenTimestamp, savedTs);
assert.strictEqual(afterReconcile.batteryPercent, 47.8);

// Brief broker disconnect preserves lastSeen & timestamp while reporting OFFLINE, and reconnect recovers
reg.markAllOffline();
const afterDisconnect = reg.getDeviceByUid('0023004D4B42501120353332');
assert.strictEqual(afterDisconnect.connectivityState, 'OFFLINE');
assert.strictEqual(afterDisconnect.lastSeenTimestamp, savedTs);
reg.markBrokerConnected();
const afterReconnect = reg.getDeviceByUid('0023004D4B42501120353332');
assert.strictEqual(afterReconnect.connectivityState, 'ONLINE');

// 5. SLRD configured height calculations (Tank 1 = 50cm, Tank 2 = 100cm) + zero guard
assert.strictEqual(tankMod.computeLevelPercentFromHeight(93.5, 50), 100);
assert.strictEqual(tankMod.computeLevelPercentFromHeight(0.0, 100), 0);
assert.strictEqual(tankMod.computeLevelPercentFromHeight(25.0, 50), 50);
assert.strictEqual(tankMod.computeLevelPercentFromHeight(25.0, 0), null);

// 6. getDevices() derives STALE state when age is between timeoutMs and 2*timeoutMs
global.window.localStorage.setItem('panorama_telemetry_timeout_sec', '10');
reg.recordDiscoveredDevice({ ...parsed, isStale: false });
const liveDevObj = reg.getDeviceByUid('0023004D4B42501120353332');
liveDevObj.lastSeenTimestamp = Date.now() - 12000;
const listed = reg.getDevices().find((d) => d.uid === '0023004D4B42501120353332');
assert.strictEqual(listed.isOnline, false);
assert.strictEqual(listed.isStale, true);
assert.strictEqual(listed.connectivityState, 'STALE');

mqtt.disconnect();
console.log('ALL DEVICE LIVENESS, MQTT & SLRD HEIGHT UNIT CHECKS PASSED');
process.exit(0);
