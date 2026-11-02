# Panorama Water Tank Monitor — Installation & Deployment Guide

This guide provides instructions for installing, configuring, and running the **Panorama Water Tank Monitor** desktop application on Microsoft Windows.

---

## 1. System Requirements

| Specification | Minimum | Recommended |
| :--- | :--- | :--- |
| **Operating System** | Windows 10 64-bit (Build 19041+) | Windows 11 64-bit |
| **Processor** | Dual-core 2.0 GHz x64 | Quad-core 2.5 GHz or higher |
| **Memory (RAM)** | 4 GB | 8 GB |
| **Storage Space** | 600 MB available storage | 1 GB SSD storage |
| **Display** | 1280 x 720 resolution | 1920 x 1080 resolution |
| **Network** | Loopback/Localhost network stack | Local Area Network (LAN) for MQTT telemetry |

---

## 2. Installation Options

You can install and run the application using either of two methods:

### Option A: Standard Setup (Recommended)
Use the standalone NSIS installer to install the application with Start Menu and Desktop shortcuts.

1. Navigate to:
   ```
   C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\installer\PanoramaWaterTank-Setup.exe
   ```
2. Double-click **`PanoramaWaterTank-Setup.exe`**.
3. Follow the installation wizard:
   - Select installation directory (Default: `%LOCALAPPDATA%\Programs\Panorama Water Tank Monitor`).
   - Check **Create Desktop Shortcut** and **Create Start Menu Shortcut**.
4. Click **Install**.
5. When complete, click **Finish** to launch the application.

---

### Option B: Portable Unpacked Run
If you prefer not to install the application to system directories, you can run the portable release directly:

1. Navigate to the release directory:
   ```
   C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\release
   ```
2. Double-click **`PanoramaWaterTank.exe`**.
3. The native window opens immediately without modifying Windows registry or application paths.

---

## 3. Application Lifecycle & Automated Daemon Management

The Panorama Water Tank Monitor is engineered for zero-configuration operation:

* **Automated Backend Startup**: When the application launches, the Electron desktop shell automatically spawns the bundled Python FastAPI server (`panorama-backend.exe`) as a supervised background daemon.
* **Health Check & Splash Synchronisation**: The desktop shell polls `http://127.0.0.1:8000/api/v1/health`. Once the database and API endpoints report healthy, the UI window appears smoothly.
* **Automated Clean Shutdown**: When the user closes the desktop window, the main process intercepts the event and executes a forceful process-tree termination (`taskkill /pid <PID> /T /F`) to ensure no orphan Python or Uvicorn processes remain in the background.
* **Single Instance Guard**: If the user double-clicks the application shortcut while an instance is already running, the running window will be brought to the foreground instead of spawning duplicate backend servers.

---

## 4. Database Configuration

The application supports both an embedded zero-configuration database and enterprise PostgreSQL:

### Default: Embedded SQLite
Out of the box, if no database environment variables are set, the backend operates in local mode using an embedded SQLite database (`panorama_dev.db`). This requires zero setup or external services and persists data locally between sessions.

### Enterprise: PostgreSQL
For multi-station railway depots and high-concurrency SCADA deployments, configure PostgreSQL:

1. Create a `.env` file in `%APPDATA%\panorama-water-tank-hmi\` or set system environment variables:
   ```ini
   DATABASE_URL=postgresql+asyncpg://panorama_user:SecurePass123!@localhost:5432/panorama_watertank
   ```
2. Start PostgreSQL (e.g., using the project Docker Compose):
   ```cmd
   cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen
   docker compose up -d postgres
   ```
3. Restart the desktop application. The backend automatically applies database schemas and connects to PostgreSQL.

---

## 5. MQTT Telemetry Ingestion

The desktop application includes an active background MQTT consumer that ingests sensor telemetry from IoT gateways and physical water tanks:

### Telemetry Topic Specification
```
panorama/telemetry/{device_id}
```

### Ingestion Payload Schema
```json
{
  "device_id": "COACH-042-TANK-A",
  "water_level": 74.5,
  "flow_rate": 3.8,
  "inflow_rate": 3.8,
  "outflow_rate": 0.0,
  "temperature": 23.4,
  "ph_value": 7.1,
  "turbidity": 1.2,
  "tds_value": 145.0,
  "battery_voltage": 12.6,
  "valve_status": true,
  "pump_status": false,
  "timestamp": "2026-10-29T10:15:30Z"
}
```

### Broker Connection Parameters
Default parameters point to localhost. To redirect to a railway depot broker:
```ini
MQTT_BROKER_HOST=192.168.1.100
MQTT_BROKER_PORT=8883
MQTT_USE_TLS=true
MQTT_CA_CERT=C:\certs\ca.crt
MQTT_USERNAME=scada_client
MQTT_PASSWORD=scada_secret
```

---

## 6. Logs & Diagnostics

All backend outputs, database transactions, MQTT ingest logs, and error traces are captured automatically.

* **Log Location**:
  ```
  %APPDATA%\panorama-water-tank-hmi\logs\backend.log
  ```
  (Typically `C:\Users\<Username>\AppData\Roaming\panorama-water-tank-hmi\logs\backend.log`)

* **Viewing Live Logs via PowerShell**:
  ```powershell
  Get-Content "$env:APPDATA\panorama-water-tank-hmi\logs\backend.log" -Wait -Tail 30
  ```

---

## 7. Uninstallation

To remove the application:
1. Open **Windows Settings** > **Apps & Features** (or `appwiz.cpl`).
2. Select **Panorama Water Tank Monitor**.
3. Click **Uninstall** and confirm.
4. User logs and configuration files in `%APPDATA%\panorama-water-tank-hmi\` can be removed if a clean purge is desired.

