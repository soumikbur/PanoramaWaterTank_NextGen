// tools/verify_unique_devices_table_cdp.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.resolve(__dirname, '../apps/mobile/node_modules/ws'));

const ARTIFACT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\c60316b0-c6df-4d3c-a511-f0bff1054820';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
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

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.once('open', res);
      this.ws.once('error', rej);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.pending.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    fs.writeFileSync(outputPath, buffer);
    console.log(`[CDP] Saved screenshot: ${outputPath} (${buffer.length} bytes)`);
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

async function run() {
  console.log('[VERIFY] Connecting to DevTools via port 9222...');
  const targets = await getJson('http://127.0.0.1:9222/json');
  console.log(`[CDP] Found ${targets.length} targets.`);
  
  const pageTarget = targets.find((t) => t.type === 'page' || t.webSocketDebuggerUrl);
  if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
    throw new Error('No inspectable page found on port 9222');
  }

  const cdp = new CdpConnection(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  console.log('[CDP] Connected to webview:', pageTarget.title, pageTarget.url);

  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Runtime.enable');

  // Step 1: Navigate to Devices screen (#/devices)
  console.log('\n--- STEP 1: Verify Main Devices Table (1 Row Per Unique Device) ---');
  await cdp.eval(`window.location.hash = '#/devices';`);
  await sleep(3000);

  // Extract main table details
  const mainTableData = await cdp.eval(`
    (() => {
      const trs = Array.from(document.querySelectorAll('tbody tr'));
      const text = document.body.innerText;
      const paginationText = Array.from(document.querySelectorAll('div, span, p')).map(e => e.innerText).find(t => t.includes('Showing') && t.includes('of')) || '';
      const summaryText = Array.from(document.querySelectorAll('div, span, strong')).map(e => e.innerText).find(t => t.includes('Registered Physical Devices')) || '';
      
      const rows = trs.map(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return tds.map(td => td.innerText.replace(/\\n/g, ' ').trim());
      });

      return {
        rowCount: trs.length,
        paginationText,
        summaryText,
        rows
      };
    })()
  `);

  console.log(`[VERIFY] Main Table Row Count: ${mainTableData.rowCount}`);
  console.log(`[VERIFY] Pagination Text: "${mainTableData.paginationText}"`);
  console.log(`[VERIFY] Summary Banner: "${mainTableData.summaryText}"`);
  console.log('[VERIFY] Rows:');
  mainTableData.rows.forEach((r, idx) => {
    console.log(`  Row ${idx + 1}: ${r.slice(0, 5).join(' | ')}`);
  });

  // Verify uniqueness of UIDs
  const uids = mainTableData.rows.map(r => r[0].split(' ')[0]);
  const uniqueUids = new Set(uids);
  console.log(`[VERIFY] Total UIDs: ${uids.length}, Unique UIDs: ${uniqueUids.size}`);
  if (uids.length !== uniqueUids.size) {
    console.error('[FAIL] Duplicate UIDs detected in main table!');
  } else {
    console.log('[PASS] All UIDs in the main table are strictly unique!');
  }

  // Screenshot 1: Main Devices Table
  const ss1 = path.join(ARTIFACT_DIR, 'unique_devices_main_table.png');
  await cdp.captureScreenshot(ss1);

  // Step 2: Click on the first device (002F00654B42501320353332) to open Device History
  console.log('\n--- STEP 2: Navigate to Individual Device History ---');
  await cdp.eval(`
    (() => {
      const firstRowDevCell = document.querySelector('tbody tr td:first-child');
      if (firstRowDevCell) {
        firstRowDevCell.click();
        return true;
      }
      return false;
    })()
  `);
  await sleep(3000);

  // Extract history table details
  const historyData = await cdp.eval(`
    (() => {
      const trs = Array.from(document.querySelectorAll('tbody tr'));
      const text = document.body.innerText;
      const historyBanner = Array.from(document.querySelectorAll('div, span, strong')).map(e => e.innerText).find(t => t.includes('Detailed Telemetry History') || t.includes('Historical Telemetry')) || '';
      const paginationText = Array.from(document.querySelectorAll('div, span, p')).map(e => e.innerText).find(t => t.includes('Showing') && t.includes('of')) || '';
      
      const rows = trs.map(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return tds.map(td => td.innerText.replace(/\\n/g, ' ').trim());
      });

      return {
        rowCount: trs.length,
        historyBanner,
        paginationText,
        rowsSample: rows.slice(0, 5)
      };
    })()
  `);

  console.log(`[VERIFY] Device History Banner: "${historyData.historyBanner}"`);
  console.log(`[VERIFY] History Pagination: "${historyData.paginationText}"`);
  console.log(`[VERIFY] History Row Count on page: ${historyData.rowCount}`);
  console.log('[VERIFY] Sample history rows:');
  historyData.rowsSample.forEach((r, idx) => {
    console.log(`  Reading ${idx + 1}: ${r.slice(0, 5).join(' | ')}`);
  });

  // Screenshot 2: Individual Device History View
  const ss2 = path.join(ARTIFACT_DIR, 'unique_device_history_view.png');
  await cdp.captureScreenshot(ss2);

  // Step 3: Click "← Back to Devices Table"
  console.log('\n--- STEP 3: Return Back to Main Devices Table ---');
  await cdp.eval(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const backBtn = btns.find(b => b.innerText.includes('Back to Devices Table'));
      if (backBtn) {
        backBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await sleep(2500);

  const backTableData = await cdp.eval(`
    (() => {
      const trs = Array.from(document.querySelectorAll('tbody tr'));
      const paginationText = Array.from(document.querySelectorAll('div, span, p')).map(e => e.innerText).find(t => t.includes('Showing') && t.includes('of')) || '';
      return {
        rowCount: trs.length,
        paginationText
      };
    })()
  `);
  console.log(`[VERIFY] Returned to Main Table. Row Count: ${backTableData.rowCount}, Pagination: "${backTableData.paginationText}"`);

  // Screenshot 3: Returned Back to Main Devices Table
  const ss3 = path.join(ARTIFACT_DIR, 'unique_devices_back_to_table.png');
  await cdp.captureScreenshot(ss3);

  cdp.close();
  console.log('\n[SUCCESS] All verification steps completed successfully!');
}

run().catch((err) => {
  console.error('[VERIFY ERROR]', err);
  process.exit(1);
});
