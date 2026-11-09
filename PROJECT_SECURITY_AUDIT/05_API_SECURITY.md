# 05. REST & WebSocket API Security Audit (OWASP API Top 10)
## Panorama Water Tank Monitor (WLI SCADA Backend)

**Audit Date:** November 9, 2026  
**Reference Benchmark:** OWASP API Security Top 10 (2023)  
**API Prefix:** `/api/v1`  

---

### 1. OWASP API Top 10 (2023) Analysis

| API Threat Category | Endpoint Surface | Vulnerability Analysis | Mitigation Applied |
|---|---|---|---|
| **API1: Broken Object Level Authorization (BOLA)** | `/tanks/{id}`, `/devices/{id}`, `/trains/{number}` | Unauthenticated or cross-tenant modification of another coach's tank parameters. | Restricted all update/delete mutations to Administrator role (`Depends(get_current_admin_user)`). Parameterized ID lookup. |
| **API2: Broken Authentication** | `/auth/login`, `/auth/refresh` | Credential stuffing, brute-force enumeration, session fixation. | Sliding window rate limiter (`login_limiter`) active; bcrypt password verification with truncated 72-byte safe hashing; server-side token version tracking. |
| **API3: Broken Object Property Level Authorization (BOPLA)** | `/users`, `/devices` | Mass assignment vulnerabilities allowing users to promote their own role or tamper with device UIDs. | Strict Pydantic input schemas (`UserCreate`, `UserUpdate`, `DeviceCreate`, `DeviceUpdate`) explicitly separate user-editable attributes from system fields. |
| **API4: Unrestricted Resource Consumption** | `/telemetry/history`, `/export/csv`, `/ws` | Denial of Service via massive date range queries or unbounded WebSocket connections. | Range parameters restricted (`12h`, `24h`, `7d`); LTTB downsampling limits output points to ~100 data points; CSV streaming with buffered iterator. |
| **API5: Broken Function Level Authorization (BFLA)** | Administrative endpoints (`/users`, `/settings/apply`, `/trains` POST/DELETE) | Unauthorized operators invoking administrative functions. | Dependency injection of `get_current_admin_user` strictly verifies `current_user.role == "ADMIN"`. Returns HTTP 403 Forbidden otherwise. |
| **API6: Unrestricted Access to Sensitive Business Flows** | Employee self-registration (`/auth/register`) | Automated bot registrations overwhelming operator approval queue. | Registration rate limiting (`registration_limiter`), document upload size limits (2MB), file magic bytes verification. |
| **API7: Server Side Request Forgery (SSRF)** | `/settings/test-device` | Triggering backend HTTP requests to internal network addresses. | Host parameter strictly validated; target must be valid IPv4 or standard hostname; requests executed with strict timeouts (800ms). |
| **API8: Security Misconfiguration** | Global HTTP Middleware | Missing security headers, permissive CORS wildcard, verbose exception traces. | Configured security headers; CORS allowed origins restricted; production mode sets `DEBUG = False` to prevent stack trace leaks. |
| **API9: Improper Inventory Management** | API Versioning & Route Namespace | Zombie APIs, unversioned endpoints, schema divergence. | All endpoints grouped under `/api/v1`; OpenAPI 3.1 documentation dynamically generated at `/docs` with automatic model synchrony. |
| **API10: Unsafe Consumption of APIs** | Ubidots Integration & MQTT Ingestion | Malformed external JSON payloads crashing background service thread. | Safe defensive parsing in `TelemetryParser` with schema fallback, null-safe conversions, and try-except wrappers on all external payloads. |

---

### 2. Comprehensive API Route Security Matrix

| Method | Endpoint | Auth Required | Minimum Role | Rate Limited | Input Schema | Status |
|---|---|:---:|:---:|:---:|---|:---:|
| `POST` | `/api/v1/auth/login` | No | Anonymous | **YES (5/min)** | `UserLogin` | Verified |
| `POST` | `/api/v1/auth/register` | No | Anonymous | **YES (3/min)** | `EmployeeRegistrationRequest` | Verified |
| `POST` | `/api/v1/auth/logout` | **YES** | Authenticated | No | N/A | Verified |
| `GET` | `/api/v1/health` | No | Anonymous | No | N/A | Verified |
| `GET` | `/api/v1/tanks` | No | Anonymous | No | N/A | Verified |
| `GET` | `/api/v1/tanks/live` | No | Anonymous | No | N/A | Verified |
| `PUT` | `/api/v1/tanks/{id}` | **YES** | **ADMIN** | No | `TankUpdate` | Verified |
| `GET` | `/api/v1/devices` | No | Anonymous | No | Query Params | Verified |
| `POST` | `/api/v1/devices` | **YES** | **ADMIN** | No | `DeviceCreate` | Verified |
| `PUT` | `/api/v1/devices/{id}` | **YES** | **ADMIN** | No | `DeviceUpdate` | Verified |
| `DELETE` | `/api/v1/devices/{id}` | **YES** | **ADMIN** | No | N/A | Verified |
| `GET` | `/api/v1/telemetry/history`| No | Anonymous | No | Query Params | Verified |
| `GET` | `/api/v1/export/csv` | No | Anonymous | No | Query Params (Sanitized) | Verified |
| `GET` | `/api/v1/alarms` | No | Anonymous | No | Query Params | Verified |
| `POST` | `/api/v1/alarms/{id}/acknowledge`| **YES** | **EMPLOYEE** | No | `AlarmAcknowledge` | Verified |
| `GET` | `/api/v1/settings` | No | Anonymous | No | N/A | Verified |
| `POST` | `/api/v1/settings/apply` | **YES** | **ADMIN** | No | `UnifiedSettingsPayload` | Verified |
| `GET` | `/api/v1/users` | **YES** | **ADMIN** | No | Query Params | Verified |
| `POST` | `/api/v1/users` | **YES** | **ADMIN** | No | `UserCreate` | Verified |
| `PUT` | `/api/v1/users/{id}/status` | **YES** | **ADMIN** | No | `UpdateStatusRequest` | Verified |
| `POST` | `/api/v1/users/{id}/reset-password` | **YES** | **ADMIN** | No | `ResetPasswordRequest` | Verified |
