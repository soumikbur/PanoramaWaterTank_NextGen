const http = require('http');

async function getTarget() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9224/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const targets = JSON.parse(data);
        const page = targets.find(t => t.type === 'page');
        if (page) resolve(page);
        else reject(new Error('No page target'));
      });
    }).on('error', reject);
  });
}

async function run() {
  const target = await getTarget();
  console.log('Connecting to:', target.webSocketDebuggerUrl);
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise(r => ws.onopen = r);

  const evalPromise = new Promise((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === 1) {
        resolve(msg.result?.result?.value);
      }
    };
  });

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const doc = document.documentElement;
        const style = window.getComputedStyle(doc);
        return {
          platform: doc.getAttribute('data-platform'),
          device: doc.getAttribute('data-android-device'),
          orientation: doc.getAttribute('data-android-orientation'),
          dpr: doc.getAttribute('data-android-dpr'),
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          cssVars: {
            pagePaddingX: style.getPropertyValue('--android-page-padding-x').trim(),
            cardPadding: style.getPropertyValue('--android-card-padding').trim(),
            cardGap: style.getPropertyValue('--android-card-gap').trim(),
            sectionGap: style.getPropertyValue('--android-section-gap').trim(),
            btnHeight: style.getPropertyValue('--android-btn-height').trim(),
            headerHeight: style.getPropertyValue('--android-header-height').trim(),
            fontPageTitle: style.getPropertyValue('--android-font-page-title').trim(),
            fontBody: style.getPropertyValue('--android-font-body').trim()
          },
          metrics: window.adaptiveUiService ? window.adaptiveUiService.getMetrics() : null
        };
      })()`,
      returnByValue: true
    }
  }));

  const res = await evalPromise;
  console.log('WebView Adaptive Scaling State:\n', JSON.stringify(res, null, 2));
  ws.close();
}

run().catch(console.error);
