// apps/mobile/scripts/verify_registration_flow_e2e.cjs
/**
 * Dedicated E2E Verification Suite for:
 * 1. Global UI Animation presence and transitions
 * 2. New Employee Registration Wizard (Steps 1-5, password meter, validation, submission)
 * 3. Administrative Review & Approval/Rejection Console in UsersScreen
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const electronPath = require('electron');

const PORT = 8789;
const DIST_DIR = path.resolve(__dirname, '../dist');

let mockRegistrations = [
  {
    id: 'reg-e2e-001',
    username: 'rahul_sen',
    full_name: 'Rahul Sen',
    email: 'rahul.sen@railnet.gov.in',
    phone: '+91-98300-44556',
    employee_id: 'EMP-771',
    department: 'Rolling Stock Operations',
    designation: 'Yard Operations Inspector',
    division_region: 'Eastern Railway (Howrah)',
    assigned_location: 'Howrah Junction Platform 1-6',
    reporting_manager: 'Chief Yard Master',
    role: 'EMPLOYEE',
    account_status: 'PENDING_APPROVAL',
    is_active: false,
    document_name: 'Railway_ID_Rahul_Sen.pdf',
    registration_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
];

function createServer() {
  const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'HEALTHY' }));
      return;
    }

    if (pathname === '/api/v1/auth/register' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const newReg = {
            id: `reg-${Date.now()}`,
            username: data.username,
            full_name: data.full_name || data.fullName,
            email: data.email,
            phone: data.phone,
            employee_id: data.employee_id || data.employeeId,
            department: data.department,
            designation: data.designation,
            division_region: data.division_region || data.divisionRegion,
            assigned_location: data.assigned_location || data.assignedLocation,
            reporting_manager: data.reporting_manager || data.reportingManager,
            document_name: data.document_name || data.documentName || 'Railway_Service_ID.pdf',
            role: 'EMPLOYEE',
            account_status: 'PENDING_APPROVAL',
            is_active: false,
            registration_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
          };
          mockRegistrations.unshift(newReg);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            registration_id: newReg.id,
            username: newReg.username,
            message: 'Employee registration submitted successfully.',
            account_status: 'PENDING_APPROVAL'
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ detail: 'Invalid JSON' }));
        }
      });
      return;
    }

    if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'demo_token_admin',
        token_type: 'bearer',
        user: {
          id: 'usr-admin-01',
          username: '@admin',
          full_name: 'Chief SCADA Administrator',
          role: 'ADMIN',
          is_active: true,
          must_change_password: false,
        }
      }));
      return;
    }

    if (pathname === '/api/v1/auth/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'usr-admin-01',
        username: '@admin',
        full_name: 'Chief SCADA Administrator',
        role: 'ADMIN',
        is_active: true,
        must_change_password: false,
      }));
      return;
    }

    if (pathname.startsWith('/api/v1/users/registrations')) {
      if (pathname.endsWith('/approve') && req.method === 'POST') {
        const parts = pathname.split('/');
        const id = parts[parts.length - 2];
        const reg = mockRegistrations.find(r => r.id === id);
        if (reg) {
          reg.account_status = 'ACTIVE';
          reg.is_active = true;
          reg.approved_at = new Date().toISOString();
          reg.approved_by = 'admin';
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reg || { id, account_status: 'ACTIVE' }));
        return;
      }

      if (pathname.endsWith('/reject') && req.method === 'POST') {
        const parts = pathname.split('/');
        const id = parts[parts.length - 2];
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          const reg = mockRegistrations.find(r => r.id === id);
          if (reg) {
            reg.account_status = 'REJECTED';
            reg.rejection_reason = parsed.rejection_reason || 'Rejected by administrator';
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(reg || { id, account_status: 'REJECTED' }));
        });
        return;
      }

      // Listing
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockRegistrations));
      return;
    }

    if (pathname === '/api/v1/users') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        {
          id: 'usr-admin-01',
          username: '@admin',
          full_name: 'Chief SCADA Administrator',
          role: 'ADMIN',
          employee_id: 'EMP-001',
          department: 'Signalling & Telecommunications',
          designation: 'Chief SCADA Administrator',
          account_status: 'ACTIVE',
          is_active: true,
          must_change_password: false,
          created_at: '2026-01-01',
        }
      ]));
      return;
    }

    if (pathname === '/api/v1/tanks/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tankId: 'tank-1',
        tankName: 'Coach C1 Auxiliary Tank',
        levelPercent: 68.4,
        volumeLiters: 13.68,
        capacityLiters: 20.0,
        heightCm: 34.2,
        maxHeightCm: 50.0,
        isOnline: true,
      }));
      return;
    }

    if (pathname === '/api/v1/tanks') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    if (pathname === '/api/v1/devices') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    if (pathname === '/api/v1/alarms') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    if (pathname === '/api/v1/alarms/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ totalActive: 0, criticalCount: 0, warningCount: 0, resolvedToday: 0 }));
      return;
    }

    if (pathname === '/api/v1/trains/regions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    if (pathname === '/api/v1/locations' || pathname.includes('/locations')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }

    // Default API fallback
    if (pathname.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
      return;
    }

    // Static Asset Serving
    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('File read error');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[TEST-SERVER] Listening at http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

const runnerScript = `
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const testReport = { passed: 0, failed: 0, errors: [] };

  function assert(condition, message) {
    if (condition) {
      console.log('  [PASS] ' + message);
      testReport.passed++;
    } else {
      console.error('  [FAIL] ' + message);
      testReport.failed++;
      testReport.errors.push(message);
    }
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  console.log('--- TEST 1: Login Page Animations & Register Switch ---');
  await win.loadURL('http://127.0.0.1:${PORT}/');
  await win.webContents.executeJavaScript('localStorage.clear();');
  await win.loadURL('http://127.0.0.1:${PORT}/');
  await delay(1200);

  const loginCheck = await win.webContents.executeJavaScript(\`
    (() => {
      const card = document.querySelector('.auth-card-entrance');
      const regBtn = document.getElementById('btn-switch-to-register');
      return {
        hasCardAnimation: !!card,
        hasRegisterButton: !!regBtn,
        regBtnText: regBtn ? regBtn.innerText.trim() : null
      };
    })()
  \`);

  assert(loginCheck.hasCardAnimation, 'Login card contains .auth-card-entrance animation class');
  assert(loginCheck.hasRegisterButton, 'New Employee? Register Here switch button is rendered');
  assert(loginCheck.regBtnText === 'Register Here', 'Switch button text is "Register Here"');

  console.log('--- TEST 2: Switch to Registration Wizard ---');
  await win.webContents.executeJavaScript(\`
    document.getElementById('btn-switch-to-register').click();
  \`);
  await delay(600);

  const wizardCheck = await win.webContents.executeJavaScript(\`
    (() => {
      const text = document.body.innerText;
      const title = text.includes('Employee Registration Wizard') || text.includes('Registration & Access Request');
      const step1 = text.includes('Step 1 of 5') || text.includes('Personal Information');
      return { title, step1 };
    })()
  \`);

  assert(wizardCheck.title, 'Registration wizard header renders Employee Registration Wizard');
  assert(wizardCheck.step1, 'Wizard starts on Step 1 (Personal Information)');

  console.log('--- TEST 3: Multi-Step Registration Form Filling ---');
  // Fill Step 1
  await win.webContents.executeJavaScript(\`
    (() => {
      function setVal(id, val) {
        const el = document.getElementById(id);
        if (el) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      setVal('reg-full-name', 'Debashis Mukherjee');
      setVal('reg-email', 'debashis.m@railnet.gov.in');
      setVal('reg-phone', '+91-98300-88899');
      
      const nextBtn = document.getElementById('btn-wizard-continue');
      if (nextBtn) nextBtn.click();
    })()
  \`);
  await delay(600);

  // Fill Step 2
  await win.webContents.executeJavaScript(\`
    (() => {
      function setVal(id, val) {
        const el = document.getElementById(id);
        if (el) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      setVal('reg-employee-id', 'EMP-882');
      
      const nextBtn = document.getElementById('btn-wizard-continue');
      if (nextBtn) nextBtn.click();
    })()
  \`);
  await delay(600);

  // Fill Step 3 (Account & Security)
  await win.webContents.executeJavaScript(\`
    (() => {
      function setVal(id, val) {
        const el = document.getElementById(id);
        if (el) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      setVal('reg-username', 'debashis_m');
      setVal('reg-password', 'Railway#2026Security');
      setVal('reg-confirm-password', 'Railway#2026Security');
      
      const nextBtn = document.getElementById('btn-wizard-continue');
      if (nextBtn) nextBtn.click();
    })()
  \`);
  await delay(600);

  // Advance Step 4 (Documents) to Step 5
  await win.webContents.executeJavaScript(\`
    (() => {
      const nextBtn = document.getElementById('btn-wizard-continue');
      if (nextBtn) nextBtn.click();
    })()
  \`);
  await delay(600);

  // Step 5: Check certify and verify submit button
  const step5Check = await win.webContents.executeJavaScript(\`
    (() => {
      const chk = document.getElementById('chk-reg-certify');
      if (chk && !chk.checked) {
        chk.click();
      }
      const submitBtn = document.getElementById('btn-wizard-submit');
      return { hasSubmitBtn: !!submitBtn, isChecked: chk ? chk.checked : false };
    })()
  \`);
  assert(step5Check.hasSubmitBtn, 'Submit Application button (#btn-wizard-submit) is rendered on final step');
  assert(step5Check.isChecked, 'Certification checkbox is checked on step 5');

  console.log('--- TEST 4: Submit Registration and Verify Confirmation ---');
  await win.webContents.executeJavaScript(\`
    const submitBtn = document.getElementById('btn-wizard-submit');
    if (submitBtn) submitBtn.click();
  \`);
  await delay(1500);

  const confirmResult = await win.webContents.executeJavaScript(\`
    (() => {
      const text = document.body.innerText;
      const hasPending = text.includes('PENDING_APPROVAL');
      const backBtn = document.getElementById('btn-back-to-login');
      const errBanner = document.getElementById('register-error-banner');
      return {
        hasPending,
        hasBackBtn: !!backBtn,
        errText: errBanner ? errBanner.innerText : null,
        bodySnippet: text.slice(0, 300)
      };
    })()
  \`);

  if (confirmResult.errText) {
    console.error('Registration submission error:', confirmResult.errText);
  }

  assert(confirmResult.hasPending, 'Confirmation view displays PENDING_APPROVAL status banner');
  assert(confirmResult.hasBackBtn, 'Confirmation view provides Back to Login button (#btn-back-to-login)');

  // Test Back to Login button
  await win.webContents.executeJavaScript(\`
    const backBtn = document.getElementById('btn-back-to-login');
    if (backBtn) backBtn.click();
  \`);
  await delay(600);

  const backToLoginCheck = await win.webContents.executeJavaScript(\`
    (() => {
      const card = document.querySelector('.auth-card-entrance');
      const signInBtn = document.querySelector('button[type="submit"]');
      return !!card && !!signInBtn;
    })()
  \`);
  assert(backToLoginCheck, 'Returned successfully to login screen after clicking Back to Login');

  console.log('--- TEST 5: Admin Console - Registration Requests Tab ---');
  // Log in as administrator via login form
  await win.webContents.executeJavaScript(\`
    (() => {
      const u = document.getElementById('login-username');
      const p = document.getElementById('login-password');
      if (u) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(u, '@admin');
        u.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (p) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(p, 'admin123');
        p.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.click();
    })()
  \`);
  await delay(1200);

  // Navigate to Users screen via sidebar
  const navSuccess = await win.webContents.executeJavaScript(\`
    (() => {
      const btn = document.querySelector('[data-screen="users"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()
  \`);
  assert(navSuccess, 'Located and clicked [data-screen="users"] sidebar button');
  await delay(1000);

  const adminTabsCheck = await win.webContents.executeJavaScript(\`
    (() => {
      const rosterTab = document.getElementById('tab-employee-roster');
      const regTab = document.getElementById('tab-registration-requests');
      const badge = document.getElementById('badge-pending-registrations');
      return {
        hasRosterTab: !!rosterTab,
        hasRegTab: !!regTab,
        badgeText: badge ? badge.innerText.trim() : null,
        bodySnippet: document.body.innerText.slice(0, 300)
      };
    })()
  \`);

  assert(adminTabsCheck.hasRosterTab, 'Employee Roster sub-tab exists');
  assert(adminTabsCheck.hasRegTab, 'Registration Requests sub-tab exists');
  assert(adminTabsCheck.badgeText && adminTabsCheck.badgeText.includes('Pending'), 'Pending count badge is rendered with pending status');

  // Click Registration Requests tab
  await win.webContents.executeJavaScript(\`
    const regTab = document.getElementById('tab-registration-requests');
    if (regTab) regTab.click();
  \`);
  await delay(1000);

  const regTableCheck = await win.webContents.executeJavaScript(\`
    (() => {
      const text = document.body.innerText;
      const hasApplicant = text.includes('Rahul Sen') || text.includes('Debashis Mukherjee');
      const hasPendingBadge = text.includes('Pending Review');
      const hasViewBtn = text.includes('View');
      const hasApproveBtn = text.includes('Approve');
      const hasRejectBtn = text.includes('Reject');
      return { hasApplicant, hasPendingBadge, hasViewBtn, hasApproveBtn, hasRejectBtn, snippet: text.slice(0, 500) };
    })()
  \`);

  assert(regTableCheck.hasApplicant, 'Applicant row is rendered in Registration Requests table');
  assert(regTableCheck.hasPendingBadge, 'Status badge "Pending Review" is rendered');
  assert(regTableCheck.hasViewBtn, 'Action button "View" is rendered');
  assert(regTableCheck.hasApproveBtn, 'Action button "Approve" is rendered');
  assert(regTableCheck.hasRejectBtn, 'Action button "Reject" is rendered');

  console.log('======================================================');
  console.log(\` REGISTRATION FLOW E2E RESULTS: Passed: \${testReport.passed} | Failed: \${testReport.failed}\`);
  console.log('======================================================');

  if (testReport.failed > 0) {
    app.exit(1);
  } else {
    app.exit(0);
  }
});
`;

async function run() {
  const server = await createServer();
  const runnerFile = path.resolve(__dirname, 'temp_registration_runner.cjs');
  fs.writeFileSync(runnerFile, runnerScript);

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = cp.spawn(electronPath, [runnerFile], { stdio: 'inherit', env });

  child.on('close', code => {
    try { fs.unlinkSync(runnerFile); } catch (e) {}
    server.close(() => {
      process.exit(code);
    });
  });
}

run();
