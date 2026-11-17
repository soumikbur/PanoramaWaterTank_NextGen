# Panorama Water Tank Monitor (WLI) — Final Project Handover Package

**Project:** Panorama Water Tank Monitor / Water Level Indicator (WLI) — NextGen  
**Phase:** Phase 10 — Final Security Audit, Production Hardening & Handover  
**Repository:** `soumikbur/PanoramaWaterTank_NextGen`  
**Certification Date:** 2026-11-17  
**Readiness Classification:** **LABORATORY CERTIFIED — PRODUCTION READY WITH LIMITATIONS**  

---

## 1. Quick-Start Guide for New Developers

### A. Run the Local Backend & Dashboard in 3 Commands
```bash
# 1. Navigate to the isolated HTTPS receiver directory
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\HTTPS_Server

# 2. Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# 3. Start the FastAPI development server
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
Open your browser to:
- **Interactive Laboratory Dashboard:** `http://127.0.0.1:8000/`
- **Swagger API Documentation:** `http://127.0.0.1:8000/docs`

### B. Run the Full Automated Test Suite (100% Pass)
```bash
# 1. Run all 62 backend integration and contract tests
pytest tests -v

# 2. Run the C++ firmware integration harness
cd ..
g++ -std=c++17 -Wall -Wextra -I. -IEC200U -o tests/test_phase09_e2e_firmware.exe tests/test_phase09_e2e_firmware.cpp EC200U/ec200u_uart.cpp EC200U/ec200u.cpp EC200U/ec200u_tls.cpp EC200U/ec200u_http.cpp EC200U/ec200u_freertos.cpp
.\tests\test_phase09_e2e_firmware.exe

# 3. Run the live modem simulation suite against the local backend
.\HTTPS_Server\.venv\Scripts\python.exe tools\test_ec200u_live.py --auto-start
```

---

## 2. System Architecture & Communication Flow

$$\text{Water Level Sensor} \longrightarrow \text{STM32F4 Main MCU} \longrightarrow \text{UART Ring Buffer} \longrightarrow \text{EC200U Modem} \xrightarrow[\text{Airtel India}]{\text{LTE Cat-1 / TLS 1.3}} \text{FastAPI Cloud Backend} \longrightarrow \text{Laboratory Dashboard}$$

- **STM32F401RE:** Dedicated to real-time ADC sampling, linear hydrostatic math, alarm tripping, and RS485 Modbus communications. Mutex hold time $<1\,\mu\text{s}$.
- **Quectel EC200U-CN:** Handles SIM card interface, LTE network attachment, PDP activation, hardware TLS 1.2/1.3 verification with Let's Encrypt `ISRG Root X1`, and authenticated HTTPS POST.
- **ESP32-WROOM-32:** Dedicated exclusively to local Bluetooth Low Energy (BLE) technician diagnostics. Completely decoupled from cellular, cloud, or wide-area networks.
- **Cloud Backend:** FastAPI with reverse proxy header parsing, Bearer token auth, 1 MB gateway size limiter, and thread-safe in-memory circular storage with duplicate sequence detection.
- **Explicit Prohibitions Enforced:** Zero MQTT, zero Ubidots, zero Wi-Fi cloud telemetry, and zero BME280 sensor code.

---

## 3. Repository Structure & Monorepo Isolation

```
PanoramaWaterTank_NextGen/
├── EC200U/                     # Production C++17 Embedded Modem Driver
│   ├── ec200u_config.h         # Pinouts, baud rate (115200), APN, target endpoints
│   ├── ec200u_types.h          # Data models, TelemetrySnapshot (with sequence_id)
│   ├── ec200u_uart.h / .cpp    # 2048-byte circular ring buffer HAL
│   ├── ec200u.h / .cpp         # Core Modem Manager state machine & recovery
│   ├── ec200u_tls.h / .cpp     # Hardware SSL engine configuration (Context 1)
│   ├── ec200u_http.h / .cpp    # Embedded HTTP client & JSON serializer
│   └── ec200u_freertos.h / .cpp# RTOS coordinator task & sub-microsecond snapshot
├── HTTPS_Server/               # Isolated Python Cloud Ingestion Application
│   ├── backend/                # FastAPI application, routes, schemas, services
│   ├── certificates/           # ISRG Root X1 CA trust store & dev certs
│   ├── docs/                   # Backend guides & phase audit reports
│   ├── tests/                  # 62 Pytest integration & contract tests
│   ├── render.yaml             # Render cloud deployment Blueprint (rootDir: HTTPS_Server)
│   └── requirements.txt        # Lean production dependencies
├── WLI_DOCS/                   # Master Technical Documentation & Audit Reports
│   ├── FINAL_SYSTEM_ARCHITECTURE.md
│   ├── FINAL_HARDWARE_CONFIGURATION.md
│   ├── FINAL_FIRMWARE_GUIDE.md
│   ├── FINAL_SECURITY_REPORT.md
│   ├── FINAL_TEST_REPORT.md
│   ├── MAINTENANCE_GUIDE.md
│   ├── TELEMETRY_DATA_CONTRACT.md
│   └── PROJECT_HANDOVER.md
├── tests/                      # Firmware C++ unit & integration test suites
│   ├── test_ec200u_firmware.cpp
│   └── test_phase09_e2e_firmware.cpp
└── tools/
    └── test_ec200u_live.py     # Live COM6 & software loopback AT test runner
```

---

## 4. API Endpoints Reference

| Endpoint | Method | Auth Required | Description |
|---|:---:|:---:|---|
| `/api/health` | `GET` | No | Basic health check, online status, application version |
| `/api/system/info` | `GET` | No | System uptime, storage statistics, tracked device counts |
| `/api/telemetry` | `POST` | **Yes** (Bearer) | Main IoT telemetry JSON ingestion endpoint |
| `/api/telemetry/file` | `POST` | **Yes** (Bearer) | Multipart JSON file upload endpoint |
| `/api/telemetry/latest` | `GET` | **Yes** (Bearer) | Retrieve latest telemetry (optional `?device_id=X`) |
| `/api/telemetry/history`| `GET` | **Yes** (Bearer) | Reverse-chronological history (optional `?device_id=X&limit=N`) |
| `/` | `GET` | No | Interactive HTTPS Laboratory Dashboard |

---

## 5. Production Environment Variables Configuration

Configure the following variables in the Render Dashboard under **Environment**:

| Variable | Recommended Production Value | Description |
|---|---|---|
| `ENVIRONMENT` | `production` | Enforces production mode and disables dev self-signed certs |
| `API_TOKEN` | `<STRONG_USER_GENERATED_SECRET>` | Bearer authentication token for edge node ingestion |
| `ENABLE_DOCS` | `false` | Disables public `/docs` and `/openapi.json` in production |
| `MAX_UPLOAD_SIZE`| `1048576` | Ingestion payload cap (1 MB) |
| `MAX_HISTORY_RECORDS` | `1000` | In-memory circular history ring capacity |
| `CORS_ORIGINS` | `https://soumikbur.github.io` | Permits cross-origin browser fetch from the website |

---

## 6. Build & Flashing Instructions

### Firmware Compilation (C++17)
```bash
# Compile standalone test runner with GCC / Clang
g++ -std=c++17 -Wall -Wextra -I. -IEC200U \
  tests/test_phase09_e2e_firmware.cpp \
  EC200U/ec200u_uart.cpp \
  EC200U/ec200u.cpp \
  EC200U/ec200u_tls.cpp \
  EC200U/ec200u_http.cpp \
  EC200U/ec200u_freertos.cpp \
  -o tests/test_phase09_e2e_firmware.exe
```

### Flashing STM32 via ST-LINK (SWD)
```bash
STM32_Programmer_CLI -c port=SWD mode=UR -w firmware_wli_v2.2.0.hex 0x08000000 -v -rst
```

---

## 7. Known Limitations & Outstanding Risks

1. **In-Memory Storage Volatility:**
   - Telemetry history is stored in RAM. Backend container restarts or cloud idle spin-downs reset historical logs. Connect an external PostgreSQL/TimescaleDB if permanent multi-month history is required.
2. **Physical Cellular Bench Verification Remaining:**
   - While all 86 unit and integration tests passed in simulation, an over-the-air test with the physical Quectel dev kit attached to `COM6` must be executed on the physical bench before rooftop installation.
3. **Battery Operating Lifetime:**
   - High-frequency 30-second uploads achieve ~22.5 days of battery life on a standard 12V 7Ah battery. Achieving the mandatory 6-month battery autonomy requires setting the upload period to $\ge 1\,\text{hour}$ or using an expanded 12V 12Ah pack.
4. **Historical Git History Revocation:**
   - The legacy Ubidots token was purged from active code (`test_e2e_integration.cpp`), but remains in past Git commits. The token must be formally revoked in the Ubidots portal.

---

## 8. Final Readiness Classification

### Status: **LABORATORY CERTIFIED — PRODUCTION READY WITH LIMITATIONS**

The system is certified for controlled laboratory deployment, bench qualification, and trial coach installations. Full mass-production rollout is authorized upon completion of the physical COM6 bench RF check.
