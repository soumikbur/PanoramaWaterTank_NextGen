// apps/mobile/scripts/dev.cjs
const esbuild = require('esbuild');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const HOST = '127.0.0.1';
const BACKEND_PORT = 8000;
const BACKEND_HOST = '127.0.0.1';

const sseClients = [];

async function start() {
  const distDir = path.resolve(__dirname, '../dist');
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const enableTestLogin = process.env.VITE_ENABLE_TEST_LOGIN !== undefined
    ? process.env.VITE_ENABLE_TEST_LOGIN.trim().toLowerCase() === 'true'
    : true;
  console.log(`[DEV SERVER] Test login shortcuts enabled: ${enableTestLogin}`);

  // Rebuild notification plugin for HMR / live-reload
  const reloadPlugin = {
    name: 'live-reload-notifier',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length > 0) {
          console.error('[DEV SERVER] Build failed with errors:', result.errors);
          return;
        }
        console.log(`[DEV SERVER] Build updated. Notifying ${sseClients.length} active client(s)...`);
        for (const client of sseClients) {
          try {
            client.write('data: reload\n\n');
          } catch (e) {}
        }
      });
    },
  };

  const ctx = await esbuild.context({
    entryPoints: [path.resolve(__dirname, '../src/index.tsx')],
    bundle: true,
    outfile: path.join(assetsDir, 'index.js'),
    format: 'esm',
    alias: {
      'react-native': 'react-native-web',
    },
    banner: {
      js: '(() => { try { new EventSource("/esbuild").onmessage = () => { console.log("[HMR] Reloading..."); location.reload(); }; } catch(e){} })();',
    },
    define: {
      'global': 'window',
      '__DEV__': 'true',
      'process.env.NODE_ENV': '"development"',
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
    sourcemap: true,
    plugins: [reloadPlugin],
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
    // 1. SSE live reload stream
    if (req.url === '/esbuild') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      sseClients.push(res);
      req.on('close', () => {
        const idx = sseClients.indexOf(res);
        if (idx !== -1) sseClients.splice(idx, 1);
      });
      return;
    }

    // 2. Transparent reverse proxy for backend REST API
    if (req.url.startsWith('/api/') || req.url.startsWith('/docs') || req.url.startsWith('/openapi.json')) {
      const proxyReq = http.request(
        {
          hostname: BACKEND_HOST,
          port: BACKEND_PORT,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        }
      );

      proxyReq.on('error', (err) => {
        console.warn(`[DEV PROXY ERROR] Cannot reach backend on port ${BACKEND_PORT}:`, err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Backend unreachable', detail: err.message }));
      });

      req.pipe(proxyReq, { end: true });
      return;
    }

    // 3. Static asset serving
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

  // 4. WebSocket upgrade proxying to backend
  server.on('upgrade', (req, clientSocket, head) => {
    const backendSocket = net.connect(BACKEND_PORT, BACKEND_HOST, () => {
      backendSocket.write(
        `${req.method} ${req.url} HTTP/1.1\r\n` +
          Object.keys(req.headers)
            .map((header) => `${header}: ${req.headers[header]}`)
            .join('\r\n') +
          '\r\n\r\n'
      );
      if (head && head.length > 0) backendSocket.write(head);
      clientSocket.pipe(backendSocket);
      backendSocket.pipe(clientSocket);
    });

    backendSocket.on('error', (err) => {
      console.warn('[DEV WS PROXY ERROR]', err.message);
      clientSocket.destroy();
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`[DEV SERVER] Panorama Water Tank SCADA Console running at http://${HOST}:${PORT}/`);
    console.log(`[DEV SERVER] Hot Reloading enabled via SSE /esbuild`);
    console.log(`[DEV SERVER] Reverse proxying /api and WebSocket to http://${BACKEND_HOST}:${BACKEND_PORT}`);
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
