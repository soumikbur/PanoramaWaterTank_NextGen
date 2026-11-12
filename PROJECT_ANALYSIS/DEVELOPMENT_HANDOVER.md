# Development Handover — Office Desktop Transition

> **Date of Handover Analysis:** 2026-11-12  
> **Latest Commit on Copied Source:** `2f96886` (`2026-11-12 02:25:08 +0530`) on branch `main` (`origin`: `https://github.com/soumikbur/PanoramaWaterTank_NextGen.git`)

---

## 1. Current Development Status

The copied repository is a **complete, functional dual-stack snapshot** from the home laptop, including `.git` history, Python backend venv (`backend/venv`), prebuilt PyInstaller backend (`backend/dist/panorama-backend/`), synced web SPA (`dist/` & `backend/static/`), prebuilt Qt executable (`build/bin/PanoramaWaterTank.exe`), and Node dependencies (`node_modules/`).

**Pending Uncommitted Changes at Copy Time (Non-Breaking):**
- 3 files in `apps/mobile/` (`scripts/test_alert_notification_unit.cjs`, `src/components/common/AlertToastBanner.tsx`, `src/services/alertNotificationService.ts`) have `+1` trailing-newline edits left over in the working tree.

---

## 2. Recent Development Changes & Doc-to-Code Drift

Recent commits (`d06d222` -> `2f96886`) introduced major features that **differ from older Markdown documentation** in `README.md`, `CHANGELOG.md`, and `docs/`:

| Area | What Older Documentation Says | What Current Code Actually Does |
| :--- | :--- | :--- |
| **Latest Features (`2f96886`, Nov 12)** | Not documented in `CHANGELOG.md` / `docs/` | Added deduplicated client alert engine (`alertNotificationService.ts`, `AlertToastBanner.tsx`), 11-assertion unit test, rebuilt Admin Settings (`SettingsScreen.tsx`) with 7 `alarm.*_enabled` settings (`settings.py`), `POST /api/v1/alarms/clear`, and alarm transition logging in Qt `TankModel.cpp`. |
| **Header & Search UI (`66276d0`, `6e07b4d`)** | Older desktop header branding | Redesigned responsive mobile header with logo + dynamic section title (`Header.tsx`) and dedicated search submit button + Enter shortcut. |
| **Location Map (`fa36b0e`)** | `README` / older Qt specs mention Google Maps | NextGen `LocationScreen.tsx` is a map-first SCADA view built on **Leaflet 1.9.4** (OpenStreetMap + Esri Satellite tiles), Haversine track distance (`1.12x`), and 10 Howrah–Asansol corridor stations. *(Google Maps API remains only in Qt `LocationManager.cpp`).* |
| **Frontend Bundler & Electron** | Docs say **Vite** and **Electron 30.0.0** | `apps/mobile/scripts/build.cjs` uses **`esbuild 0.21.5`**, and `package.json` uses **Electron `^45.1.0`**. |
| **Edge MCU & MQTT Format** | `SYSTEM_ARCHITECTURE.md` says **ESP32-S3**; `MQTT_ARCHITECTURE.md` shows nested `gps`/`flags` JSON | Edge targets STM32/ESP32 + Quectel EC200U LTE modem sending **flat JSON** (`uid`, `trno`, `chno`, `wlp1`, `wlp2`, `cm1`, `cm2`, `wlv1`, `wlv2`, `bat`, `lat`, `long`, `speed`, `time`). |
| **Capacity Rank Names** | Docs say `FULL`, `ADEQUATE`, `LOW`, `CRITICAL` | `backend/app/services/calculator.py` returns `LOW`, `MODERATE`, `GOOD`, `HIGH`. |
| **Ubidots Cloud** | Listed in Settings specs | Active **only** in Qt `ApiClient.cpp`; in NextGen it is config storage only. |

---

## 3. What Is Ready vs Incomplete on This Office Desktop

### Ready Immediately
- **Backend API & MQTT Server:** `backend/venv` works with local Python `3.14.6`; all **58 pytest tests pass**.
- **Prebuilt Desktop Apps:**
  - NextGen FastAPI + Electron + `backend/dist/panorama-backend/` present.
  - Classic Qt `6.12.0` app (`PanoramaWaterTank.exe`) configures and compiles cleanly `[182/182]` using `C:\Qt\Tools\mingw1310_64\bin` + `C:\Qt\6.12.0\mingw_64` + `C:\Qt\Tools\Ninja`.
- **Alert Notification Unit Tests:** `11/11` pass cleanly under local Node `v24.20.0`.
- **Local MQTT Broker:** Port `1883` is active on `127.0.0.1` on this machine for offline testing.

### Incomplete / Needs Action Before Resuming Feature Work
1. **Fix 29 TypeScript Errors (`tsc --noEmit`):** Especially `App.tsx:110` (`setActiveScreen` missing in `MainContent`) and `TrainManagementScreen.tsx` (`Layers`, `setSelectedCoachNumber`).
2. **Wire Backend Alarm Toggles:** Enforce `alarm.*_enabled` keys from `settings` inside `backend/app/mqtt/client.py` / `AlarmService` (currently client-toast-only).
3. **Clean Migration Artifacts (Once Authorized):**
   - Remove broken `backend/.venv` (points to `C:\Users\soumi\...\Python312`) or prioritize `backend/venv` in `apps/mobile/electron/main.cjs`.
   - Fix hardcoded home-session scratch path in `qml/App.qml`.
   - Align `CMakePresets.json` compiler path with `C:/Qt/Tools/mingw1310_64/bin`.
   - Optionally disable `VITE_ENABLE_TEST_LOGIN` default `true` in `apps/mobile/scripts/build.cjs` for production builds.
4. **Refresh Graphify Knowledge Graph (Optional):** `graphify update .` when ready so `graphify-out/` reflects commits after `70ee9c6`.

---

## 4. Safe Startup Checklist for Next Coding Session

1. Inspect/commit or discard the 3 trailing-newline working-tree diffs (`git diff`).
2. Fix `tsc --noEmit` errors before touching React screens (`cd apps\mobile; .\node_modules\.bin\tsc --noEmit`).
3. Run backend tests using `backend\venv\Scripts\python.exe -m pytest tests/ -q` after any backend edit.
4. Use `C:\Qt\Tools\mingw1310_64\bin` (not MSYS2 GCC 16.2.0) whenever configuring/building the Qt desktop target.
5. Do **not** deploy Electron/Windows installers without syncing `dist/` (`npm run build` at repo root) and rebuilding `backend/dist/panorama-backend/` via `build-windows.bat` / `build-windows.ps1`.

