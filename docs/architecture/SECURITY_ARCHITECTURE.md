# Panorama Water Tank Monitor — Security Architecture & Threat Model

---

### 1. Threat Modeling & Defense-in-Depth

The security architecture addresses threats across the three primary layers of industrial IoT:

| Layer | Threat Model | Architectural Mitigation |
|---|---|---|
| **Edge & Sensor** | Physical tapping, replay attacks, signal spoofing | 4–20 mA current loop; packet schema contracts; watchdog staleness timers; cellular APN isolation. |
| **Network & Ingress** | Man-in-the-Middle (MitM), unauthorized data interception | Mandatory TLS 1.3 encryption; mutual TLS (mTLS) for broker; strict CORS origin whitelisting. |
| **Application & API** | Broken Access Control, Path Traversal, CSV Injection, XSS | Strict path canonicalization; bcrypt password hashing; JWT version revocation; CSV formula neutralization. |

---

### 2. Authentication & Authorization Lifecycle

1. **Password Security:** Salted bcrypt hashing with 72-byte safe truncation.
2. **Session Revocation via `token_version`:** When a user logs out, resets credentials, or an administrator locks the account, `user.token_version` is incremented. Existing JWTs fail authentication immediately.
3. **Role-Based Access Control (RBAC):**
   - `ADMIN`: Full administrative control (user provisioning, hardware assignment, calibration).
   - `EMPLOYEE`: Operational monitoring, alarm acknowledgment, and report generation.
   - `OPERATOR` / `VIEWER`: Read-only telemetry and dashboard inspection.

---

### 3. Client & Desktop Sandboxing

- **Web Application:** Content Security Policy blocking `'unsafe-eval'`; `X-Frame-Options: DENY` preventing clickjacking.
- **Electron Shell:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and strict navigation guards intercepting unapproved external URLs.
