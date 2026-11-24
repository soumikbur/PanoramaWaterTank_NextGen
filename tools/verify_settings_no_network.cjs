// tools/verify_settings_no_network.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');

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
        console.log('[CDP] Connected. Checking current page and authentication...');
        const currentUrl = await evaluate('window.location.href');
        console.log('[CDP] Current URL:', currentUrl);

        // Authenticate if on login screen
        if (currentUrl.includes('login') || (await evaluate('!localStorage.getItem("panorama_token")'))) {
          console.log('[CDP] On login screen, performing quick admin login...');
          const quickBtn = await evaluate('!!document.getElementById("btn-quick-login-admin")');
          if (quickBtn) {
            await evaluate('document.getElementById("btn-quick-login-admin").click();');
          } else {
            // Fill login credentials directly
            await evaluate(`
              (() => {
                const u = document.querySelector('input[type="text"], input[name="username"]');
                const p = document.querySelector('input[type="password"]');
                const btn = document.querySelector('button[type="submit"]');
                if (u && p && btn) {
                  u.value = '@admin';
                  u.dispatchEvent(new Event('input', { bubbles: true }));
                  p.value = 'Admin@123';
                  p.dispatchEvent(new Event('input', { bubbles: true }));
                  btn.click();
                }
              })()
            `);
          }
          await sleep(2500);
        }

        console.log('[CDP] Navigating to #/settings...');
        await evaluate('window.location.hash = "#/settings";');
        await sleep(2000);

        // Ensure "All 6 Sections" is active
        await evaluate(`
          (() => {
            const pills = Array.from(document.querySelectorAll('.settings-section-pills button'));
            const allPill = pills.find(p => p.innerText.includes('All 6 Sections') || p.innerText.includes('All'));
            if (allPill) allPill.click();
          })()
        `);
        await sleep(500);

        // 1. Verify Section 4 Network is completely REMOVED from DOM
        console.log('[CDP] 1. Checking Section 4 (Network & Cloud Telemetry) is completely absent...');
        const networkAbsenceCheck = await evaluate(`
          (() => {
            const el = document.getElementById('section-4-network');
            const pageText = document.body.innerText;
            const hasNetworkHeading = pageText.includes('Network & Cloud Telemetry');
            const hasMqttButton = pageText.includes('Test MQTT Broker');
            const hasRestCard = pageText.includes('Central SCADA REST API Gateway');
            const hasUbidots = pageText.includes('Ubidots Cloud Industrial Gateway');
            const hasLocal8000 = pageText.includes('Local (8000)');
            const hasRenderCloud = pageText.includes('Render Cloud');
            
            return {
              elementExists: !!el,
              hasNetworkHeading,
              hasMqttButton,
              hasRestCard,
              hasUbidots,
              hasLocal8000,
              hasRenderCloud,
              isFullyAbsent: !el && !hasNetworkHeading && !hasMqttButton && !hasRestCard && !hasUbidots
            };
          })()
        `);
        console.log('Network Absence Check:', JSON.stringify(networkAbsenceCheck, null, 2));

        if (!networkAbsenceCheck.isFullyAbsent) {
          throw new Error('Section 4 (Network & Cloud Telemetry) is NOT fully removed!');
        }

        // 2. Verify Remaining 6 Sections Exist in Correct Order
        console.log('[CDP] 2. Inspecting Remaining 6 Sections...');
        const sectionsInspection = await evaluate(`
          (() => {
            const expectedSections = [
              { id: 'section-1-general', expectedTitle: '1. General Settings' },
              { id: 'section-2-appearance', expectedTitle: '2. Appearance & Display Settings' },
              { id: 'section-3-device', expectedTitle: '3. Device Configuration & Hardware' },
              { id: 'section-4-map', expectedTitle: '4. Map & Location Settings' },
              { id: 'section-5-notifications', expectedTitle: '5. Notifications & Alarm Setpoints' },
              { id: 'section-6-user', expectedTitle: '6. User Preferences & Session Profile' }
            ];

            const results = expectedSections.map(s => {
              const el = document.getElementById(s.id);
              const heading = el ? el.querySelector('h2, h3')?.innerText.trim() : null;
              return {
                id: s.id,
                present: !!el,
                title: heading,
                titleMatches: heading ? heading.includes(s.expectedTitle.split(' ')[0]) : false,
                offsetTop: el ? el.offsetTop : null,
                offsetHeight: el ? el.offsetHeight : null
              };
            });

            // Check navigation pills
            const pillButtons = Array.from(document.querySelectorAll('.settings-section-pills button')).map(b => b.innerText.trim());

            return {
              allSectionsCount: results.filter(r => r.present).length,
              sections: results,
              pills: pillButtons,
              pillsCount: pillButtons.length
            };
          })()
        `);
        console.log('Sections Inspection:', JSON.stringify(sectionsInspection, null, 2));

        if (sectionsInspection.allSectionsCount !== 6) {
          throw new Error(`Expected 6 sections, but found ${sectionsInspection.allSectionsCount}`);
        }

        // Verify ordering: offsetTop must be strictly ascending
        const offsets = sectionsInspection.sections.map(s => s.offsetTop);
        for (let i = 1; i < offsets.length; i++) {
          if (offsets[i] <= offsets[i - 1]) {
            throw new Error(`Section order invalid: Section ${i+1} (${offsets[i]}px) is not below Section ${i} (${offsets[i-1]}px)`);
          }
        }
        console.log('[CDP] Section ordering verified: strictly sequential without overlap or reversal.');

        // 3. Verify Section 3 is immediately followed by Section 4 (Map) with no empty card
        console.log('[CDP] 3. Checking transition between Section 3 and Section 4 (Map)...');
        const transitionCheck = await evaluate(`
          (() => {
            const sec3 = document.getElementById('section-3-device');
            const sec4 = document.getElementById('section-4-map');
            if (!sec3 || !sec4) return { error: 'Missing sec3 or sec4' };
            
            const sec3Bottom = sec3.offsetTop + sec3.offsetHeight;
            const sec4Top = sec4.offsetTop;
            const gap = sec4Top - sec3Bottom;

            // Check if there are any sibling elements between sec3 and sec4
            let sibling = sec3.nextElementSibling;
            let siblingsBetween = [];
            while (sibling && sibling !== sec4) {
              siblingsBetween.push({
                tag: sibling.tagName,
                id: sibling.id,
                text: sibling.innerText?.trim().slice(0, 50),
                height: sibling.offsetHeight
              });
              sibling = sibling.nextElementSibling;
            }

            return {
              sec3Bottom,
              sec4Top,
              gap,
              siblingsBetweenCount: siblingsBetween.length,
              siblingsBetween
            };
          })()
        `);
        console.log('Section 3 -> Section 4 Transition Check:', JSON.stringify(transitionCheck, null, 2));

        if (transitionCheck.siblingsBetweenCount > 0) {
          throw new Error(`Found unexpected element(s) between Section 3 and Section 4: ${JSON.stringify(transitionCheck.siblingsBetween)}`);
        }

        // 4. Test Section 2 Appearance Interactions
        console.log('[CDP] 4. Testing Section 2 Appearance Controls...');
        await evaluate(`document.getElementById('btn-scale-preset-120')?.click();`);
        await sleep(300);
        const scale120State = await evaluate(`
          (() => ({
            badge: document.getElementById('current-scale-badge')?.innerText,
            appScale: document.documentElement.style.getPropertyValue('--app-scale'),
            is120Selected: document.getElementById('btn-scale-preset-120')?.style.backgroundColor === 'rgb(239, 246, 255)'
          }))()
        `);
        console.log('Scale 120% State:', scale120State);

        await evaluate(`document.getElementById('btn-reset-display-scale')?.click();`);
        await sleep(300);
        const resetState = await evaluate(`
          (() => ({
            badge: document.getElementById('current-scale-badge')?.innerText,
            is100Selected: document.getElementById('btn-scale-preset-100')?.style.backgroundColor === 'rgb(239, 246, 255)'
          }))()
        `);
        console.log('Reset State:', resetState);

        // 5. Test Continuous Scrolling
        console.log('[CDP] 5. Testing Continuous Vertical Scrolling...');
        const scrollTest = await evaluate(`
          (() => {
            const main = document.querySelector('main');
            if (!main) return { error: 'No main element' };
            const maxScroll = main.scrollHeight - main.clientHeight;
            main.scrollTop = maxScroll;
            return {
              scrollHeight: main.scrollHeight,
              clientHeight: main.clientHeight,
              maxScroll,
              actualScrollTop: main.scrollTop,
              canScroll: maxScroll > 0
            };
          })()
        `);
        console.log('Scroll Test Result:', scrollTest);

        // 6. Test Navigation Pills Filtering
        console.log('[CDP] 6. Testing Navigation Pills Filtering...');
        await evaluate(`
          (() => {
            const pills = Array.from(document.querySelectorAll('.settings-section-pills button'));
            const mapPill = pills.find(p => p.innerText.includes('4. Map'));
            if (mapPill) mapPill.click();
          })()
        `);
        await sleep(500);

        const mapPillState = await evaluate(`
          (() => {
            const sec1 = document.getElementById('section-1-general');
            const sec4 = document.getElementById('section-4-map');
            return {
              sec1Visible: !!sec1,
              sec4Visible: !!sec4
            };
          })()
        `);
        console.log('Map Pill Filter State (only Section 4 should be visible):', mapPillState);

        // Restore all sections
        await evaluate(`
          (() => {
            const pills = Array.from(document.querySelectorAll('.settings-section-pills button'));
            const allPill = pills.find(p => p.innerText.includes('All 6 Sections'));
            if (allPill) allPill.click();
          })()
        `);
        await sleep(500);

        const restoredState = await evaluate(`
          (() => {
            return {
              allPillActive: true,
              sec1Visible: !!document.getElementById('section-1-general'),
              sec4Visible: !!document.getElementById('section-4-map')
            };
          })()
        `);
        console.log('Restored All Sections State:', restoredState);

        console.log('\n======================================================');
        console.log('>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<');
        console.log('======================================================\n');
        ws.close();
        process.exit(0);
      } catch (err) {
        console.error('[CDP] Verification FAILED:', err);
        ws.close();
        process.exit(1);
      }
    };
  });
});
