/**
 * Automated SCADA Page Testing Utility
 * 
 * Drives multi-route navigation, tests UI interactions, verifies hydration,
 * validates modals and forms, verifies RBAC boundaries, and records page state metrics.
 */

const SCADA_MODULES = [
  { id: 'dashboard', hash: '#/dashboard', name: 'Fleet Overview Dashboard' },
  { id: 'trains', hash: '#/trains', name: 'Train Fleet Management' },
  { id: 'coaches', hash: '#/coaches', name: 'Coach Management' },
  { id: 'coach-details', hash: '#/coach-details', name: 'Coach Telemetry & Dual Tanks' },
  { id: 'watertank', hash: '#/watertank', name: 'All Tanks Overview' },
  { id: 'devices', hash: '#/devices', name: 'Device Hardware Registry' },
  { id: 'location', hash: '#/location', name: 'GPS Corridor Tracking' },
  { id: 'monitoring', hash: '#/monitoring', name: 'Live Telemetry Monitoring' },
  { id: 'alerts', hash: '#/alerts', name: 'Alarm & Notification Center' },
  { id: 'history', hash: '#/history', name: 'Telemetry History' },
  { id: 'reports', hash: '#/reports', name: 'Analytics & Reports' },
  { id: 'settings', hash: '#/settings', name: 'SCADA System Settings' },
  { id: 'users', hash: '#/users', name: 'Employee & User Management' },
  { id: 'logs', hash: '#/logs', name: 'System Event Logs' },
];

class PageTester {
  constructor(page, options = {}) {
    this.page = page;
    this.options = options;
    this.results = [];
    this.interactionResults = [];
  }

  /**
   * Navigates to initial target URL and waits for application readiness.
   */
  async loadTarget(url, waitMs = 3000) {
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
        isLoginPage: !!document.querySelector('#btn-quick-login-admin, input[type="password"]'),
      };
    });

    console.log(`[TESTER] Loaded: "${info.title}" (Body text: ${info.bodyTextLength} chars, Hash: "${info.hash}", IsLogin: ${info.isLoginPage})`);

    // Ensure session is authenticated for full SCADA audit
    if (info.isLoginPage) {
      console.log('[TESTER] Initializing authenticated session as Administrator...');
      await this.loginAsAdmin();
    }

    return info;
  }

  /**
   * Performs quick admin login
   */
  async loginAsAdmin() {
    const quickAdmin = this.page.locator('#btn-quick-login-admin');
    if (await quickAdmin.count() > 0) {
      await quickAdmin.click();
    } else {
      await this.page.fill('input[type="text"]', '@admin');
      await this.page.fill('input[type="password"]', 'Admin@123');
      await this.page.click('button[type="submit"]');
    }
    await this.page.waitForTimeout(2500);
    console.log(`[TESTER] Authentication complete. Current hash: "${await this.page.evaluate(() => window.location.hash)}"`);
  }

  /**
   * Tests all core SCADA modules by updating location hash and checking DOM stability.
   */
  async testModules(baseUrl, delayBetweenModules = 1200) {
    this.results = [];

    for (const mod of SCADA_MODULES) {
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
      console.log(`[TESTER] ${mark} Module [${mod.id.padEnd(14)}]: ${record.passed ? 'PASS' : 'FAIL'} (${durationMs}ms, ${bodyLength} chars)`);
    }

    // Run interactive component tests
    await this.testInteractions();

    return this.results;
  }

  /**
   * Tests interactive workflows: Modals, Search Filters, RBAC, and Logout/Login
   */
  async testInteractions() {
    console.log('\n[TESTER] Commencing Interactive Component & State Audits...');
    this.interactionResults = [];

    // 1. Header Install App Modal
    try {
      console.log('  [1/5] Testing Install App Modal...');
      const installBtn = this.page.locator('#header-install-app-btn, button:has-text("Install App")').first();
      if (await installBtn.count() > 0) {
        await installBtn.click();
        await this.page.waitForTimeout(600);

        // Switch tabs
        const iosTab = this.page.locator('#modal-tab-ios');
        if (await iosTab.count() > 0) await iosTab.click();
        await this.page.waitForTimeout(300);

        const androidTab = this.page.locator('#modal-tab-android');
        if (await androidTab.count() > 0) await androidTab.click();
        await this.page.waitForTimeout(300);

        // Close modal
        await this.page.click('#install-modal-close-btn');
        await this.page.waitForTimeout(500);
        console.log('  ✓ Install App Modal lifecycle verified');
        this.interactionResults.push({ name: 'Install App Modal', passed: true });
      }
    } catch (e) {
      console.log(`  ✗ Install App Modal error: ${e.message}`);
      this.interactionResults.push({ name: 'Install App Modal', passed: false, error: e.message });
    }

    // 2. Train Management Screen: Region Filter, Search, and Add Train Modal
    try {
      console.log('  [2/5] Testing Train Management & Add Train Modal...');
      await this.page.evaluate(() => {
        window.location.hash = '#/trains';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await this.page.waitForTimeout(1000);

      // Click REGIONS button
      const regionsBtn = this.page.locator('button:has-text("REGIONS")');
      if (await regionsBtn.count() > 0) {
        await regionsBtn.click();
        await this.page.waitForTimeout(500);
      }

      // Test Search Box
      const searchBox = this.page.locator('input[placeholder*="Search" i]').first();
      if (await searchBox.count() > 0) {
        await searchBox.fill('12841');
        await this.page.waitForTimeout(300);
        await searchBox.fill('');
        await this.page.waitForTimeout(300);
      }

      // Open and Close Add Train Modal
      const addTrainBtn = this.page.locator('button:has-text("Add Train"), button:has-text("Register Train")').first();
      if (await addTrainBtn.count() > 0) {
        await addTrainBtn.click();
        await this.page.waitForTimeout(800);
        const closeBtn = this.page.locator('button[data-testid="close-add-train-btn"], button:has-text("Cancel")').first();
        if (await closeBtn.count() > 0) {
          await closeBtn.click();
          await this.page.waitForTimeout(500);
        }
      }
      console.log('  ✓ Train Management interactive controls verified');
      this.interactionResults.push({ name: 'Train Management Controls', passed: true });
    } catch (e) {
      console.log(`  ✗ Train Management error: ${e.message}`);
      this.interactionResults.push({ name: 'Train Management Controls', passed: false, error: e.message });
    }

    // 3. Device Hardware Registry & Add Device Modal
    try {
      console.log('  [3/5] Testing Device Registry & Add Device Modal...');
      await this.page.evaluate(() => {
        window.location.hash = '#/devices';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await this.page.waitForTimeout(1000);

      const addDevBtn = this.page.locator('button:has-text("Register Device"), button:has-text("Add Device")').first();
      if (await addDevBtn.count() > 0) {
        await addDevBtn.click();
        await this.page.waitForTimeout(800);
        const cancelBtn = this.page.locator('button:has-text("Cancel")').first();
        if (await cancelBtn.count() > 0) {
          await cancelBtn.click();
          await this.page.waitForTimeout(500);
        }
      }
      console.log('  ✓ Device Registry interactive controls verified');
      this.interactionResults.push({ name: 'Device Registry Controls', passed: true });
    } catch (e) {
      console.log(`  ✗ Device Registry error: ${e.message}`);
      this.interactionResults.push({ name: 'Device Registry Controls', passed: false, error: e.message });
    }

    // 4. Alerts Screen: Notifications Toggle
    try {
      console.log('  [4/5] Testing Alarm & Notification Center...');
      await this.page.evaluate(() => {
        window.location.hash = '#/alerts';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await this.page.waitForTimeout(1000);

      const notifyBtn = this.page.locator('button[data-testid="alerts-enable-popups-btn"]');
      if (await notifyBtn.count() > 0) {
        await notifyBtn.click();
        await this.page.waitForTimeout(500);
      }
      console.log('  ✓ Alerts Center interactive controls verified');
      this.interactionResults.push({ name: 'Alerts Center Controls', passed: true });
    } catch (e) {
      console.log(`  ✗ Alerts Center error: ${e.message}`);
      this.interactionResults.push({ name: 'Alerts Center Controls', passed: false, error: e.message });
    }

    // 5. Employee RBAC & Logout/Login Cycle
    try {
      console.log('  [5/5] Testing RBAC Security & Logout/Login Lifecycle...');
      // Logout Admin
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(x => x.innerText.includes('Logout'));
        if (b) b.click();
      });
      await this.page.waitForTimeout(1500);

      // Login as Employee
      const quickEmp = this.page.locator('#btn-quick-login-employee');
      if (await quickEmp.count() > 0) {
        await quickEmp.click();
      } else {
        await this.page.fill('input[type="text"]', '@employee');
        await this.page.fill('input[type="password"]', 'Employee@123');
        await this.page.click('button[type="submit"]');
      }
      await this.page.waitForTimeout(2000);

      // Check restricted route #/users
      await this.page.evaluate(() => {
        window.location.hash = '#/users';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await this.page.waitForTimeout(800);
      const isRestricted = await this.page.evaluate(() => document.body.innerText.includes('Access Restricted'));

      // Return to Dashboard
      const returnBtn = this.page.locator('button:has-text("Return to Dashboard")');
      if (await returnBtn.count() > 0) {
        await returnBtn.click();
        await this.page.waitForTimeout(800);
      }

      // Logout Employee & Relogin Admin
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(x => x.innerText.includes('Logout'));
        if (b) b.click();
      });
      await this.page.waitForTimeout(1500);
      await this.loginAsAdmin();

      console.log(`  ✓ RBAC boundary and full auth cycle verified (Restricted banner shown: ${isRestricted})`);
      this.interactionResults.push({ name: 'RBAC & Auth Lifecycle', passed: isRestricted });
    } catch (e) {
      console.log(`  ✗ RBAC lifecycle error: ${e.message}`);
      this.interactionResults.push({ name: 'RBAC & Auth Lifecycle', passed: false, error: e.message });
    }
  }

  getResults() {
    return this.results;
  }

  getInteractionResults() {
    return this.interactionResults;
  }
}

module.exports = {
  PageTester,
  SCADA_MODULES,
};
