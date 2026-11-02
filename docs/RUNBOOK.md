# Panorama Water Tank Monitor — Operations & Deployment Runbook

This runbook provides step-by-step instructions for deploying, operating, troubleshooting, and simulating telemetry for the NextGen Panorama Water Tank Monitor system.

---

## 1. Prerequisites & System Requirements

- **Operating System**: Windows 10/11, Ubuntu 22.04 LTS, or macOS 13+
- **Runtimes**:
  - Python 3.10+ (Verified with Python 3.14)
  - Node.js 18.x+ (Verified with Node.js v24.20)
  - Docker & Docker Compose (for PostgreSQL and Mosquitto)
- **Ports Required**:
  - `5432` — PostgreSQL Database
  - `8883` / `1883` — MQTT Message Broker
  - `8000` — FastAPI Backend & WebSockets
  - `3000` / `8081` — React Native Metro / Web Client

---

## 2. Infrastructure Deployment (Docker Compose)

The fastest way to spin up the local database and message broker is via Docker Compose:

```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen
docker-compose up -d
```

This starts:
1. `panorama-postgres`: PostgreSQL 16 container with persistent volume.
2. `panorama-mosquitto`: Mosquitto MQTT broker with TLS support on `8883` and local dev listener on `1883`.

---

## 3. Backend Deployment

### 3.1 Virtual Environment Setup & Dependencies
```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### 3.2 Database Migrations
```powershell
# Run Alembic migrations to initialize schema
alembic upgrade head
```

### 3.3 Starting the Application Server
```powershell
# Start Uvicorn ASGI server with hot reload
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API Documentation available at: `http://localhost:8000/docs`
- Health check available at: `http://localhost:8000/api/v1/health`

---

## 4. Frontend Deployment (React Native / Web)

```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\apps\mobile

# Install NPM dependencies
npm install

# Start React Native / Web development server
npm run web
```
The HMI interface opens at `http://localhost:3000`.

---

## 5. Telemetry Edge Simulator

To simulate a real train running on the tracks emitting live telemetry over MQTT:

```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\backend
python scripts\simulate_telemetry.py --train 12002 --coach B4 --interval 3
```

This simulator:
- Generates gradual water consumption draining down to low levels.
- Simulates periodic refilling events at stations up to 100%.
- Generates realistic train GPS coordinates, speed changes, and battery voltage fluctuations.
- Publishes valid JSON frames to `panorama/telemetry/0026004D4B42501120353332`.

---

## 6. Operational Troubleshooting & Diagnostics

### 6.1 Database Unreachable
- **Symptoms**: Backend logs show `asyncpg.exceptions.CannotConnectNowError`.
- **Action**: Check if PostgreSQL container is running:
  ```powershell
  docker ps --filter "name=panorama-postgres"
  docker logs panorama-postgres --tail 50
  ```

### 6.2 MQTT Disconnected / No Live Data
- **Symptoms**: Frontend header shows "DISCONNECTED", no live updates.
- **Action**:
  1. Verify broker port: `Test-NetConnection -ComputerName localhost -Port 1883`
  2. Check broker logs: `docker logs panorama-mosquitto --tail 50`
  3. Verify backend MQTT client connection in `/api/v1/health`.

### 6.3 Database Backup & Restore
- **Backup**:
  ```powershell
  docker exec -t panorama-postgres pg_dump -U panorama_app panorama_db > backup_$(Get-Date -Format "yyyyMMdd").sql
  ```
- **Restore**:
  ```powershell
  docker exec -i panorama-postgres psql -U panorama_app -d panorama_db < backup_20261028.sql
  ```

