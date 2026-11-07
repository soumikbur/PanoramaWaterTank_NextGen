// apps/mobile/scripts/verify_live_e2e_mqtt_stream.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const LIVE_URL = 'https://soumikbur.github.io/PanoramaWaterTank_NextGen/';
const BRAIN_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\07f934a3-112b-4821-90f4-23baf24a9f52\\screenshots';
const LOCAL_DIR = path.resolve(__dirname, '../../screenshots_scada');

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function saveScreenshot(win, filename) {
  const image = await win.webContents.capturePage();
  const buffer = image.toPNG();
  fs.writeFileSync(path.join(BRAIN_DIR, filename), buffer);
  fs.writeFileSync(path.join(LOCAL_DIR, filename), buffer);
  console.log('[SCREENSHOT SAVED]: ' + filename);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
    },
  });

  try {
    console.log('[E2E MQTT] Loading live published website...');
    await win.loadURL(LIVE_URL);
    await sleep(4000);

    // Login
    await win.webContents.executeJavaScript(`
      (() => {
        const quick = document.getElementById('btn-quick-login-employee');
        if (quick) { quick.click(); return; }
        const u = document.getElementById('login-username');
        const p = document.getElementById('login-password');
        const btn = document.querySelector('button[type="submit"]');
        if (u && p && btn) {
          u.value = 'employee';
          u.dispatchEvent(new Event('input', { bubbles: true }));
          p.value = 'Employee@123';
          p.dispatchEvent(new Event('input', { bubbles: true }));
          btn.click();
        }
      })();
    `);
    await sleep(3500);

    console.log('[E2E MQTT] Waiting for MQTT client to connect...');
    await sleep(2000);

    // Publish frame via python script
    console.log('[E2E MQTT] Publishing contract telemetry frame to HiveMQ...');
    const pythonExe = path.resolve(__dirname, '../../../backend/venv/Scripts/python.exe');
    const pyScript = `import paho.mqtt.publish as publish, json
payload = json.dumps({
    'uid': '0023004D4B42501120353332',
    'lat': 22.557279,
    'long': 88.352432,
    'speed': 3.4,
    'time': '12:15:39',
    'cm1': 120.8,
    'cm2': 0.0,
    'wlp1': 12.1,
    'wlp2': 0.0,
    'wlv1': True,
    'wlv2': False,
    'bat': 83.6,
    'chno': 'CR123456',
    'trno': '225256'
})
publish.single('0023004D4B42501120353332', payload, hostname='broker.hivemq.com', port=1883)
`;
    cp.execFileSync(pythonExe, ['-c', pyScript]);
    console.log('[E2E MQTT] Frame published over WAN! Waiting for live WebSocket reception on published site...');
    await sleep(4000);

    // Check DOM on live site
    const telemetryCheck = await win.webContents.executeJavaScript(`
      (() => {
        const txt = document.body.innerText;
        return {
          has12Pct: txt.includes('12%') || txt.includes('12.1%'),
          has120Cm: txt.includes('120.8 cm'),
          has83Bat: txt.includes('83.6%'),
          hasTrain225256: txt.includes('225256'),
          hasCoachCR: txt.includes('CR123456') || txt.includes('C4'),
          hasKolkata: txt.includes('22.557') || txt.includes('22.5573'),
          hasSpeed: txt.includes('3.4 km/h'),
          mqttStatus: document.getElementById('header-mqtt-status-pill')?.innerText,
        };
      })();
    `);
    console.log('[E2E MQTT DOM CHECK ON PUBLISHED SITE]:', JSON.stringify(telemetryCheck, null, 2));

    // Capture screenshots with live telemetry on published site
    console.log('[E2E MQTT] Capturing Full HD 1920x1080 of live telemetry on published site...');
    win.setSize(1920, 1080);
    await sleep(1500);
    await saveScreenshot(win, '04_live_published_site_with_telemetry_1920x1080.png');

    console.log('[E2E MQTT] Capturing Laptop 1366x768 of live telemetry on published site...');
    win.setSize(1366, 768);
    await sleep(1500);
    await saveScreenshot(win, '05_live_published_site_with_telemetry_1366x768.png');

  } catch (err) {
    console.error('[E2E MQTT ERROR]:', err);
  } finally {
    win.close();
    app.quit();
  }
});

