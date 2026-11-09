# 06. Authentication & Authorization Security Audit
## Panorama Water Tank Monitor (WLI SCADA HMI)

**Audit Date:** November 9, 2026  
**Target Modules:** `backend/app/core/security.py`, `backend/app/api/v1/auth.py`, `backend/app/models/user.py`, `apps/mobile/src/api/client.ts`  

---

### 1. Password Storage & Cryptographic Verification

#### Implementation Inspection:
- **Hashing Algorithm:** `bcrypt` with automated salt generation (`bcrypt.gensalt()`).
- **Input Preprocessing:** Passwords encoded to UTF-8 and truncated at 72 bytes (`plain_password.encode("utf-8")[:72]`), complying with bcrypt's internal cipher limitation to prevent silent buffer overruns.
- **Verification Logic:** Uses `bcrypt.checkpw(pwd_bytes, hash_bytes)` providing constant-time execution against timing attacks.

#### Findings & Risk Assessment:
- Default seeded administrator password (`Admin@123`) and employee password (`Employee@123`) are provided for initial bootstrapping.
- **Mitigation Requirement:** Enterprise deployment procedures must mandate forced password rotation upon initial login. The `User.must_change_password` flag is supported in both the database model and the HMI frontend to enforce immediate credential resets.

---

### 2. Session Management & JWT Security

#### JWT Configuration:
- **Algorithm:** HMAC-SHA256 (`HS256`).
- **Signature Secret:** Configured via `SECRET_KEY` in environment.
- **Claims Included in Token Payload:**
  - `sub`: Username / subject.
  - `id`: Internal user UUID.
  - `role`: Role string (`ADMIN`, `EMPLOYEE`, `OPERATOR`).
  - `v`: Session version counter (`token_version`).
  - `exp`: UTC expiration timestamp.

#### Token Invalidation & Session Revocation:
- Many traditional JWT implementations suffer from an inability to invalidate tokens prior to expiration.
- In Panorama WLI, when an operator logs out, changes their password, or when an administrator resets their account status, `user.token_version` is atomically incremented (`user.token_version += 1`).
- During token decoding in `get_current_user`, the token's embedded version claim `v` is matched against the database `user.token_version`. Any discrepancy instantly raises HTTP 401 Unauthorized, achieving instantaneous session termination across all active client devices.

---

### 3. Role-Based Access Control (RBAC) Enforcement

The system implements a four-tier hierarchical access model:

| Role | Operational Scope | Permitted Endpoints | Blocked Mutations |
|---|---|---|---|
| **ADMIN** | System Architecture & Fleet Control | All endpoints (Read, Write, Delete, User Management, Calibration) | None |
| **EMPLOYEE** | Active Train & Coach Operations | Telemetry views, Train list, Tank status, Alarm acknowledgment | Tank geometry changes, device provisioning, user deletion |
| **OPERATOR** | Monitoring Station Console | Dashboard view, realtime MQTT stream, alarm inspection | System configuration, threshold alterations |
| **VIEWER** | Read-Only Audit & Reporting | Dashboard, Reports, History views | All state alterations and acknowledgments |

Automated regression test `test_rbac_mutation_endpoints_enforcement` rigorously asserts that non-admin tokens attempting tank mutations or device deletions receive HTTP 403 Forbidden.
