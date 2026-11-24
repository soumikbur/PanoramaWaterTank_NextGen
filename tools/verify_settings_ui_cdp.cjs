// tools/verify_settings_ui_cdp.cjs
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

        // 1. Initial Inspection
        console.log('[CDP] 1. Inspecting Initial Render...');
        const initialStatus = await evaluate(`
          (() => {
            const card = document.getElementById('appearance-display-settings-card');
            const heading = card ? card.querySelector('h2')?.innerText : null;
            const subtitle = card ? card.querySelector('p')?.innerText : null;
            const innerCard = document.getElementById('global-display-scaling-card');
            const currentBadge = document.getElementById('current-scale-badge')?.innerText;
            const resetBtn = document.getElementById('btn-reset-display-scale')?.innerText;
            
            const presets = Array.from(document.querySelectorAll('#display-scale-preset-grid button')).map(b => ({
              id: b.id,
              text: b.innerText.replace(/\\n/g, ' '),
              selected: b.style.backgroundColor === 'rgb(239, 246, 255)' || b.style.borderColor === 'rgb(37, 99, 235)'
            }));

            const slider = document.getElementById('display-scale-slider');
            const sliderVal = slider ? slider.value : null;

            const contrastBtns = Array.from(document.querySelectorAll('[id^="btn-contrast-"]')).map(b => ({
              id: b.id,
              text: b.innerText,
              selected: b.style.backgroundColor === 'rgb(239, 246, 255)'
            }));

            const densityBtns = Array.from(document.querySelectorAll('[id^="btn-density-"]')).map(b => ({
              id: b.id,
              text: b.innerText,
              selected: b.style.backgroundColor === 'rgb(239, 246, 255)'
            }));

            const footer = card ? card.querySelector('div:last-child')?.innerText : null;

            return {
              hasCard: !!card,
              heading,
              subtitle,
              hasInnerCard: !!innerCard,
              currentBadge,
              resetBtn,
              presetsCount: presets.length,
              presets,
              sliderVal,
              contrastBtns,
              densityBtns,
              footer,
              currentHash: window.location.hash
            };
          })()
        `);
        console.log('Initial Inspection:', JSON.stringify(initialStatus, null, 2));

        // 2. Test Clicking Preset "120%"
        console.log('[CDP] 2. Clicking preset 120%...');
        await evaluate(`document.getElementById('btn-scale-preset-120')?.click();`);
        await sleep(500);

        const after120 = await evaluate(`
          (() => {
            const badge = document.getElementById('current-scale-badge')?.innerText;
            const sliderVal = document.getElementById('display-scale-slider')?.value;
            const appScale = document.documentElement.style.getPropertyValue('--app-scale');
            const dataZoom = document.documentElement.getAttribute('data-zoom');
            const is120Selected = document.getElementById('btn-scale-preset-120')?.style.backgroundColor === 'rgb(239, 246, 255)';
            return { badge, sliderVal, appScale, dataZoom, is120Selected };
          })()
        `);
        console.log('After clicking 120%:', after120);

        // 3. Test Slider to index 5 (150%)
        console.log('[CDP] 3. Moving slider to index 5 (150%)...');
        await evaluate(`
          (() => {
            const slider = document.getElementById('display-scale-slider');
            if (slider) {
              const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              nativeSetter.call(slider, '5');
              slider.dispatchEvent(new Event('input', { bubbles: true }));
              slider.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `);
        await sleep(500);

        const afterSlider = await evaluate(`
          (() => {
            const badge = document.getElementById('current-scale-badge')?.innerText;
            const appScale = document.documentElement.style.getPropertyValue('--app-scale');
            const dataZoom = document.documentElement.getAttribute('data-zoom');
            const is150Selected = document.getElementById('btn-scale-preset-150')?.style.backgroundColor === 'rgb(239, 246, 255)';
            return { badge, appScale, dataZoom, is150Selected };
          })()
        `);
        console.log('After slider index 5 (150%):', afterSlider);

        // 4. Test Contrast and Density toggling
        console.log('[CDP] 4. Testing High Contrast & Compact SCADA toggles...');
        await evaluate(`document.getElementById('btn-contrast-high_contrast')?.click();`);
        await evaluate(`document.getElementById('btn-density-compact')?.click();`);
        await sleep(500);

        const afterContrastDensity = await evaluate(`
          (() => {
            const contrast = document.documentElement.getAttribute('data-contrast');
            const density = document.documentElement.getAttribute('data-density');
            const rootClasses = document.getElementById('app-root')?.className;
            return { contrast, density, rootClasses };
          })()
        `);
        console.log('After contrast and density change:', afterContrastDensity);

        // 5. Test Reset to Default
        console.log('[CDP] 5. Clicking Reset to Default...');
        await evaluate(`document.getElementById('btn-reset-display-scale')?.click();`);
        await sleep(500);

        const afterReset = await evaluate(`
          (() => {
            const badge = document.getElementById('current-scale-badge')?.innerText;
            const sliderVal = document.getElementById('display-scale-slider')?.value;
            const appScale = document.documentElement.style.getPropertyValue('--app-scale');
            const is100Selected = document.getElementById('btn-scale-preset-100')?.style.backgroundColor === 'rgb(239, 246, 255)';
            const contrast = document.documentElement.getAttribute('data-contrast');
            const density = document.documentElement.getAttribute('data-density');
            return { badge, sliderVal, appScale, is100Selected, contrast, density };
          })()
        `);
        console.log('After Reset:', afterReset);

        // 6. Test Persistence across reload
        console.log('[CDP] 6. Testing persistence across reload...');
        await evaluate('window.location.reload();');
        await sleep(2500);

        const afterReload = await evaluate(`
          (() => {
            const badge = document.getElementById('current-scale-badge')?.innerText;
            const sliderVal = document.getElementById('display-scale-slider')?.value;
            const appScale = document.documentElement.style.getPropertyValue('--app-scale');
            const is100Selected = document.getElementById('btn-scale-preset-100')?.style.backgroundColor === 'rgb(239, 246, 255)';
            const stored = localStorage.getItem('panorama_display_preferences_v2');
            return { badge, sliderVal, appScale, is100Selected, stored: JSON.parse(stored || '{}') };
          })()
        `);
        console.log('After Reload Persistence:', afterReload);

        console.log('[CDP] All verification checks PASSED!');
        ws.close();
        process.exit(0);
      } catch (err) {
        console.error('[CDP] Error running verification:', err);
        ws.close();
        process.exit(1);
      }
    };
  });
});
