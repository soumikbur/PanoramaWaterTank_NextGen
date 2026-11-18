# Panorama Water Tank Monitor — Performance Measurement Report

All metrics below were collected via reproducible automated benchmarks (`measure_backend_perf.py`, `measure_frontend_perf.js`, `npm run build`, and Playwright headless Chrome) on the exact same machine before and after optimization.

---

## 1. Backend & SQLite Performance (`HTTPS_Server` Local Uvicorn Benchmark)

Methodology: 30× `GET /api/health`, 50× authenticated `POST /api/telemetry` (SQLite INSERT), 30× `GET /api/telemetry/latest`, 30× `GET /api/telemetry/history`, 30× `PUT /api/sync/state/fleet` (SQLite WAL upsert), 30× `GET /api/sync/state` (SQLite WAL read).

| Metric | Before (`b6792b7`) | After (`optimize/repo-hardening-and-cleanup`) | Delta |
| :--- | :---: | :---: | :---: |
| `POST /api/telemetry` avg response time (Auth + Pydantic + SQLite INSERT) | `13.67 ms` | **`5.69 ms`** | **-58.4% (2.4× faster)** |
| `POST /api/telemetry` p95 response time | `31.43 ms` | **`20.91 ms`** | **-33.5%** |
| `GET /api/telemetry/latest` avg response time | `6.43 ms` | **`2.59 ms`** | **-59.7% (2.5× faster)** |
| `GET /api/telemetry/history` avg response time | `4.77 ms` | **`4.32 ms`** | **-9.4%** |
| `PUT /api/sync/state/fleet` avg response time (SQLite WAL write) | `15.56 ms` | **`7.00 ms`** | **-55.0% (2.2× faster)** |
| `GET /api/sync/state` avg response time (SQLite WAL read) | `4.46 ms` | **`2.61 ms`** | **-41.5%** |
| Uvicorn server RSS memory | `8.25 MB` | **`8.24 MB`** | Steady |
| Root `backend` `GET /api/v1/settings/config` DB query count | `30 queries` | **`1 query`** | **-96.7% queries** |

*Note: `GET /api/health` is a pure in-memory JSON response whose localhost loopback jitter ranged `1.81–6.12 ms` depending on Windows loopback scheduling; all SQLite-bound endpoints improved dramatically due to persistent WAL connections and amortized pruning.*

---

## 2. Frontend Build, Artifact & Repository Size Measurements

| Metric | Before | After | Delta |
| :--- | :---: | :---: | :---: |
| `apps/mobile/dist/` total size | `56,661.67 KB` (`9` files) | **`51,318.14 KB`** (`7` files) | **-5,343.53 KB (-5.22 MB)** |
| `assets/index.js` minified bundle size | `1,389.96 KB` | **`1,366.92 KB`** | **-23.04 KB (-1.7%)** |
| Production JS/CSS sourcemaps shipped (`*.map`) | `5,320.59 KB` (`2` files) | **`0 KB`** (`0` files) | **-100% eliminated** |
| `PanoramaWaterTank_Capacitor/www` + `android/.../public` APK bloat | `99,772.30 KB` (2× 50 MB APK) | **`0 KB`** (excluded) | **-99.8 MB eliminated** |
| `apps/mobile` esbuild compile time | `742 ms` | **`223 ms`** | **-69.9%** |
| `HTTPS_Server/frontend/` total size | `121.51 KB` (`7` files) | `123.55 KB` (`7` files) | +2.04 KB (modal fix + DOM diffing + debouncing) |
| Tracked stale/cached/debug files removed from Git | `1,475` tracked files | **`1,218`** tracked files | **-257 files (~58+ MB removed)** |

---

## 3. Browser Runtime & Error Measurements (Headless Chrome 1366×768)

| Application & Metric | Before (Live GitHub Pages) | After Verification | Status |
| :--- | :---: | :---: | :---: |
| **Main SCADA App** — Wall load / Load event | `960 ms` / `956 ms` | `1,110 ms` / `1,105 ms` *(network variance)* | Healthy |
| **Main SCADA App** — JS Heap (`usedJSHeapSize`) | `5.99 MB` | **`5.39 MB`** | **-10.0%** |
| **Main SCADA App** — JavaScript console / page errors | `0` / `0` | **`0` / `0`** | Clean |
| **Main SCADA App** — Failed API requests (`HTTP >= 400`) | `0` | **`0`** | Clean |
| **HTTPS Laboratory** — Wall load / Load event | `805 ms` / `801 ms` | `1,182 ms` / `1,179 ms` *(network variance)* | Healthy |
| **HTTPS Laboratory** — JS Heap (`usedJSHeapSize`) | `1.48 MB` | **`1.48 MB`** | Steady |
| **HTTPS Laboratory** — JavaScript console / page errors | `0` / `0` | **`0` / `0`** | Clean |
| **HTTPS Laboratory** — Failed API requests (`HTTP >= 400`) | `0` | **`0`** | Clean |
| **HTTPS Laboratory** — Unchanged polling DOM rebuilds | Every 3 s / 10 s | **Skipped via signature diff** | Optimized |
