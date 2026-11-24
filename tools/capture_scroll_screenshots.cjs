// tools/capture_scroll_screenshots.cjs
const http = require('http');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const artifactDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\c60316b0-c6df-4d3c-a511-f0bff1054820';
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
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
      const r = await sendCommand('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return r?.result?.value;
    }

    ws.onopen = async () => {
      try {
        console.log('[Capture] Connected to CDP. Navigating to #/settings...');
        await evaluate('window.location.hash = "#/settings";');
        await sleep(1500);

        const scrollPositions = [
          { name: 'settings_scroll_01_top_sec1_2.png', scrollY: 0, label: 'Section 1 (General) & Section 2 (Appearance)' },
          { name: 'settings_scroll_02_sec2_3.png', scrollY: 800, label: 'Section 2 (Appearance Detail) & Section 3 (Device)' },
          { name: 'settings_scroll_03_sec3_4.png', scrollY: 1700, label: 'Section 3 (Calibration) & Section 4 (Network)' },
          { name: 'settings_scroll_04_sec4_5.png', scrollY: 2700, label: 'Section 4 (Ubidots/API) & Section 5 (Map)' },
          { name: 'settings_scroll_05_sec6.png', scrollY: 3800, label: 'Section 6 (Notifications & Critical Alarms)' },
          { name: 'settings_scroll_06_bottom_sec7_footer.png', scrollY: 5500, label: 'Section 7 (User Preferences) & Footer' }
        ];

        for (const item of scrollPositions) {
          console.log(`[Capture] Scrolling to ${item.scrollY}px for ${item.label}...`);
          await evaluate(`
            (() => {
              const main = document.querySelector('main');
              if (main) main.scrollTop = ${item.scrollY};
            })()
          `);
          await sleep(800);

          const localPath = path.join(__dirname, item.name);
          const artifactPath = path.join(artifactDir, item.name);

          execSync(`adb -s emulator-5554 shell screencap -p /sdcard/${item.name}`);
          execSync(`adb -s emulator-5554 pull /sdcard/${item.name} "${localPath}"`);
          fs.copyFileSync(localPath, artifactPath);
          console.log(`[Capture] Successfully saved: ${item.name} (${fs.statSync(localPath).size} bytes)`);
        }

        console.log('[Capture] All 6 scroll position screenshots captured successfully!');
        ws.close();
        process.exit(0);
      } catch (err) {
        console.error('[Capture] Error capturing screenshots:', err);
        ws.close();
        process.exit(1);
      }
    };
  });
});
