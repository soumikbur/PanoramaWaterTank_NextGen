/**
 * Verification test suite for tank online/offline status calculations.
 */
const assert = require('assert');

// Simulate computeConsistData logic
function computeConsistData(params) {
  const {
    trainNumber,
    totalCoaches = 24,
    managedDevices = [],
    liveTelemetry = null,
    mqttStatus = 'CONNECTED',
    timeoutSeconds = 120,
    now = Date.now(),
  } = params;

  const coachTypes = ['Passenger', 'AC Chair Car', 'AC 3-Tier', 'AC 2-Tier', 'Sleeper Class', 'Executive'];
  const timeoutMs = timeoutSeconds * 1000;
  const isMqttActive = mqttStatus !== 'DISCONNECTED';
  const cleanTrainNumber = (trainNumber || '225256').trim();

  const engagedDevices = managedDevices.filter(
    (d) =>
      d.assignmentStatus === 'ENGAGED' &&
      d.trainNumber?.trim().toLowerCase() === cleanTrainNumber.toLowerCase()
  );

  const coaches = [];
  const tanks = [];

  for (let i = 1; i <= totalCoaches; i++) {
    const defaultCoachNum = `C${i}`;
    const typeIndex = (i - 1) % coachTypes.length;
    const coachType = coachTypes[typeIndex];

    const isLiveMatch =
      liveTelemetry &&
      isMqttActive &&
      !liveTelemetry.isStale &&
      liveTelemetry.trno?.trim().toLowerCase() === cleanTrainNumber.toLowerCase() &&
      (liveTelemetry.chno?.trim().toLowerCase() === defaultCoachNum.toLowerCase() ||
        (i === 1 && liveTelemetry.chno));

    const coachNum = isLiveMatch && liveTelemetry ? liveTelemetry.chno : defaultCoachNum;

    const mappedDevice = engagedDevices.find(
      (d) => d.coachNumber?.trim().toLowerCase() === coachNum.toLowerCase()
    );

    let deviceUid = null;
    let isMapped = false;
    let hasTelemetry = false;
    let lastSeenTimestamp = null;
    let tank1Level = null;
    let tank2Level = null;

    if (mappedDevice) {
      isMapped = true;
      deviceUid = mappedDevice.uid;
      lastSeenTimestamp = mappedDevice.lastSeenTimestamp || null;
      hasTelemetry = mappedDevice.tank1Level != null || mappedDevice.tank2Level != null || Boolean(mappedDevice.lastSeenTimestamp);
      tank1Level = mappedDevice.tank1Level ?? null;
      tank2Level = mappedDevice.tank2Level ?? null;
    }

    if (isLiveMatch && liveTelemetry) {
      isMapped = true;
      deviceUid = liveTelemetry.uid;
      lastSeenTimestamp = liveTelemetry.receivedAt || now;
      hasTelemetry = true;
      tank1Level = liveTelemetry.wlp1;
      tank2Level = liveTelemetry.wlp2;
    }

    let isCoachOnline = false;
    let offlineReason = null;

    if (!isMapped || !deviceUid) {
      isCoachOnline = false;
      offlineReason = 'UNMAPPED';
    } else if (!hasTelemetry || lastSeenTimestamp == null || lastSeenTimestamp === 0) {
      isCoachOnline = false;
      offlineReason = 'NO_TELEMETRY';
    } else if (!isMqttActive) {
      isCoachOnline = false;
      offlineReason = 'MQTT_DISCONNECTED';
    } else if (now - lastSeenTimestamp > timeoutMs) {
      isCoachOnline = false;
      offlineReason = 'TIMED_OUT';
    } else {
      isCoachOnline = true;
      offlineReason = null;
    }

    const tank1 = {
      tankId: `${cleanTrainNumber}-${coachNum}-tank-1`,
      tankIndex: 1,
      isOnline: isCoachOnline,
      isMapped,
      offlineReason,
      levelPercent: tank1Level,
    };

    const tank2 = {
      tankId: `${cleanTrainNumber}-${coachNum}-tank-2`,
      tankIndex: 2,
      isOnline: isCoachOnline,
      isMapped,
      offlineReason,
      levelPercent: tank2Level,
    };

    coaches.push({
      coachNumber: coachNum,
      isOnline: isCoachOnline,
      offlineReason,
      isMapped,
      tanks: [tank1, tank2],
    });

    tanks.push(tank1, tank2);
  }

  const totalTanks = tanks.length;
  const onlineTanks = tanks.filter((t) => t.isOnline).length;
  const offlineTanks = totalTanks - onlineTanks;
  const unmappedTanks = tanks.filter((t) => !t.isMapped).length;

  return {
    metrics: {
      totalCoaches,
      totalTanks,
      onlineTanks,
      offlineTanks,
      unmappedTanks,
    },
    coaches,
    tanks,
  };
}

console.log('=== TEST SUITE: ONLINE TANK COUNT VERIFICATION ===\n');

// SCENARIO 1: 0 devices connected / no telemetry
{
  const res = computeConsistData({
    trainNumber: '225256',
    totalCoaches: 24,
    managedDevices: [],
    liveTelemetry: null,
    mqttStatus: 'CONNECTED',
    timeoutSeconds: 120,
    now: Date.now(),
  });

  console.log('Scenario 1: 0 devices connected');
  console.log(`  Total Coaches: ${res.metrics.totalCoaches}`);
  console.log(`  Total Tanks:   ${res.metrics.totalTanks}`);
  console.log(`  Online Tanks:  ${res.metrics.onlineTanks}`);
  console.log(`  Offline Tanks: ${res.metrics.offlineTanks}`);
  console.log(`  Unmapped:      ${res.metrics.unmappedTanks}`);

  assert.strictEqual(res.metrics.totalCoaches, 24);
  assert.strictEqual(res.metrics.totalTanks, 48);
  assert.strictEqual(res.metrics.onlineTanks, 0, 'Online tanks must be exactly 0');
  assert.strictEqual(res.metrics.offlineTanks, 48, 'Offline tanks must be exactly 48');
  assert.strictEqual(res.metrics.onlineTanks + res.metrics.offlineTanks, res.metrics.totalTanks, 'Formula Total = Online + Offline must hold');
  console.log('  PASS: Scenario 1 verified successfully.\n');
}

// SCENARIO 2: 1 device connected and mapped to Coach C1 with fresh telemetry (within 120s)
{
  const now = Date.now();
  const res = computeConsistData({
    trainNumber: '225256',
    totalCoaches: 24,
    managedDevices: [
      {
        uid: 'DEV-001',
        trainNumber: '225256',
        coachNumber: 'C1',
        assignmentStatus: 'ENGAGED',
        registrationStatus: 'REGISTERED',
        isOnline: true,
        lastSeenTimestamp: now - 15000, // 15 seconds ago (fresh < 120s)
        tank1Level: 75.4,
        tank2Level: 42.1,
      },
    ],
    liveTelemetry: null,
    mqttStatus: 'CONNECTED',
    timeoutSeconds: 120,
    now,
  });

  console.log('Scenario 2: 1 device connected & mapped (fresh telemetry 15s ago)');
  console.log(`  Total Tanks:   ${res.metrics.totalTanks}`);
  console.log(`  Online Tanks:  ${res.metrics.onlineTanks}`);
  console.log(`  Offline Tanks: ${res.metrics.offlineTanks}`);

  assert.strictEqual(res.metrics.totalTanks, 48);
  assert.strictEqual(res.metrics.onlineTanks, 2, 'Online tanks must be exactly 2');
  assert.strictEqual(res.metrics.offlineTanks, 46, 'Offline tanks must be exactly 46');
  assert.strictEqual(res.metrics.onlineTanks + res.metrics.offlineTanks, res.metrics.totalTanks);
  console.log('  PASS: Scenario 2 verified successfully.\n');
}

// SCENARIO 3: Telemetry timeout expires (>120s)
{
  const now = Date.now();
  const res = computeConsistData({
    trainNumber: '225256',
    totalCoaches: 24,
    managedDevices: [
      {
        uid: 'DEV-001',
        trainNumber: '225256',
        coachNumber: 'C1',
        assignmentStatus: 'ENGAGED',
        registrationStatus: 'REGISTERED',
        isOnline: true,
        lastSeenTimestamp: now - 130000, // 130s ago (> 120s timeout!)
        tank1Level: 75.4,
        tank2Level: 42.1,
      },
    ],
    liveTelemetry: null,
    mqttStatus: 'CONNECTED',
    timeoutSeconds: 120,
    now,
  });

  console.log('Scenario 3: Telemetry timeout (> 120s)');
  console.log(`  Total Tanks:   ${res.metrics.totalTanks}`);
  console.log(`  Online Tanks:  ${res.metrics.onlineTanks}`);
  console.log(`  Offline Tanks: ${res.metrics.offlineTanks}`);
  console.log(`  Coach 1 reason: ${res.coaches[0].offlineReason}`);

  assert.strictEqual(res.metrics.onlineTanks, 0, 'Online tanks must be 0 after timeout');
  assert.strictEqual(res.metrics.offlineTanks, 48, 'Offline tanks must be 48');
  assert.strictEqual(res.coaches[0].offlineReason, 'TIMED_OUT');
  assert.strictEqual(res.metrics.onlineTanks + res.metrics.offlineTanks, res.metrics.totalTanks);
  console.log('  PASS: Scenario 3 verified successfully.\n');
}

// SCENARIO 4: Unmapped device receiving telemetry (must NOT be counted as online tank on unmapped coach)
{
  const now = Date.now();
  const res = computeConsistData({
    trainNumber: '225256',
    totalCoaches: 24,
    managedDevices: [
      {
        uid: 'DEV-DISCOVERED-99',
        trainNumber: null, // UNMAPPED
        coachNumber: null,
        assignmentStatus: 'AVAILABLE', // NOT ENGAGED
        registrationStatus: 'DISCOVERED',
        isOnline: true,
        lastSeenTimestamp: now - 5000,
        tank1Level: 80.0,
        tank2Level: 80.0,
      },
    ],
    liveTelemetry: null,
    mqttStatus: 'CONNECTED',
    timeoutSeconds: 120,
    now,
  });

  console.log('Scenario 4: Unmapped device receiving telemetry');
  console.log(`  Total Tanks:   ${res.metrics.totalTanks}`);
  console.log(`  Online Tanks:  ${res.metrics.onlineTanks}`);
  console.log(`  Offline Tanks: ${res.metrics.offlineTanks}`);

  assert.strictEqual(res.metrics.onlineTanks, 0, 'Unmapped device must NOT cause any tank to be online');
  assert.strictEqual(res.metrics.offlineTanks, 48);
  assert.strictEqual(res.metrics.onlineTanks + res.metrics.offlineTanks, res.metrics.totalTanks);
  console.log('  PASS: Scenario 4 verified successfully.\n');
}

// SCENARIO 5: MQTT Broker Disconnected
{
  const now = Date.now();
  const res = computeConsistData({
    trainNumber: '225256',
    totalCoaches: 24,
    managedDevices: [
      {
        uid: 'DEV-001',
        trainNumber: '225256',
        coachNumber: 'C1',
        assignmentStatus: 'ENGAGED',
        registrationStatus: 'REGISTERED',
        isOnline: true,
        lastSeenTimestamp: now - 5000,
        tank1Level: 75.4,
        tank2Level: 42.1,
      },
    ],
    liveTelemetry: null,
    mqttStatus: 'DISCONNECTED', // Broker lost!
    timeoutSeconds: 120,
    now,
  });

  console.log('Scenario 5: MQTT broker disconnected');
  console.log(`  Total Tanks:   ${res.metrics.totalTanks}`);
  console.log(`  Online Tanks:  ${res.metrics.onlineTanks}`);
  console.log(`  Offline Tanks: ${res.metrics.offlineTanks}`);
  console.log(`  Coach 1 reason: ${res.coaches[0].offlineReason}`);

  assert.strictEqual(res.metrics.onlineTanks, 0, 'Online tanks must be 0 when broker is disconnected');
  assert.strictEqual(res.metrics.offlineTanks, 48);
  assert.strictEqual(res.coaches[0].offlineReason, 'MQTT_DISCONNECTED');
  assert.strictEqual(res.metrics.onlineTanks + res.metrics.offlineTanks, res.metrics.totalTanks);
  console.log('  PASS: Scenario 5 verified successfully.\n');
}

console.log('ALL VERIFICATION ASSERTIONS PASSED PERFECTLY!');

