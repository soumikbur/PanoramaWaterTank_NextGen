/**
 * Comprehensive Low-Resource Android Stress Testing & Profiling Harness
 * Target: Panorama_ULTRA_LOW_RESOURCE AVD (emulator-5554)
 * Package: com.panorama.watertankmonitor
 */

const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ADB = 'C:\\Users\\User\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const REPORTS_DIR = path.resolve(__dirname, '../MOBILE_TEST_REPORTS/LOW_RESOURCE_TESTING');
const SCREENSHOTS_DIR = path.join(REPORTS_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function runAdb(cmd) {
  try {
    return execSync(`"${ADB}" -s emulator-5554 ${cmd}`, { encoding: 'utf8', timeout: 30000 });
  } catch (err) {
    return (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '') + err.message;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureScreenshot(filename) {
  const localPath = path.join(SCREENSHOTS_DIR, filename);
  runAdb('shell screencap -p /sdcard/temp_screen.png');
  runAdb(`pull /sdcard/temp_screen.png "${localPath}"`);
  console.log(`[SCREENSHOT] Saved: ${filename}`);
  return localPath;
}

function getMemoryUsage() {
  const out = runAdb('shell dumpsys meminfo com.panorama.watertankmonitor');
  const totalPssMatch = out.match(/TOTAL PSS:\s+(\d+)/i) || out.match(/TOTAL\s+(\d+)/i);
  const javaHeapMatch = out.match(/Java Heap:\s+(\d+)/i);
  const nativeHeapMatch = out.match(/Native Heap:\s+(\d+)/i);
  const codeMatch = out.match(/Code:\s+(\d+)/i);
  const stackMatch = out.match(/Stack:\s+(\d+)/i);
  const graphicsMatch = out.match(/Graphics:\s+(\d+)/i);
  const privateDirtyMatch = out.match(/Private Dirty:\s+(\d+)/i);

  return {
    totalPssKb: totalPssMatch ? parseInt(totalPssMatch[1], 10) : 0,
    totalPssMb: totalPssMatch ? (parseInt(totalPssMatch[1], 10) / 1024).toFixed(2) : '0.00',
    javaHeapKb: javaHeapMatch ? parseInt(javaHeapMatch[1], 10) : 0,
    nativeHeapKb: nativeHeapMatch ? parseInt(nativeHeapMatch[1], 10) : 0,
    graphicsKb: graphicsMatch ? parseInt(graphicsMatch[1], 10) : 0,
    codeKb: codeMatch ? parseInt(codeMatch[1], 10) : 0,
    stackKb: stackMatch ? parseInt(stackMatch[1], 10) : 0,
    privateDirtyKb: privateDirtyMatch ? parseInt(privateDirtyMatch[1], 10) : 0,
    raw: out.substring(0, 500),
  };
}

function getCpuUsage() {
  const out = runAdb('shell dumpsys cpuinfo');
  const appLine = out.split('\n').find((l) => l.includes('com.panorama.watertankmonitor'));
  const totalLine = out.split('\n').find((l) => l.includes('TOTAL:'));

  let appPercent = 0;
  if (appLine) {
    const m = appLine.match(/([\d.]+)%\s+[\d]+\/com\.panorama\.watertankmonitor/);
    if (m) appPercent = parseFloat(m[1]);
  }

  return {
    appCpuString: appLine ? appLine.trim() : '0% (idle)',
    appCpuPercent: appPercent,
    totalCpuString: totalLine ? totalLine.trim() : 'N/A',
  };
}

function checkAnrAndCrashes() {
  const exitInfo = runAdb('shell dumpsys activity exit-info com.panorama.watertankmonitor');
  const logcatErrors = runAdb('shell logcat -d -t 100 *:E | grep -i -E "fatal|anr|crash|panorama"');
  return {
    exitInfo: exitInfo.substring(0, 1000),
    recentErrors: logcatErrors.substring(0, 1000),
  };
}

class CdpClient {
  constructor(port = 9222) {
    this.port = port;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    let socketName = null;
    for (let attempt = 1; attempt <= 10; attempt++) {
      const sockOut = runAdb('shell "cat /proc/net/unix | grep devtools"');
      const m = sockOut.match(/@(webview_devtools_remote_\d+)/);
      if (m) {
        socketName = m[1];
        break;
      }
      console.log(`[CDP] Waiting for webview devtools socket (attempt ${attempt}/10)...`);
      await sleep(1000);
    }

    if (!socketName) throw new Error('Could not find active webview_devtools_remote socket');

    console.log(`[CDP] Forwarding tcp:${this.port} to localabstract:${socketName}`);
    runAdb(`forward tcp:${this.port} localabstract:${socketName}`);
    await sleep(800);

    let targets = null;
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        targets = await new Promise((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${this.port}/json`, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => {
              try {
                resolve(JSON.parse(d));
              } catch (e) {
                reject(e);
              }
            });
          });
          req.on('error', reject);
        });
        if (targets && targets.length > 0) break;
      } catch (err) {
        console.log(`[CDP] Waiting for DevTools endpoint (attempt ${attempt}/10)...`);
        await sleep(1000);
      }
    }

    if (!targets || targets.length === 0) throw new Error('No DevTools targets found');

    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found in DevTools JSON endpoint');

    console.log(`[CDP] Connecting to: ${pageTarget.webSocketDebuggerUrl}`);
    this.ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        console.log('[CDP] WebSocket connected successfully');
        resolve();
      };
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const cb = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            cb(msg);
          }
        } catch (e) {
          console.error('[CDP] Error parsing message:', e);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`Timeout waiting for response to ${method} (id ${id})`));
      }, 15000);

      this.callbacks.set(id, (msg) => {
        clearTimeout(timeout);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res && res.result ? res.result.value : null;
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
  }
}

async function main() {
  console.log('========================================================================');
  console.log('STARTING ULTRA-LOW-RESOURCE ANDROID STRESS TESTING SUITE');
  console.log('Device: Panorama_ULTRA_LOW_RESOURCE (emulator-5554)');
  console.log('Specs: 720x1280, 240 DPI, Software GPU, Android 11 (API 30)');
  console.log('========================================================================\n');

  const benchmarkData = {
    testStartTime: new Date().toISOString(),
    device: {
      name: 'Panorama_ULTRA_LOW_RESOURCE',
      abi: 'x86_64',
      androidVersion: runAdb('shell getprop ro.build.version.release').trim(),
      apiLevel: runAdb('shell getprop ro.build.version.sdk').trim(),
      ramTargetMb: 1024,
      vmHeapSize: '128M',
      display: '720x1280 240dpi',
      gpu: 'swiftshader_indirect (software)',
    },
    startupBenchmarks: {},
    profileATests: {},
    profileBTests: {},
    profileCTests: {},
    stressLoopResults: {},
    lifecycleTests: {},
    networkTests: {},
  };

  // Step 1: Benchmark Cold & Warm Startup
  console.log('\n[PHASE 1] Benchmarking Application Startup Times...');
  runAdb('shell am force-stop com.panorama.watertankmonitor');
  await sleep(1500);

  // Cold start
  console.log('Executing Cold Start (am start -W)...');
  const coldStartOut = runAdb('shell am start -W -n com.panorama.watertankmonitor/.MainActivity');
  console.log('Cold Start Output:\n' + coldStartOut);

  const coldTotalMatch = coldStartOut.match(/TotalTime:\s+(\d+)/);
  const coldWaitMatch = coldStartOut.match(/WaitTime:\s+(\d+)/);
  benchmarkData.startupBenchmarks.coldStart = {
    totalTimeMs: coldTotalMatch ? parseInt(coldTotalMatch[1], 10) : 'N/A',
    waitTimeMs: coldWaitMatch ? parseInt(coldWaitMatch[1], 10) : 'N/A',
  };

  await sleep(3000);
  captureScreenshot('01_cold_start_login.png');

  // Warm start (minimize and restore)
  console.log('Executing Warm Start (minimize -> foreground)...');
  runAdb('shell input keyevent 3'); // Home
  await sleep(1500);
  const warmStartOut = runAdb('shell am start -W -n com.panorama.watertankmonitor/.MainActivity');
  const warmTotalMatch = warmStartOut.match(/TotalTime:\s+(\d+)/);
  const warmWaitMatch = warmStartOut.match(/WaitTime:\s+(\d+)/);
  benchmarkData.startupBenchmarks.warmStart = {
    totalTimeMs: warmTotalMatch ? parseInt(warmTotalMatch[1], 10) : 'N/A',
    waitTimeMs: warmWaitMatch ? parseInt(warmWaitMatch[1], 10) : 'N/A',
  };
  console.log(`Cold TotalTime: ${benchmarkData.startupBenchmarks.coldStart.totalTimeMs}ms, Warm TotalTime: ${benchmarkData.startupBenchmarks.warmStart.totalTimeMs}ms`);

  // Step 2: Connect CDP to WebView
  console.log('\n[PHASE 2] Connecting CDP to Web Application...');
  // Find PID of com.panorama.watertankmonitor
  const pidOut = runAdb('shell pidof com.panorama.watertankmonitor').trim();
  const pid = pidOut.split(/\s+/)[0];
  console.log(`Active App PID: ${pid}`);
  runAdb(`forward tcp:9222 localabstract:webview_devtools_remote_${pid}`);
  await sleep(1000);

  const cdp = new CdpClient(9222);
  await cdp.connect();

  // Inspect page title and authenticate
  const pageTitle = await cdp.evaluate('document.title');
  console.log(`Current Page Title: "${pageTitle}"`);

  // Perform quick test admin login if on login screen
  console.log('Performing Admin Authentication...');
  const loginResult = await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const adminBtn = btns.find(b => b.innerText.includes('Login as Admin'));
      if (adminBtn) {
        adminBtn.click();
        return { clicked: true, action: 'Login as Admin' };
      }
      return { clicked: false, currentHash: window.location.hash };
    })()
  `);
  console.log('Login action result:', loginResult);
  await sleep(3000);
  captureScreenshot('02_dashboard_after_auth.png');

  // Step 3: Profile A - Low Resource (2 Cores, Background Limit = 2)
  console.log('\n[PHASE 3] Configuring Profile A: Low Resource (2 Cores, Background Process Limit 2)...');
  runAdb('shell "echo 1 > /sys/devices/system/cpu/cpu1/online"');
  runAdb('shell "settings put global background_process_limit 2"');

  const modules = [
    { name: 'Dashboard', hash: '#/dashboard?train=12249', snap: '03_profileA_dashboard.png', wait: 2500 },
    { name: 'Train Management', hash: '#/trains', snap: '04_profileA_trains.png', wait: 2500 },
    { name: 'All Tanks', hash: '#/watertank', snap: '05_profileA_tanks.png', wait: 2500 },
    { name: 'Devices', hash: '#/devices', snap: '06_profileA_devices.png', wait: 2500 },
    { name: 'Location & GPS Map', hash: '#/location', snap: '07_profileA_location.png', wait: 4000 },
    { name: 'Alerts', hash: '#/alerts', snap: '08_profileA_alerts.png', wait: 2500 },
    { name: 'History & Charts', hash: '#/history', snap: '09_profileA_history.png', wait: 3000 },
    { name: 'Reports', hash: '#/reports', snap: '10_profileA_reports.png', wait: 2500 },
    { name: 'Settings', hash: '#/settings', snap: '11_profileA_settings.png', wait: 2000 },
  ];

  for (const m of modules) {
    console.log(`[Profile A] Navigating to ${m.name} (${m.hash})...`);
    await cdp.evaluate(`window.location.hash = '${m.hash}'`);
    await sleep(m.wait);

    const mem = getMemoryUsage();
    const cpu = getCpuUsage();
    captureScreenshot(m.snap);

    benchmarkData.profileATests[m.name] = {
      hash: m.hash,
      totalPssMb: mem.totalPssMb,
      totalPssKb: mem.totalPssKb,
      javaHeapKb: mem.javaHeapKb,
      nativeHeapKb: mem.nativeHeapKb,
      graphicsKb: mem.graphicsKb,
      cpuPercent: cpu.appCpuPercent,
      cpuString: cpu.appCpuString,
    };
    console.log(`  RAM: ${mem.totalPssMb} MB (PSS) | Graphics: ${(mem.graphicsKb / 1024).toFixed(2)} MB | CPU: ${cpu.appCpuPercent}%`);
  }

  // Step 4: Profile B - Critical Resource (1 Core, Memory Pressure, Background Limit = 1)
  console.log('\n[PHASE 4] Configuring Profile B: Critical Resource (1 Core, Memory Pressure, Background Limit 1)...');
  runAdb('shell "echo 0 > /sys/devices/system/cpu/cpu1/online"');
  runAdb('shell "settings put global background_process_limit 1"');
  runAdb('shell "am send-trim-memory com.panorama.watertankmonitor RUNNING_CRITICAL"');

  const cpu1Status = runAdb('shell cat /sys/devices/system/cpu/cpu1/online').trim();
  console.log(`CPU1 Online State: ${cpu1Status} (0 = Disabled, successfully throttled to 1 core)`);

  for (const m of modules) {
    console.log(`[Profile B] Navigating to ${m.name}...`);
    await cdp.evaluate(`window.location.hash = '${m.hash}'`);
    await sleep(m.wait + 500);

    const mem = getMemoryUsage();
    const cpu = getCpuUsage();
    const snapName = m.snap.replace('profileA', 'profileB');
    captureScreenshot(snapName);

    benchmarkData.profileBTests[m.name] = {
      hash: m.hash,
      totalPssMb: mem.totalPssMb,
      totalPssKb: mem.totalPssKb,
      javaHeapKb: mem.javaHeapKb,
      nativeHeapKb: mem.nativeHeapKb,
      graphicsKb: mem.graphicsKb,
      cpuPercent: cpu.appCpuPercent,
      cpuString: cpu.appCpuString,
    };
    console.log(`  [Profile B] RAM: ${mem.totalPssMb} MB | CPU: ${cpu.appCpuPercent}%`);
  }

  // Step 5: High-Stress Rapid Navigation Loop under Profile B
  console.log('\n[PHASE 5] Executing 8 Rapid Navigation Stress Loops under Profile B (1 Core)...');
  const heavyRoutes = ['#/dashboard?train=12249', '#/watertank', '#/location', '#/history', '#/trains'];
  const startStressMem = getMemoryUsage();

  for (let loop = 1; loop <= 8; loop++) {
    for (const r of heavyRoutes) {
      await cdp.evaluate(`window.location.hash = '${r}'`);
      await sleep(400); // Rapid switching
    }
    console.log(`  Completed Stress Loop ${loop}/8`);
  }

  const endStressMem = getMemoryUsage();
  const endStressCpu = getCpuUsage();
  captureScreenshot('12_after_rapid_stress_loop.png');

  benchmarkData.stressLoopResults = {
    startPssMb: startStressMem.totalPssMb,
    endPssMb: endStressMem.totalPssMb,
    memoryDeltaMb: (parseFloat(endStressMem.totalPssMb) - parseFloat(startStressMem.totalPssMb)).toFixed(2),
    endCpuPercent: endStressCpu.appCpuPercent,
  };
  console.log(`Stress Loop Results: Start ${startStressMem.totalPssMb} MB -> End ${endStressMem.totalPssMb} MB (Delta: ${benchmarkData.stressLoopResults.memoryDeltaMb} MB)`);

  // Step 6: Application Lifecycle & Memory Pressure Resilience
  console.log('\n[PHASE 6] Testing App Backgrounding, Screen Lock, and Recovery...');
  console.log('Sending App to Background (Home key)...');
  runAdb('shell input keyevent 3');
  await sleep(2500);
  const bgMem = getMemoryUsage();
  const bgCpu = getCpuUsage();
  captureScreenshot('13_background_state.png');

  console.log('Simulating System Memory Pressure (TRIM_MEMORY_RUNNING_CRITICAL)...');
  runAdb('shell am send-trim-memory com.panorama.watertankmonitor RUNNING_CRITICAL');
  await sleep(1500);

  console.log('Restoring App to Foreground...');
  runAdb('shell am start -n com.panorama.watertankmonitor/.MainActivity');
  await sleep(2500);
  const fgMem = getMemoryUsage();
  const fgCpu = getCpuUsage();
  captureScreenshot('14_restored_foreground_state.png');

  // Verify WebView is still alive
  let webViewAlive = false;
  try {
    const title = await cdp.evaluate('document.title');
    webViewAlive = !!title;
  } catch (e) {
    webViewAlive = false;
  }
  console.log(`WebView Recovery Status: ${webViewAlive ? 'ALIVE & RESPONSIVE' : 'TERMINATED'}`);

  benchmarkData.lifecycleTests = {
    backgroundPssMb: bgMem.totalPssMb,
    restoredPssMb: fgMem.totalPssMb,
    webViewAliveAfterPressure: webViewAlive,
  };

  // Step 7: Screen Lock / Unlock Lifecycle
  console.log('Simulating Screen Sleep & Wakeup...');
  runAdb('shell input keyevent 26'); // Sleep
  await sleep(1500);
  runAdb('shell input keyevent 26'); // Wake
  runAdb('shell input keyevent 82'); // Unlock keyguard
  await sleep(2000);
  captureScreenshot('15_after_device_unlock.png');

  // Step 8: Network Disconnection & Reconnection
  console.log('\n[PHASE 7] Simulating Network Disconnect and Reconnection...');
  runAdb('shell "svc data disable; svc wifi disable"');
  await sleep(2000);
  const offlineNavResult = await cdp.evaluate(`
    (() => {
      window.location.hash = '#/watertank';
      return { currentUrl: window.location.href, online: navigator.onLine };
    })()
  `);
  console.log('Offline navigation status:', offlineNavResult);
  captureScreenshot('16_network_offline_state.png');

  console.log('Restoring Network Connectivity...');
  runAdb('shell "svc data enable; svc wifi enable"');
  await sleep(3000);
  captureScreenshot('17_network_restored_state.png');

  // Step 9: Restore Normal System Resources (Profile C Baseline)
  console.log('\n[PHASE 8] Restoring Baseline System Configuration (Profile C)...');
  runAdb('shell "echo 1 > /sys/devices/system/cpu/cpu1/online"');
  runAdb('shell "settings put global background_process_limit -1"');
  await sleep(1500);

  await cdp.evaluate(`window.location.hash = '#/dashboard?train=12249'`);
  await sleep(2500);
  const baselineMem = getMemoryUsage();
  const baselineCpu = getCpuUsage();
  captureScreenshot('18_profileC_baseline_recovery.png');

  benchmarkData.profileCTests = {
    name: 'Dashboard (Baseline Steady-State)',
    totalPssMb: baselineMem.totalPssMb,
    totalPssKb: baselineMem.totalPssKb,
    javaHeapKb: baselineMem.javaHeapKb,
    nativeHeapKb: baselineMem.nativeHeapKb,
    graphicsKb: baselineMem.graphicsKb,
    cpuPercent: baselineCpu.appCpuPercent,
  };

  // Check ANRs and Crashes
  const anrReport = checkAnrAndCrashes();
  benchmarkData.crashesAndAnrs = {
    hasAnr: anrReport.exitInfo.includes('ANR'),
    hasCrash: anrReport.exitInfo.includes('CRASH'),
    exitInfoSnippet: anrReport.exitInfo,
  };

  // Step 10: Persist Raw Benchmark Data
  const jsonPath = path.join(REPORTS_DIR, 'benchmark_data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(benchmarkData, null, 2), 'utf8');
  console.log(`\n[COMPLETE] Benchmark data written to: ${jsonPath}`);

  cdp.close();
  return benchmarkData;
}

main().catch((err) => {
  console.error('Fatal execution error in test harness:', err);
  process.exit(1);
});
