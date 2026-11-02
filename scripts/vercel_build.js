// scripts/vercel_build.js
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const mobileDir = path.resolve(__dirname, '../apps/mobile');
const targetDir = fs.existsSync(mobileDir) ? mobileDir : process.cwd();

console.log('[VERCEL-BUILD] Building application in:', targetDir);
cp.execSync('npm run build', { cwd: targetDir, stdio: 'inherit' });

// Sync dist to root dist if building from root
const srcDist = path.join(targetDir, 'dist');
const rootDist = path.resolve(__dirname, '../dist');
if (fs.existsSync(srcDist) && path.resolve(srcDist) !== rootDist) {
  fs.mkdirSync(rootDist, { recursive: true });
  fs.cpSync(srcDist, rootDist, { recursive: true, force: true });
  console.log('[VERCEL-BUILD] Successfully synced dist to root dist');
}

