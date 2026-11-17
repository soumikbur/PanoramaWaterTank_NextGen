# Production Endpoint Specification & Verification Record

## 1. Service Metadata & Deployment Status
- **Application Name:** Panorama Water Tank — HTTPS Receiver
- **Deployment Platform:** Render (Web Service)
- **Repository Root:** `https://github.com/soumikbur/PanoramaWaterTank_NextGen`
- **Subdirectory Path:** `HTTPS_Server`
- **Deployment Status:** **READY FOR DEPLOYMENT (Awaiting User Render Dashboard Linkage)**
- **Public Service URL:** `https://<service-name>.onrender.com` *(Placeholder: To be updated upon initial cloud launch)*
- **Last Verification Date:** Not yet verified on public cloud *(Pending manual Render deployment)*

---

## 2. Public Endpoint Directory

| Endpoint | Method | Auth Required | Description |
|---|:---:|:---:|---|
| `/` | `GET` | No | Embedded Laboratory Dashboard UI |
| `/api/health` | `GET` | No | Service availability & uptime diagnostics |
| `/api/system/info` | `GET` | No | System uptime & memory buffer metrics |
| `/api/telemetry` | `POST` | **Bearer Token** | Quectel EC200U 4G LTE direct JSON telemetry ingestion |
| `/api/telemetry/file` | `POST` | **Bearer Token** | Multipart/form-data JSON file upload |
| `/api/telemetry/latest`| `GET` | **Bearer Token** | Query latest reading (`?device_id=...`) |
| `/api/telemetry/history`| `GET` | **Bearer Token** | Query historical readings (`?device_id=...&limit=...`) |
| `/docs` | `GET` | No | Interactive Swagger UI API documentation |
| `/openapi.json` | `GET` | No | OpenAPI 3.1.0 schema specification |

---

## 3. Authentication & Security
- **Mechanism:** HTTP Bearer Authentication (RFC 6750) or Custom Header (`X-Device-Token`).
- **Header Format:** `Authorization: Bearer <CONFIGURED_API_TOKEN>`
- **Storage:** Stored in Render environment variables (`API_TOKEN`). Never exposed in frontend code, client scripts, or version control.

---

## 4. Supported Telemetry Payload Format

### Ingestion Schema (POST `/api/telemetry`):
```json
{
  "device_id": "COACH-042",
  "water_level_cm": 182.5,
  "water_percentage": 91.25,
  "pressure_bar": 0.82,
  "battery_v": 12.4,
  "signal_csq": 28,
  "gps_lat": 22.5726,
  "gps_lon": 88.3639,
  "flow_rate_lpm": 14.2,
  "temperature_c": 28.5
}
```
*Note: `device_id` is mandatory and non-empty. All other fields are dynamically preserved and forwarded with their native types.*

---

## 5. TLS Certificate Profile & Trust Chain

- **Domain Scope:** `*.onrender.com` (or custom custom domain, if mapped)
- **Issuer:** Let's Encrypt Authority / Cloudflare Inc.
- **Root Trust Anchor:** `ISRG Root X1`
- **Supported Protocols:** TLS 1.2, TLS 1.3
- **EC200U Modem Integration:** The Quectel EC200U requires the public root certificate (`cacert.pem` representing ISRG Root X1) pre-flashed to modem storage (`UFS:cacert.pem`). Local self-signed private keys must NEVER be deployed to the modem.

---

## 6. Verification Checklist (To be executed post-deployment)

```powershell
# Run the automated verification client against the live public URL
python scripts/test_production_endpoint.py --base-url https://<service-name>.onrender.com --token <YOUR_TOKEN>
```

- [ ] Health Check (`/api/health`) returns HTTP 200 with `status: "online"`
- [ ] System Diagnostics (`/api/system/info`) returns HTTP 200 with zero token exposure
- [ ] Dashboard (`/`) loads without mixed-content warnings
- [ ] Unauthenticated requests to `/api/telemetry` receive HTTP 401
- [ ] Invalid token requests to `/api/telemetry` receive HTTP 401
- [ ] Valid authenticated JSON POST receives HTTP 200
- [ ] Multipart file upload receives HTTP 200
- [ ] Latest telemetry query returns verified ingested data
- [ ] Telemetry history query returns reverse-chronological list
- [ ] Public HTTPS certificate is valid and issued by a trusted root CA
