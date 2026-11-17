# Final Backend Architecture & API Operations Guide

**Project:** Panorama Water Tank Monitor (WLI) — NextGen  
**Subsystem:** `PanoramaWaterTank_NextGen/HTTPS_Server`  
**Framework:** FastAPI 0.115.0 on Uvicorn 0.30.0 (Python 3.11+)  
**Date:** 2026-11-17  

---

## 1. Backend Architecture & Components

The HTTPS Receiver application is a lightweight, isolated IoT telemetry backend built specifically for industrial cellular edge nodes:

```
HTTPS_Server/
├── backend/
│   ├── config.py           # Environment variables, ports, CORS, TLS paths
│   ├── main.py             # FastAPI entrypoint, middleware, static mount
│   ├── routes/
│   │   ├── health.py       # GET /api/health
│   │   ├── system.py       # GET /api/system/info
│   │   └── telemetry.py    # POST /api/telemetry, /file, GET /latest, /history
│   ├── schemas/
│   │   └── telemetry.py    # Pydantic V2 models, extra="allow"
│   ├── services/
│   │   ├── storage_service.py   # Thread-safe in-memory circular storage & deduplication
│   │   └── telemetry_service.py # Ingestion processing & file byte parsing
│   ├── static/             # HTTPS Laboratory Dashboard (HTML/CSS/JS)
│   └── utils/
│       └── security.py     # Bearer and X-Device-Token verification
├── certificates/           # TLS trust store & local development certs
├── render.yaml             # Declarative Render Blueprint
└── requirements.txt        # Minimal production dependencies
```

---

## 2. Complete REST API Reference

| Method | Endpoint | Auth Required? | Request Format | Response Codes | Description |
|:---:|---|:---:|---|:---:|---|
| `GET` | `/api/health` | No | None | `200` | Service health status, application name, version |
| `GET` | `/api/system/info` | No | None | `200` | System uptime, storage statistics, tracked device counts |
| `POST` | `/api/telemetry` | **Yes** (Bearer) | JSON Body | `200`, `401`, `413`, `422` | Primary IoT telemetry ingestion endpoint |
| `POST` | `/api/telemetry/file` | **Yes** (Bearer) | Multipart File | `200`, `400`, `401`, `413` | Laboratory JSON file upload ingestion endpoint |
| `GET` | `/api/telemetry/latest` | **Yes** (Bearer) | Query Param (`device_id`) | `200`, `401`, `404` | Retrieves latest reading for a device or all devices |
| `GET` | `/api/telemetry/history` | **Yes** (Bearer) | Query Params (`device_id`, `limit`) | `200`, `401` | Reverse-chronological historical records |
| `GET` | `/` | No | None | `200` | Serves the interactive HTTPS Laboratory Dashboard |
| `GET` | `/docs` | Configurable | None | `200` | Interactive OpenAPI Swagger UI (`ENABLE_DOCS=true`) |

---

## 3. Authentication & Security Middleware

### A. Authentication Header Validation (`backend/utils/security.py`)
Requests to protected endpoints must supply the secret token via either:
- Standard HTTP Authorization Header: `Authorization: Bearer <API_TOKEN>`
- Device Custom Header: `X-Device-Token: <API_TOKEN>`

When `API_TOKEN` is configured on the server, missing credentials return `HTTP 401 Unauthorized` with detail `"Unauthorized: Missing API token in Authorization or X-Device-Token header."`. Invalid tokens return `HTTP 401 Unauthorized` with detail `"Unauthorized: Invalid API token provided."`.

### B. Gateway Payload Size Limiter (`backend/main.py`)
`limit_request_size` middleware drops any request with `Content-Length > MAX_UPLOAD_SIZE` (default: 1 MB) immediately with `HTTP 413 Payload Too Large`, protecting against memory exhaustion attacks.

### C. Reverse Proxy Header Support
`ProxyHeadersMiddleware` is mounted with `trusted_hosts=["*"]` to extract `X-Forwarded-Proto` and `X-Forwarded-For` from Cloudflare/Render edge proxies, ensuring RFC-compliant HTTPS URL generation.

---

## 4. Telemetry Storage & Duplicate Detection Engine

The storage service (`backend/services/storage_service.py`) operates entirely in system RAM using a bounded circular buffer:
- **Zero Database Overhead:** No PostgreSQL, SQLite, or ORM dependencies; instant boot and minimal memory footprint.
- **Capacity:** Bounded to `MAX_HISTORY_RECORDS` (default: 1,000 records). When the buffer is full, the oldest records are dropped (`FIFO`).
- **Duplicate Sequence Detection:** Compares incoming `sequence_id` against the latest known record for that `device_id`. If identical, the record is flagged with `"is_duplicate": true` and tracked in `storage.duplicate_records_detected`.

> [!NOTE]
> Telemetry records are ephemeral and reside in RAM. Container restarts or cloud free-tier cold starts reset the in-memory history. For multi-week historical analytics, an external time-series database (e.g. TimescaleDB or PostgreSQL) may be connected to `storage_service.py`.

---

## 5. HTTPS Laboratory Dashboard

Served directly from `GET /` using modular static vanilla JavaScript:
- **P&ID Water Tank Displays:** Visualizes arrival and departure tanks with level in cm, percentage, volume, and alarm thresholds.
- **Diagnostic Gauges:** Displays transducer voltage, battery DC voltage, cellular CSQ signal strength, and GPS lock coordinates.
- **Freshness Indicator:** Automatically changes state to `"STALE"` if no reading is received for $>180\,\text{s}$.
- **Bench Test Tools:** Features an interactive JSON manual POST tester, a multipart JSON file uploader, and a raw response viewer.
- **Zero Token Leakage:** The dashboard stores API tokens solely in browser runtime memory (`apiToken` variable); tokens are never written to `localStorage`, `sessionStorage`, or cookies.

---

## 6. Cloud Deployment Instructions (Render)

1. **Connect Repository:** Link `soumikbur/PanoramaWaterTank_NextGen` in the Render Dashboard.
2. **Select Web Service:** Use `render.yaml` Blueprint or create a Python Web Service.
3. **Configure Isolated Root:**
   - **Root Directory:** `HTTPS_Server`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
4. **Environment Variables:**
   - `ENVIRONMENT`: `production`
   - `API_TOKEN`: `<STRONG_SECRET_TOKEN>`
   - `ENABLE_DOCS`: `false` (in strict production)
   - `MAX_UPLOAD_SIZE`: `1048576`
   - `MAX_HISTORY_RECORDS`: `1000`
   - `CORS_ORIGINS`: `https://soumikbur.github.io`
