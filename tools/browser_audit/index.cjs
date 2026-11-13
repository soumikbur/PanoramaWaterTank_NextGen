/**
 * Reusable Chrome DevTools Protocol & Playwright Browser Audit Tool
 * 
 * Master Orchestrator:
 * - Direct CDP attachment or dedicated Google Chrome instance
 * - Full Console, Network, and WebSocket monitoring
 * - Automated multi-route page stability verification
 * - Generates comprehensive JSON and Markdown audit logs in WLI_DOCS/browser_debug_logs/
 */

const path = require('path');
const fs = require('fs');
const { getBrowserSession, closeBrowserSession, probeCdpPort, DEFAULT_CDP_URL } = require('./browser_connector.cjs');
const { ConsoleMonitor } = require('./console_monitor.cjs');
const { NetworkMonitor } = require('./network_monitor.cjs');
const { WebSocketMonitor } = require('./websocket_monitor.cjs');
const { PageTester } = require('./page_tester.cjs');

const DEFAULT_TARGET_URL = 'https://soumikbur.github.io/PanoramaWaterTank_NextGen/';
const DEFAULT_LOG_DIR = path.resolve(__dirname, '../../WLI_DOCS/browser_debug_logs');

// CLI Argument Parser
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    targetUrl: DEFAULT_TARGET_URL,
    preferCdp: true,
    cdpUrl: DEFAULT_CDP_URL,
    headless: true,
    fullAudit: true,
    outDir: DEFAULT_LOG_DIR,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) {
      options.targetUrl = args[++i];
    } else if (arg === '--cdp' && args[i + 1]) {
      options.cdpUrl = args[++i];
    } else if (arg === '--no-cdp') {
      options.preferCdp = false;
    } else if (arg === '--headless') {
      options.headless = args[i + 1] === 'false' ? false : true;
      if (args[i + 1] === 'false' || args[i + 1] === 'true') i++;
    } else if (arg === '--headed') {
      options.headless = false;
    } else if (arg === '--out' && args[i + 1]) {
      options.outDir = path.resolve(args[++i]);
    } else if (arg === '--quick') {
      options.fullAudit = false;
    }
  }

  return options;
}

/**
 * Runs a complete browser audit.
 */
async function runBrowserAudit(options = {}) {
  const opts = { ...parseArgs(), ...options };
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log('='.repeat(70));
  console.log(`[PANORAMA SCADA BROWSER DEVTOOLS AUDIT]`);
  console.log(`Target URL:  ${opts.targetUrl}`);
  console.log(`Headless:    ${opts.headless}`);
  console.log(`Prefer CDP:  ${opts.preferCdp} (${opts.cdpUrl})`);
  console.log(`Log Output:  ${opts.outDir}`);
  console.log('='.repeat(70));

  if (!fs.existsSync(opts.outDir)) {
    fs.mkdirSync(opts.outDir, { recursive: true });
  }

  let session = null;
  const consoleMonitor = new ConsoleMonitor();
  const networkMonitor = new NetworkMonitor();
  const wsMonitor = new WebSocketMonitor();

  try {
    session = await getBrowserSession({
      cdpUrl: opts.cdpUrl,
      preferCdp: opts.preferCdp,
      headless: opts.headless,
    });

    const { page, context, mode } = session;

    // Attach raw CDP session if available
    let cdpSession = null;
    try {
      cdpSession = await context.newCDPSession(page);
      await cdpSession.send('Log.enable').catch(() => {});
      await cdpSession.send('Runtime.enable').catch(() => {});
      await cdpSession.send('Network.enable').catch(() => {});
    } catch (e) {
      console.log(`[CDP] Raw CDP session could not be established (${e.message}); using standard Playwright hooks.`);
    }

    // Attach all monitors
    consoleMonitor.attach(page, cdpSession);
    networkMonitor.attach(page, cdpSession);
    wsMonitor.attach(page, cdpSession);

    // Initialize tester
    const tester = new PageTester(page);
    const pageInfo = await tester.loadTarget(opts.targetUrl);

    let moduleResults = [];
    let interactionResults = [];
    if (opts.fullAudit) {
      console.log('\n[AUDIT] Commencing Multi-Route Navigation Audit...');
      moduleResults = await tester.testModules(opts.targetUrl);
      interactionResults = tester.getInteractionResults();
    }

    // Capture screenshot
    const screenshotPath = path.join(opts.outDir, `screenshot_${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[AUDIT] Visual snapshot saved to: ${screenshotPath}`);

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const consoleSummary = consoleMonitor.getSummary();
    const networkSummary = networkMonitor.getSummary();
    const wsSummary = wsMonitor.getSummary();

    const auditReport = {
      meta: {
        timestamp: new Date().toISOString(),
        durationSeconds: Number(durationSec),
        targetUrl: opts.targetUrl,
        browserMode: mode,
        browserVersion: session.browser.version ? session.browser.version() : 'Google Chrome',
        headless: opts.headless,
      },
      pageInfo,
      console: {
        summary: consoleSummary,
        errors: consoleMonitor.getErrors(),
        warnings: consoleMonitor.getWarnings(),
        allEntries: consoleMonitor.getAll(),
      },
      network: {
        summary: networkSummary,
        httpErrors: networkMonitor.getHttpErrors(),
        failedRequests: networkMonitor.getFailedRequests(),
        allRequests: networkMonitor.getAll().completed.slice(-50),
      },
      webSocket: {
        summary: wsSummary,
        sockets: wsMonitor.getSockets(),
        errors: wsMonitor.getErrors(),
        recentFrames: wsMonitor.getFrames(25),
      },
      moduleNavigation: moduleResults,
      interactiveVerification: interactionResults,
    };

    // Save JSON audit log
    const jsonPath = path.join(opts.outDir, `audit_report_${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(auditReport, null, 2), 'utf-8');
    console.log(`[AUDIT] Detailed JSON log written to: ${jsonPath}`);

    // Generate Markdown report
    const mdPath = path.join(opts.outDir, `BROWSER_DEBUG_REPORT_${timestamp}.md`);
    const mdContent = generateMarkdownReport(auditReport, screenshotPath);
    fs.writeFileSync(mdPath, mdContent, 'utf-8');
    console.log(`[AUDIT] Human-readable report written to: ${mdPath}`);

    // Print Console Summary
    printSummary(auditReport);

    await closeBrowserSession(session);

    return {
      success: consoleSummary.errorCount === 0 && networkSummary.httpErrorCount === 0,
      report: auditReport,
      jsonPath,
      mdPath,
    };
  } catch (fatalErr) {
    console.error(`[FATAL AUDIT ERROR] ${fatalErr.message}\n${fatalErr.stack}`);
    if (session) await closeBrowserSession(session);
    throw fatalErr;
  }
}

function printSummary(report) {
  console.log('\n' + '='.repeat(70));
  console.log('AUDIT SUMMARY METRICS:');
  console.log(`- Connection Mode:          ${report.meta.browserMode}`);
  console.log(`- Browser Version:          ${report.meta.browserVersion}`);
  console.log(`- Total Console Errors:     ${report.console.summary.errorCount}`);
  console.log(`- Total Console Warnings:   ${report.console.summary.warningCount}`);
  console.log(`- Uncaught Page Exceptions: ${report.console.summary.pageErrorCount}`);
  console.log(`- Failed Network Requests:  ${report.network.summary.failedRequestCount}`);
  console.log(`- HTTP 4xx/5xx Errors:      ${report.network.summary.httpErrorCount}`);
  console.log(`- WebSocket Total Sockets:  ${report.webSocket.summary.totalSockets}`);
  console.log(`- WebSocket Socket Errors:  ${report.webSocket.summary.errorCount}`);
  console.log(`- Tested Modules:           ${report.moduleNavigation.length} (${report.moduleNavigation.filter(m => m.passed).length} Passed)`);
  console.log('='.repeat(70) + '\n');
}

function generateMarkdownReport(report, screenshotPath) {
  const meta = report.meta;
  const c = report.console.summary;
  const n = report.network.summary;
  const w = report.webSocket.summary;

  return `# Panorama SCADA — Chrome DevTools Browser Debug Report

**Generated:** ${meta.timestamp}  
**Target URL:** ${meta.targetUrl}  
**Browser Connection Mode:** \`${meta.browserMode}\` (${meta.browserVersion})  
**Execution Duration:** ${meta.durationSeconds}s  

---

## 1. Executive Summary

| Category | Count | Status |
|---|---|---|
| **Console Errors** | ${c.errorCount} | ${c.errorCount === 0 ? '✅ CLEAN' : '❌ ERRORS DETECTED'} |
| **Console Warnings** | ${c.warningCount} | ${c.warningCount <= 5 ? '✅ NOMINAL' : '⚠️ HIGH'} |
| **Uncaught Page Exceptions** | ${c.pageErrorCount} | ${c.pageErrorCount === 0 ? '✅ ZERO' : '❌ FATAL'} |
| **HTTP 4xx / 5xx Errors** | ${n.httpErrorCount} | ${n.httpErrorCount === 0 ? '✅ ZERO' : '❌ FAILED'} |
| **Failed Network Requests** | ${n.failedRequestCount} | ${n.failedRequestCount === 0 ? '✅ ZERO' : '❌ FAILED'} |
| **WebSocket Sockets** | ${w.totalSockets} | ${w.errorCount === 0 ? '✅ HEALTHY' : '❌ DROPPED'} |
| **WebSocket Socket Errors** | ${w.errorCount} | ${w.errorCount === 0 ? '✅ ZERO' : '❌ ERRORS'} |

---

## 2. Console Messages & Errors

### Error Messages (${report.console.errors.length})
${report.console.errors.length === 0 ? '_Zero console errors recorded during session._' : report.console.errors.map((e, i) => `
${i + 1}. **[${e.type}]** \`${e.text}\`  
   Source: \`${e.url}:${e.line}\`
`).join('\n')}

### Warnings (${report.console.warnings.length})
${report.console.warnings.length === 0 ? '_Zero warnings recorded._' : report.console.warnings.slice(0, 10).map((w, i) => `
${i + 1}. **[${w.type}]** ${w.text} (\`${w.url}:${w.line}\`)
`).join('\n')}

---

## 3. Network & API Inspection

### HTTP 4xx / 5xx Responses (${report.network.httpErrors.length})
${report.network.httpErrors.length === 0 ? '_Zero HTTP 4xx/5xx responses encountered._' : report.network.httpErrors.map((h, i) => `
${i + 1}. **${h.method} ${h.url}** → \`${h.status} ${h.statusText}\` (${h.durationMs}ms)
`).join('\n')}

### Failed Requests (${report.network.failedRequests.length})
${report.network.failedRequests.length === 0 ? '_Zero network requests failed._' : report.network.failedRequests.map((f, i) => `
${i + 1}. **${f.method} ${f.url}** → \`${f.errorText}\`
`).join('\n')}

---

## 4. WebSocket Lifecycle & Frames

- **Sockets Tracked:** ${w.totalSockets}
- **Socket Errors:** ${w.errorCount}
- **Total Frames Transmitted:** ${w.totalFrames}

${report.webSocket.sockets.map(s => `
- **URL:** \`${s.url}\` | Status: \`${s.status}\` | Frames: ${s.framesCount} ${s.closeCode ? `| Close: ${s.closeCode} (${s.closeReason || 'normal'})` : ''}
`).join('\n')}

---

## 5. SCADA Module Navigation Matrix

| Module | Route Hash | Load Time | DOM Health | Status |
|---|---|---|---|---|
${report.moduleNavigation.map(m => `| **${m.name}** | \`${m.hash}\` | ${m.durationMs}ms | ${m.bodyLength} chars | ${m.passed ? '✅ PASS' : '❌ FAIL'} |`).join('\n')}

---

## 6. Interactive Component & RBAC Verification

| Test Workflow | Target Feature | Outcome |
|---|---|---|
${(report.interactiveVerification || []).map(t => `| **${t.name}** | Interactive Lifecycle & Validation | ${t.passed ? '✅ VERIFIED PASS' : '❌ FAIL'} |`).join('\n')}

---

*Report automatically generated by tools/browser_audit/index.cjs via Chrome DevTools Protocol.*
`;
}

// If invoked from CLI directly
if (require.main === module) {
  runBrowserAudit()
    .then((res) => {
      console.log(`[AUDIT COMPLETE] Success: ${res.success}`);
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error(`[AUDIT FAILED]`, err);
      process.exit(1);
    });
}

module.exports = {
  runBrowserAudit,
};
