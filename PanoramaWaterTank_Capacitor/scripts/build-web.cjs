// PanoramaWaterTank_Capacitor/scripts/build-web.cjs
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

async function buildWebForCapacitor() {
  const rootDir = path.resolve(__dirname, '..');
  const mobileAppDir = path.resolve(rootDir, '../apps/mobile');
  const wwwDir = path.join(rootDir, 'www');
  const assetsDir = path.join(wwwDir, 'assets');

  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  console.log('[CAPACITOR BUILD] Bundling web application from apps/mobile for Android...');
  const start = Date.now();

  const enableTestLogin = true;
  const apiUrl = (process.env.VITE_API_URL || '').trim();
  const wsUrl = (process.env.VITE_WS_URL || '').trim();

  await esbuild.build({
    entryPoints: [path.join(mobileAppDir, 'src/index.tsx')],
    bundle: true,
    outfile: path.join(assetsDir, 'index.js'),
    format: 'esm',
    alias: {
      'react-native': 'react-native-web',
    },
    define: {
      'global': 'window',
      '__DEV__': 'false',
      'process.env.NODE_ENV': '"production"',
      'process.env.VITE_ENABLE_TEST_LOGIN': enableTestLogin ? '"true"' : '"false"',
      'import.meta.env.VITE_ENABLE_TEST_LOGIN': enableTestLogin ? '"true"' : '"false"',
      'process.env.VITE_API_URL': JSON.stringify(apiUrl),
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      'process.env.VITE_WS_URL': JSON.stringify(wsUrl),
      'import.meta.env.VITE_WS_URL': JSON.stringify(wsUrl),
      'process.env.IS_CAPACITOR': '"true"',
    },
    loader: {
      '.css': 'css',
      '.png': 'dataurl',
      '.svg': 'text',
      '.jpg': 'dataurl',
      '.jpeg': 'dataurl',
      '.gif': 'dataurl',
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
      '.ttf': 'dataurl',
      '.eot': 'dataurl',
    },
    minify: true,
    target: ['es2020', 'chrome100'],
  });

  // Copy public directory from apps/mobile if present
  const publicDir = path.join(mobileAppDir, 'public');
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, wwwDir, { recursive: true, force: true });
  }

  // Generate mobile-optimized index.html
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#1976D2" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <title>Panorama Water Tank Monitor</title>
    <link rel="stylesheet" href="./assets/index.css" />
    <style>
      * {
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background-color: #F8FAFC;
        -webkit-font-smoothing: antialiased;
      }
      #root {
        height: 100vh;
        width: 100vw;
        display: flex;
        flex-direction: column;
        padding-top: env(safe-area-inset-top, 0px);
        padding-bottom: env(safe-area-inset-bottom, 0px);
        padding-left: env(safe-area-inset-left, 0px);
        padding-right: env(safe-area-inset-right, 0px);
      }
    </style>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script type="module" src="./assets/index.js"></script>
  </body>
</html>`;

  fs.writeFileSync(path.join(wwwDir, 'index.html'), htmlContent, 'utf8');

  // Copy www directory to android/app/src/main/assets/public
  const androidPublicDir = path.join(rootDir, 'android/app/src/main/assets/public');
  if (fs.existsSync(androidPublicDir)) {
    fs.cpSync(wwwDir, androidPublicDir, { recursive: true, force: true });
    console.log('[CAPACITOR BUILD] Copied www/ assets to android/app/src/main/assets/public');
  }

  const duration = Date.now() - start;
  console.log(`[CAPACITOR BUILD] Web assets successfully bundled into www/ in ${duration}ms!`);
}

buildWebForCapacitor().catch((err) => {
  console.error('[CAPACITOR BUILD ERROR]', err);
  process.exit(1);
});

