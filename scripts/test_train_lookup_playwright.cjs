const path = require('path');
const fs = require('fs');
const { getBrowserSession, closeBrowserSession } = require('../tools/browser_audit/browser_connector.cjs');

const ARTIFACT_DIR = 'C:\\Users\\soumi\\.gemini\\antigravity\\brain\\02d4ebd6-2deb-462f-b938-3b5741021d98\\screenshots';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function run() {
  console.log('[TEST] Launching Chrome to test Train 15120 verification...');
  const session = await getBrowserSession({
    headless: true,
    preferCdp: false,
    viewport: { width: 1280, height: 800 },
  });

  const { page } = session;

  page.on('request', (req) => {
    if (req.url().includes('trains/lookup')) {
      console.log(`[NETWORK REQ] ${req.method()} ${req.url()}`);
      console.log(`[REQ HEADERS] Authorization: ${req.headers()['authorization'] ? 'Present' : 'None'}`);
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('trains/lookup')) {
      console.log(`[NETWORK RES] ${res.status()} ${res.url()}`);
      try {
        const body = await res.json();
        console.log('[NETWORK BODY] Train Name:', body.train_name, '| Status:', body.status, '| Total Coaches:', body.total_coaches);
      } catch (e) {
        console.log('[NETWORK BODY] Non-JSON response');
      }
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[BROWSER ERROR] ${msg.text()}`);
    }
  });

  try {
    console.log('[TEST] Navigating to http://127.0.0.1:8000 ...');
    await page.goto('http://127.0.0.1:8000', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const isLogin = await page.$('#btn-quick-login-admin, input[type="password"]');
    if (isLogin) {
      console.log('[TEST] Clicking Quick Login Admin button...');
      const quickAdmin = await page.$('#btn-quick-login-admin');
      if (quickAdmin) {
        await quickAdmin.click();
      } else {
        await page.fill('input[type="text"]', '@admin');
        await page.fill('input[type="password"]', 'Admin@123');
        await page.click('button[type="submit"]');
      }
      await page.waitForTimeout(2500);
    }

    console.log('[TEST] Authenticated. Opening Add Train modal...');
    await page.evaluate(() => {
      window.location.hash = '#/train-management';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await page.waitForTimeout(1500);

    // Look for Add Train button
    let addBtn = await page.$('[data-testid="add-train-btn"], button:has-text("Add Train"), button:has-text("Add New Train")');
    if (!addBtn) {
      console.log('[TEST] Trying dashboard or employee screens...');
      await page.evaluate(() => {
        window.location.hash = '#/dashboard';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await page.waitForTimeout(1500);
      addBtn = await page.$('[data-testid="add-train-btn"], button:has-text("Add Train")');
    }

    if (addBtn) {
      console.log('[TEST] Found Add Train button, clicking...');
      await addBtn.click();
      await page.waitForTimeout(500);
    }

    // Check if input is ready
    let numInput = await page.$('[data-testid="train-number-input"]');
    if (!numInput) {
      console.log('[TEST] Modal not open yet, inspecting page buttons...');
      const btns = await page.$$('button');
      for (const b of btns) {
        const txt = await b.innerText();
        if (txt.toLowerCase().includes('train')) {
          console.log(`[TEST] Button text: "${txt}"`);
        }
      }
    }

    numInput = await page.waitForSelector('[data-testid="train-number-input"]', { timeout: 5000 });
    console.log('[TEST] Entering train number 15120...');
    await numInput.fill('15120');
    await page.waitForTimeout(300);

    console.log('[TEST] Clicking Verify button...');
    const verifyBtn = await page.waitForSelector('[data-testid="verify-train-btn"]', { timeout: 5000 });
    await verifyBtn.click();

    console.log('[TEST] Waiting for verification completion (button text changes to Re-verify)...');
    await page.waitForSelector('button:has-text("Re-verify")', { timeout: 15000 });

    const statusEl = await page.waitForSelector('[data-testid="train-lookup-status"]', { timeout: 5000 });
    const statusText = await statusEl.innerText();
    console.log(`[TEST] Verification Status: "${statusText.replace(/\n/g, ' ')}"`);

    await page.waitForTimeout(500);
    const trainNameInput = await page.$('input[placeholder*="Express" i], input[data-testid="train-name-input"]');
    const trainName = trainNameInput ? await trainNameInput.inputValue() : '';
    console.log(`[TEST] Populated Train Name: "${trainName}"`);

    const shotPath = path.join(ARTIFACT_DIR, 'train_lookup_15120_verified.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`[TEST] Screenshot captured: ${shotPath}`);

    if (statusText.toLowerCase().includes('verified') || trainName.toLowerCase().includes('janta') || trainName.toLowerCase().includes('express')) {
      console.log('[TEST PASSED] Verification of Train 15120 completed successfully!');
    } else {
      throw new Error(`Train 15120 was not verified as expected. Status: "${statusText}", Name: "${trainName}"`);
    }
  } finally {
    await closeBrowserSession(session);
    console.log('[TEST DONE]');
  }
}

run().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
