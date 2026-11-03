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

async function main() {
  console.log('[*] Checking live production deployment...');
  
  // 1. Root URL
  const root = await check('https://panorama-water-tank-next-gen.vercel.app/');
  console.log('1. Root URL Status:', root.statusCode);
  console.log('   Content-Type:', root.headers['content-type']);
  console.log('   Has <div id="root"></div>:', root.body.includes('id="root"'));
  console.log('   Has index.js script:', root.body.includes('/assets/index.js'));

  // 2. Static Asset JS
  const js = await check('https://panorama-water-tank-next-gen.vercel.app/assets/index.js');
  console.log('2. Asset /assets/index.js Status:', js.statusCode, 'Length:', js.body.length);

  // 3. Static Asset CSS
  const css = await check('https://panorama-water-tank-next-gen.vercel.app/assets/index.css');
  console.log('3. Asset /assets/index.css Status:', css.statusCode, 'Length:', css.body.length);

  // 4. SPA Subroutes
  for (const route of ['/trains', '/devices', '/location', '/settings']) {
    const sub = await check(`https://panorama-water-tank-next-gen.vercel.app${route}`);
    console.log(`4. SPA Route ${route} Status:`, sub.statusCode, 'Has #root:', sub.body.includes('id="root"'));
  }

  // 5. API Health
  const health = await check('https://panorama-water-tank-next-gen.vercel.app/api/v1/health');
  console.log('5. API Health Status:', health.statusCode, 'Body:', health.body.slice(0, 150));

  // 6. API Live Tank
  const tank = await check('https://panorama-water-tank-next-gen.vercel.app/api/v1/tanks/live');
  console.log('6. API Live Tank Status:', tank.statusCode, 'Body:', tank.body.slice(0, 150));

  // 7. Docs Swagger
  const docs = await check('https://panorama-water-tank-next-gen.vercel.app/docs');
  console.log('7. Swagger UI /docs Status:', docs.statusCode, 'Has Swagger:', docs.body.includes('swagger-ui'));
}

main().catch(console.error);
