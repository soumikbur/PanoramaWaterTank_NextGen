const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:3001/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('panorama_custom_api_url', 'http://127.0.0.1:8000/api/v1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const quick = page.locator('#btn-quick-login-admin');
  if (await quick.isVisible().catch(() => false)) {
    await quick.click();
    await page.waitForTimeout(1500);
  }

  await page.locator('button[data-screen="alerts"]').click();
  await page.waitForTimeout(2000);

  const mainText = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.innerText : document.body.innerText;
  });

  console.log('Main content text:\n', mainText);
  await browser.close();
})();
