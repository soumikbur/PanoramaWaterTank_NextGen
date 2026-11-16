# REST API & WebSocket Reference Specification — Panorama NextGen

The **Panorama Water Tank Monitor — NextGen** provides a versioned REST API under `/api/v1` and WebSocket live streaming under `/ws/live`.

---

## 1. Authentication & Security Model

- **Authentication Scheme**: OAuth2 Password Flow emitting signed HMAC-SHA256 (`HS256`) JSON Web Tokens (JWT).
- **Header Format**: `Authorization: Bearer <access_token>`
- **Token Invalidation**: Server-side session invalidation supported via `token_version` tracking in PostgreSQL. Logging out increments `token_version`, immediately invalidating all outstanding JWTs.
- **RBAC Roles**:
  - `ADMIN`: Full administrative control (Consist editing, device deletion, user management, Raw Data terminal).
  - `EMPLOYEE`: Operational supervisor (Viewing consists, acknowledging alarms, exporting reports).
  - `OPERATOR` / `VIEWER`: Read-only telemetry access.

---

## 2. API Endpoint Matrix

### 2.1 System Health & Diagnostics

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---:|
| `GET` | `/health` | Root health probe alias | None |
| `GET` | `/api/v1/health` | Comprehensive system health check | None |
| `GET` | `/api/v1/health/database` | PostgreSQL connection pool execution & latency probe | None |
| `GET` | `/api/v1/health/mqtt` | MQTT broker connection status & subscription count | None |
| `GET` | `/api/v1/health/system` | Compute, memory & active worker thread metrics | None |

### 2.2 Authentication & Authorization

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---:|
| `POST` | `/api/v1/auth/login` | Authenticate user & return signed JWT token | None |
| `GET` | `/api/v1/auth/me` | Fetch active authenticated user profile | Bearer JWT |
| `POST` | `/api/v1/auth/logout` | Revoke session & increment `token_version` | Bearer JWT |
| `POST` | `/api/v1/auth/change-password`| Update user password | Bearer JWT |
| `POST` | `/api/v1/auth/register` | Submit new user account registration for admin approval | None |

### 2.3 Trains & Consist Management

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---:|
| `GET` | `/api/v1/trains` | List all configured trains with consist summaries | Bearer JWT |
| `POST` | `/api/v1/trains` | Create a new train consist | Admin |
| `GET` | `/api/v1/trains/regions` | List railway zones and regional divisions | Bearer JWT |
| `GET` | `/api/v1/trains/lookup/{train_number}` | Query external railway database (DataMeet / RailRadar) | Bearer JWT |
| `GET` | `/api/v1/trains/{train_number}/consist` | Get detailed coach marshaling & tank mappings | Bearer JWT |
| `PUT` | `/api/v1/trains/{train_number}` | Update train metadata or regional assignment | Admin |
| `DELETE` | `/api/v1/trains/{train_number}` | Cascade delete train consist (0 orphans guaranteed) | Admin |
| `POST` | `/api/v1/trains/{train_number}/coaches` | Append coach to train consist | Admin |
| `PUT` | `/api/v1/trains/{train_number}/coaches/reorder` | Update coach sequence positions (1..N) | Admin |
| `PUT` | `/api/v1/trains/{train_number}/coaches/{coach_number}` | Update coach category/name | Admin |
| `DELETE` | `/api/v1/trains/{train_number}/coaches/{coach_number}`| Remove coach from consist | Admin |

### 2.4 Devices & Edge Hardware

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---:|
| `GET` | `/api/v1/devices` | List registered and auto-discovered edge hardware nodes | Bearer JWT |
| `POST` | `/api/v1/devices` | Register a new hardware node UID | Admin |
| `GET` | `/api/v1/devices/{device_id}/diagnostics`| Fetch signal quality, battery voltage & packet stats | Bearer JWT |
| `PUT` | `/api/v1/devices/{device_id}` | Map device to train coach and dual-tank positions | Admin |
| `DELETE` | `/api/v1/devices/{device_id}` | Unmap or delete device record | Admin |

### 2.5 Tanks & Fluid Telemetry

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---:|
| `GET` | `/api/v1/tanks` | List all coach tanks with physical dimensions & levels | Bearer JWT |
| `GET` | `/api/v1/tanks/live` | Real-time snapshot of all water volumes and percentages | Bearer JWT |
| `PUT` | `/api/v1/tanks/{tank_id}` | Update cylinder height (cm), capacity (L), or thresholds | Admin |
| `GET` | `/api/v1/telemetry/history` | Query time-series telemetry with LTTB downsampling | Bearer JWT |
| `POST` | `/api/v1/telemetry/ingest` | Manual / HTTP fallback ingestion for telemetry packet | Bearer JWT |

### 2.6 Alarms & Supervisory Alerts

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---:|
| `GET` | `/api/v1/alarms` | Query active and historical SCADA alarms | Bearer JWT |
| `POST` | `/api/v1/alarms/{alarm_id}/acknowledge`| Acknowledge alarm with operator comment | Bearer JWT |
| `GET` | `/api/v1/alarms/stats` | Aggregate counts by severity (`CRITICAL`, `WARNING`) | Bearer JWT |
| `POST` | `/api/v1/alarms/clear` | Clear resolved alarms from console buffer | Admin |

### 2.7 Location & Mainline Corridor Tracking

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---:|
| `GET` | `/api/v1/location` | Fetch current GPS locations of all fleet trains | Bearer JWT |
| `GET` | `/api/v1/location/corridors` | List configured mainline railway transit corridors | Bearer JWT |
| `GET` | `/api/v1/location/corridor` | Get Howrah–Asansol corridor path & refill stations | Bearer JWT |
| `GET` | `/api/v1/location/stations/search` | Search Indian Railway station database by code/name | Bearer JWT |
| `GET` | `/api/v1/location/official-route/{train_number}`| Fetch verified timetable route for train | Bearer JWT |

### 2.8 Export & Operational Reports

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---:|
| `GET` | `/api/v1/export/csv` | Download RFC 4180 CSV report with formula escaping | Bearer JWT |

---

## 3. Real-Time WebSockets Live Stream

- **Endpoint**: `ws://<host>:8000/ws/live` or `wss://<host>:8000/ws/live`
- **Protocol**: Raw JSON streaming over WebSocket.
- **Message Format**:
```json
{
  "type": "TELEMETRY_UPDATE",
  "data": {
    "device_uid": "002F00654B42501320353332",
    "train_number": "13009",
    "coach_number": "SLRD",
    "tank1": {
      "level_percent": 84.5,
      "volume_liters": 16.9,
      "height_cm": 42.2,
      "status": "NORMAL"
    },
    "tank2": {
      "level_percent": 82.0,
      "volume_liters": 16.4,
      "height_cm": 41.0,
      "status": "NORMAL"
    },
    "battery_percent": 97.1,
    "gps": {
      "latitude": 22.556949,
      "longitude": 88.352447,
      "speed_kmh": 0.9,
      "has_fix": true
    },
    "timestamp": "2026-11-16T12:20:14Z"
  }
}
```
