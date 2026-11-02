const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  console.log('[*] Testing Live Production Vercel Deployment in Chromium...');
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const errors = [];
  win.webContents.on('console-message', (e, level, msg) => {
    console.log(`[Browser Console L${level}] ${msg}`);
    if (level >= 3) {
      errors.push(msg);
    }
  });

  const targetUrl = 'https://brisk-granite-l88zzc8.tmp.now';
  console.log(`[*] Navigating to ${targetUrl}...`);
  try {
    await win.loadURL(targetUrl);
    console.log('[✓] Page loaded successfully!');
    
    // Wait 3 seconds for React hydration
    await new Promise(r => setTimeout(r, 3000));
    
    const pageTitle = await win.getTitle();
    console.log(`[✓] Page Title: ${pageTitle}`);

    const appState = await win.webContents.executeJavaScript(`
      (() => {
        const root = document.getElementById('root');
        return {
          hasRoot: !!root,
          innerHTMLPreview: root ? root.innerHTML.slice(0, 300) : '',
          currentPath: window.location.pathname,
          currentHash: window.location.hash
        };
      })()
    `);
    console.log('[✓] App State:', JSON.stringify(appState, null, 2));

    // Capture screenshot
    const screenshot = await win.capturePage();
    const screenshotPath = path.resolve(__dirname, '../../WLI_DOCS/audit_screenshots/live_vercel_verified.png');
    require('fs').writeFileSync(screenshotPath, screenshot.toPNG());
    console.log(`[✓] Screenshot saved to: ${screenshotPath}`);

    console.log(`[*] Total Errors: ${errors.length}`);
    app.quit();
  } catch (err) {
    console.error('[!] Navigation failed:', err);
    app.exit(1);
  }
});

