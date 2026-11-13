// apps/mobile/scripts/run_audit.cjs
const cp = require('child_process');
const path = require('path');
const electronPath = require('electron');

const runnerFile = path.join(__dirname, 'full_website_audit_runner.cjs');

const spawnEnv = {
  ...process.env,
  ELECTRON_ENABLE_LOGGING: '1',
};
delete spawnEnv.ELECTRON_RUN_AS_NODE;

console.log('[AUDIT LAUNCHER] Launching Electron with:', electronPath);
const child = cp.spawn(electronPath, [runnerFile], {
  stdio: 'inherit',
  env: spawnEnv,
});

child.on('exit', (code) => {
  console.log(`[AUDIT LAUNCHER] Electron process finished with code ${code}`);
  process.exit(code || 0);
});

