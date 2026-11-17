# Final Security Audit & Production Hardening Report

**Project:** Panorama Water Tank Monitor (WLI) — NextGen  
**Document:** Final Security Audit, Cryptographic Review & Threat Analysis  
**Auditor:** Principal Industrial IoT Security & Network Hardening Engineer  
**Security Classification:** Strict Internal Technical Audit  
**Date:** 2026-11-17  

---

## 1. Executive Summary

A comprehensive, critical-priority security audit was performed across all firmware, modem, backend, and deployment components of the **Panorama Water Tank Monitor (WLI)**. The audit verified credential handling, private key protection, authentication mechanisms, TLS/SSL transport security, and gateway DoS resistance.

All exposed legacy credentials were sanitized in active code, cryptographic private keys were confirmed excluded from version control, authentication was verified across all ingestion and query endpoints, and TLS certificate validation was confirmed active in hardware.

---

## 2. Credential Audit & Secret Sanitization

### A. Repository & Source Code Audit Findings
A comprehensive regex sweep was executed across all source code, markdown documentation, scripts, and configuration files for exposed secrets:

1. **Legacy Ubidots Cloud Credential:**
   - *Finding:* A hardcoded legacy Ubidots authentication token was identified in `tests/test_e2e_integration.cpp` (Line 30).
   - *Assessment:* In accordance with the security directive, this credential was treated as fully compromised.
   - *Action Taken:* The hardcoded credential was purged from `test_e2e_integration.cpp` and replaced with the safe placeholder string `QStringLiteral("BBUS-REVOKED-LEGACY-TOKEN-PLACEHOLDER")`.
   - *Status:* **Sanitized in Active Working Tree.**

2. **Git Commit History Implications & Remediation:**
   - *Risk Analysis:* Deleting or replacing a secret in the latest commit does **not** purge it from past Git commit objects. Anyone with repository read access could inspect historical commits to view the legacy token.
   - *Recommended Corrective Actions:*
     1. **Immediate Account Revocation:** The repository owner must log into the Ubidots cloud administrative console and immediately revoke or delete the compromised API token.
     2. **Historical Git Scrubbing (Optional):** If the repository is published publicly, the owner may scrub the token from past commit blobs using standard tools such as `git filter-repo` or `BFG Repo-Cleaner`:
        ```bash
        # Example historical scrubbing command using BFG Repo-Cleaner
        java -jar bfg.jar --replace-text banned_tokens.txt my-repo.git
        git reflog expire --expire=now --all && git gc --prune=now --aggressive
        ```
     3. *Strict Policy:* In accordance with the project guidelines, automated rewriting or force-pushing of shared Git history was not performed autonomously.

3. **Backend API Tokens:**
   - Production API tokens are injected exclusively via environment variables (`API_TOKEN`).
   - Default fallback tokens in `.env.example` are clearly labeled as `dev_secret_token_123` and rejected in production environments.

---

## 3. Cryptographic Private Key & Trust Store Review

| Cryptographic Asset | Storage Location | In Git? | Production Disposition |
|---|---|:---:|---|
| **Server Private Key** (`server.key`) | Local dev environment only | **NO** (Excluded by `.gitignore`) | Production TLS is terminated at Render edge proxy; private keys are managed by cloud infrastructure. |
| **Development Certificate** (`server.crt`) | `certificates/development/` | Yes (Public Cert) | Blocked in production mode via `get_resolved_tls_paths()` safeguard. |
| **Public CA Trust Store** (`cacert.pem`) | `certificates/cacert.pem` | Yes (Public Cert) | Public Let's Encrypt `ISRG Root X1` root CA provisioned to EC200U modem UFS. Zero private key exposure. |
| **Cellular Modem Private Keys** | None | N/A | Server-only authentication (`seclevel=1`). Client private keys are neither generated nor stored on the modem. |

---

## 4. API Authentication & Token Protection

### A. Endpoint Guard Enforcement
- Ingestion endpoints (`POST /api/telemetry` and `POST /api/telemetry/file`) enforce mandatory token validation via FastAPI dependencies (`verify_api_token`).
- Query endpoints (`GET /api/telemetry/latest` and `GET /api/telemetry/history`) enforce mandatory token validation.
- Missing credentials return `HTTP 401 Unauthorized` (`"Unauthorized: Missing API token in Authorization or X-Device-Token header."`).
- Invalid credentials return `HTTP 401 Unauthorized` (`"Unauthorized: Invalid API token provided."`).
- Error details contain zero secret reflection or sensitive system internal paths.

### B. Frontend Token Isolation
- The Laboratory Dashboard (`HTTPS_Server/backend/static/js/app.js`) stores the API token in a private JavaScript runtime closure variable (`apiToken`).
- Tokens are **never** persisted to `localStorage`, `sessionStorage`, or browser cookies.
- Reloading the page clears the token from browser memory, requiring technician re-entry.

---

## 5. TLS Transport Security & Certificate Validation

1. **Hardware-Enforced Server Verification:**
   - Quectel EC200U SSL Context 1 is configured with `AT+QSSLCFG="seclevel",1,1`, binding certificate validation to the `ISRG Root X1` trust store.
   - Setting `seclevel=0` (bypassing verification) is strictly prohibited in firmware code.
2. **Server Name Indication (SNI):**
   - Configured via `AT+QSSLCFG="sni",1,1`. Mandatory for multi-tenant reverse proxy architectures (Cloudflare / Render).
3. **NITZ Clock Immunity:**
   - Configured via `AT+QSSLCFG="ignorelocaltime",1,1` to prevent false certificate expiration rejections prior to cellular network time sync.
4. **Rejection of Invalid / Expired Certificates:**
   - Confirmed in unit test suites `test_tls_security.py` (Tests B, C, D) and `test_ec200u_firmware.cpp` (Test 05).

---

## 6. Input Validation & Denial-of-Service (DoS) Protection

1. **Gateway Payload Size Limiter:**
   - Incoming request headers are inspected by `limit_request_size` middleware in `main.py`.
   - Requests with `Content-Length > 1,048,576` bytes ($1\,\text{MB}$) are dropped immediately with `HTTP 413 Payload Too Large`.
2. **Multipart File Ingestion Cap:**
   - The file upload endpoint in `telemetry.py` streams bytes in $64\,\text{KB}$ chunks and terminates processing if cumulative bytes exceed $1\,\text{MB}$.
3. **Pydantic V2 Schema Validation:**
   - Telemetry payloads are strictly validated for required non-empty `device_id` (1–64 characters).
   - Malformed JSON structures return `HTTP 422 Unprocessable Entity` or `HTTP 400 Bad Request` without exposing Python tracebacks.

---

## 7. Known Security Limitations & Operational Risks

1. **In-Memory Telemetry Volatility:**
   - Telemetry records are stored in system RAM. A backend container restart clears historical records. This is an operational trade-off to maintain zero database dependencies.
2. **Pre-Shared Static API Token:**
   - The edge nodes use a pre-shared bearer token. While protected by TLS 1.2/1.3 in transit, physical memory dumping of an edge MCU could expose the token. Recommended future upgrade: per-device asymmetric public-key JWT signatures.
3. **Certificate Renewal Cycle:**
   - The Let's Encrypt `ISRG Root X1` certificate is valid until **September 30, 2035**. Server-side certificate rotations (which renew every 90 days) require no changes on the modem as long as the root trust chain remains unchanged.
