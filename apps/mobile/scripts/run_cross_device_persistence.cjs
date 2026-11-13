// apps/mobile/scripts/run_cross_device_persistence.cjs
const cp = require('child_process');
const path = require('path');
const electronPath = require('electron');

const runnerFile = path.join(__dirname, 'verify_cross_device_persistence_runner.cjs');

const spawnEnv = {
  ...process.env,
  ELECTRON_ENABLE_LOGGING: '1',
};
delete spawnEnv.ELECTRON_RUN_AS_NODE;

console.log('[CROSS-DEVICE PERSISTENCE LAUNCHER] Launching Electron with:', electronPath);
const child = cp.spawn(electronPath, [runnerFile], {
  stdio: 'inherit',
  env: spawnEnv,
});

child.on('exit', (code) => {
  console.log(`[CROSS-DEVICE PERSISTENCE LAUNCHER] Finished with code ${code}`);
  process.exit(code || 0);
});

