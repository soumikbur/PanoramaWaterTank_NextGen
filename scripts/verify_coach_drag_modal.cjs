/**
 * Live Verification Script:
 * Opens Coach Fleet & Consist Editing panel and Edit Coach modal in Google Chrome via CDP.
 * Captures high-res screenshots for visual verification.
 */

const cp = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9223;
const APP_URL = 'http://127.0.0.1:8000/#/dashboard';
const ARTIFACT_DIR = path.resolve('C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots');

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
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

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (this.onMessage) this.onMessage(msg);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result ? res.result.value : undefined;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  console.log('[*] Launching Chrome on port ' + DEBUG_PORT + '...');
  const chromeProcess = cp.spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + path.resolve(__dirname, '../.chrome-test-profile-coach'),
    'about:blank',
  ]);

  let connected = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const list = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      if (list && list.length > 0) {
        connected = true;
        break;
      }
    } catch (e) {}
  }

  if (!connected) {
    console.error('Failed to connect to Chrome debugging port.');
    chromeProcess.kill();
    process.exit(1);
  }

  const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('DOM.enable');
  await client.send('Log.enable');

  client.onMessage = (msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Exception]', JSON.stringify(msg.params?.exceptionDetails));
    }
    if (msg.method === 'Log.entryAdded') {
      console.log('[Browser Log]', msg.params?.entry?.text);
    }
  };

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 850,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log('[*] Navigating to ' + APP_URL + '...');
  await client.send('Page.navigate', { url: APP_URL });
  await sleep(3500);

  // Authenticate as Admin via REST API
  console.log('[*] Logging in via real REST API /auth/login...');
  const loginRes = await client.eval(`
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: '@admin', password: 'Admin@123' })
        });
        const data = await res.json();
        if (data.access_token) {
          localStorage.setItem('panorama_token', data.access_token);
          return { success: true, token: data.access_token.slice(0, 15) + '...' };
        }
        return { success: false, data };
      } catch (e) {
        return { success: false, error: e.message };
      }
    })()
  `);
  console.log('[*] Login API result:', loginRes);

  console.log('[*] Navigating to #/coaches?train=12841...');
  await client.send('Page.navigate', { url: 'http://127.0.0.1:8000/#/coaches?train=12841' });
  await sleep(5000);

  // Navigate to Coach Details / open Manage Coach Modal
  console.log('[*] Opening Manage Coach Modal (Coach Fleet & Consist Editing)...');
  const pageDebug = await client.eval(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText?.trim(),
        title: b.getAttribute('title')
      }));
      return {
        hash: window.location.hash,
        title: document.title,
        bodySnippet: document.body.innerText.slice(0, 300),
        buttons: btns
      };
    })()
  `);
  console.log('[*] Page Debug Info:', JSON.stringify(pageDebug, null, 2));

  const opened = await client.eval(`
    (() => {
      const editBtn = Array.from(document.querySelectorAll('button')).find(b => 
        (b.getAttribute('title') && b.getAttribute('title').includes('Edit Coaches & Consist')) ||
        (b.textContent && b.textContent.includes('Edit Coaches & Consist'))
      );
      if (editBtn) {
        editBtn.click();
        return 'CLICKED_EDIT_COACHES_BTN';
      }
      return 'BTN_NOT_FOUND';
    })()
  `);
  console.log('[*] Button click status:', opened);
  await sleep(2500);
  await sleep(2500);

  const modalOpened = await client.eval(`
    (() => {
      const overlay = document.querySelector('[data-testid="manage-coach-overlay"]');
      const allModals = Array.from(document.querySelectorAll('[role="dialog"], [data-testid*="modal"], [data-testid*="overlay"]')).map(m => m.getAttribute('data-testid') || m.className);
      return {
        hasOverlay: Boolean(overlay),
        allModals: allModals,
        bodyHtmlSnippet: document.body.innerHTML.slice(-800)
      };
    })()
  `);
  console.log('[*] Manage Coach Modal inspect:', JSON.stringify(modalOpened, null, 2));
  assert.strictEqual(modalOpened?.hasOverlay, true, 'Manage Coach Modal overlay must be visible');

  // Verify Drag Handles exist in the DOM
  const dragHandlesCount = await client.eval(`
    (() => {
      const handles = document.querySelectorAll('[data-testid^="drag-handle-"]');
      return handles.length;
    })()
  `);
  console.log('[*] Drag handles found in POS column:', dragHandlesCount);
  assert.ok(dragHandlesCount > 0, 'At least one coach drag handle must be present');

  // Capture screenshot of Coach Fleet & Consist Editing panel with Drag Handles
  const ss1 = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'coach_fleet_reorder_panel.png'), Buffer.from(ss1.data, 'base64'));
  console.log('[*] Saved screenshot: coach_fleet_reorder_panel.png');

  // Click on the first coach's "Edit" button to open Edit Coach sub-modal
  console.log('[*] Clicking Edit Coach on first coach row...');
  const editSubModalOpened = await client.eval(`
    (() => {
      const editBtn = document.querySelector('button[title*="Edit Coach Parameters"]') || 
                      document.querySelector('button[title*="Edit Coach"]');
      if (editBtn) {
        editBtn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('[*] Edit Sub-modal opened:', editSubModalOpened);
  await sleep(2000);

  // Verify that "Assigned Hardware Device UID" is NOT in the DOM
  const deviceUidSectionStatus = await client.eval(`
    (() => {
      const modalEl = document.querySelector('[data-testid="manage-coach-overlay"]') || document.body;
      const modalText = modalEl.innerText;
      const hasDeviceUid = modalText.includes('Assigned Hardware Device UID') || modalText.includes('Hardware Device UID');
      const hasUnassignedNode = modalText.includes('Choose Unassigned Node');
      const hasMqttTopic = modalText.includes('MQTT Telemetry Topic');
      const coachInput = document.querySelector('input[placeholder*="C1, B1"]');
      const isReadOnly = coachInput ? coachInput.disabled : false;
      const coachCategorySelect = Boolean(document.querySelector('select'));
      const tankInputs = document.querySelectorAll('input[type="number"]');

      return {
        hasDeviceUid,
        hasUnassignedNode,
        hasMqttTopic,
        isCoachIdReadOnly: isReadOnly,
        hasCategorySelect: coachCategorySelect,
        tankInputCount: tankInputs.length
      };
    })()
  `);
  console.log('[*] Edit Coach DOM Check:', JSON.stringify(deviceUidSectionStatus));

  assert.strictEqual(deviceUidSectionStatus.hasDeviceUid, false, 'Assigned Hardware Device UID MUST NOT be present in Edit Coach');
  assert.strictEqual(deviceUidSectionStatus.hasUnassignedNode, false, 'Choose Unassigned Node dropdown MUST NOT be present in Edit Coach');
  assert.strictEqual(deviceUidSectionStatus.hasMqttTopic, false, 'MQTT Telemetry Topic MUST NOT be present in Edit Coach');
  assert.strictEqual(deviceUidSectionStatus.isCoachIdReadOnly, true, 'Coach Identifier must be read-only in Edit Coach');
  assert.ok(deviceUidSectionStatus.tankInputCount >= 4, 'Must have tank height and capacity input fields');

  // Capture screenshot of Edit Coach modal
  const ss2 = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'coach_edit_modal_no_device.png'), Buffer.from(ss2.data, 'base64'));
  console.log('[*] Saved screenshot: coach_edit_modal_no_device.png');

  console.log('\n🎉 ALL LIVE VERIFICATION CHECKS COMPLETED SUCCESSFULLY!');
  client.close();
  chromeProcess.kill();
}

main().catch((err) => {
  console.error('[!] Error in verification:', err);
  process.exit(1);
});
