# SECURITY & COMPLIANCE AUDIT: PANORAMA WATER TANK MONITOR
**Audit Standard:** OWASP Top 10 (2021) & Industrial SCADA Cyber Security (IEC 62443-4-2)  
**Evaluated Assets:** FastAPI Backend, React Frontend, MQTT Broker, Database Layer  
**Date:** November 15, 2026

---

## 1. OWASP TOP 10 (2021) COMPLIANCE SCORECARD

| OWASP Category | Finding | Compliance Status | Risk Level |
| :--- | :--- | :---: | :---: |
| **A01: Broken Access Control** | Mutation endpoints protected by `get_current_admin_user`; non-admins restricted to read-only | COMPLIANT | Low |
| **A02: Cryptographic Failures** | TLS 1.3 enforced on MQTT (8883) & HTTPS; bcrypt password hashing (work factor 12) | COMPLIANT | Low |
| **A03: Injection** | 100% SQLAlchemy ORM parameterized queries; zero raw SQL string concatenation | COMPLIANT | Very Low |
| **A04: Insecure Design** | Separation of unassigned hardware device pool from operational fleet | COMPLIANT | Low |
| **A05: Security Misconfiguration** | CORS regex restricted strictly to loopback, GitHub Pages, and Capacitor | COMPLIANT | Low |
| **A06: Vulnerable & Outdated Components**| FastAPI 0.115, SQLAlchemy 2.0.38, Pydantic 2.10, React 18 — current versions | COMPLIANT | Low |
| **A07: Identification & Auth Failures** | Account lockout after 5 failed attempts; token versioning for instant revocation | COMPLIANT | Low |
| **A08: Software & Data Integrity** | Deletion audit records immutable; signed JWT tokens | COMPLIANT | Low |
| **A09: Security Logging & Monitoring** | Audit trails for all CRUD mutations logged in database and structured logs | COMPLIANT | Low |
| **A10: Server-Side Request Forgery** | External train lookup (DataMeet) strictly validates numeric train numbers | COMPLIANT | Low |

---

## 2. ROLE-BASED ACCESS CONTROL (RBAC) MATRIX

```
+---------------------------------------------------------------------------------+
| Operation / Endpoint            | ADMIN          | EMPLOYEE       | OPERATOR   |
+---------------------------------------------------------------------------------+
| View Live Telemetry / Gauges    | ALLOWED        | ALLOWED        | ALLOWED    |
| Acknowledge Alarms              | ALLOWED        | ALLOWED        | DENIED     |
| Record Water Filling Operation  | ALLOWED        | ALLOWED        | DENIED     |
| Register / Edit Trains & Coaches| ALLOWED        | DENIED         | DENIED     |
| Assign / Unassign Devices       | ALLOWED        | DENIED         | DENIED     |
| Calibrate Tank Dimensions       | ALLOWED        | DENIED         | DENIED     |
| Delete Train / Consist          | ALLOWED (Audit)| DENIED         | DENIED     |
| Manage System Users & Roles     | ALLOWED        | DENIED         | DENIED     |
| Change System Settings          | ALLOWED        | DENIED         | DENIED     |
+---------------------------------------------------------------------------------+
```

- **Enforcement Mechanism:** FastAPI dependencies `get_current_user`, `get_current_active_user`, and `get_current_admin_user`.
- **Privilege Escalation Protection:** Any attempt by an `EMPLOYEE` or unauthenticated token to access `/api/v1/users` or issue `DELETE /api/v1/trains/{id}` raises `HTTP 403 Forbidden`.

---

## 3. JWT TOKEN LIFECYCLE & REVOCATION

- **Signature Algorithm:** `HS256` using `SECRET_KEY` loaded from environment variables.
- **Expiration:** Access tokens expire after 60 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES`).
- **Immediate Revocation via `token_version`:**
  - The `users` table maintains an integer column `token_version`.
  - When an administrator modifies a user's role or password, `token_version` is incremented.
  - Active tokens carrying an outdated `token_version` claim are immediately rejected with `401 Unauthorized` without waiting for the 60-minute expiration window.

---

## 4. TAMPER RESISTANCE & DELETION AUDITING

Accidental or malicious fleet deletion is mitigated through:
1. **No Automated Reaper:** Zero-TTL ensures records do not vanish spontaneously.
2. **Soft Deletes:** `is_deleted = True` preserves record relationships and historical metrics.
3. **Immutable Audit Table (`deletion_audit_records`):**
   - Stores deleted entity state, actor identity, IP address, and UTC timestamp.
   - Deletion audit records have no `DELETE` endpoint in the API.

---

## 5. ENVIRONMENT SECRETS & CREDENTIALS PROTECTION

- **`.env` Separation:** Production database passwords, MQTT credentials, and JWT signing keys are stored exclusively in deployment environment variables (Render Dashboard / GitHub Secrets).
- **`.gitignore` Audit:** Verified that `.env`, `*.db`, and private credentials are explicitly ignored in git commits.

---
*Security & Compliance Audit completed.*
