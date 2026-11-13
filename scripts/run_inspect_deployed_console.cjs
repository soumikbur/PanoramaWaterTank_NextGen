// scripts/run_inspect_deployed_console.cjs
const cp = require('child_process');
const path = require('path');
const electronPath = require(path.join(__dirname, '../apps/mobile/node_modules/electron'));

const runnerFile = path.join(__dirname, 'inspect_deployed_console.cjs');

const spawnEnv = {
  ...process.env,
};
delete spawnEnv.ELECTRON_RUN_AS_NODE;

console.log('[CONSOLE AUDIT LAUNCHER] Launching Electron with:', electronPath);
const child = cp.spawn(electronPath, [runnerFile], {
  stdio: 'inherit',
  env: spawnEnv,
});

child.on('exit', (code) => {
  console.log(`[CONSOLE AUDIT LAUNCHER] Finished with code ${code}`);
  process.exit(code || 0);
});
