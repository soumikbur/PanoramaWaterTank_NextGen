// apps/mobile/scripts/dev.cjs
const esbuild = require('esbuild');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const HOST = '127.0.0.1';

async function start() {
  const distDir = path.resolve(__dirname, '../dist');
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const ctx = await esbuild.context({
    entryPoints: [path.resolve(__dirname, '../src/index.tsx')],
    bundle: true,
    outfile: path.join(assetsDir, 'index.js'),
    format: 'esm',
    alias: {
      'react-native': 'react-native-web',
    },
    define: {
      'global': 'window',
      '__DEV__': 'true',
      'process.env.NODE_ENV': '"development"',
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
    sourcemap: true,
  });

  await ctx.watch();
  await ctx.rebuild();
  generateHtml(distDir);

  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.map': 'application/json',
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';

    let filePath = path.join(distDir, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        });
        res.end(content, 'utf-8');
      }
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`[DEV SERVER] Panorama Water Tank SCADA Console running at http://${HOST}:${PORT}/`);
  });
}

function generateHtml(distDir) {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1976D2" />
    <meta name="description" content="Panorama Water Tank Monitor — NextGen Railway Coach SCADA & HMI System" />
    <title>Panorama Water Tank Monitor — Railway SCADA/HMI</title>
    <link rel="stylesheet" href="./assets/index.css" />
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
  fs.writeFileSync(path.join(distDir, 'index.html'), htmlContent, 'utf8');
}

start().catch((err) => {
  console.error('[DEV SERVER ERROR]', err);
  process.exit(1);
});
