# Panorama Water Tank Monitor — Security Audit & Remediation Report

**Audit Date:** 2026-11-18  
**Scope:** `HTTPS_Server/backend/`, `backend/app/`, `apps/mobile/src/`, `HTTPS_Server/frontend/`, `src/`, `EC200U/`, deployment & CI configs.

---

## 1. Remediated Findings

| Severity | Finding | Location | Remediation Applied |
| :---: | :--- | :--- | :--- |
| **CRITICAL** | Live-format Ubidots API token (`BBUS-*`) hardcoded in desktop C++ source | `src/configuration/SettingsManager.cpp:78,80` | Removed hardcoded token; reads user setting or `UBIDOTS_TOKEN` env var. *(Also cleared sample `BBUS-` string in `backend/app/api/v1/settings.py:33`.)* |
| **CRITICAL** | `@admin` & `@employee` passwords and account lock status silently reset to hardcoded defaults on every backend restart | `backend/app/core/database.py:213-257` | Preserved existing `hashed_password`, `account_status`, and `is_active` across restarts; defaults only seed when accounts do not yet exist. |
| **HIGH** | Permissive wildcard `*.vercel.app` CORS regex with `allow_credentials=True` | `backend/app/main.py:98` | Removed wildcard `*.vercel.app` regex; restricted to explicit loopback, Capacitor, and `https://soumikbur.github.io`. |
| **HIGH** | Unvalidated WebSocket `Origin` & uncapped chunked payload size on sync endpoint | `HTTPS_Server/backend/routes/sync.py` | Enforced `config.CORS_ORIGINS` check on browser WebSocket `Origin` headers and `MAX_UPLOAD_SIZE` byte cap (`413`) on `PUT /api/sync/state/{namespace}`. |
| **HIGH** | Authentication edge cases in `HTTPS_Server` (`Bearer` malformed schemes swallowed as "missing", header-name-as-token not rejected, `X-Device-Token` missing from OpenAPI) | `HTTPS_Server/backend/utils/security.py` | Hardened strict case-insensitive header parsing, constant-time `secrets.compare_digest`, explicit `401 Malformed Authorization header`, reserved header-name rejection, and `APIKeyHeader` OpenAPI scheme. |
| **HIGH** | `get_current_user_optional` ignored JWT `token_version` (logout revocation); `change-password` ignored `current_password` | `backend/app/api/v1/auth.py:41,235` | Added `token_version` verification in `get_current_user_optional` and verified `current_password` whenever supplied to `change-password`. |
| **HIGH** | `window.panoramaNavigate` allowed unauthenticated navigation bypass | `apps/mobile/src/state/AppContext.tsx:1930` | Added authentication gate before changing active screen. |
| **HIGH** | Full TypeScript source exposed via stale 5.32 MB dev sourcemaps in production builds | `apps/mobile/scripts/build.cjs`, `scripts/sync_dist.js`, `backend/static/assets/*.map` | Cleaned build directory, stripped sourcemaps from all production sync targets, and added a CI check failing builds if `index.js.map` reappears. |

---

## 2. Verified Preserved Security Controls

- **Token-based telemetry authentication (`HTTPS_Server`):** Mandatory on `POST /api/telemetry`, `POST /api/telemetry/upload`, `POST /api/telemetry/file`, `GET /api/telemetry/latest`, and `GET /api/telemetry/history`. Tested with 73 automated tests (missing, invalid, empty, malformed, header-name-as-value all return `401`).
- **Zero frontend token leakage:** `HTTPS_Server/frontend/js/api.js` stores `API_TOKEN` in closure memory only (never `localStorage`, `sessionStorage`, cookies, or console logs). Postman collection (`HTTPS_Server/docs/postman/`) uses environment variables only (`{{api_token}}`).
- **Private key hygiene:** Zero `.key` or PEM private keys tracked in Git (`test_test_i_private_key_excluded_from_git` passing).
- **CORS enforcement:** Explicit allowlist (`https://soumikbur.github.io`, loopback) with zero wildcard `*` origins; verified live `OPTIONS` preflight and `401/404/413/500` CORS headers on Render.

---

## 3. Remaining Open Risks & Recommended Operator Actions

| Priority | Item | Location / Service | Recommended Action |
| :---: | :--- | :--- | :--- |
| **P0 (Immediate)** | **Rotate exposed credentials** | Render `API_TOKEN` (previously shown in Postman screenshot) & Ubidots token (previously in `SettingsManager.cpp` git history) | Rotate both tokens immediately in Render Dashboard & Ubidots console; optionally scrub git history with `git filter-repo` if the repo is public. |
| **P1** | **Unauthenticated `/api/sync/state` & `/api/sync/ws` on Render** | `HTTPS_Server/backend/routes/sync.py` | Required today because the static GitHub Pages frontend syncs operational state without embedding `API_TOKEN` in public JS. Upgrade to short-lived user session JWTs issued by a unified auth service before production multi-tenant rollout. |
| **P1** | **Public unauthenticated HiveMQ broker (`broker.hivemq.com`)** | `apps/mobile/src/services/mqttService.ts`, `backend/app/core/config.py`, `render.yaml` | Migrate production fleet devices and web clients from public HiveMQ to a TLS-encrypted, username/password-authenticated private broker (e.g., HiveMQ Cloud / EMQX Cloud) and disable plaintext port `1883`. |
| **P1** | **Hardcoded fallback JWT `SECRET_KEY` in root `backend`** | `backend/app/core/config.py:48` | Always inject a strong random `SECRET_KEY` via environment variables in production and add a startup refusal when `ENV=production` uses the default string. |
| **P2** | **Unauthenticated write/read routes in root `backend`** | `backend/app/api/v1/telemetry.py:105` (`/ingest`), `location.py:240-296` (`/routes`), `settings.py:109-180`, `alarms.py:172` (`/clear`) | Add device-token auth to `/telemetry/ingest` and admin-only auth to route mutations, settings reads, and alarm clear when deploying root `backend/` publicly. |
| **P2** | **Firmware hardcoded default token & TLS clock check** | `EC200U/ec200u_config.h:59`, `ec200u_tls.cpp:41,53` | Provision per-device credentials at manufacturing (flash/NVS) rather than compile-time headers, and enable NITZ clock sync (`AT+CTZU`) before enforcing TLS certificate expiry. |
