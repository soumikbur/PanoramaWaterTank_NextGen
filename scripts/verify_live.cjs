const https = require('https');

function check(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data
      }));
    });
    req.on('error', reject);
  });
}

const BASE_URL = 'https://soumikbur.github.io/PanoramaWaterTank_NextGen';

async function main() {
  console.log('[*] Checking live GitHub Pages deployment...');

  // 1. Root URL
  const root = await check(`${BASE_URL}/`);
  console.log('1. Root URL Status:', root.statusCode);
  console.log('   Content-Type:', root.headers['content-type']);
  console.log('   Has <div id="root"></div>:', root.body.includes('id="root"'));
  console.log('   Has index.js script:', root.body.includes('./assets/index.js'));

  // 2. Static Asset JS
  const js = await check(`${BASE_URL}/assets/index.js`);
  console.log('2. Asset /assets/index.js Status:', js.statusCode, 'Length:', js.body.length);

  // 3. Static Asset CSS
  const css = await check(`${BASE_URL}/assets/index.css`);
  console.log('3. Asset /assets/index.css Status:', css.statusCode, 'Length:', css.body.length);

  // 4. Service Worker & SPA 404 Fallback
  const sw = await check(`${BASE_URL}/sw.js`);
  console.log('4. Asset /sw.js Status:', sw.statusCode, 'Length:', sw.body.length);

  const fallback = await check(`${BASE_URL}/404.html`);
  console.log('5. SPA Fallback /404.html Status:', fallback.statusCode, 'Has pathSegmentsToKeep:', fallback.body.includes('pathSegmentsToKeep'));
}

main().catch(console.error);
