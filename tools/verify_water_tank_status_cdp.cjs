// tools/verify_water_tank_status_cdp.cjs
const http = require('http');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\c60316b0-c6df-4d3c-a511-f0bff1054820';
const ROOT_DIR = path.resolve(__dirname, '..');

function getDevToolsPages() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function runCDP(wsUrl, fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    function send(method, params = {}) {
      return new Promise((res, rej) => {
        const msgId = id++;
        const handler = (e) => {
          const m = JSON.parse(e.data);
          if (m.id === msgId) {
            ws.removeEventListener('message', handler);
            if (m.error) rej(m.error);
            else res(m.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    ws.onopen = async () => {
      try {
        await fn(send);
        ws.close();
        resolve();
      } catch (err) {
        ws.close();
        reject(err);
      }
    };
    ws.onerror = reject;
  });
}

async function main() {
  console.log('Connecting to DevTools at 127.0.0.1:9222...');
  const pages = await getDevToolsPages();
  const page = pages.find(p => p.type === 'page' || (p.url && p.url.includes('localhost')));
  if (!page) {
    throw new Error('No inspectable Capacitor webview page found!');
  }
  console.log(`Attached to webview page: ${page.title} (${page.url})`);

  await runCDP(page.webSocketDebuggerUrl, async (send) => {
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 1000));

    // 2. Query DOM structure of WaterTankStatusCard and adjacent cards
    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const card = document.querySelector('.scada-tank-status-card');
        const coachCard = document.querySelector('.scada-col-coach');
        const locationCard = document.querySelector('.scada-col-location');
        const header = document.querySelector('.scada-topbar, header');

        if (!card) {
          return { found: false, error: 'scada-tank-status-card not found in DOM', bodyHtmlStart: document.body.innerHTML.substring(0, 500) };
        }

        const headingText = (card.querySelector('.scada-card-title')?.innerText || card.querySelector('.scada-card-title')?.textContent || '').trim();
        const tankCards = card.querySelectorAll('.scada-tank-column');
        const pillBadges = Array.from(card.querySelectorAll('.scada-tank-subheading-pill')).map(el => (el.innerText || el.textContent || '').trim());
        const rulers = card.querySelectorAll('.scada-tank-ruler');
        const wavePaths = card.querySelectorAll('.scada-tank-wave-path');
        const fillPaths = card.querySelectorAll('.scada-tank-water-fill');
        const telemetryPanels = Array.from(card.querySelectorAll('.scada-telemetry-status-panel')).map(el => (el.innerText || el.textContent || '').trim().replace(/\\n/g, ' '));
        const summaryPanel = card.querySelector('.scada-total-water-summary-panel');
        const summaryColumns = summaryPanel ? Array.from(summaryPanel.querySelectorAll('.scada-total-summary-col')).map(el => (el.innerText || el.textContent || '').trim().replace(/\\n/g, ' ')) : [];

        // Check tick markings
        const rulerTicks = Array.from(rulers).map(ruler => {
          return Array.from(ruler.querySelectorAll('.scada-ruler-tick-num')).map(t => (t.textContent || t.innerText || '').trim());
        });

        // Check values in reading panels
        const readingPanels = Array.from(card.querySelectorAll('.scada-tank-readout-card')).map(p => (p.innerText || p.textContent || '').trim().replace(/\\n/g, ' '));

        return {
          found: true,
          headingText,
          hasCoachCardAbove: !!coachCard,
          hasLocationCardBelow: !!locationCard,
          hasHeader: !!header,
          tankColumnCount: tankCards.length,
          pillBadges,
          rulerCount: rulers.length,
          rulerTicks,
          wavePathCount: wavePaths.length,
          fillPathCount: fillPaths.length,
          readingPanels,
          telemetryPanels,
          hasSummaryPanel: !!summaryPanel,
          summaryColumns
        };
      })()`,
      returnByValue: true
    });

    console.log('\n=== Raw Eval Response ===', evalRes);
    const val = evalRes?.result?.value;
    console.log('\n=== DOM Verification Report ===');
    console.log(JSON.stringify(val, null, 2));
    if (!val || !val.found) {
      throw new Error(`Verification failed: ${val ? val.error : 'No evaluation result'}`);
    }

    // Assertions
    if (!val.headingText.includes('Water Tank Status')) {
      throw new Error(`Expected heading to include 'Water Tank Status', got '${val.headingText}'`);
    }
    if (val.tankColumnCount !== 2) {
      throw new Error(`Expected 2 tank columns, found ${val.tankColumnCount}`);
    }
    if (!val.hasCoachCardAbove) {
      console.warn('Warning: Coach info card above was not found');
    }
    if (!val.hasLocationCardBelow) {
      console.warn('Warning: Location card below was not found');
    }
    if (!val.hasSummaryPanel) {
      throw new Error('Total Water Summary panel is missing!');
    }

    console.log('\nAll core assertions passed!');

    // 3. Scroll to top to capture top of dashboard (header + coach info + water tank status top)
    await send('Runtime.evaluate', {
      expression: `(() => {
        const main = document.querySelector('main');
        if (main) main.scrollTop = 0;
      })()`
    });
    await new Promise(r => setTimeout(r, 600));

    execSync('adb -s emulator-5554 shell screencap -p /sdcard/dashboard_after_redesign.png');
    const dashLocal = path.join(ROOT_DIR, 'dashboard_after_redesign.png');
    const dashArtifact = path.join(ARTIFACT_DIR, 'dashboard_after_redesign.png');
    execSync(`adb -s emulator-5554 pull /sdcard/dashboard_after_redesign.png "${dashLocal}"`);
    fs.copyFileSync(dashLocal, dashArtifact);
    console.log(`Saved dashboard_after_redesign.png to ${dashLocal} and ${dashArtifact}`);

    // 4. Scroll specifically to Water Tank Status card to capture the focused approved view
    await send('Runtime.evaluate', {
      expression: `(() => {
        const main = document.querySelector('main');
        const card = document.querySelector('.scada-tank-status-card');
        if (main && card) {
          main.scrollTop = card.offsetTop - 55;
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 800));

    execSync('adb -s emulator-5554 shell screencap -p /sdcard/water_tank_status_approved.png');
    const tankLocal = path.join(ROOT_DIR, 'water_tank_status_approved.png');
    const tankArtifact = path.join(ARTIFACT_DIR, 'water_tank_status_approved.png');
    execSync(`adb -s emulator-5554 pull /sdcard/water_tank_status_approved.png "${tankLocal}"`);
    fs.copyFileSync(tankLocal, tankArtifact);
    console.log(`Saved water_tank_status_approved.png to ${tankLocal} and ${tankArtifact}`);

    // 5. Scroll down slightly to capture the complete Total Water Summary panel and Location card context
    await send('Runtime.evaluate', {
      expression: `(() => {
        const main = document.querySelector('main');
        const card = document.querySelector('.scada-tank-status-card');
        if (main && card) {
          main.scrollTop = card.offsetTop + 180;
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 800));

    execSync('adb -s emulator-5554 shell screencap -p /sdcard/water_tank_status_summary.png');
    const sumLocal = path.join(ROOT_DIR, 'water_tank_status_summary.png');
    const sumArtifact = path.join(ARTIFACT_DIR, 'water_tank_status_summary.png');
    execSync(`adb -s emulator-5554 pull /sdcard/water_tank_status_summary.png "${sumLocal}"`);
    fs.copyFileSync(sumLocal, sumArtifact);
    console.log(`Saved water_tank_status_summary.png to ${sumLocal} and ${sumArtifact}`);
  });
}

main().catch(err => {
  console.error('Verification script failed:', err);
  process.exit(1);
});
