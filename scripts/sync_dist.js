const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../apps/mobile/dist');
const dest = path.resolve(__dirname, '../dist');
const backendStatic = path.resolve(__dirname, '../backend/static');
const httpsFrontend = path.resolve(__dirname, '../HTTPS_Server/frontend');
const httpsBackendStatic = path.resolve(__dirname, '../HTTPS_Server/backend/static');

const skipMaps = (filePath) => !filePath.endsWith('.map');
const skipMapsAndApk = (filePath) =>
  !filePath.endsWith('.map') && !filePath.toLowerCase().endsWith('.apk');

// 1. Sync mobile web build to dist
if (fs.existsSync(src)) {
  if (fs.existsSync(dest)) {
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

  fs.cpSync(src, dest, { recursive: true, force: true, filter: skipMaps });
  console.log('Successfully synced apps/mobile/dist to root dist');

  // Clean stale sourcemaps in backend/static before syncing
  for (const staleMap of ['assets/index.js.map', 'assets/index.css.map']) {
    const p = path.join(backendStatic, staleMap);
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
  fs.mkdirSync(backendStatic, { recursive: true });
  fs.cpSync(src, backendStatic, { recursive: true, force: true, filter: skipMaps });
  console.log('Successfully synced apps/mobile/dist to backend/static');

  // Exclude .apk and .map when syncing into Capacitor Android assets to prevent recursive 50MB APK bloat
  const capWww = path.resolve(__dirname, '../PanoramaWaterTank_Capacitor/www');
  if (fs.existsSync(capWww)) fs.rmSync(capWww, { recursive: true, force: true });
  fs.mkdirSync(capWww, { recursive: true });
  fs.cpSync(src, capWww, { recursive: true, force: true, filter: skipMapsAndApk });
  console.log('Successfully synced apps/mobile/dist to PanoramaWaterTank_Capacitor/www (APK/maps excluded)');

  const capAndroidAssets = path.resolve(__dirname, '../PanoramaWaterTank_Capacitor/android/app/src/main/assets/public');
  if (fs.existsSync(path.dirname(capAndroidAssets))) {
    if (fs.existsSync(capAndroidAssets)) fs.rmSync(capAndroidAssets, { recursive: true, force: true });
    fs.mkdirSync(capAndroidAssets, { recursive: true });
    fs.cpSync(src, capAndroidAssets, { recursive: true, force: true, filter: skipMapsAndApk });
    console.log('Successfully synced apps/mobile/dist to PanoramaWaterTank_Capacitor/android/app/src/main/assets/public (APK/maps excluded)');
  }
} else {
  console.warn('Source apps/mobile/dist not found at:', src);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
}

// 2. Sync HTTPS Laboratory Dashboard to dist/https, dist/lab, and keep HTTPS_Server/backend/static JS/CSS aligned
if (fs.existsSync(httpsFrontend)) {
  const httpsDest = path.resolve(dest, 'https');
  const labDest = path.resolve(dest, 'lab');

  fs.mkdirSync(httpsDest, { recursive: true });
  fs.cpSync(httpsFrontend, httpsDest, { recursive: true, force: true });
  console.log('Successfully synced HTTPS_Server/frontend to dist/https');

  fs.mkdirSync(labDest, { recursive: true });
  fs.cpSync(httpsFrontend, labDest, { recursive: true, force: true });
  console.log('Successfully synced HTTPS_Server/frontend to dist/lab');

  if (fs.existsSync(httpsBackendStatic)) {
    for (const sub of ['js', 'css']) {
      const subSrc = path.join(httpsFrontend, sub);
      if (fs.existsSync(subSrc)) {
        fs.cpSync(subSrc, path.join(httpsBackendStatic, sub), { recursive: true, force: true });
      }
    }
    console.log('Successfully synced HTTPS_Server/frontend/{js,css} to HTTPS_Server/backend/static');
  }
} else {
  console.warn('HTTPS frontend not found at:', httpsFrontend);
}
