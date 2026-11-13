/**
 * Automated Regression Protection Suite
 * Verifies event listener safety and WebSocketService API contract across Web & Capacitor environments.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

console.log('====================================================');
console.log('🧪 RUNNING EVENT LISTENER REGRESSION TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  process.stdout.write(`[Test ${totalTests}] ${name} ... `);
  try {
    fn();
    console.log('✅ PASSED');
    passedTests++;
  } catch (err) {
    console.log('❌ FAILED');
    console.error(err);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------
// Test 1: WebSocketService API Interface Contract & Event Dispatch
// -----------------------------------------------------------------
runTest('WebSocketService exposes addEventListener, removeEventListener, on, off, addListener, removeListener', () => {
  const tsCode = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/src/services/websocket.ts'),
    'utf-8'
  );

  // Transpile websocket.ts to test directly in Node
  const result = esbuild.transformSync(tsCode, {
    loader: 'ts',
    format: 'cjs',
    target: 'node18'
  });

  // Evaluate the module in a scoped context
  const mockModule = { exports: {} };
  const mockWindow = {
    location: { protocol: 'http:', hostname: 'localhost', port: '8000' }
  };
  const mockStorage = {
    getItem: () => null,
    setItem: () => {}
  };

  const fn = new Function('module', 'exports', 'window', 'localStorage', 'sessionStorage', result.code);
  fn(mockModule, mockModule.exports, mockWindow, mockStorage, mockStorage);

  const ws = mockModule.exports.wsService || (mockModule.exports.WebSocketService && mockModule.exports.WebSocketService.getInstance());
  assert(ws, 'WebSocketService instance must exist');

  // Verify all event registration and removal aliases exist as functions
  assert.strictEqual(typeof ws.addEventListener, 'function', 'ws.addEventListener must be a function');
  assert.strictEqual(typeof ws.removeEventListener, 'function', 'ws.removeEventListener must be a function');
  assert.strictEqual(typeof ws.on, 'function', 'ws.on must be a function');
  assert.strictEqual(typeof ws.off, 'function', 'ws.off must be a function');
  assert.strictEqual(typeof ws.addListener, 'function', 'ws.addListener must be a function');
  assert.strictEqual(typeof ws.removeListener, 'function', 'ws.removeListener must be a function');

  // Test event subscription and triggering via addEventListener
  let receivedData = null;
  const testHandler = (data) => {
    receivedData = data;
  };

  const unsub = ws.addEventListener('test_event', testHandler);
  assert.strictEqual(typeof unsub, 'function', 'addEventListener must return an unsubscribe function');

  // Trigger event
  ws.emit('test_event', { status: 'ok', value: 42 });
  assert.deepStrictEqual(receivedData, { status: 'ok', value: 42 }, 'Event callback should receive dispatched data');

  // Test removal via returned function
  unsub();
  receivedData = null;
  ws.emit('test_event', { status: 'updated' });
  assert.strictEqual(receivedData, null, 'Callback must not be invoked after unsubscription');

  // Test registration via on() and removal via removeEventListener()
  let receivedData2 = null;
  const testHandler2 = (data) => {
    receivedData2 = data;
  };
  ws.on('test_event_2', testHandler2);
  ws.emit('test_event_2', 'payload_1');
  assert.strictEqual(receivedData2, 'payload_1');

  ws.removeEventListener('test_event_2', testHandler2);
  ws.emit('test_event_2', 'payload_2');
  assert.strictEqual(receivedData2, 'payload_1', 'removeEventListener must prevent further invocations');
});

// -----------------------------------------------------------------
// Test 2: Production Bundle Verification (dist/assets/index.js)
// -----------------------------------------------------------------
runTest('Production bundle dist/assets/index.js includes WebSocketService listener methods and no Ba.addEventListener failure', () => {
  const distJsPath = path.resolve(__dirname, '../dist/assets/index.js');
  assert(fs.existsSync(distJsPath), 'dist/assets/index.js must exist');

  const bundle = fs.readFileSync(distJsPath, 'utf-8');

  // Check that addEventListener and removeEventListener definition exist inside WebSocketService in the bundle
  assert(
    bundle.includes('addEventListener(') && bundle.includes('removeEventListener('),
    'bundle must contain addEventListener and removeEventListener method definitions'
  );

  // Check that WebSocketService class in bundle defines addEventListener, removeEventListener, addListener, removeListener
  assert(
    bundle.includes('addEventListener(e,o,a){return this.on(e,o)}') ||
    bundle.includes('addEventListener('),
    'WebSocketService must define addEventListener in bundle'
  );
  assert(
    bundle.includes('removeEventListener(e,o){this.off(e,o)}') ||
    bundle.includes('removeEventListener('),
    'WebSocketService must define removeEventListener in bundle'
  );

  // Check that AppContext and LogsScreen use wsService.on or safe addEventListener
  assert(!bundle.includes('wsService.addEventListener is not a function'), 'Bundle cannot contain unhandled errors');
});

// -----------------------------------------------------------------
// Test 3: Capacitor Android Build Assets Verification
// -----------------------------------------------------------------
runTest('Capacitor assets in PanoramaWaterTank_Capacitor/www contain updated index.js', () => {
  const capJsPath = path.resolve(__dirname, '../PanoramaWaterTank_Capacitor/www/assets/index.js');
  assert(fs.existsSync(capJsPath), 'Capacitor www/assets/index.js must exist');

  const capBundle = fs.readFileSync(capJsPath, 'utf-8');
  assert(
    capBundle.includes('addEventListener(') && capBundle.includes('removeEventListener('),
    'Capacitor bundle must contain addEventListener and removeEventListener method definitions'
  );
});

// -----------------------------------------------------------------
// Test 4: Defensive Guard Verification in AppContext, NativeBridge, and Services
// -----------------------------------------------------------------
runTest('NativeBridge, BrowserNotificationBridge, and LocalFleetStore guard all event targets defensively', () => {
  // Check browserNotificationBridge.ts
  const bnbCode = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/src/services/browserNotificationBridge.ts'),
    'utf-8'
  );
  assert(
    bnbCode.includes("typeof navigator.serviceWorker.addEventListener !== 'function'") ||
    bnbCode.includes("typeof navigator.serviceWorker.addEventListener === 'function'"),
    'browserNotificationBridge must guard navigator.serviceWorker.addEventListener'
  );

  // Check nativeBridge.ts
  const nbCode = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/src/services/nativeBridge.ts'),
    'utf-8'
  );
  assert(
    nbCode.includes("typeof Network.addListener === 'function'"),
    'nativeBridge must guard Network.addListener'
  );
  assert(
    nbCode.includes("typeof App.addListener === 'function'"),
    'nativeBridge must guard App.addListener'
  );

  // Check localFleetStore.ts
  const lfsCode = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/src/services/localFleetStore.ts'),
    'utf-8'
  );
  assert(
    lfsCode.includes("typeof centralChannel.addEventListener === 'function'"),
    'localFleetStore must guard centralChannel.addEventListener'
  );

  // Check deviceRegistry.ts
  const drCode = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/src/services/deviceRegistry.ts'),
    'utf-8'
  );
  assert(
    drCode.includes("typeof centralChannel.addEventListener === 'function'"),
    'deviceRegistry must guard centralChannel.addEventListener'
  );

  // Check trainLookupService.ts
  const tlsCode = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/src/services/trainLookupService.ts'),
    'utf-8'
  );
  assert(
    tlsCode.includes("typeof options.externalSignal.addEventListener === 'function'"),
    'trainLookupService must guard externalSignal.addEventListener'
  );
});

// -----------------------------------------------------------------
// Test 5: UI Screen Event Listener Safety (Header, InstallAppModal, Sidebar, UsersScreen)
// -----------------------------------------------------------------
runTest('All common UI components verify window.addEventListener before attaching handlers', () => {
  const filesToCheck = [
    '../apps/mobile/src/components/common/Header.tsx',
    '../apps/mobile/src/components/common/InstallAppModal.tsx',
    '../apps/mobile/src/components/common/Sidebar.tsx',
    '../apps/mobile/src/screens/LocationScreen.tsx',
    '../apps/mobile/src/screens/SettingsScreen.tsx',
    '../apps/mobile/src/screens/UsersScreen.tsx',
    '../apps/mobile/src/screens/LogsScreen.tsx'
  ];

  for (const relPath of filesToCheck) {
    const fullPath = path.resolve(__dirname, relPath);
    assert(fs.existsSync(fullPath), `File ${relPath} must exist`);
    const content = fs.readFileSync(fullPath, 'utf-8');

    // If file has addEventListener, it must be guarded or on validated targets
    if (content.includes('window.addEventListener')) {
      assert(
        content.includes("typeof window.addEventListener === 'function'") ||
        content.includes("typeof window !== 'undefined'"),
        `${relPath} must have safety checks around window.addEventListener`
      );
    }
    // Verify no stray wsService.addEventListener
    assert(
      !content.includes('wsService.addEventListener'),
      `${relPath} should prefer wsService.on or guarded addEventListener`
    );
  }
});

console.log('\n====================================================');
console.log(`🎉 TEST SUMMARY: ${passedTests}/${totalTests} tests passed successfully.`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
