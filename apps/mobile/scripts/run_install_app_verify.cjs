// apps/mobile/scripts/run_install_app_verify.cjs
const cp = require('child_process');
const path = require('path');
const electronPath = require('electron');

const runnerFile = path.join(__dirname, 'verify_install_app_flow.cjs');

const spawnEnv = {
  ...process.env,
};
delete spawnEnv.ELECTRON_RUN_AS_NODE;

console.log('[INSTALL APP LAUNCHER] Launching Electron with:', electronPath);
const child = cp.spawn(electronPath, [runnerFile], {
  stdio: 'inherit',
  env: spawnEnv,
});

child.on('exit', (code) => {
  console.log(`[INSTALL APP LAUNCHER] Finished with code ${code}`);
  process.exit(code || 0);
});

