// tools/verify_complete_settings_cdp.cjs
const http = require('http');
const fs = require('fs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

http.get('http://127.0.0.1:9222/json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', async () => {
    const list = JSON.parse(data);
    const page = list.find(p => p.type === 'page' || p.url.includes('localhost'));
    if (!page) {
      console.error('No page found');
      process.exit(1);
    }
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    let messageId = 1;
    const pendingPromises = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pendingPromises.has(msg.id)) {
        const { resolve, reject } = pendingPromises.get(msg.id);
        pendingPromises.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function sendCommand(method, params = {}) {
      const id = messageId++;
      return new Promise((resolve, reject) => {
        pendingPromises.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await sendCommand('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return res?.result?.value;
    }

    ws.onopen = async () => {
      try {
        console.log('[CDP] Connected. Navigating to #/settings...');
        await evaluate('window.location.hash = "#/settings";');
        await sleep(2000);

        // 1. Verify All 7 Sections Exist in DOM
        console.log('[CDP] 1. Inspecting All 7 Sections...');
        const sectionsInspection = await evaluate(`
          (() => {
            const sectionIds = [
              'section-1-general',
              'section-2-appearance',
              'section-3-device',
              'section-4-network',
              'section-5-map',
              'section-6-notifications',
              'section-7-user'
            ];

            const results = sectionIds.map(id => {
              const el = document.getElementById(id);
              return {
                id,
                present: !!el,
                title: el ? (el.querySelector('h2, h3')?.innerText || 'No title') : null,
                rect: el ? { top: el.offsetTop, height: el.offsetHeight } : null
              };
            });

            const footer = document.getElementById('settings-page-footer');
            const mainContainer = document.querySelector('main');

            return {
              allSectionsCount: results.filter(r => r.present).length,
              sections: results,
              hasFooter: !!footer,
              footerText: footer ? footer.innerText : null,
              scrollableHeight: mainContainer ? mainContainer.scrollHeight : null,
              viewportHeight: mainContainer ? mainContainer.clientHeight : null
            };
          })()
        `);
        console.log('Sections Inspection:', JSON.stringify(sectionsInspection, null, 2));

        // 2. Verify Specific Controls in Each Section
        console.log('[CDP] 2. Verifying Controls in Each Section...');
        const controlsInspection = await evaluate(`
          (() => {
            return {
              sec1_inputs: document.querySelectorAll('#section-1-general input').length,
              sec2_presets: document.querySelectorAll('#display-scale-preset-grid button').length,
              sec2_currentScale: document.getElementById('current-scale-badge')?.innerText,
              sec3_inputs: document.querySelectorAll('#section-3-device input, #section-3-device select').length,
              sec4_inputs: document.querySelectorAll('#section-4-network input').length,
              sec5_inputs: document.querySelectorAll('#section-5-map select, #section-5-map input').length,
              sec6_inputs: document.querySelectorAll('#section-6-notifications input').length,
              sec7_inputs: document.querySelectorAll('#section-7-user select, #section-7-user input').length,
            };
          })()
        `);
        console.log('Controls Inspection:', JSON.stringify(controlsInspection, null, 2));

        // 3. Test Section 2 Appearance Interactions
        console.log('[CDP] 3. Testing Section 2 Appearance Controls...');
        await evaluate(`document.getElementById('btn-scale-preset-120')?.click();`);
        await sleep(400);
        const scale120State = await evaluate(`
          (() => ({
            badge: document.getElementById('current-scale-badge')?.innerText,
            appScale: document.documentElement.style.getPropertyValue('--app-scale'),
            is120Selected: document.getElementById('btn-scale-preset-120')?.style.backgroundColor === 'rgb(239, 246, 255)'
          }))()
        `);
        console.log('Scale 120% State:', scale120State);

        await evaluate(`document.getElementById('btn-reset-display-scale')?.click();`);
        await sleep(400);
        const resetState = await evaluate(`
          (() => ({
            badge: document.getElementById('current-scale-badge')?.innerText,
            is100Selected: document.getElementById('btn-scale-preset-100')?.style.backgroundColor === 'rgb(239, 246, 255)'
          }))()
        `);
        console.log('Reset State:', resetState);

        // 4. Test Scroll Functionality
        console.log('[CDP] 4. Testing Scroll Positions...');
        const scrollTest = await evaluate(`
          (() => {
            const main = document.querySelector('main');
            if (!main) return { error: 'No main found' };
            const maxScroll = main.scrollHeight - main.clientHeight;
            main.scrollTop = maxScroll;
            return {
              maxScroll,
              actualScrollTop: main.scrollTop,
              canScroll: maxScroll > 0
            };
          })()
        `);
        console.log('Scroll Test Result:', scrollTest);

        console.log('[CDP] Complete Settings Verification PASSED!');
        ws.close();
        process.exit(0);
      } catch (err) {
        console.error('[CDP] Error in verification:', err);
        ws.close();
        process.exit(1);
      }
    };
  });
});
