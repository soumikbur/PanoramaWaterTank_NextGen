const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const mode = (process.argv[2] || 'debug').toLowerCase();
const isWindows = process.platform === 'win32';
const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew';
const androidDir = path.resolve(__dirname, '../android');

let gradleTask = 'assembleDebug';
if (mode === 'release') gradleTask = 'assembleRelease';
else if (mode === 'bundle') gradleTask = 'bundleRelease';

console.log(`[GRADLE] Running task ${gradleTask} in ${androidDir}...`);

const result = spawnSync(gradlewCmd, [gradleTask], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  console.error(`[GRADLE ERROR] Task ${gradleTask} failed with exit code ${result.status}`);
  process.exit(result.status || 1);
}

console.log(`[GRADLE SUCCESS] Task ${gradleTask} completed successfully!`);

if (mode === 'debug' || mode === 'release') {
  require('./copy-apk.cjs');
}

