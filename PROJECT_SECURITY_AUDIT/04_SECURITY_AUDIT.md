# 04. Comprehensive Security Audit (OWASP Top 10 & ASVS 4.0)
## Panorama Water Tank Monitor (WLI SCADA HMI)

**Audit Date:** November 9, 2026  
**Standards Applied:** OWASP Top 10 (2021), OWASP ASVS v4.0.3 (Level 2), CWE / SANS Top 25  
**Audit Scope:** Full Application Stack (FastAPI Backend, SQLite/PostgreSQL, React SPA, Electron HMI)  

---

### 1. OWASP Top 10 (2021) Compliance Matrix

| OWASP Category | Initial State | Vulnerability Discovered | Status Post-Remediation | Residual Risk |
|---|---|---|:---:|---|
| **A01: Broken Access Control** | **VULNERABLE** | 1. SPA fallback path traversal in `main.py` allowed directory escaping to arbitrary system files.<br>2. `export/csv`, `location`, `settings` endpoints had missing authentication checks. | **REMEDIATED** | Low. Enforced strict directory sandboxing, path canonicalization, and mandatory JWT authorization. |
| **A02: Cryptographic Failures** | **WARNING** | Hardcoded default JWT secret in `.env` and `config.py`. Token expiration was 24 hours. MQTT plaintext transport enabled by default. | **MITIGATED** | Medium. Requires formal production provisioning of hardware HSM or vault-managed secrets and TLS certificate deployment. |
| **A03: Injection** | **VULNERABLE** | CSV Formula Injection in `export.py` where train and coach names could trigger DDE commands in Excel. | **REMEDIATED** | Low. All cell values sanitized with single quote prefixing for dangerous formula trigger symbols (`=`, `+`, `-`, `@`). SQL queries use parameterized ORM. |
| **A04: Insecure Design** | **WARNING** | Telemetry ingestion relies on unauthenticated public HiveMQ broker topics. | **DOCUMENTED / HARDENED** | Medium. Telemetry parser enforces rigorous contract validation, range checks, and type guards. Production deployment mandates private authenticated broker. |
| **A05: Security Misconfiguration** | **VULNERABLE** | 1. Overly broad CORS regex allowed arbitrary GitHub Pages subdomains (`.*\.github\.io`).<br>2. CSP header included `'unsafe-eval'`.<br>3. `*` present in allowed CORS origins. | **REMEDIATED** | Low. CORS origin regex locked strictly to loopback and verified production domains (`soumikbur.github.io`). CSP stripped of `'unsafe-eval'`. |
| **A06: Vulnerable & Outdated Components** | **PASSED** | React 18, FastAPI 0.110+, SQLAlchemy 2.0.28+, Pydantic 2.6+, bcrypt 4.1+. | **VERIFIED** | Low. All core dependencies are modern, active, and scanned against known CVE databases. |
| **A07: Identification & Auth Failures** | **MITIGATED** | Mock token fallback in frontend preview build. | **REMEDIATED** | Low. Preview shortcuts disabled in production builds. Server-side session invalidation and token versioning (`token_version`) verified. |
| **A08: Software & Data Integrity Failures** | **PASSED** | Untrusted document upload validation previously hardened with magic bytes and file extension whitelists. | **VERIFIED** | Low. Automated tests verify rejection of spoofed extensions and disguised executables. |
| **A09: Security Logging & Monitoring** | **PASSED** | Detailed `AuditEvent` database logging for account creation, password reset, and alarm acknowledgments. | **VERIFIED** | Low. Tamper-evident audit logs record user ID, IP address, action, and timestamp. |
| **A10: Server-Side Request Forgery (SSRF)** | **PASSED** | Backend makes no outbound calls with user-controlled URLs (Ubidots endpoints and device test endpoints are strictly validated). | **VERIFIED** | Low. Whitelisted domain routing. |

---

### 2. OWASP ASVS v4.0.3 Evaluation Highlights

- **V2 Authentication:** Passwords hashed with bcrypt using modern salt generation; login endpoint enforces IP-based rate limiting (5 attempts per minute burst ceiling); account lockout after consecutive failures.
- **V3 Session Management:** Stateless JWT with server-side revocation capability via `token_version` database counter; tokens invalidated immediately upon password change or admin reset.
- **V4 Access Control:** Role-Based Access Control distinguishes `ADMIN`, `EMPLOYEE`, `OPERATOR`, and `VIEWER`. All write mutations verify admin privileges via `Depends(get_current_admin_user)`.
- **V5 Input Validation:** Strongly-typed Pydantic schemas validate all incoming payloads; boundary limits enforced on water level (0–100%), tank geometry (>0), and coordinates.
- **V14 Build and Deployment:** Static assets compiled with esbuild and served with defensive HTTP headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`).
