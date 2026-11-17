const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ADB = 'C:\\Users\\User\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const REPORTS_DIR = path.resolve(__dirname, '../MOBILE_TEST_REPORTS/LOW_RESOURCE_TESTING');
const SCREENSHOTS_DIR = path.join(REPORTS_DIR, 'screenshots');

function runAdb(cmd) {
  return execSync(`"${ADB}" -s emulator-5554 ${cmd}`, { encoding: 'utf8', timeout: 30000 });
}

function captureScreenshot(filename) {
  const localPath = path.join(SCREENSHOTS_DIR, filename);
  runAdb('shell screencap -p /sdcard/temp_screen.png');
  runAdb(`pull /sdcard/temp_screen.png "${localPath}"`);
  console.log(`[SCREENSHOT] Saved: ${filename}`);
  return localPath;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('--- Post-Image Fix Verification on Panorama_ULTRA_LOW_RESOURCE ---');

  // Verify DevTools socket
  const sockOut = runAdb('shell "cat /proc/net/unix | grep devtools"');
  const m = sockOut.match(/@(webview_devtools_remote_\d+)/);
  if (!m) throw new Error('DevTools socket not found');
  console.log('Forwarding DevTools socket:', m[1]);
  runAdb(`forward tcp:9222 localabstract:${m[1]}`);
  await sleep(1000);

  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });

  const pageTarget = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));

  async function evaluate(expr) {
    const id = Math.floor(Math.random() * 1000000);
    return new Promise((resolve, reject) => {
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          resolve(msg.result && msg.result.result ? msg.result.result.value : null);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    });
  }

  // Check login
  console.log('Current URL:', await evaluate('window.location.href'));
  const loginAction = await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Login as Admin'));
      if (btn) {
        btn.click();
        return 'clicked_login';
      }
      return 'already_authenticated';
    })()
  `);
  console.log('Authentication action:', loginAction);
  await sleep(2500);

  // Navigate to Dashboard
  console.log('Navigating to Dashboard (#/dashboard?train=12249)...');
  await evaluate('window.location.hash = "#/dashboard?train=12249"');
  await sleep(2500);
  captureScreenshot('repaired_01_dashboard.png');

  const dashText = await evaluate('document.body.innerText.substring(0, 300)');
  console.log('Dashboard text snippet:\n', dashText);

  // Navigate to Train Management
  console.log('Navigating to Train Management (#/trains)...');
  await evaluate('window.location.hash = "#/trains"');
  await sleep(2000);
  captureScreenshot('repaired_02_trains.png');

  // Navigate to All Tanks
  console.log('Navigating to All Tanks (#/watertank)...');
  await evaluate('window.location.hash = "#/watertank"');
  await sleep(2000);
  captureScreenshot('repaired_03_tanks.png');

  // Measure memory and CPU
  const memOut = runAdb('shell dumpsys meminfo com.panorama.watertankmonitor');
  const totalPss = memOut.match(/TOTAL PSS:\s+(\d+)/i) || memOut.match(/TOTAL\s+(\d+)/i);
  const javaHeap = memOut.match(/Java Heap:\s+(\d+)/i);
  const nativeHeap = memOut.match(/Native Heap:\s+(\d+)/i);

  const cpuOut = runAdb('shell dumpsys cpuinfo');
  const appCpuLine = cpuOut.split('\n').find((l) => l.includes('com.panorama.watertankmonitor'));

  console.log('\n--- Diagnostic Results Post Repair ---');
  console.log(`Total PSS: ${totalPss ? (parseInt(totalPss[1], 10) / 1024).toFixed(2) : 'N/A'} MB`);
  console.log(`Java Heap: ${javaHeap ? (parseInt(javaHeap[1], 10) / 1024).toFixed(2) : 'N/A'} MB`);
  console.log(`Native Heap: ${nativeHeap ? (parseInt(nativeHeap[1], 10) / 1024).toFixed(2) : 'N/A'} MB`);
  console.log(`App CPU: ${appCpuLine ? appCpuLine.trim() : '0% idle'}`);

  ws.close();
  console.log('--- Verification Complete ---');
}

main().catch((err) => {
  console.error('Error in verification:', err);
  process.exit(1);
});
