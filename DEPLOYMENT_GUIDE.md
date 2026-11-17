# Cloud Deployment & Production HTTPS Guide — Render Platform

## 1. Architectural Rationale

### Why GitHub Pages Cannot Host FastAPI
The existing front-end dashboard is hosted via **GitHub Pages** at `https://soumikbur.github.io/PanoramaWaterTank_NextGen/`. GitHub Pages is a static content delivery network (CDN) that serves static files (HTML, CSS, client-side JavaScript, and WebAssembly). It does **not** provide:
- A Python server runtime.
- A persistent TCP or ASGI network listener.
- Dynamic request processing, file handling, or backend routing.
- The ability to execute `uvicorn backend.main:app`.

Consequently, while the static web application runs on GitHub Pages, the IoT telemetry receiver requires an active cloud container environment capable of terminating HTTPS connections, authenticating requests, parsing JSON, and executing Python.

### Why Render is Selected
**Render** (`render.com`) is a modern cloud application platform that provides:
- Native Python container environments with automatic build and start execution.
- Managed, zero-cost TLS certificates (automated provisioning and 90-day renewal via Let's Encrypt).
- Direct GitHub repository integration with automatic Git commit webhooks.
- Subdirectory isolation (`rootDir: HTTPS_Server`), enabling the new IoT receiver to live alongside the existing website and Capacitor applications in the same repository.
- Native reverse-proxy TLS termination forwarding requests via HTTP with `X-Forwarded-Proto` and `X-Forwarded-For`.

---

## 2. Monorepo Integration Architecture

The `PanoramaWaterTank_NextGen` repository hosts multiple independent subsystems. By configuring Render's `rootDir` parameter, the cloud service builds and runs exclusively inside `HTTPS_Server/`:

```
GitHub Repository: https://github.com/soumikbur/PanoramaWaterTank_NextGen
  │
  ├── Existing Website (Static Vite/React frontend -> deployed to GitHub Pages)
  │
  ├── Existing Capacitor Application (Android mobile build)
  │
  └── HTTPS_Server (Dedicated Subdirectory)
        │
        ├── backend/                  # FastAPI Application Package
        ├── certificates/             # Local dev certs & production CA docs
        ├── docs/                     # Technical specifications & guides
        ├── scripts/                  # Certificate, test & runner utilities
        ├── tests/                    # 54-test regression & TLS security suite
        ├── .env.example              # Production configuration template
        ├── render.yaml               # Declarative Blueprint configuration
        └── requirements.txt          # Production dependencies
```

---

## 3. Step-by-Step Render Deployment Procedure

### Option A: Declarative Blueprint Deployment (`render.yaml`)
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub account and select repository: `soumikbur/PanoramaWaterTank_NextGen`.
4. Render will parse `HTTPS_Server/render.yaml` (or specify blueprint path `HTTPS_Server/render.yaml`).
5. Review the service definition `panorama-wli-https-receiver` and click **Apply**.

### Option B: Manual Web Service Deployment
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** and select **Web Service**.
3. Choose **Build and deploy from a Git repository** and connect:
   `https://github.com/soumikbur/PanoramaWaterTank_NextGen`
4. Configure the service settings:
   - **Name:** `panorama-wli-https-receiver` (or your preferred identifier)
   - **Region:** `Oregon (US West)` or nearest region
   - **Branch:** `main`
   - **Root Directory:** `HTTPS_Server`  *(CRITICAL: Isolates deployment to the HTTPS subsystem)*
   - **Runtime:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
   - **Instance Type:** `Free`

---

## 4. Production Environment Variables Configuration

In the Render Dashboard under **Environment**, configure the following variables:

| Variable Name | Required | Example Production Value | Description |
|---|:---:|---|---|
| `ENVIRONMENT` | **Yes** | `production` | Enforces production security gates and disables dev self-signed cert loading |
| `API_TOKEN` | **Yes** | *(Generate a 32+ character random string)* | Bearer token required for EC200U modem POST ingestion |
| `LOG_LEVEL` | No | `INFO` | Logging verbosity (`INFO`, `WARNING`, `ERROR`) |
| `MAX_UPLOAD_SIZE`| No | `1048576` | Payload size cap in bytes (default: 1 MB) |
| `MAX_HISTORY_RECORDS` | No | `1000` | In-memory circular buffer history capacity |
| `CORS_ORIGINS` | No | `https://soumikbur.github.io` | Allowed cross-origin browser origins |

> [!CAUTION]
> **Production Credential Security:**
> - Never hardcode the production `API_TOKEN` in source code or commits.
> - Never enter the production `API_TOKEN` into frontend JavaScript files.
> - `.env` is git-ignored and must never be pushed to GitHub.
> - Render injects environment variables securely into the container runtime.

---

## 5. Reverse Proxy & Managed TLS Architecture

```mermaid
flowchart LR
    EdgeModem["Quectel EC200U 4G LTE"] -->|HTTPS POST :443 (TLS 1.2/1.3)| RenderEdge["Render Cloudflare/Envoy Edge Proxy"]
    Browser["Operator Web Browser"] -->|HTTPS GET :443| RenderEdge
    RenderEdge -->|Plain HTTP :$PORT (Internal Private Network)| UvicornApp["FastAPI / Uvicorn Container"]
    
    subgraph CertAuthority ["Public Certificate Authority"]
        LE["Let's Encrypt / DigiCert"] -.->|Auto-Provision & Renew| RenderEdge
    end
    
    subgraph Headers ["Injected Forwarded Headers"]
        RenderEdge -.->|X-Forwarded-Proto: https<br/>X-Forwarded-For: client-ip| UvicornApp
    end
```

### Key TLS Characteristics:
1. **Edge TLS Termination:** Render terminates SSL/TLS on port 443 at its edge router. Communications between the IoT device and Render are 100% encrypted over public LTE.
2. **Internal Proxy Forwarding:** Render forwards requests over an isolated internal network to Uvicorn using the dynamic port defined in `$PORT` (typically 10000).
3. **Forwarded Headers Support:** Running Uvicorn with `--proxy-headers --forwarded-allow-ips="*"` and FastAPI's `ProxyHeadersMiddleware` ensures that `request.url` and documentation links correctly reflect `https://`.
4. **No Internal Redirect Loops:** The FastAPI application does not execute naive HTTP-to-HTTPS redirect logic; Render's edge handles HTTPS enforcement automatically.

---

## 6. Distinguishing Development vs. Production Certificates

| Attribute | Local Development (Phase 06) | Cloud Production (Render Phase 07) |
|---|---|---|
| **Certificate Authority** | Self-signed private root generated locally | Public Trusted CA (Let's Encrypt / ISRG Root X1) |
| **Domain Scope** | `localhost`, `127.0.0.1` | `https://<service-name>.onrender.com` |
| **Private Key Location** | `HTTPS_Server/certificates/development/server.key` | Managed securely by Render edge infrastructure |
| **Local Private Key on Cloud** | **NEVER UPLOADED** | Not applicable |
| **Client Verification** | Requires `--ca-cert certificates/development/server.crt` | Standard operating system root trust store |
| **Modem Provisioning** | Flashed with development `server.crt` for local test bench | Flashed with Let's Encrypt `ISRG Root X1` root certificate |

---

## 7. Validating the Deployed Public Endpoint

Once Render finishes building and marks the service **Live**, retrieve your public URL:
`https://<your-service-name>.onrender.com`

Execute the automated production verification client from your workstation:
```powershell
cd "C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\HTTPS_Server"
.\.venv\Scripts\python scripts/test_production_endpoint.py --base-url https://<your-service-name>.onrender.com --token <YOUR_PRODUCTION_TOKEN>
```

The script executes 10 thorough verification tests:
1. `GET /api/health` — Service availability.
2. `GET /api/system/info` — Diagnostics & secret leakage check.
3. `GET /` — Laboratory dashboard delivery.
4. `POST /api/telemetry` (No Auth) — Verifies HTTP 401 guard.
5. `POST /api/telemetry` (Bad Token) — Verifies HTTP 401 guard.
6. `POST /api/telemetry` (Valid Token) — Verifies JSON ingestion.
7. `POST /api/telemetry/file` (Valid Token) — Verifies multipart file upload.
8. `GET /api/telemetry/latest` — Verifies retrieved telemetry matches ingested values.
9. `GET /api/telemetry/history` — Verifies historical ring buffer ordering.
10. `TLS Certificate Validation` — Verifies public certificate chain validity and domain matching.

---

## 8. Telemetry Storage Limitations

> [!IMPORTANT]
> **Ephemeral In-Memory Telemetry Storage:**
> - Current telemetry ingestion is stored in an in-memory, thread-safe circular buffer (`storage_service.py`) capped at `MAX_HISTORY_RECORDS=1000`.
> - **Render Free Tier Behavior:** Free instances spin down after 15 minutes of inactivity. When a new request arrives, Render spins up a fresh container (cold start: ~30–50s).
> - **Redeployments & Restarts:** Any deployment, code push, or container restart **erases the in-memory telemetry history**.
> - This service is designed as an operational laboratory intake testing system. Persistent historical storage (PostgreSQL / TimescaleDB) is intentionally deferred to subsequent project phases.

---

## 9. Operations, Monitoring & Token Rotation

### Viewing Service Logs
In the Render Dashboard:
1. Navigate to **Web Services** -> **panorama-wli-https-receiver**.
2. Click **Logs** in the left sidebar to observe live real-time access logs and diagnostic output.

### Continuous Deployment
Whenever you push new commits to the `main` branch of `https://github.com/soumikbur/PanoramaWaterTank_NextGen`, Render automatically detects the changes within `HTTPS_Server/`, triggers a fresh build, executes dependency installation, and hot-swaps the container.

### Rotating the API Token
1. Go to **Environment** in the Render Dashboard.
2. Update the value of `API_TOKEN`.
3. Click **Save Changes**. Render will automatically restart the web service with the new token.
4. Update the token in your Quectel EC200U modem configuration.
