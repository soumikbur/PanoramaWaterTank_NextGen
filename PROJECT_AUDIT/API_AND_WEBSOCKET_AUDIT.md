# REST API & WebSocket Protocol Audit

**Project:** Panorama Water Tank Monitor (NextGen SCADA)  
**Endpoint Base:** `/api/v1`  
**WebSocket Path:** `/api/v1/ws/live`  

---

## 1. REST Endpoint Inventory & Security Status

| Method | Endpoint Path | Auth Required | Purpose | Status |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | None | Authenticate credentials and issue JWT bearer token | Verified |
| `GET` | `/api/v1/auth/me` | JWT | Fetch authenticated user profile | Verified |
| `GET` | `/api/v1/health` | None | System diagnostics, DB status, active sockets | Verified |
| `GET` | `/api/v1/trains` | Optional | List configured trains with coach/tank counts | Verified |
| `POST` | `/api/v1/trains` | Admin JWT | Register new train with coach consist | Verified |
| `DELETE` | `/api/v1/trains/{id}` | Admin JWT | Cascade delete train and associated records | Verified |
| `GET` | `/api/v1/tanks/live` | Optional | Real-time primary tank telemetry reading | Verified |
| `GET` | `/api/v1/tanks` | Optional | Fleet-wide tank list with levels and statuses | Verified |
| `GET` | `/api/v1/alarms` | Optional | Active and acknowledged SCADA alarms | Verified |
| `POST` | `/api/v1/alarms/{id}/ack` | JWT | Acknowledge alarm and mute 30-min reminders | Verified |
| `GET` | `/api/v1/telemetry/history` | Optional | LTTB downsampled historical time-series data | Verified |

---

## 2. WebSocket Protocol & Lifecycle

### Handshake & Route
- Connected via `ws://<host>:<port>/api/v1/ws/live`.
- Accepted and registered into `ConnectionManager.active_connections`.

### Frame Specifications
1. **Telemetry Update (`TELEMETRY_UPDATE`):**
   ```json
   {
     "event": "TELEMETRY_UPDATE",
     "data": {
       "trainNumber": "12841",
       "coachNumber": "C1",
       "primaryLevel": 78.5,
       "primaryVolume": 15.7,
       "rawLevel": 78.2,
       "batteryVoltage": 12.6,
       "temperature": 28.4,
       "latitude": 22.5726,
       "longitude": 88.3639,
       "status": "NORMAL"
     }
   }
   ```
2. **Heartbeat Ping-Pong:**
   - Client sends: `{"type": "ping"}` every 30 seconds.
   - Server returns: `{"event": "PONG", "data": {"type": "pong", "timestamp": 1731553800.12}}`.
   - Stale detection drops socket if no frame is received within 45 seconds.

