const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\soumi\\.gemini\\antigravity\\brain\\02d4ebd6-2deb-462f-b938-3b5741021d98\\chrome_tank_profile';
const screenshotDir = 'C:\\Users\\soumi\\.gemini\\antigravity\\brain\\02d4ebd6-2deb-462f-b938-3b5741021d98\\screenshots';

if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

function getDebuggerUrl(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          if (list && list.length > 0) resolve(list[0].webSocketDebuggerUrl);
          else reject(new Error('No debug page found'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

function sendCdp(ws, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ id, method, params });
    const timer = setTimeout(() => reject(new Error(`Timeout on ${method}`)), 15000);
    
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.off('message', handler);
          clearTimeout(timer);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(payload);
  });
}

async function run() {
  const WebSocket = (await import('ws')).default;
  const cdpPort = 9226;

  console.log('[VERIFY] Launching Chrome CDP on port ' + cdpPort);
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    'http://127.0.0.1:3001/'
  ]);

  let wsUrl = '';
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 600));
    try {
      wsUrl = await getDebuggerUrl(cdpPort);
      if (wsUrl) break;
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error('[VERIFY] Failed to connect to Chrome CDP');
    chrome.kill();
    process.exit(1);
  }

  console.log('[VERIFY] Connected to CDP:', wsUrl);
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  const cdp = (method, params) => sendCdp(ws, method, params, reqId++);

  await cdp('Page.enable');
  await cdp('DOM.enable');
  await cdp('Runtime.enable');

  // Set local storage session
  const demoUser = {
    id: 'emp-001',
    username: '@employee',
    full_name: 'WLI Maintenance Engineer',
    role: 'EMPLOYEE',
    is_active: true
  };

  await cdp('Runtime.evaluate', {
    expression: `
      localStorage.setItem('panorama_token', 'demo-token');
      localStorage.setItem('panorama_demo_user', '${JSON.stringify(demoUser)}');
      localStorage.setItem('panorama_telemetry_timeout_sec', '120');
      window.location.hash = '#/dashboard';
    `
  });

  await new Promise(r => setTimeout(r, 1500));

  // If still on login page, click quick login employee
  await cdp('Runtime.evaluate', {
    expression: `
      const btn = document.querySelector('#btn-quick-login-employee');
      if (btn) btn.click();
    `
  });

  await new Promise(r => setTimeout(r, 2000));

  // Helper to capture screenshot & inspect text
  const inspectAndCapture = async (label, screenHash, selectorToEval) => {
    if (screenHash) {
      await cdp('Runtime.evaluate', { expression: `window.location.hash = '${screenHash}';` });
      await new Promise(r => setTimeout(r, 1500));
    }

    const evalRes = await cdp('Runtime.evaluate', { expression: selectorToEval, returnByValue: true });
    console.log(`[VERIFY ${label}] Metrics:\n`, JSON.stringify(evalRes.result?.value, null, 2));

    const ss = await cdp('Page.captureScreenshot', { format: 'png' });
    const ssPath = path.join(screenshotDir, `verify_${label}.png`);
    fs.writeFileSync(ssPath, Buffer.from(ss.data, 'base64'));
    console.log(`[VERIFY ${label}] Screenshot saved: ${ssPath}`);
    return evalRes.result?.value;
  };

  // 1. Sidebar & Mobile Drawer metrics
  const sidebarData = await inspectAndCapture('01_sidebar_desktop', '#/dashboard', `
    (() => {
      const card = document.querySelector('#sidebar-train-summary-card');
      if (!card) return 'Card not found';
      return {
        text: card.innerText.replace(/\\s+/g, ' ').trim()
      };
    })()
  `);

  // 2. Mobile viewport (390x844) Train Summary Card
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 1000));

  const mobileDashboardData = await inspectAndCapture('02_mobile_dashboard', null, `
    (() => {
      const summaryCards = Array.from(document.querySelectorAll('div')).filter(d => d.innerText && d.innerText.includes('TRAIN SUMMARY') && d.innerText.includes('Total Coaches'));
      const text = summaryCards.length > 0 ? summaryCards[0].innerText.replace(/\\s+/g, ' ').trim() : 'Summary not found';
      return { text };
    })()
  `);

  // 3. All Tanks Screen (390x844)
  const allTanksData = await inspectAndCapture('03_all_tanks_screen', '#/watertank', `
    (() => {
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.replace(/\\s+/g, ' ').trim());
      const filterPills = buttons.filter(t => t.includes('All') || t.includes('Online') || t.includes('Offline') || t.includes('Low Level'));
      return { filterPills };
    })()
  `);

  // 4. Train Management Screen
  const trainsData = await inspectAndCapture('04_trains_management', '#/trains', `
    (() => {
      const regionCards = Array.from(document.querySelectorAll('h3')).map(h => h.innerText);
      const onlineTexts = Array.from(document.querySelectorAll('div, span')).filter(e => e.innerText && e.innerText.includes('Online Trains:')).map(e => e.innerText.trim());
      return { regionCards, onlineTexts: Array.from(new Set(onlineTexts)) };
    })()
  `);

  // 5. Device Mapping Screen
  const deviceMappingData = await inspectAndCapture('05_device_mapping', '#/devices', `
    (() => {
      const cards = Array.from(document.querySelectorAll('div')).filter(d => d.innerText && d.innerText.includes('CONSIST TANKS') || d.innerText && d.innerText.includes('OFFLINE NODES'));
      const headerText = document.querySelector('h1')?.innerText;
      const timeoutSelect = document.querySelector('select')?.value;
      return { headerText, timeoutSelect };
    })()
  `);

  // 6. Coach Details Screen
  const coachData = await inspectAndCapture('06_coach_details', '#/coach-details', `
    (() => {
      const statusDiv = Array.from(document.querySelectorAll('div')).filter(d => d.innerText && d.innerText.includes('DEVICE STATUS'));
      return { statusText: statusDiv.length > 0 ? statusDiv[0].innerText.replace(/\\s+/g, ' ').trim() : 'Not found' };
    })()
  `);

  ws.close();
  chrome.kill();
  console.log('[VERIFY] Complete.');
}

run().catch(err => {
  console.error('[VERIFY ERROR]', err);
  process.exit(1);
});

