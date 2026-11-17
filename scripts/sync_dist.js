const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../apps/mobile/dist');
const dest = path.resolve(__dirname, '../dist');
const backendStatic = path.resolve(__dirname, '../backend/static');
const httpsFrontend = path.resolve(__dirname, '../HTTPS_Server/frontend');

// 1. Sync mobile web build to dist
if (fs.existsSync(src)) {
  if (fs.existsSync(dest)) {
    // Keep https/lab subdirectories if they exist during clean
    const httpsTemp = path.resolve(__dirname, '../.tmp_https');
    if (fs.existsSync(path.resolve(dest, 'https'))) {
      fs.cpSync(path.resolve(dest, 'https'), httpsTemp, { recursive: true, force: true });
    }
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    if (fs.existsSync(httpsTemp)) {
      fs.cpSync(httpsTemp, path.resolve(dest, 'https'), { recursive: true, force: true });
      fs.rmSync(httpsTemp, { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(dest, { recursive: true });
  }

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
  console.warn('Source apps/mobile/dist not found at:', src);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
}

// 2. Sync HTTPS Laboratory Dashboard to dist/https and dist/lab
if (fs.existsSync(httpsFrontend)) {
  const httpsDest = path.resolve(dest, 'https');
  const labDest = path.resolve(dest, 'lab');

  fs.mkdirSync(httpsDest, { recursive: true });
  fs.cpSync(httpsFrontend, httpsDest, { recursive: true, force: true });
  console.log('Successfully synced HTTPS_Server/frontend to dist/https');

  fs.mkdirSync(labDest, { recursive: true });
  fs.cpSync(httpsFrontend, labDest, { recursive: true, force: true });
  console.log('Successfully synced HTTPS_Server/frontend to dist/lab');
} else {
  console.warn('HTTPS frontend not found at:', httpsFrontend);
}
