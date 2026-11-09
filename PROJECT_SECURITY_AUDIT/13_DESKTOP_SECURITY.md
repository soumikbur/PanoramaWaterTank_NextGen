# 13. Desktop SCADA & Electron Security Audit
## Panorama Water Tank Monitor (Electron Native HMI)

**Audit Date:** November 9, 2026  
**Audited Runtime:** Electron 30.0 / Node.js 20+ Embedded  
**Source Code:** `apps/mobile/electron/main.cjs`, `preload.cjs`  

---

### 1. Electron Security Checklist & Posture

| Electron Security Guideline | Configured Setting | Status | Operational Significance |
|---|---|:---:|---|
| **Context Isolation** | `contextIsolation: true` | **ENFORCED** | Separates Electron internal APIs from renderer JavaScript context |
| **Node.js Integration** | `nodeIntegration: false` | **ENFORCED** | Prevents compromised webpage code from executing `child_process` or `fs` |
| **Sandbox Execution** | `sandbox: true` | **ENFORCED** | Enforces OS-level process sandboxing for renderer processes |
| **Web Security** | `webSecurity: true` | **ENFORCED** | Blocks mixed content, local file reading via XHR, and cross-origin bypasses |
| **Remote Module** | `@electron/remote` not installed | **SECURE** | Completely eliminates remote proxy vulnerability surface |
| **Window Open Handler** | `setWindowOpenHandler` with `action: 'deny'` | **ENFORCED** | Disallows popups and renders external URLs in system default browser |
| **Navigation Guard** | `webContents.on('will-navigate')` | **ENFORCED** | Restricts renderer strictly to `file:` and `http://127.0.0.1` origins |

---

### 2. Native Daemon Supervision & Process Tree Safety

1. **Single Instance Lock:**
   - `app.requestSingleInstanceLock()` prevents multiple concurrent Electron instances from competing for SQLite locks or serial COM ports.
2. **Subprocess Management:**
   - In development and packaged mode, Electron supervises the Python backend daemon process.
   - On application exit, `stopBackend()` forcefully terminates the child process and its complete Windows process tree using `taskkill /pid {pid} /T /F`, preventing zombie server processes from lingering on port 8000.
3. **Virtual Environment Detection:**
   - Updated `getBackendExecutable()` to search both standard `backend/.venv` and legacy `backend/venv` virtual environment layouts.
