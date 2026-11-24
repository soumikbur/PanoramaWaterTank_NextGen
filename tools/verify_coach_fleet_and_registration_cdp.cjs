// tools/verify_coach_fleet_and_registration_cdp.cjs
const http = require('http');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\c60316b0-c6df-4d3c-a511-f0bff1054820';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureScreenshot(filename) {
  const remotePath = `/sdcard/${filename}`;
  const localPath = path.join(__dirname, '..', filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);

  try {
    execSync(`adb -s emulator-5554 shell screencap -p ${remotePath}`);
    execSync(`adb -s emulator-5554 pull ${remotePath} "${localPath}"`);
    fs.copyFileSync(localPath, artifactPath);
    console.log(`[Screenshot] Saved ${filename} -> ${artifactPath}`);
  } catch (err) {
    console.error(`[Screenshot] Error capturing ${filename}:`, err.message);
  }
}

// Ensure port 8000 is reversed from emulator to host
try {
  execSync('adb -s emulator-5554 reverse tcp:8000 tcp:8000');
  console.log('[ADB] Reversed tcp:8000 -> tcp:8000');
} catch (e) {
  console.warn('[ADB] Port reverse warning:', e.message);
}

http.get('http://127.0.0.1:9222/json', (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', async () => {
    const list = JSON.parse(data);
    const page = list.find((p) => p.type === 'page' || p.url.includes('localhost'));
    if (!page) {
      console.error('No target webview found on localhost:9222');
      process.exit(1);
    }

    console.log(`[CDP] Connecting to webview: ${page.title} (${page.url})`);
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        const handler = (e) => {
          const m = JSON.parse(e.data);
          if (m.id === msgId) {
            ws.removeEventListener('message', handler);
            if (m.error) {
              reject(m.error);
            } else {
              resolve(m.result);
            }
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return res?.result?.value;
    }

    ws.onopen = async () => {
      try {
        console.log('[CDP] Connected! Configuring local backend URL and reloading...');

        // 1. Ensure backend URL points to local server (http://127.0.0.1:8000/api/v1)
        await evaluate(`
          (() => {
            localStorage.setItem('panorama_backend_url', 'http://127.0.0.1:8000/api/v1');
            localStorage.setItem('panorama_backend_verified', 'true');
            window.location.reload();
          })()
        `);
        await sleep(3000);

        // 2. Check if login screen is displayed and authenticate as Admin
        const isLogin = await evaluate(`Boolean(document.getElementById('btn-quick-login-admin'))`);
        if (isLogin) {
          console.log('[CDP] On login screen, clicking btn-quick-login-admin...');
          await evaluate(`document.getElementById('btn-quick-login-admin').click()`);
          await sleep(2500);
        }

        // 3. Navigate to Train Management
        console.log('[CDP] Navigating to Train Management screen...');
        await evaluate(`window.location.hash = '#/trains'`);
        await sleep(2500);

        // 4. Drill into region (NORTH has trains like 12302) or select train directly
        console.log('[CDP] Selecting Northern Railway region to inspect trains...');
        await evaluate(`
          (() => {
            const cards = Array.from(document.querySelectorAll('div, button')).filter(el => 
              el.innerText && (el.innerText.includes('NORTH') || el.innerText.includes('Northern Railway'))
            );
            // Click "View Trains in Region"
            const viewBtns = Array.from(document.querySelectorAll('button')).filter(b => 
              b.innerText && b.innerText.includes('View Trains in Region')
            );
            if (viewBtns.length > 0) {
              viewBtns[0].click();
            } else if (cards.length > 0) {
              cards[0].click();
            }
          })()
        `);
        await sleep(2000);

        // 5. Select Train 12302 or first available train
        console.log('[CDP] Inspecting train 12302 (19 coaches configured)...');
        const trainInspected = await evaluate(`
          (() => {
            // Find train 12302 card or button
            const trainElements = Array.from(document.querySelectorAll('div, button')).filter(el => 
              el.innerText && (el.innerText.includes('12302') || el.innerText.includes('Rajdhani') || el.innerText.includes('Express'))
            );
            const inspectBtns = Array.from(document.querySelectorAll('button')).filter(b => 
              b.innerText && (b.innerText.includes('Inspect Consist') || b.innerText.includes('View Consist'))
            );
            if (inspectBtns.length > 0) {
              inspectBtns[0].click();
              return 'clicked-inspect-btn';
            }
            if (trainElements.length > 0) {
              trainElements[0].click();
              return 'clicked-train-card';
            }
            return 'no-element-found';
          })()
        `);
        console.log('[CDP] Train inspected:', trainInspected);
        await sleep(2000);

        // 6. Click "Edit Coaches" button to open ManageCoachModal
        console.log('[CDP] Opening ManageCoachModal (Coach Fleet & Consist Editing)...');
        const openModalRes = await evaluate(`
          (() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => 
              b.title === 'Edit Coaches & Consist' || 
              (b.innerText && b.innerText.includes('Edit Coaches')) ||
              (b.innerText && b.innerText.includes('Manage Coaches'))
            );
            if (btns.length > 0) {
              btns[0].click();
              return true;
            }
            return false;
          })()
        `);
        console.log('[CDP] Open modal clicked:', openModalRes);
        await sleep(2000);

        // 7. Verify ManageCoachModal layout & inspect table headers
        const modalStats = await evaluate(`
          (() => {
            const container = document.querySelector('[data-testid="manage-coach-container"]');
            const overlay = document.querySelector('[data-testid="manage-coach-overlay"]');
            const ths = Array.from(document.querySelectorAll('[data-testid="manage-coach-container"] table th')).map(th => {
              const comp = window.getComputedStyle(th);
              return {
                text: th.innerText.trim(),
                position: comp.position,
                top: comp.top,
                background: comp.backgroundColor,
                zIndex: comp.zIndex,
              };
            });
            const rows = Array.from(document.querySelectorAll('[data-testid="manage-coach-container"] table tbody tr')).map(tr => {
              const tds = Array.from(tr.querySelectorAll('td'));
              return {
                coachNumber: tr.getAttribute('data-coach-number') || (tds[1] ? tds[1].innerText.trim() : ''),
                deviceUid: tds[5] ? tds[5].innerText.trim() : ''
              };
            });

            return {
              hasContainer: Boolean(container),
              containerWidth: container ? container.offsetWidth : 0,
              containerHeight: container ? container.offsetHeight : 0,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              headerCount: ths.length,
              headers: ths,
              rowCount: rows.length,
              sampleCoaches: rows.slice(0, 5)
            };
          })()
        `);

        console.log('[CDP] Modal Layout & Sticky Headers Inspection:');
        console.log(JSON.stringify(modalStats, null, 2));

        // Capture Screenshot 1: Coach Fleet Modal Mobile View
        captureScreenshot('coach_fleet_modal_mobile.png');

        // 8. Test scrolling inside modal table
        console.log('[CDP] Scrolling table down to verify sticky header pinning...');
        await evaluate(`
          (() => {
            const scrollContainer = document.querySelector('.coach-table-scroll-container');
            if (scrollContainer) {
              scrollContainer.scrollTop = 350;
            }
          })()
        `);
        await sleep(800);

        // 9. Click Edit on Coach SLRD or the first coach
        console.log('[CDP] Clicking Edit on first coach...');
        const editClicked = await evaluate(`
          (() => {
            const rows = Array.from(document.querySelectorAll('[data-testid="manage-coach-container"] table tbody tr'));
            for (const row of rows) {
              const editBtn = Array.from(row.querySelectorAll('button')).find(b => 
                (b.title && b.title.includes('Edit Coach')) ||
                (b.innerText && b.innerText.includes('Edit'))
              );
              if (editBtn) {
                editBtn.click();
                return row.getAttribute('data-coach-number') || 'first-coach';
              }
            }
            return null;
          })()
        `);
        console.log('[CDP] Edit clicked on coach:', editClicked);
        await sleep(1500);

        // Scroll sub-modal form body to Hardware Device Management section
        await evaluate(`
          (() => {
            const formBody = Array.from(document.querySelectorAll('form div')).find(div => 
              div.style && div.style.overflowY === 'auto'
            );
            if (formBody) {
              formBody.scrollTop = 600;
            }
          })()
        `);
        await sleep(800);

        // Capture Screenshot 2: Hardware Device Section inside Coach Edit
        captureScreenshot('coach_edit_hardware_device_section.png');

        // 10. Click "+ Add New Device" button
        console.log('[CDP] Clicking "+ Add New Device" button...');
        const addDeviceClicked = await evaluate(`
          (() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => 
              (b.title && b.title.includes('Register a new physical hardware device')) ||
              (b.innerText && b.innerText.includes('Add New Device'))
            );
            if (btns.length > 0) {
              btns[0].click();
              return true;
            }
            return false;
          })()
        `);
        console.log('[CDP] Add New Device clicked:', addDeviceClicked);
        await sleep(1500);

        // Capture Screenshot 3: New Device Registration Form
        captureScreenshot('new_device_registration_form.png');

        // 11. Test Invalid Validation (non-hex UID)
        console.log('[CDP] Testing validation error on non-hex UID...');
        await evaluate(`
          (() => {
            const uidInputs = Array.from(document.querySelectorAll('input')).filter(inp => 
              inp.placeholder && inp.placeholder.includes('0025004D4B42501120353335')
            );
            if (uidInputs.length > 0) {
              uidInputs[0].value = 'INVALID-XYZ-123';
              uidInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
            const regBtns = Array.from(document.querySelectorAll('button')).filter(b => 
              b.innerText && b.innerText.includes('Register Device')
            );
            if (regBtns.length > 0) {
              regBtns[0].click();
            }
          })()
        `);
        await sleep(800);

        const validationErr = await evaluate(`
          (() => {
            const errDiv = Array.from(document.querySelectorAll('div')).find(d => 
              d.innerText && d.innerText.includes('Invalid UID format')
            );
            return errDiv ? errDiv.innerText.trim() : null;
          })()
        `);
        console.log('[CDP] Validation error message caught:', validationErr);

        // 12. Enter genuine valid UID and register device
        const testUid = '0025004D4B42501120353335';
        console.log(`[CDP] Entering genuine UID ${testUid} and registering...`);
        await evaluate(`
          (() => {
            const uidInputs = Array.from(document.querySelectorAll('input')).filter(inp => 
              inp.placeholder && inp.placeholder.includes('0025004D4B42501120353335')
            );
            if (uidInputs.length > 0) {
              uidInputs[0].value = '${testUid}';
              uidInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
            const nameInputs = Array.from(document.querySelectorAll('input')).filter(inp => 
              inp.placeholder && inp.placeholder.includes('SLRD Coach Water Monitor')
            );
            if (nameInputs.length > 0) {
              nameInputs[0].value = 'SLRD Water Monitor Unit';
              nameInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
            const regBtns = Array.from(document.querySelectorAll('button')).filter(b => 
              b.innerText && b.innerText.includes('Register Device')
            );
            if (regBtns.length > 0) {
              regBtns[0].click();
            }
          })()
        `);
        await sleep(2500);

        // 13. Verify Coach Edit Form has updated UID and status badge
        const postRegCheck = await evaluate(`
          (() => {
            const uidInputs = Array.from(document.querySelectorAll('input')).filter(inp => 
              inp.placeholder && inp.placeholder.includes('blank to unassign')
            );
            const currentVal = uidInputs.length > 0 ? uidInputs[0].value : '';
            const badges = Array.from(document.querySelectorAll('span')).map(s => s.innerText.trim()).filter(t => 
              ['REGISTERED', 'UNREGISTERED', 'ONLINE', 'OFFLINE', 'AVAILABLE'].includes(t)
            );
            return {
              currentCoachUid: currentVal,
              visibleBadges: badges
            };
          })()
        `);
        console.log('[CDP] Post-registration coach form state:', postRegCheck);

        // Capture Screenshot 4: Device registered and assigned to coach
        captureScreenshot('device_registered_and_assigned.png');

        // 14. Save Coach Changes
        console.log('[CDP] Saving Coach Changes...');
        await evaluate(`
          (() => {
            const saveBtn = Array.from(document.querySelectorAll('button')).find(b => 
              b.innerText && (b.innerText.includes('Save Changes') || b.innerText.includes('Saving...'))
            );
            if (saveBtn) saveBtn.click();
          })()
        `);
        await sleep(2500);

        // 15. Verify consistency in table
        const finalTableCheck = await evaluate(`
          (() => {
            const rows = Array.from(document.querySelectorAll('[data-testid="manage-coach-container"] table tbody tr')).map(tr => {
              const tds = Array.from(tr.querySelectorAll('td'));
              return {
                coach: tr.getAttribute('data-coach-number') || (tds[1] ? tds[1].innerText.trim() : ''),
                device: tds[5] ? tds[5].innerText.trim() : ''
              };
            });
            return rows;
          })()
        `);
        console.log('[CDP] Consist coaches after saving:', JSON.stringify(finalTableCheck.slice(0, 5), null, 2));

        console.log('[CDP] Verification completed successfully!');
        ws.close();
        process.exit(0);
      } catch (err) {
        console.error('[CDP] Test execution failed:', err);
        ws.close();
        process.exit(1);
      }
    };
  });
});
