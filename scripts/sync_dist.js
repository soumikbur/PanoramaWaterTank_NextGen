const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../apps/mobile/dist');
const dest = path.resolve(__dirname, '../dist');
const backendStatic = path.resolve(__dirname, '../backend/static');

if (fs.existsSync(src)) {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log('Successfully synced apps/mobile/dist to root dist');

  fs.mkdirSync(backendStatic, { recursive: true });
  fs.cpSync(src, backendStatic, { recursive: true, force: true });
  console.log('Successfully synced apps/mobile/dist to backend/static');

  const capWww = path.resolve(__dirname, '../PanoramaWaterTank_Capacitor/www');
  fs.mkdirSync(capWww, { recursive: true });
  fs.cpSync(src, capWww, { recursive: true, force: true });
  console.log('Successfully synced apps/mobile/dist to PanoramaWaterTank_Capacitor/www');

  const capAndroidAssets = path.resolve(__dirname, '../PanoramaWaterTank_Capacitor/android/app/src/main/assets/public');
  if (fs.existsSync(path.dirname(capAndroidAssets))) {
    fs.mkdirSync(capAndroidAssets, { recursive: true });
    fs.cpSync(src, capAndroidAssets, { recursive: true, force: true });
    console.log('Successfully synced apps/mobile/dist to PanoramaWaterTank_Capacitor/android/app/src/main/assets/public');
  }
} else {
  console.warn('Source dist not found at:', src);
}

