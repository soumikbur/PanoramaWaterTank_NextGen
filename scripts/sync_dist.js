const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../apps/mobile/dist');
const dest = path.resolve(__dirname, '../dist');
const backendStatic = path.resolve(__dirname, '../backend/static');

if (fs.existsSync(src)) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log('Successfully synced apps/mobile/dist to root dist');

  fs.mkdirSync(backendStatic, { recursive: true });
  fs.cpSync(src, backendStatic, { recursive: true, force: true });
  console.log('Successfully synced apps/mobile/dist to backend/static');
} else {
  console.warn('Source dist not found at:', src);
}

