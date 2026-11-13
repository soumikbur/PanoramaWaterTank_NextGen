const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const apkSrc = path.join(__dirname, '../android/app/build/outputs/apk/debug/app-debug.apk');

if (!fs.existsSync(apkSrc)) {
  console.error('[COPY APK ERROR] Source APK not found at:', apkSrc);
  process.exit(1);
}

const destinations = [
  path.join(projectRoot, 'apps/mobile/public/downloads'),
  path.join(projectRoot, 'apps/mobile/dist/downloads'),
  path.join(projectRoot, 'dist/downloads'),
  path.join(projectRoot, 'backend/static/downloads'),
  path.join(__dirname, '../www/downloads'),
];

for (const destDir of destinations) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const destFile = path.join(destDir, 'panorama-water-tank-monitor.apk');
  fs.copyFileSync(apkSrc, destFile);
  const size = fs.statSync(destFile).size;
  console.log(`[COPY APK] Successfully copied to: ${destFile} (${(size / (1024 * 1024)).toFixed(2)} MB)`);
}

