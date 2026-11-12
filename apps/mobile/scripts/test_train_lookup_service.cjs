// Unit tests for frontend trainLookupService & localFleetStore (esbuild-compiled).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(__dirname, '_tmp_train_lookup_bundle.cjs');

esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/services/trainLookupService.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: OUT_FILE,
  define: {
    'process.env.API_URL': '""',
    'process.env.REACT_APP_API_URL': '""',
    'process.env.VITE_API_URL': '""',
  },
});

const storeBundle = path.join(__dirname, '_tmp_local_fleet_bundle.cjs');
esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/services/localFleetStore.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: storeBundle,
});

// Minimal browser globals for static GitHub Pages mode simulation
const memStorage = new Map();
global.window = {
  location: {
    origin: 'https://soumikbur.github.io',
    hostname: 'soumikbur.github.io',
  },
  localStorage: {
    getItem: (k) => (memStorage.has(k) ? memStorage.get(k) : null),
    setItem: (k, v) => memStorage.set(k, String(v)),
    removeItem: (k) => memStorage.delete(k),
    clear: () => memStorage.clear(),
  },
};
global.localStorage = global.window.localStorage;

const { trainLookupService } = require(OUT_FILE);
const { localFleetStore } = require(storeBundle);

async function run() {
  try {
    // Mock GeoJSON DataMeet payload with real structure
    const sampleGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            number: '15102',
            name: 'Mumbai CST Chhapra Jansadharan Express',
            zone: 'NER',
            from_station_code: 'CSTM',
            from_station_name: 'MUMBAI CST',
            to_station_code: 'CPR',
            to_station_name: 'CHHAPRA',
            type: 'Exp',
          },
        },
        {
          type: 'Feature',
          properties: {
            number: '12002',
            name: 'New Delhi-Bhopal Shatabdi Express',
            zone: 'NR',
            from_station_code: 'NDLS',
            from_station_name: 'NEW DELHI',
            to_station_code: 'BPL',
            to_station_name: 'BHOPAL JN',
            type: 'Shtb',
          },
        },
      ],
    };

    // 1. Primary RailRadar Public API verification (15120) + deduped concurrent requests
    const sample15120 = {
      success: true,
      data: {
        train: {
          number: '15120',
          name: 'Banaras Janta Express',
          type: 'Mail/Express',
          category: 'Express',
          source: { code: 'DDN', name: 'Dehradoon', lat: 30.31454, lng: 78.033243 },
          destination: { code: 'BNRS', name: 'Banaras', lat: 25.29926, lng: 82.97177 },
          runDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          coachPosition: 'ENG-SLRD-GEN-S1-S2-B1-A1-H1-LPR',
        },
        route: [
          { sequence: 1, station: { code: 'DDN', name: 'Dehradoon' }, isHalt: true, departure: '18:30', departureDay: 1 },
          { sequence: 2, station: { code: 'LKO', name: 'Lucknow' }, isHalt: false },
          { sequence: 3, station: { code: 'BNRS', name: 'Banaras' }, isHalt: true, arrival: '15:05', arrivalDay: 2 },
        ],
      },
    };

    let fetchCount = 0;
    const seenProgress = [];
    global.fetch = async (url) => {
      fetchCount++;
      if (String(url).includes('railradar.in/api/v1/trains/15120')) {
        await new Promise((r) => setTimeout(r, 40));
        return { ok: true, status: 200, text: async () => JSON.stringify(sample15120) };
      }
      if (String(url).includes('datameet/railways')) {
        await new Promise((r) => setTimeout(r, 40));
        return { ok: true, status: 200, text: async () => JSON.stringify(sampleGeoJson) };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ success: false, error: { code: 'TRAIN_NOT_FOUND' } }) };
    };

    const [r1, r2, r3] = await Promise.all([
      trainLookupService.lookup('15120', { onProgress: (lbl) => seenProgress.push(lbl) }),
      trainLookupService.lookup('15120'),
      trainLookupService.lookup('15120'),
    ]);
    assert.strictEqual(fetchCount, 1, 'Expected concurrent Verify calls for same train to deduplicate to 1 request');
    assert.strictEqual(r1.result.status, 'VERIFIED');
    assert.strictEqual(r1.result.provider, 'RailRadar Public API');
    assert.strictEqual(r1.result.train_name, 'Banaras Janta Express');
    assert.strictEqual(r1.result.source_code, 'DDN');
    assert.strictEqual(r1.result.destination_code, 'BNRS');
    assert.strictEqual(r1.result.region, 'NORTH');
    assert.strictEqual(r1.result.railway_zone, null);
    assert(r1.result.missing_fields.includes('railwayZone'), 'Should not fabricate missing railwayZone');
    assert.strictEqual(r1.result.route.length, 2, 'Should keep halting stops only');
    assert(r1.result.coach_composition.length > 0 && !r1.result.coach_composition.some((c) => c.coach_number === 'ENG'));
    assert(seenProgress.some((s) => s.includes('RailRadar')), 'Expected progress callback');
    assert.strictEqual(r2.result.status, 'VERIFIED');
    assert.strictEqual(r3.result.status, 'VERIFIED');
    console.log('[PASS] Static RailRadar Public verification (15120) & rapid-click deduplication');

    // 1b. RailRadar 404 falls back cleanly to DataMeet OpenData (15102)
    const dmFallback = await trainLookupService.lookup('15102');
    assert.strictEqual(dmFallback.result.status, 'VERIFIED');
    assert.strictEqual(dmFallback.result.provider, 'DataMeet OpenData');
    assert.strictEqual(dmFallback.result.train_name, 'Mumbai CST Chhapra Jansadharan Express');
    assert.strictEqual(dmFallback.result.railway_zone, 'NER');
    assert.strictEqual(dmFallback.result.region, 'NORTH');
    console.log('[PASS] Static fallback from RailRadar 404 to DataMeet OpenData (15102)');

    // 1c. Non-Express MEMU/Passenger exclusion using structured metadata
    global.fetch = async (url) => {
      if (String(url).includes('railradar.in/api/v1/trains/10107')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            data: {
              train: {
                number: '10107',
                name: 'Mangaluru Central MEMU Express',
                type: 'MEMU',
                category: 'Local',
              },
            },
          }),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    };
    const nonExp = await trainLookupService.lookup('10107', { refresh: true });
    assert.strictEqual(nonExp.result.status, 'UNSUPPORTED_TYPE');
    assert.strictEqual(nonExp.result.error_code, 'NON_EXPRESS_TRAIN');
    console.log('[PASS] Non-Express MEMU exclusion even with Express in train name');

    // Restore primary mock before 99998 NOT_FOUND + localFleetStore checks
    global.fetch = async (url) => {
      if (String(url).includes('datameet/railways')) {
        return { ok: true, status: 200, text: async () => JSON.stringify(sampleGeoJson) };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ success: false, error: { code: 'TRAIN_NOT_FOUND' } }) };
    };

    // 2. Non-existent train -> NOT_FOUND
    const nf = await trainLookupService.lookup('99998');
    assert.strictEqual(nf.result.status, 'NOT_FOUND');
    assert.strictEqual(nf.result.error_code, 'NOT_FOUND');
    assert(nf.result.message.includes('Invalid Train Number'));
    console.log('[PASS] Invalid train number differentiation (NOT_FOUND)');

    // 3. Static localFleetStore save + duplicate check + delete
    const created = localFleetStore.createTrain({
      train_number: '15102',
      name: 'Mumbai CST Chhapra Jansadharan Express',
      region: 'NORTH',
      railway_zone: 'NER',
      source_station: 'MUMBAI CST',
      source_code: 'CSTM',
      destination_station: 'CHHAPRA',
      destination_code: 'CPR',
      train_type: 'Express',
      coach_number: 'S1',
      tank_capacity: 500,
    });
    assert.strictEqual(created.success, true);
    assert.strictEqual(localFleetStore.hasTrain('15102'), true);

    assert.throws(
      () => localFleetStore.createTrain({ train_number: '15102', name: 'Dup', region: 'NORTH' }),
      (e) => e.status === 409
    );

    const dupLookup = await trainLookupService.lookup('15102');
    assert.strictEqual(dupLookup.result.already_exists, true);
    localFleetStore.deleteTrain('15102');
    assert.strictEqual(localFleetStore.hasTrain('15102'), false);
    console.log('[PASS] Static localFleetStore CRUD & duplicate prevention');

    // 4. Error differentiation: RATE_LIMITED (429), AUTH_ERROR (401), INVALID_RESPONSE, SERVER_UNAVAILABLE (503), TIMEOUT
    trainLookupService.clearCache();
    memStorage.clear();
    global.fetch = async () => ({ ok: false, status: 429, text: async () => 'Too Many Requests' });
    const rl = await trainLookupService.lookup('12002', { refresh: true });
    assert.strictEqual(rl.result.status, 'UNAVAILABLE');
    assert.strictEqual(rl.result.error_code, 'RATE_LIMITED');

    trainLookupService.clearCache();
    memStorage.clear();
    global.fetch = async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' });
    const auth = await trainLookupService.lookup('12002', { refresh: true });
    assert.strictEqual(auth.result.status, 'UNAVAILABLE');
    assert.strictEqual(auth.result.error_code, 'AUTH_ERROR');

    trainLookupService.clearCache();
    memStorage.clear();
    global.fetch = async () => ({ ok: true, status: 200, text: async () => '{bad json' });
    const badJson = await trainLookupService.lookup('12002', { refresh: true });
    assert.strictEqual(badJson.result.status, 'UNAVAILABLE');
    assert.strictEqual(badJson.result.error_code, 'INVALID_RESPONSE');

    trainLookupService.clearCache();
    memStorage.clear();
    global.fetch = async () => ({ ok: false, status: 503, text: async () => 'Service Unavailable' });
    const srv = await trainLookupService.lookup('12002', { refresh: true });
    assert.strictEqual(srv.result.status, 'UNAVAILABLE');
    assert.strictEqual(srv.result.error_code, 'SERVER_UNAVAILABLE');

    trainLookupService.clearCache();
    memStorage.clear();
    global.fetch = async () => {
      const e = new Error('The operation timed out');
      e.name = 'AbortError';
      throw e;
    };
    const to = await trainLookupService.lookup('12002', { refresh: true });
    assert.strictEqual(to.result.status, 'UNAVAILABLE');
    assert.strictEqual(to.result.error_code, 'TIMEOUT');
    console.log('[PASS] Error classification: RATE_LIMITED, AUTH_ERROR, INVALID_RESPONSE, SERVER_UNAVAILABLE, TIMEOUT');

    console.log('\nALL TRAIN LOOKUP & STATIC FLEET UNIT TESTS PASSED!\n');
  } finally {
    try { fs.unlinkSync(OUT_FILE); } catch {}
    try { fs.unlinkSync(storeBundle); } catch {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

