# Panorama Water Tank Monitor — Production Deployment Guide

**Repository:** `https://github.com/soumikbur/PanoramaWaterTank_NextGen`  
**Live Frontend (GitHub Pages):** `https://soumikbur.github.io/PanoramaWaterTank_NextGen/`  
**Live HTTPS Laboratory:** `https://soumikbur.github.io/PanoramaWaterTank_NextGen/https/`  
**Live Backend (Render):** `https://panorama-water-tank-backend.onrender.com`

---

## 1. Architecture Overview

| Component | Source Directory | Build Output | Hosting Target |
| :--- | :--- | :--- | :--- |
| Main SCADA Web App | `apps/mobile/` | `dist/` (via `npm run build`) | GitHub Pages (`/`) |
| HTTPS Laboratory UI | `HTTPS_Server/frontend/` | `dist/https/` & `dist/lab/` | GitHub Pages (`/https/`) & Render (`/`) |
| HTTPS Receiver & Multi-User Sync API | `HTTPS_Server/` | Python FastAPI (`backend.main:app`) | Render Web Service |
| Full Relational SCADA Backend *(optional self-hosted)* | `backend/` | Python FastAPI (`app.main:app`) | Docker / Render / PostgreSQL |

---

## 2. GitHub Pages Deployment (Automated via GitHub Actions)

GitHub Pages is deployed automatically on every push to `main` by `.github/workflows/backend-ci.yml` (`CI & GitHub Pages Deployment`):

1. **Repository Settings → Pages:** Source must be set to **GitHub Actions**.
2. **Build Pipeline (`npm run build`):**
   - Runs `apps/mobile/scripts/build.cjs` (cleans `apps/mobile/dist`, compiles minified ESM bundle via esbuild with `legalComments: 'none'` and zero `.map` sourcemaps).
   - Runs `scripts/sync_dist.js`:
     - Copies clean production web assets (`*.map` excluded) to `dist/` and `backend/static/`.
     - Copies web assets (excluding `*.map` and `*.apk`) to `PanoramaWaterTank_Capacitor/www` and Android assets.
     - Copies `HTTPS_Server/frontend/` to `dist/https/`, `dist/lab/`, and syncs JS/CSS to `HTTPS_Server/backend/static/`.
3. **Verification:** `.github/workflows/ci.yml` verifies `dist/index.html`, `dist/404.html`, `dist/https/index.html`, `dist/lab/index.html`, rejects any leaked `dist/assets/index.js.map`, runs root `backend/tests/`, and runs `HTTPS_Server/tests/` (73 tests).

---

## 3. Render Backend Deployment (`HTTPS_Server`)

The live cloud service `https://panorama-water-tank-backend.onrender.com` runs the isolated `HTTPS_Server` FastAPI application:

### Service Configuration
- **Repository:** `soumikbur/PanoramaWaterTank_NextGen`
- **Branch:** `main`
- **Root Directory:** `HTTPS_Server`
- **Runtime:** Python `3.11.9`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:**
  ```bash
  uvicorn backend.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"
  ```
- **Health Check Path:** `/api/health`

### Required Environment Variables (Set in Render Dashboard — Never Commit Secrets)
| Variable | Value / Example | Notes |
| :--- | :--- | :--- |
| `ENVIRONMENT` | `production` | Binds `0.0.0.0` and blocks local dev self-signed TLS certs |
| `API_TOKEN` | `<strong-random-32+-char-secret>` | Required for `POST /api/telemetry`, `/upload`, `/file`, `GET /latest`, `/history` (via `Authorization: Bearer` or `X-Device-Token`). **Rotate immediately if exposed.** |
| `CORS_ORIGINS` | `https://soumikbur.github.io` | Comma-separated allowlist (wildcard `*` is stripped automatically) |
| `LOG_LEVEL` | `INFO` | Controls structured server logging |
| `MAX_UPLOAD_SIZE` | `1048576` | 1 MB request & state payload limit |
| `MAX_HISTORY_RECORDS` | `1000` | Bounded circular + SQLite telemetry retention |
| `ENABLE_DOCS` | `true` *(or `false` for strict lockdown)* | Toggles `/docs` and `/openapi.json` |
| `TELEMETRY_DB_PATH` *(optional)* | `/var/data/panorama_telemetry.db` | Attach a Render Persistent Disk to retain SQLite across restarts |
| `STATE_DB_PATH` *(optional)* | `/var/data/panorama_shared_state.db` | Attach a Render Persistent Disk to retain multi-user fleet state across restarts |

> **Important (Render Free Tier):** Free-tier containers sleep after ~15 minutes idle (30–50 s cold start) and use an ephemeral filesystem. Attach a Render Persistent Disk (pointing `TELEMETRY_DB_PATH` and `STATE_DB_PATH` to the mount path) for permanent retention across redeploys.

---

## 4. Postman & EC200U Integration Setup

Import the zero-secret Postman collection and environment from `HTTPS_Server/docs/postman/`:
- `Panorama_WLI_HTTPS_Backend.postman_collection.json`
- `Panorama_WLI_Render.postman_environment.json`

Configure the `api_token` environment variable with your Render `API_TOKEN`. Both authentication headers are supported case-insensitively:
- **API Key Header:** `X-Device-Token: <API_TOKEN>`
- **Bearer Header:** `Authorization: Bearer <API_TOKEN>`

---

## 5. Local Development Quickstart

```powershell
# 1. Start HTTPS_Server backend locally (port 8000)
cd HTTPS_Server
.\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 2. Build & sync frontends (from repository root)
cd ..
npm run build

# 3. Run HTTPS_Server test suite (73 tests)
HTTPS_Server\.venv\Scripts\python.exe -m pytest HTTPS_Server\tests -v
```

---

## 6. Post-Deployment Verification Checklist

1. `GET https://panorama-water-tank-backend.onrender.com/api/health` → `200 OK` (`"status": "online"`)
2. `GET https://panorama-water-tank-backend.onrender.com/api/system/info` → `200 OK` (`"sqlite_persisted": true`)
3. `POST https://panorama-water-tank-backend.onrender.com/api/telemetry` (no token) → `401 Unauthorized`
4. `POST https://panorama-water-tank-backend.onrender.com/api/telemetry` (`X-Device-Token: <API_TOKEN>`) → `200 OK`
5. Open `https://soumikbur.github.io/PanoramaWaterTank_NextGen/` → verify 0 console errors and `CONNECTED` sync status
6. Open `https://soumikbur.github.io/PanoramaWaterTank_NextGen/https/` → verify 100% zoom, 0 console errors, and live backend health
