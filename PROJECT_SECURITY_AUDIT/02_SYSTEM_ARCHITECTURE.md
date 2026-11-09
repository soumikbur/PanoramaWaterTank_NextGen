# 02. System Architecture & Component Interactions
## Panorama Water Tank Monitor (Railway SCADA HMI)

**Audit Date:** November 9, 2026  
**Target Environment:** Railway Corporation / Industrial SCADA Monitoring  

---

### 1. High-Level Architectural Topology

```
+-----------------------------------------------------------------------------------+
|                            EDGE HARDWARE & SENSORS                                |
|  +--------------------+   4-20mA   +------------------+    UART    +------------+ |
|  | Hydrostatic Sensor | ---------> | ESP32-S3 MCU     | ---------> | EC200U LTE | |
|  | (Water Height/Pr.) |            | (A/D Conv, Cal.) |            | Modem      | |
|  +--------------------+            +------------------+            +------------+ |
+---------------------------------------------|-------------------------------------+
                                              |
                                     LTE / IP / MQTT
                                              v
+-----------------------------------------------------------------------------------+
|                        MQTT BROKER CLUSTER / INGESTION GATEWAY                    |
|                        HiveMQ WSS / Mosquitto TLS (Port 8883/8884)                |
|                        Topics: panorama/telemetry/+                               |
+-----------------------+-----------------------------------+-----------------------+
                        |                                   |
                  WSS (Direct)                         TCP (Loopback)
                        |                                   |
                        v                                   v
+----------------------------------+        +---------------------------------------+
|  CLIENT-SIDE HMI DASHBOARD       |        |  FASTAPI SCADA BACKEND (DAEMON)       |
|  (React 18 / Vite / Electron)    |        |  (Python 3.12 / AsyncIO)              |
|                                  |        |                                       |
|  - MqttService (WebSocket)       |        |  - MqttService Background Worker      |
|  - AppContext (Global State)     |        |  - Volume & Capacity Calculator       |
|  - TankStatusService (Validation)|        |  - Alarm Evaluation Engine            |
|  - REST ApiClient (HTTP/Bearer)  | <----> |  - WebSocket Telemetry Broadcast      |
|  - Responsive SCADA Views        |  REST  |  - REST Endpoints (Auth, Fleet, etc.) |
+----------------------------------+        +-------------------+-------------------+
                                                                |
                                                           SQLAlchemy
                                                          (Async Engine)
                                                                |
                                                                v
                                            +---------------------------------------+
                                            |  PERSISTENCE STORAGE                  |
                                            |  - SQLite (Local: panorama_dev.db)    |
                                            |  - PostgreSQL + asyncpg (Production)  |
                                            |  - Audit Events, Telemetry Time-Series|
                                            +---------------------------------------+
```

---

### 2. Detailed Data Flow Analysis

#### Flow 1: Telemetry Ingestion from Physical Transducers
1. The hydrostatic pressure sensor generates an analog current proportional to water column height.
2. The ESP32-S3 ADC samples the sensor signal, applies calibrated polynomial lookup, and formats a JSON payload.
3. The LTE modem transmits the packet to the MQTT broker over cellular Cat-1 data.
4. The backend `MqttService` receives the packet via callback, parses it, validates timestamps, and initiates an async database transaction.
5. In parallel, the browser HMI connects via WSS directly to the broker (or receives WebSocket frames from backend `/api/v1/ws`).

#### Flow 2: Tank Status & Health Determination Engine
1. Telemetry payloads arrive with device UID and raw water level.
2. `tankStatusService` applies a rigorous 4-point operational verification:
   - Point 1: Valid hardware-to-tank association.
   - Point 2: Non-null received sensor reading.
   - Point 3: Watchdog timestamp freshness check ($\le 120$s timeout).
   - Point 4: Active physical carrier connectivity.
3. Tanks failing any of the 4 checkpoints transition immediately to `OFFLINE` or `AWAITING_TELEMETRY`.

#### Flow 3: Operator Authentication & Authorization Flow
1. Operator submits credentials (`username`, `password`) over HTTPS to `/api/v1/auth/login`.
2. Login rate limiter verifies client IP is within permissible burst allowance.
3. Password verified using bcrypt salt and constant-time comparison.
4. Access token signed using HMAC-SHA256 with user ID, role, and token version (`v`).
5. Role-Based Access Control (RBAC) middleware checks user role before executing configuration mutations or fleet alterations.
