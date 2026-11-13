// apps/mobile/scripts/run_responsive_verify.cjs
const cp = require('child_process');
const path = require('path');
const electronPath = require('electron');

const runnerFile = path.join(__dirname, 'verify_responsive_matrix.cjs');

const spawnEnv = {
  ...process.env,
};
delete spawnEnv.ELECTRON_RUN_AS_NODE;

console.log('[RESPONSIVE TEST LAUNCHER] Launching Electron with:', electronPath);
const child = cp.spawn(electronPath, [runnerFile], {
  stdio: 'inherit',
  env: spawnEnv,
});

child.on('exit', (code) => {
  console.log(`[RESPONSIVE TEST LAUNCHER] Finished with code ${code}`);
  process.exit(code || 0);
});

