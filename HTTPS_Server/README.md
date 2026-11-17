# Panorama Water Tank Monitor — HTTPS Receiver

## 1. Project Overview
The **Panorama Water Tank — HTTPS Receiver** is a lightweight, isolated IoT data receiver and diagnostic laboratory dashboard developed within the `PanoramaWaterTank_NextGen` repository. It provides an encrypted, authenticated HTTPS intake pipeline for cellular telemetry transmitted by coach-mounted edge units.

---

## 2. Hardware Architecture
The active hardware profile consists of:
- **Main MCU (STM32):** Reads analog 0.5–4.5V pressure transducers, runs level and percentage calculations, manages alarm state machines, and issues JSON telemetry via UART.
- **Cellular & GNSS (Quectel EC200U-CN):** Manages 4G LTE-Cat1 network connectivity, GNSS position fixes, and executes HTTPS POST requests with hardware-accelerated TLS 1.2/1.3.
- **Short-Range (ESP32):** Reserved exclusively for BLE beaconing. Zero cellular, Wi-Fi, or HTTPS responsibility.
- **BME280:** Omitted entirely from this hardware architecture.

---

## 3. Directory Structure
```
HTTPS_Server/
│
├── backend/
│   ├── __init__.py
│   ├── config.py                   # Centralized configuration, dynamic PORT, CORS & environment loader
│   ├── main.py                     # FastAPI entrypoint, ProxyHeadersMiddleware & CORS
│   ├── routes/                     # Modular REST API routes
│   │   ├── __init__.py
│   │   ├── health.py               # GET /api/health
│   │   ├── telemetry.py            # POST & GET /api/telemetry/*
│   │   └── system.py               # GET /api/system/info
│   ├── schemas/                    # Pydantic v2 dynamic schemas
│   │   ├── __init__.py
│   │   └── telemetry.py            # TelemetryPayload & response models
│   ├── services/                   # Business logic & state management
│   │   ├── __init__.py
│   │   ├── storage_service.py      # Thread-safe in-memory circular buffer (ephemeral)
│   │   └── telemetry_service.py    # Unified ingestion & timestamping pipeline
│   ├── utils/                      # Security & helper utilities
│   │   ├── __init__.py
│   │   └── security.py             # Constant-time token authentication
│   └── static/                     # Embedded Laboratory Dashboard
│       ├── index.html              # High-density industrial HTML5 layout
│       ├── css/style.css           # Clean light-mode industrial CSS
│       └── js/
│           ├── api.js              # Network client & in-memory token store
│           ├── dashboard.js        # Health, polling, TLS status & stale tracking
│           ├── telemetry.js        # Dynamic variable rendering & tables
│           └── app.js              # Coordinator, testing tools & live clock
│
├── certificates/
│   ├── README.md                   # TLS trust model & Root CA guide
│   ├── development/                # Local development credentials (git-ignored private keys)
│   │   ├── server.crt              # Self-signed X.509 RSA 2048-bit certificate
│   │   ├── server.key              # Private key (STRICTLY git-ignored)
│   │   └── certificate_info.txt    # Human-readable certificate metadata
│   └── production/                 # Production Let's Encrypt / Cloud Edge trust model
│       └── README.md               # ISRG Root X1 trust store guide for EC200U
│
├── scripts/
│   ├── generate_certificate.py     # Pure-Python self-signed X.509 certificate generator
│   ├── inspect_certificate.py      # Detailed X.509 certificate inspector & validator
│   ├── run_server.py               # Dual-mode HTTP (8000) / HTTPS (8443) Uvicorn runner
│   ├── test_https_post.py          # End-to-end encrypted telemetry testing client
│   └── test_production_endpoint.py # Automated 10-test cloud production validation client
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py                 # Pytest fixtures & environment setup
│   ├── test_auth.py                # Authentication & security tests (Group C)
│   ├── test_dashboard_assets.py    # Modular scripts & DOM layout tests
│   ├── test_dashboard_workflow.py  # Full browser interaction lifecycle test
│   ├── test_file_upload.py         # Multipart file upload tests (Group D)
│   ├── test_health.py              # Health check & baseline tests (Group A)
│   ├── test_security.py            # Limits, size caps & path traversal (Group F)
│   ├── test_storage.py             # Storage, ordering & concurrency (Group E)
│   ├── test_structure.py           # Isolation & structure tests (Group G)
│   ├── test_system.py              # System info & diagnostics (Group H)
│   ├── test_telemetry.py           # JSON ingestion & dynamic variables (Group B)
│   ├── test_tls_security.py        # TLS handshake, trust, expiry & SAN tests (Group S)
│   └── verify_live_server.py       # Live Uvicorn socket verification script
│
├── docs/
│   ├── DEPLOYMENT_GUIDE.md         # Complete Render production cloud deployment guide
│   ├── PRODUCTION_ENDPOINT.md      # Public endpoint directory & verification checklist
│   ├── architecture/
│   │   ├── INITIAL_ARCHITECTURE.md
│   │   ├── HTTPS_RECEIVER_ARCHITECTURE.md
│   │   ├── BACKEND_ARCHITECTURE.md
│   │   ├── API_DATA_FLOW.md
│   │   └── DASHBOARD_ARCHITECTURE.md
│   ├── security/
│   │   ├── HTTP_HTTPS_EXPLANATION.md
│   │   └── TLS_CONFIGURATION.md
│   ├── testing/
│   │   ├── API_TEST_REPORT.md
│   │   ├── FRONTEND_TEST_REPORT.md
│   │   ├── DASHBOARD_VALIDATION.md
│   │   └── TLS_TEST_REPORT.md
│   └── audit/
│       ├── TECHNICAL_AUDIT_REPORT.md
│       ├── PHASE_03_GRAPHIFY_AUDIT.md
│       ├── PHASE_04_GRAPHIFY_AUDIT.md
│       ├── PHASE_05_GRAPHIFY_AUDIT.md
│       ├── PHASE_06_GRAPHIFY_AUDIT.md
│       ├── PHASE_07_GRAPHIFY_AUDIT.md
│       ├── PONYTAIL_PHASE_04_REPORT.md
│       ├── PONYTAIL_PHASE_05_REPORT.md
│       ├── PONYTAIL_PHASE_06_REPORT.md
│       └── PONYTAIL_PHASE_07_REPORT.md
│
├── .env.example                    # Environment variable template
├── .gitignore                      # Local Git exclusion rules (blocks *.key, *.pem, .env)
├── pytest.ini                      # Pytest configuration
├── requirements.txt                # Lean Python dependencies
├── render.yaml                     # Render Blueprint specification
└── README.md                       # This document
```

---

## 4. Technology Stack
- **Language:** Python 3.11+ (verified on Python 3.14.6)
- **Web Framework:** FastAPI (>= 0.110.0)
- **ASGI Server:** Uvicorn with standard extras (>= 0.28.0)
- **Cryptography & TLS:** `cryptography` (>= 42.0.0), Python standard `ssl`
- **Reverse Proxy Support:** `ProxyHeadersMiddleware` for Render/Cloudflare forwarded proto
- **Validation:** Pydantic v2 (>= 2.6.0) with dynamic extra attribute preservation
- **Multipart Processing:** Python-Multipart (>= 0.0.9)
- **Configuration:** Python-Dotenv (>= 1.0.0)
- **Testing:** Pytest (>= 8.0.0), Pytest-Asyncio, HTTPX (>= 0.27.0)
- **Frontend Dashboard:** Semantic HTML5, CSS3, Vanilla ES6 JavaScript (zero external CDNs or heavy frameworks)

---

## 5. Cloud Deployment (Render Platform)

See the full [DEPLOYMENT_GUIDE.md](file:///C:/Users/User/Documents/Antigravity_soumik/PanoramaWaterTank_NextGen/HTTPS_Server/docs/DEPLOYMENT_GUIDE.md) for detailed instructions.

### Deployment Summary:
1. Connect repository `https://github.com/soumikbur/PanoramaWaterTank_NextGen` to Render as a **Web Service**.
2. Set **Root Directory** to `HTTPS_Server`.
3. Set **Build Command:** `pip install -r requirements.txt`.
4. Set **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`.
5. Set **Environment Variables:**
   - `ENVIRONMENT=production`
   - `API_TOKEN=<YOUR_STRONG_SECRET>`
   - `LOG_LEVEL=INFO`

---

## 6. Local Environment Setup & Execution

### Setup Virtual Environment:
```powershell
cd "C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\HTTPS_Server"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Running the Server Locally:
**1. HTTPS Mode (Encrypted — Port 8443):**
```powershell
python scripts\run_server.py --mode https
```
- **Dashboard:** [https://localhost:8443](https://localhost:8443)
- **Health Check:** [https://localhost:8443/api/health](https://localhost:8443/api/health)
- **Swagger UI:** [https://localhost:8443/docs](https://localhost:8443/docs)

**2. HTTP Mode (Plain Debugging — Port 8000):**
```powershell
python scripts\run_server.py --mode http
```
- **Dashboard:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Health Check:** [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

---

## 7. REST API Endpoints Specification

| Method | Path | Auth Required | Description |
|---|---|:---:|---|
| `GET` | `/` | No | Serves laboratory testing dashboard HTML |
| `GET` | `/api/health` | No | Service availability, TLS mode & uptime |
| `POST` | `/api/telemetry` | **Yes** | Direct JSON telemetry ingestion (EC200U 4G LTE) |
| `POST` | `/api/telemetry/file` | **Yes** | Multipart/form-data JSON file upload |
| `GET` | `/api/telemetry/latest` | **Yes** | Query latest reading (optional `?device_id=...`) |
| `GET` | `/api/telemetry/history`| **Yes** | Query historical readings (`?device_id=...&limit=...`)|
| `GET` | `/api/system/info` | No | System uptime and memory storage metrics |

---

## 8. Automated Testing & Verification

Run the full pytest suite (54 tests):
```powershell
pytest -v
```

Execute the 10-test production endpoint verification client:
```powershell
# Against local auto-started instance:
python scripts/test_production_endpoint.py --auto-start

# Against deployed public cloud instance:
python scripts/test_production_endpoint.py --base-url https://<service-name>.onrender.com --token <SECRET>
```

---

## 9. Phase Completion Status
- **Phase 01: Technical Audit:** Completed.
- **Phase 02: Architecture Design:** Completed.
- **Phase 03: Project Initialization:** Completed.
- **Phase 04: FastAPI Backend & REST API:** Completed.
- **Phase 05: HTTPS Laboratory Dashboard:** Completed & Verified.
- **Phase 06: TLS/SSL Certificate Generation & Server Configuration:** Completed & Verified.
- **Phase 07: Cloud Deployment & Public HTTPS Endpoint Setup:** **Completed & Ready for User Render Linkage.**
- **Phase 08: Cellular Hardware & Modem AT Integration:** Pending.
