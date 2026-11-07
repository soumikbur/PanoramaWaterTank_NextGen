const cp = require('child_process');
const path = require('path');
const electronPath = require('electron');

const script = path.resolve(__dirname, 'verify_live_github_pages.cjs');
const childEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
delete childEnv.ELECTRON_RUN_AS_NODE;

const child = cp.spawn(electronPath, [script], {
  stdio: 'inherit',
  env: childEnv,
});

child.on('close', (code) => {
  console.log('[ELECTRON RUNNER] Process closed with code:', code);
  process.exit(code || 0);
});

