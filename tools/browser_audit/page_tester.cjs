/**
 * Automated SCADA Page Testing Utility
 * 
 * Drives multi-route navigation, tests UI interactions, verifies hydration,
 * and records page state metrics.
 */

const SCADA_MODULES = [
  { id: 'dashboard', hash: '#/dashboard', name: 'Fleet Overview Dashboard' },
  { id: 'trains', hash: '#/trains', name: 'Train Fleet Management' },
  { id: 'coaches', hash: '#/coaches', name: 'Coach Management' },
  { id: 'devices', hash: '#/devices', name: 'Device Hardware Registry' },
  { id: 'location', hash: '#/location', name: 'GPS Corridor Tracking' },
  { id: 'monitoring', hash: '#/monitoring', name: 'Live Telemetry Monitoring' },
  { id: 'alerts', hash: '#/alerts', name: 'Alarm & Notification Center' },
  { id: 'history', hash: '#/history', name: 'Telemetry History' },
  { id: 'reports', hash: '#/reports', name: 'Analytics & Reports' },
  { id: 'settings', hash: '#/settings', name: 'SCADA System Settings' },
  { id: 'users', hash: '#/users', name: 'Employee & User Management' },
];

class PageTester {
  constructor(page, options = {}) {
    this.page = page;
    this.options = options;
    this.results = [];
  }

  /**
   * Navigates to initial target URL and waits for application readiness.
   */
  async loadTarget(url, waitMs = 3500) {
    console.log(`[TESTER] Navigating to target: ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.page.waitForTimeout(waitMs);

    const info = await this.page.evaluate(() => {
      const keys = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          keys.push(localStorage.key(i));
        }
      } catch {}
      return {
        title: document.title,
        url: window.location.href,
        hash: window.location.hash,
        storageKeys: keys,
        bodyTextLength: document.body.innerText.length,
        hasErrorOverlay: !!document.querySelector('.error-boundary, [role="alert"]'),
      };
    });

    console.log(`[TESTER] Loaded: "${info.title}" (Body text: ${info.bodyTextLength} chars, Hash: "${info.hash}")`);
    return info;
  }

  /**
   * Tests all core SCADA modules by updating location hash and checking DOM stability.
   */
  async testModules(baseUrl, delayBetweenModules = 1200) {
    this.results = [];

    for (const mod of SCADA_MODULES) {
      const targetHashUrl = baseUrl.split('#')[0] + mod.hash;
      const startTime = Date.now();
      let errorOccurred = null;
      let domHealthy = false;
      let bodyLength = 0;

      try {
        await this.page.evaluate((h) => {
          window.location.hash = h;
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }, mod.hash);

        await this.page.waitForTimeout(delayBetweenModules);

        const check = await this.page.evaluate(() => ({
          bodyLength: document.body.innerText.length,
          hasFatalError: !!document.querySelector('.fatal-error, #error-container'),
        }));

        domHealthy = !check.hasFatalError && check.bodyLength > 50;
        bodyLength = check.bodyLength;
      } catch (err) {
        errorOccurred = err.message;
      }

      const durationMs = Date.now() - startTime;
      const record = {
        id: mod.id,
        name: mod.name,
        hash: mod.hash,
        durationMs,
        passed: domHealthy && !errorOccurred,
        bodyLength,
        error: errorOccurred,
        timestamp: new Date().toISOString(),
      };

      this.results.push(record);
      const mark = record.passed ? '✓' : '✗';
      console.log(`[TESTER] ${mark} Module [${mod.id.padEnd(12)}]: ${record.passed ? 'PASS' : 'FAIL'} (${durationMs}ms, ${bodyLength} chars)`);
    }

    return this.results;
  }

  getResults() {
    return this.results;
  }
}

module.exports = {
  PageTester,
  SCADA_MODULES,
};
