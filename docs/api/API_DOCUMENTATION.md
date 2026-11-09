# Panorama Water Tank Monitor — REST & WebSocket API Documentation
## Base URL: `/api/v1`

All responses are formatted in JSON with ISO 8601 UTC timestamps.

---

### 1. Authentication Endpoints

#### `POST /auth/login`
- **Description:** Authenticates operator credentials and issues a signed JWT access token.
- **Request Body:**
  ```json
  {
    "username": "@admin",
    "password": "AdminPassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "user": {
      "id": "user-uuid",
      "username": "@admin",
      "role": "ADMIN",
      "account_status": "ACTIVE"
    }
  }
  ```

#### `POST /auth/logout`
- **Description:** Terminates session and invalidates active JWT via server-side token version increment.
- **Headers:** `Authorization: Bearer <token>`

---

### 2. Fleet & Consist Endpoints

#### `GET /trains`
- **Description:** Lists registered trains with aggregate coach and tank status.
- **Query Parameters:** `region` (NORTH, SOUTH, EAST, WEST), `search` (string)

#### `GET /trains/{train_number}/consist`
- **Description:** Returns the complete coach and dual-tank hierarchy for a specific passenger train.

---

### 3. Tank & Telemetry Endpoints

#### `GET /tanks/live`
- **Description:** Retrieves real-time water levels, volume in litres, capacity rank, battery voltage, and alarm status for all configured tanks.

#### `GET /telemetry/history`
- **Description:** Queries historical telemetry downsampled using Largest-Triangle-Three-Buckets (LTTB) algorithm (~100 points).
- **Query Parameters:** `tank_id` (UUID), `range` (12h, 24h, 7d).

#### `GET /export/csv`
- **Description:** Exports historical readings as an RFC 4180 CSV file with formula injection mitigation.
- **Query Parameters:** `tank_id` (UUID), `range` (12h, 24h, 7d).

---

### 4. Alarm & Hardware Endpoints

#### `GET /alarms`
- **Description:** Lists triggered system alarms with optional status filtering (`ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`).

#### `POST /alarms/{id}/acknowledge`
- **Description:** Records operator acknowledgment with audit logging.
- **Request Body:** `{"comment": "Water refilled at Howrah Junction."}`

#### `GET /devices`
- **Description:** Lists registered edge devices with firmware version and online presence.

#### `GET /location`
- **Description:** Returns real-time GPS coordinates and route tracks along the Howrah–Asansol railway corridor.
