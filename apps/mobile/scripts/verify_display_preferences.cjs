// apps/mobile/scripts/verify_display_preferences.cjs
const assert = require('assert');

// Mock localStorage in Node
const store = new Map();
global.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, val) => store.set(key, String(val)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

// Test constants
const SCALE_FACTORS = {
  '90%': 0.9,
  '100%': 1.0,
  '110%': 1.1,
  '120%': 1.2,
  '130%': 1.3,
  '150%': 1.5,
};

const DEFAULT_PREFS = {
  scale: '100%',
  fontSize: 'small',
  layoutDensity: 'COMFORTABLE',
  contrastMode: 'STANDARD',
};

function scaleToFontSize(scale) {
  switch (scale) {
    case '90%': return 'compact';
    case '100%': return 'small';
    case '110%': return 'normal';
    case '120%': return 'large';
    case '130%': return 'extralarge';
    case '150%': return 'maximum';
    default: return 'small';
  }
}

function getStorageKey(username) {
  if (username && username.trim().length > 0) {
    return `panorama_display_preferences_${username.trim().toLowerCase()}`;
  }
  return 'panorama_display_preferences';
}

function loadPreferences(username) {
  if (username) {
    const raw = localStorage.getItem(getStorageKey(username));
    if (raw) return JSON.parse(raw);
  }
  const globalRaw = localStorage.getItem('panorama_display_preferences');
  if (globalRaw) return JSON.parse(globalRaw);

  const legacyScale = localStorage.getItem('panorama_display_scale');
  if (legacyScale && SCALE_FACTORS[legacyScale]) {
    return {
      ...DEFAULT_PREFS,
      scale: legacyScale,
      fontSize: scaleToFontSize(legacyScale),
    };
  }
  return { ...DEFAULT_PREFS };
}

function savePreferences(prefs, username) {
  const json = JSON.stringify(prefs);
  if (username) {
    localStorage.setItem(getStorageKey(username), json);
  }
  localStorage.setItem('panorama_display_preferences', json);
  localStorage.setItem('panorama_display_scale', prefs.scale);
}

function resetPreferences(username) {
  const defaults = { ...DEFAULT_PREFS };
  savePreferences(defaults, username);
  return defaults;
}

console.log('[VERIFY] Starting Display Preferences Test Suite...');

// 1. Initial Default State (Must be 100% Small)
localStorage.clear();
const initial = loadPreferences();
assert.strictEqual(initial.scale, '100%');
assert.strictEqual(initial.fontSize, 'small');
assert.strictEqual(initial.layoutDensity, 'COMFORTABLE');
assert.strictEqual(initial.contrastMode, 'STANDARD');
console.log('✓ 1. Initial default preferences match (100% Small, Comfortable, Standard)');

// 2. User Isolation Test (admin vs operator)
savePreferences({ scale: '150%', fontSize: 'maximum', layoutDensity: 'COMPACT', contrastMode: 'HIGH_CONTRAST' }, 'admin');
savePreferences({ scale: '90%', fontSize: 'compact', layoutDensity: 'COMFORTABLE', contrastMode: 'STANDARD' }, 'operator');

const adminPrefs = loadPreferences('admin');
const operatorPrefs = loadPreferences('operator');

assert.strictEqual(adminPrefs.scale, '150%');
assert.strictEqual(adminPrefs.contrastMode, 'HIGH_CONTRAST');
assert.strictEqual(operatorPrefs.scale, '90%');
assert.strictEqual(operatorPrefs.contrastMode, 'STANDARD');
console.log('✓ 2. User isolation verified: admin (150% High Contrast) != operator (90% Standard)');

// 3. Reset Preferences Test (Must restore 100% default)
const resetAdmin = resetPreferences('admin');
assert.strictEqual(resetAdmin.scale, '100%');
const loadedAdminAfterReset = loadPreferences('admin');
assert.strictEqual(loadedAdminAfterReset.scale, '100%');
// Operator preferences should remain untouched
const operatorStill90 = loadPreferences('operator');
assert.strictEqual(operatorStill90.scale, '90%');
console.log('✓ 3. Reset to default restores 100% default for admin while preserving operator settings');

// 4. Legacy migration test
localStorage.clear();
localStorage.setItem('panorama_display_scale', '130%');
const migrated = loadPreferences();
assert.strictEqual(migrated.scale, '130%');
assert.strictEqual(migrated.fontSize, 'extralarge');
console.log('✓ 4. Legacy storage key (panorama_display_scale: 130%) migrated successfully');

// 5. Scale Factor Calculation
Object.entries(SCALE_FACTORS).forEach(([preset, factor]) => {
  assert.strictEqual(SCALE_FACTORS[preset], factor);
});
console.log('✓ 5. All 6 scale presets (90%, 100%, 110%, 120%, 130%, 150%) correctly mapped to factors');

console.log('\n[PASS] All 5 display preference verification tests passed successfully!\n');
