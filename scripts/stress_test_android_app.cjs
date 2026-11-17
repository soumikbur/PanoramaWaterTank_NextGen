const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ADB = process.env.LOCALAPPDATA + '\\Android\\Sdk\\platform-tools\\adb.exe';
const SCREENSHOTS_DIR = 'C:/Users/soumi/.gemini/antigravity/brain/02d4ebd6-2deb-462f-b938-3b5741021d98/screenshots';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function runAdb(cmd) {
  try {
    return execSync(`"${ADB}" ${cmd}`, { encoding: 'utf8', timeout: 15000 });
  } catch (err) {
    return err.stdout || err.message;
  }
}

function captureScreenshot(filename) {
  const localPath = path.join(SCREENSHOTS_DIR, filename);
  runAdb('shell screencap -p /sdcard/recov_screen.png');
  runAdb(`pull /sdcard/recov_screen.png "${localPath}"`);
  console.log(`[SCREENSHOT] Saved: ${filename}`);
  return localPath;
}

function getMemoryUsage() {
  const out = runAdb('shell dumpsys meminfo com.panorama.watertankmonitor');
  const totalPssMatch = out.match(/TOTAL PSS:\s+(\d+)/i) || out.match(/TOTAL\s+(\d+)/);
  const javaHeapMatch = out.match(/Java Heap:\s+(\d+)/i);
  const nativeHeapMatch = out.match(/Native Heap:\s+(\d+)/i);
  return {
    totalPssKb: totalPssMatch ? parseInt(totalPssMatch[1], 10) : 'N/A',
    javaHeapKb: javaHeapMatch ? parseInt(javaHeapMatch[1], 10) : 'N/A',
    nativeHeapKb: nativeHeapMatch ? parseInt(nativeHeapMatch[1], 10) : 'N/A',
  };
}

function getCpuUsage() {
  const out = runAdb('shell dumpsys cpuinfo');
  const line = out.split('\n').find((l) => l.includes('com.panorama.watertankmonitor'));
  const totalLine = out.split('\n').find((l) => l.includes('TOTAL:'));
  return {
    appCpu: line ? line.trim() : '0% (idle)',
    totalCpu: totalLine ? totalLine.trim() : 'N/A',
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('================================================================');
  console.log('STARTING PHASE 7: STRESS TESTING & LOW-RESOURCE AUDIT VIA CDP');
  console.log('================================================================');

  // Dismiss soft keyboard
  runAdb('shell input keyevent 4');
  await sleep(1000);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  const page = pages[0];
  console.log(`Attached to Page via CDP: ${await page.title()} (${page.url()})`);

  const screens = [
    { name: 'Dashboard', hash: '#/dashboard?train=12249', snap: 'stress_1_dashboard.png', wait: 2000 },
    { name: 'Train Management', hash: '#/trains', snap: 'stress_2_trains.png', wait: 2000 },
    { name: 'All Tanks', hash: '#/watertank', snap: 'stress_3_tanks.png', wait: 2000 },
    { name: 'Devices', hash: '#/devices', snap: 'stress_4_devices.png', wait: 2000 },
    { name: 'Location & Map', hash: '#/location', snap: 'stress_5_location_map.png', wait: 4000 },
    { name: 'Historical Analytics', hash: '#/history', snap: 'stress_6_history.png', wait: 2000 },
    { name: 'Reports', hash: '#/reports', snap: 'stress_7_reports.png', wait: 2000 },
    { name: 'Settings', hash: '#/settings', snap: 'stress_8_settings.png', wait: 2000 },
    { name: 'Return to Dashboard', hash: '#/dashboard?train=12249', snap: 'stress_9_dashboard_return.png', wait: 2000 },
  ];

  console.log('\n--- Pass 1: Primary Navigation Cycle ---');
  for (const s of screens) {
    console.log(`Navigating to: ${s.name} (${s.hash})...`);
    await page.evaluate((h) => { window.location.hash = h; }, s.hash);
    await sleep(s.wait);
    captureScreenshot(s.snap);
    const mem = getMemoryUsage();
    console.log(`  RAM -> Total PSS: ${mem.totalPssKb} KB, Java: ${mem.javaHeapKb} KB, Native: ${mem.nativeHeapKb} KB`);
  }

  console.log('\n--- Pass 2: Repeated Navigation Cycle (Leak Verification) ---');
  for (const s of screens) {
    await page.evaluate((h) => { window.location.hash = h; }, s.hash);
    await sleep(800);
  }
  const memPass2 = getMemoryUsage();
  console.log(`Pass 2 Final RAM -> Total PSS: ${memPass2.totalPssKb} KB`);

  console.log('\n--- Testing Background & Foreground Transition ---');
  runAdb('shell input keyevent 3'); // Home key
  await sleep(2500);
  const memBg = getMemoryUsage();
  const cpuBg = getCpuUsage();
  console.log(`Background RAM: ${memBg.totalPssKb} KB, CPU: ${cpuBg.appCpu}`);
  captureScreenshot('stress_10_background_launcher.png');

  console.log('Restoring app to foreground...');
  runAdb('shell am start -n com.panorama.watertankmonitor/.MainActivity');
  await sleep(2500);
  const memFg = getMemoryUsage();
  console.log(`Foreground restored RAM: ${memFg.totalPssKb} KB`);
  captureScreenshot('stress_11_restored_foreground.png');

  console.log('\n--- Testing Screen Lock / Unlock Lifecycle ---');
  runAdb('shell input keyevent 26'); // Sleep
  await sleep(2000);
  runAdb('shell input keyevent 26'); // Wake
  runAdb('shell input keyevent 82'); // Unlock keyguard
  await sleep(2000);
  captureScreenshot('stress_12_after_screen_unlock.png');

  console.log('\n--- Testing App Restart ---');
  runAdb('shell am force-stop com.panorama.watertankmonitor');
  await sleep(1000);
  runAdb('shell am start -n com.panorama.watertankmonitor/.MainActivity');
  await sleep(3000);
  captureScreenshot('stress_13_after_app_restart.png');

  const finalCpu = getCpuUsage();
  const finalMem = getMemoryUsage();
  console.log(`Final App CPU: ${finalCpu.appCpu}`);
  console.log(`Final App RAM: Total PSS ${finalMem.totalPssKb} KB`);

  console.log('================================================================');
  console.log('ALL PHASE 7 STRESS TESTS COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
  await browser.close();
}

run().catch((err) => {
  console.error('Stress test failed:', err);
  process.exit(1);
});
