const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
  });

  win.webContents.on('console-message', (e, level, msg, line, src) => {
    console.log(`[RENDERER CONSOLE ${level}] ${msg} (${src}:${line})`);
  });

  await win.loadURL('http://127.0.0.1:3001');
  await new Promise((r) => setTimeout(r, 2000));

  // If login screen is showing, log in
  const isLogin = await win.webContents.executeJavaScript(`!!document.querySelector('#login-username')`);
  console.log('Is on login screen:', isLogin);
  if (isLogin) {
    await win.webContents.executeJavaScript(`document.querySelector('#btn-quick-admin').click();`);
    await new Promise((r) => setTimeout(r, 300));
    await win.webContents.executeJavaScript(`document.querySelector('button[type="submit"]').click();`);
    await new Promise((r) => setTimeout(r, 2500));
  }

  console.log('Now on page. Current screen text:', await win.webContents.executeJavaScript(`document.body.innerText.slice(0, 100).replace(/\\n+/g, ' ')`));

  console.log('Clicking Alerts navigation button...');
  const clickRes = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('button[data-screen="alerts"]');
      if (btn) {
        btn.click();
        return 'Found and clicked alerts button';
      }
      return 'Alerts button not found';
    })()
  `);
  console.log('Click result:', clickRes);

  await new Promise((r) => setTimeout(r, 2000));

  const bodySnippet = await win.webContents.executeJavaScript(`document.body.innerText.slice(0, 300).replace(/\\n+/g, ' ')`);
  console.log('After clicking alerts body text:', bodySnippet);

  const image = await win.capturePage();
  const filePath = path.join(__dirname, '..', '..', 'WLI_DOCS', 'audit_screenshots', 'test_alerts_capture.png');
  fs.writeFileSync(filePath, image.toPNG());
  console.log('Saved screenshot. Size:', fs.statSync(filePath).size);

  app.quit();
});

