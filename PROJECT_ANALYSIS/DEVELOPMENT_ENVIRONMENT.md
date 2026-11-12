# Development Environment Audit — Office Desktop

> Audited directly against this Windows office desktop on **2026-11-12**. All checks were read-only or executed in isolated `%TEMP%` directories without modifying project builds or databases.

---

## 1. Installed vs Required Software Audit

| Tool / SDK | Required For | Status on Office Desktop | Detected Version & Path |
| :--- | :--- | :--- | :--- |
| **Qt SDK (`mingw_64`)** | Classic Qt Desktop build (`>= 6.9`) | **Installed** (not on default `PATH`) | Qt **6.12.0** (`C:\Qt\6.12.0\mingw_64`) |
| **Qt6::Mqtt (`Qt6Mqtt`)** | Qt MQTT client (`MqttService.cpp`) | **Installed** | `C:\Qt\6.12.0\mingw_64\lib\cmake\Qt6Mqtt` |
| **Qt Creator** | Qt IDE / QML debugging | **Installed** (not on default `PATH`) | `C:\Qt\Tools\QtCreator\bin\qtcreator.exe` |
| **MinGW C++ (`g++`)** | Qt CMake build (`13.1.0` matches `build/`) | **Dual Installed (Watch Conflict!)** | 1. `C:\Qt\Tools\mingw1310_64\bin\g++.exe` (**13.1.0**, matches Qt 6.12)<br>2. `C:\msys64\ucrt64\bin\g++.exe` (**16.2.0**, active on `PATH` & referenced by `CMakePresets.json`) |
| **CMake** | Qt C++ build configure | **Installed** | `C:\Program Files\CMake\bin\cmake.exe` (**4.4.4**) + `C:\Qt\Tools\CMake_64\bin\cmake.exe` |
| **Ninja** | CMake generator | **Installed** | `C:\Python314\Scripts\ninja.exe` (**1.13.2**) + `C:\Qt\Tools\Ninja\ninja.exe` |
| **Python** | FastAPI backend + PyInstaller | **Installed (Split Venvs!)** | System: `C:\Python314\python.exe` (**3.14.6**, lacks backend packages)<br>`backend\venv`: **Working Python 3.14.6** (all deps installed)<br>`backend\.venv`: **BROKEN** (points to missing home path `C:\Users\soumi\...\Python312`) |
| **Node.js & npm** | Frontend build (`esbuild`) & Electron | **Installed** | Node **`v24.20.0`**, npm **`11.19.0`** |
| **Frontend `node_modules`** | React, `react-native-web`, Leaflet, Electron 45 | **Present** | Installed in root `node_modules/` & `apps/mobile/node_modules/` |
| **Local Mosquitto Broker** | Offline / local MQTT testing | **Running on Port 1883** | TCP `127.0.0.1:1883` responded `True` (`Test-NetConnection`) |
| **Docker / PostgreSQL (`psql`)** | Container / Postgres stack (`docker-compose.yml`) | **MISSING** | Neither `docker` nor `psql` found; dev uses SQLite WAL |
| **Android SDK / Java / Gradle / `adb`** | Native Android builds | **NOT INSTALLED (Not Needed)** | Missing `java`, `gradle`, `adb`, `ANDROID_HOME` — repo has **no native Android project** |
| **Environment Variables** | `Qt6_DIR`, `JAVA_HOME`, `ANDROID_HOME` | **Unset** | CMake needs explicit `-DCMAKE_PREFIX_PATH=C:/Qt/6.12.0/mingw_64` or Qt Creator kit |

---

## 2. Home-Laptop Migration Findings & Machine-Specific Paths

1. **Broken Virtual Environment (`backend\.venv`):**
   - `backend\.venv\pyvenv.cfg` points to `home = C:\Users\soumi\AppData\Local\Programs\Python\Python312`, which does **not** exist on this office desktop (`C:\Users\User\...`).
   - Meanwhile, `backend\venv\pyvenv.cfg` points to `home = C:\Python314` (`3.14.6`) and has **all required packages** (`fastapi 0.162.0`, `SQLAlchemy 2.1.6`, `uvicorn 0.54.0`, `paho-mqtt 2.1.0`, `pytest 9.2.0`, `pyinstaller 6.22.3`, `alembic 1.20.1`).
   - **Risk in Electron Dev Mode:** `apps/mobile/electron/main.cjs` checks `backend/.venv/Scripts/python.exe` *before* `backend/venv/Scripts/python.exe` whenever the packaged `panorama-backend.exe` is absent (though `backend/dist/panorama-backend/panorama-backend.exe` currently exists and takes priority).

2. **Hardcoded Home-Session Scratch Path in QML (`qml/App.qml`):**
   - Lines `334, 356, 375, 393, 411, 430, 448` of `qml/App.qml` contain a hardcoded scratch path (`C:/Users/User/.gemini/antigravity-ide/brain/af675fed-8d5d-441e-bf51-fbde6dfbdf72/scratch/`) inside QML file logic.

3. **`CMakePresets.json` vs Existing `build/CMakeCache.txt` Compiler Mismatch:**
   - Existing `build/CMakeCache.txt` was built with Qt's **MinGW 13.1.0** (`C:/Qt/Tools/mingw1310_64/bin/g++.exe`), which matches Qt 6.12.0 ABI.
   - However, `CMakePresets.json` (lines 18–19) points `CMAKE_C_COMPILER` / `CMAKE_CXX_COMPILER` to **`C:/msys64/ucrt64/bin/gcc.exe` / `g++.exe`**, which on this desktop is **GCC 16.2.0**. Reconfiguring with the CMake preset risks compiler/ABI conflicts with Qt 6.12.0 binaries.

4. **Missing Runtime Env / Credentials Check (`backend/.env`):**
   - `backend/.env` is present (key names verified: `ENV`, `DEBUG`, `APP_NAME`, `APP_VERSION`, `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `DATABASE_URL`, `MQTT_BROKER_HOST`, `MQTT_BROKER_PORT`, `MQTT_TLS_PORT`, `MQTT_USE_TLS`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID_PREFIX`, `MQTT_TELEMETRY_TOPIC_FILTER`, `MQTT_COMMAND_TOPIC_PREFIX`, `MQTT_STATUS_TOPIC_FILTER`, `DEFAULT_DEVICE_UID`, `DEFAULT_TRAIN_NUMBER`, `DEFAULT_COACH_NUMBER`, geometry & threshold defaults, `CORS_ORIGINS`). Values are intentionally omitted from this report.
   - `apps/mobile/.env.example` exists, with optional `VITE_*` variables supplied at bundle time or overridden dynamically in Settings.

5. **No Hardcoded Local-Only Blockers in Backend Code (Except Default Hardware Hosts):**
   - Qt desktop defaults ESP32 host to `192.168.1.219` (`src/networking/ApiClient.h`, `SettingsManager.cpp`).
   - NextGen backend `settings.py` defaults `device.host` to `192.168.4.1` and `mqtt.host` to `broker.hivemq.com`.

---

## 3. Safe Verification Results on Office Desktop

| Check | Command Used (Safe / Isolated) | Result |
| :--- | :--- | :--- |
| **Backend Pytest Suite** | `DATABASE_URL=sqlite+aiosqlite:///%TEMP%/pwt_pytest_verify.db` + `backend\venv\Scripts\python.exe -m pytest tests/ -q` | **PASSED — `58 passed in 39.47s`** |
| **Alert Unit Test (Node)** | `node apps/mobile/scripts/test_alert_notification_unit.cjs` | **PASSED — `11/11` assertions** |
| **Frontend TypeScript (`tsc`)** | `apps\mobile\node_modules\.bin\tsc --noEmit` | **FAILED — 29 TS errors** across 9 TSX files |
| **Qt CMake Configure (Temp)** | Out-of-source in `%TEMP%\pwt_qt_verify` with `C:\Qt\Tools\mingw1310_64\bin` + `C:\Qt\6.12.0\mingw_64` + `C:\Qt\Tools\Ninja` | **PASSED** (`-- Configuring done`, `-- Generating done`) |
| **Qt Desktop App Build (Temp)** | `cmake --build %TEMP%\pwt_qt_verify --target PanoramaWaterTank -j 4` | **PASSED — `[182/182]`** (`Linking CXX executable bin\PanoramaWaterTank.exe`, exit code `0`) |

---

## 4. Recommended Safe Build & Run Instructions for This Desktop

### A. Run FastAPI Backend (Development)
```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\backend
.\venv\Scripts\python.exe run_server.py
```

### B. Build & Check Frontend HMI
```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\apps\mobile
.\node_modules\.bin\tsc --noEmit   # Fix 29 TS errors before relying on builds
npm run build                        # Bundles via esbuild into apps/mobile/dist
```
Then from repo root to sync `dist/` and `backend/static/`:
```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen
npm run build
```

### C. Configure & Build Qt 6 Desktop App (Matching `mingw1310_64`)
Prepend Qt's matching MinGW 13.1.0 toolchain before MSYS2's GCC 16.2.0:
```powershell
$env:PATH = "C:\Qt\Tools\mingw1310_64\bin;C:\Qt\6.12.0\mingw_64\bin;C:\Qt\Tools\Ninja;$env:PATH"
cmake -S . -B build -G Ninja `
  -DCMAKE_PREFIX_PATH="C:/Qt/6.12.0/mingw_64" `
  -DCMAKE_C_COMPILER="C:/Qt/Tools/mingw1310_64/bin/gcc.exe" `
  -DCMAKE_CXX_COMPILER="C:/Qt/Tools/mingw1310_64/bin/g++.exe"
cmake --build build --target PanoramaWaterTank -j 4
```
