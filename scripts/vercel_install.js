// scripts/vercel_install.js
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const mobileDir = path.resolve(__dirname, '../apps/mobile');
const targetDir = fs.existsSync(mobileDir) ? mobileDir : process.cwd();

console.log('[VERCEL-INSTALL] Installing dependencies in:', targetDir);
cp.execSync('npm install', { cwd: targetDir, stdio: 'inherit' });

