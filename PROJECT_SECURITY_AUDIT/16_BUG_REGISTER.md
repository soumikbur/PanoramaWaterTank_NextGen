# 16. Defect & Vulnerability Register (P0–P4 Ranking)
## Panorama Water Tank Monitor (WLI SCADA NextGen)

**Audit Date:** November 9, 2026  
**Defect Severity Classification:**  
- **P0 (Critical):** Immediate system compromise, arbitrary file read, or core telemetry corruption.
- **P1 (High):** Cross-tenant authorization bypass, credential leakage, or unauthenticated data exfiltration.
- **P2 (Medium):** CSV formula injection, CSP weakening, public broker exposure, client-side demo fallback.
- **P3 (Low):** Subprocess path resolution divergence, sync directory mismatch, cosmetic styling flaws.
- **P4 (Informational):** Architectural recommendations, code comment cleanup, documentation alignment.

---

### Master Defect Registry

| Bug ID | Severity | Category | File & Location | Description | Status |
|---|:---:|---|---|---|:---:|
| **BUG-001** | **P0** | Security | `backend/app/main.py:167` | **Arbitrary File Read / Path Traversal:** SPA fallback lacked path canonicalization and directory sandboxing, allowing external requests (`/../../.env`) to escape `static/`. | **FIXED & TESTED** |
| **BUG-002** | **P1** | Security | `backend/app/main.py:73` | **Permissive CORS Regex:** Matched `^https://.*\.github\.io$`, allowing rogue GitHub Pages tenants to send authenticated cross-origin requests. | **FIXED & TESTED** |
| **BUG-003** | **P1** | Security | `backend/.env:8`, `config.py:36` | **Hardcoded JWT Secret:** Static `SECRET_KEY` committed to repository. Allowed offline token forging. | **MITIGATED & DOCUMENTED** |
| **BUG-004** | **P1** | Security | `export.py`, `devices.py`, `settings.py` | **Unauthenticated Sensitive Endpoints:** Sensitive telemetry exports, device diagnostics, and system settings accessible without token verification. | **FIXED & TESTED** |
| **BUG-005** | **P2** | Security | `backend/app/api/v1/export.py:75` | **CSV Formula Injection:** Raw device UIDs and train numbers written to CSV without formula character sanitization. | **FIXED & TESTED** |
| **BUG-006** | **P2** | Security | `backend/app/main.py:94` | **Weak Content Security Policy:** Included `'unsafe-eval'` and overly broad `connect-src` directives. | **FIXED & TESTED** |
| **BUG-007** | **P2** | IoT SCADA | `mqttService.ts`, `mqtt/client.py` | **Public MQTT Broker Dependency:** Defaulting to public HiveMQ sandbox broker without mutual TLS or payload signatures. | **HARDENED & RUNBOOKED** |
| **BUG-008** | **P2** | Logic / HMI | `Sidebar.tsx`, `client.ts` | **Hardcoded Online Tank Count:** Train summary displayed 48 Online / 0 Offline regardless of real hardware connectivity. | **FIXED & TESTED** |
| **BUG-009** | **P2** | Security | `apps/mobile/src/api/client.ts:85` | **Client-Side Authentication Bypass:** Fallback demo login accepted hardcoded credentials on failed API requests. | **HARDENED** |
| **BUG-010** | **P3** | Architecture | `apps/mobile/scripts/build.cjs:170` | **Build Sync Path Divergence:** `rootDist` resolved to `../../../dist` (outside repository root). | **FIXED & TESTED** |
| **BUG-011** | **P3** | Desktop HMI | `apps/mobile/electron/main.cjs:56` | **Python Venv Detection:** Electron only scanned for `backend/venv`, failing on standard `backend/.venv`. | **FIXED & TESTED** |
| **BUG-012** | **P3** | Frontend HMI | `EmployeeDashboard.tsx`, `Sidebar.tsx` | **Mobile Viewport Squeeze:** Desktop sidebar remained visible on mobile screens, compressing main dashboard content. | **FIXED & TESTED** |
| **BUG-013** | **P4** | Documentation | `README.md`, `DEPLOYMENT.md` | **Documentation Drift:** Architecture documents referenced deprecated Qt-only desktop builds without web HMI instructions. | **ALIGNED** |
