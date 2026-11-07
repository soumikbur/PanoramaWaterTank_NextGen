// apps/mobile/scripts/build.cjs
const fs = require('fs');
const path = require('path');

let esbuild;
try {
  esbuild = require('esbuild');
} catch (errPrimary) {
  try {
    const esbuildPath = require.resolve('esbuild', {
      paths: [__dirname, path.resolve(__dirname, '..'), path.resolve(__dirname, '../..')]
    });
    esbuild = require(esbuildPath);
  } catch (errFallback) {
    console.error('[BUILD ERROR] Unable to locate module "esbuild" across workspace or root search paths.');
    throw errPrimary;
  }
}

async function build() {
  const distDir = path.resolve(__dirname, '../dist');
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const enableTestLogin = process.env.VITE_ENABLE_TEST_LOGIN !== undefined
    ? process.env.VITE_ENABLE_TEST_LOGIN.trim().toLowerCase() === 'true'
    : true;
  console.log(`[BUILD] Bundling application with esbuild (test shortcuts: ${enableTestLogin})...`);
  const start = Date.now();

  await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src/index.tsx')],
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
    target: ['es2020'],
  });

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1976D2" />
    <meta name="description" content="Panorama Water Tank Monitor — NextGen Railway Coach SCADA & HMI System" />
    <title>Panorama Water Tank Monitor — Railway SCADA/HMI</title>
    <link rel="stylesheet" href="./assets/index.css" />
    <script>
      (function() {
        try {
          document.documentElement.setAttribute('data-theme', 'light');
        } catch (e) {}

        // GitHub Pages SPA Redirect Decoder
        try {
          var url = new URL(window.location.href);
          var p = url.searchParams.get('p');
          if (p) {
            var q = url.searchParams.get('q');
            var cleanPath = p;
            if (cleanPath.indexOf('#/') === 0) cleanPath = cleanPath.substring(2);
            else if (cleanPath.indexOf('#') === 0) cleanPath = cleanPath.substring(1);
            if (cleanPath.indexOf('/') === 0) cleanPath = cleanPath.substring(1);

            var newHash = '#/' + cleanPath + (q ? '?' + q.replace(/~and~/g, '&') : '');
            window.location.hash = newHash;
            var cleanUrl = window.location.pathname + window.location.hash;
            window.history.replaceState(null, null, cleanUrl);
          }
        } catch (e) {}
      })();
    </script>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 0;
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background-color: #F5F7FB;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        overflow: hidden;
      }
      #root {
        height: 100vh;
        width: 100vw;
        display: flex;
        flex-direction: column;
      }
    </style>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script type="module" src="./assets/index.js"></script>
  </body>
</html>`;

  const notFoundContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Redirecting — Panorama Water Tank Monitor</title>
    <script>
      // Single Page App redirect for GitHub Pages
      (function() {
        var pathSegmentsToKeep = 1; // 1 for project repository root: /PanoramaWaterTank_NextGen/
        var l = window.location;
        var pathname = l.pathname;
        var segments = pathname.split('/').filter(Boolean);
        var repoSegment = segments.length > 0 ? '/' + segments[0] : '';
        var subpath = segments.slice(pathSegmentsToKeep).join('/');

        // Redirect to base path with ?p= query
        var redirectUrl = l.protocol + '//' + l.host + repoSegment + '/?p=/' +
          encodeURIComponent(subpath) +
          (l.search ? '&q=' + encodeURIComponent(l.search.slice(1)) : '') +
          l.hash;

        l.replace(redirectUrl);
      })();
    </script>
    <style>
      body {
        font-family: Inter, -apple-system, sans-serif;
        background-color: #F8FAFC;
        color: #0F172A;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div style="text-align: center;">
      <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #0F172A;">Loading Railway SCADA...</h2>
      <p style="margin: 0; font-size: 13px; color: #64748B;">Redirecting to Panorama Water Tank Monitor...</p>
    </div>
  </body>
</html>`;

  fs.writeFileSync(path.join(distDir, 'index.html'), htmlContent, 'utf8');
  fs.writeFileSync(path.join(distDir, '404.html'), notFoundContent, 'utf8');

  // Sync to root dist if different
  const rootDist = path.resolve(__dirname, '../../../dist');
  if (path.resolve(distDir) !== rootDist) {
    fs.mkdirSync(rootDist, { recursive: true });
    fs.cpSync(distDir, rootDist, { recursive: true, force: true });
  }

  // Sync to backend static directory
  const backendStatic = path.resolve(__dirname, '../../../backend/static');
  fs.mkdirSync(backendStatic, { recursive: true });
  fs.cpSync(distDir, backendStatic, { recursive: true, force: true });

  const duration = Date.now() - start;
  console.log(`[BUILD] Build completed successfully in ${duration}ms! Output: ${distDir}`);
}

build().catch((err) => {
  console.error('[BUILD ERROR]', err);
  process.exit(1);
});

