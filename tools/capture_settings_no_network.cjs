// tools/capture_settings_no_network.cjs
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
        console.log('[Capture] Connected to CDP. Checking authentication...');
        const currentUrl = await evaluate('window.location.href');
        if (currentUrl.includes('login') || (await evaluate('!localStorage.getItem("panorama_token")'))) {
          console.log('[Capture] On login screen, performing quick admin login...');
          const quickBtn = await evaluate('!!document.getElementById("btn-quick-login-admin")');
          if (quickBtn) {
            await evaluate('document.getElementById("btn-quick-login-admin").click();');
          } else {
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

        console.log('[Capture] Navigating to #/settings...');
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

        const scrollPositions = [
          { name: 'settings_no_network_01_top_sec1_2.png', scrollY: 0, label: 'Section 1 (General) & Section 2 (Appearance)' },
          { name: 'settings_no_network_02_sec2_3.png', scrollY: 750, label: 'Section 2 (Appearance Detail) & Section 3 (Device Config)' },
          { name: 'settings_no_network_03_sec3_4_map.png', scrollY: 1550, label: 'Section 3 directly into Section 4 (Map & Location - No Network gap)' },
          { name: 'settings_no_network_04_sec4_5.png', scrollY: 2250, label: 'Section 4 (Map) into Section 5 (Notifications & Alerts)' },
          { name: 'settings_no_network_05_sec5_6_footer.png', scrollY: 3400, label: 'Section 5 & Section 6 (User Preferences & Profile) and Footer' }
        ];

        for (const item of scrollPositions) {
          console.log(`[Capture] Scrolling to ${item.scrollY}px for ${item.label}...`);
          await evaluate(`
            (() => {
              const main = document.querySelector('main');
              if (main) main.scrollTop = ${item.scrollY};
            })()
          `);
          await sleep(600);

          const localPath = path.join(__dirname, '..', item.name);
          const artifactPath = path.join(artifactDir, item.name);

          execSync(`adb -s emulator-5554 shell screencap -p /sdcard/${item.name}`);
          execSync(`adb -s emulator-5554 pull /sdcard/${item.name} "${localPath}"`);
          fs.copyFileSync(localPath, artifactPath);
          console.log(`[Capture] Successfully saved: ${item.name} (${fs.statSync(localPath).size} bytes)`);
        }

        // Also save primary screenshot settings_screen_no_network.png (reset scroll to top)
        await evaluate(`
          (() => {
            const main = document.querySelector('main');
            if (main) main.scrollTop = 0;
          })()
        `);
        await sleep(500);

        const primaryName = 'settings_screen_no_network.png';
        const primaryLocalPath = path.join(__dirname, '..', primaryName);
        const primaryArtifactPath = path.join(artifactDir, primaryName);
        execSync(`adb -s emulator-5554 shell screencap -p /sdcard/${primaryName}`);
        execSync(`adb -s emulator-5554 pull /sdcard/${primaryName} "${primaryLocalPath}"`);
        fs.copyFileSync(primaryLocalPath, primaryArtifactPath);
        console.log(`[Capture] Successfully saved primary: ${primaryName} (${fs.statSync(primaryLocalPath).size} bytes)`);

        console.log('[Capture] All screenshots captured and copied to artifact directory!');
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
