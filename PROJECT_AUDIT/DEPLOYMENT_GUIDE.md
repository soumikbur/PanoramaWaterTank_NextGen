# Production Deployment Guide — Panorama Water Tank Monitor (NextGen)

---

## 1. System Topology Overview

The Panorama Water Tank Monitor NextGen employs a decoupled, multi-platform architecture:
1. **Frontend**: Static React Single Page Application (SPA) built and deployed to GitHub Pages and packaged into native Capacitor Android APK.
2. **Backend**: Async Python FastAPI application serving REST endpoints, WebSocket push streams, and MQTT telemetry listeners.
3. **Database**: PostgreSQL 16 (Authoritative production data store with async connection pool).
4. **IoT Message Broker**: Mosquitto / HiveMQ MQTTS broker on TLS port 8883.

---

## 2. Environment Variables

Create `.env` inside `backend/`:

```env
# Application Settings
ENV=production
DEBUG=false
APP_NAME="Panorama Water Tank Monitor"
APP_VERSION="2.0.0"

# Cryptographic Keys
SECRET_KEY=generate_a_64_character_hex_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Authoritative Database (PostgreSQL 16)
DATABASE_URL=postgresql+asyncpg://panorama_user:SecurePassword123@localhost:5432/panorama_db

# Cellular IoT MQTT Broker
MQTT_BROKER_HOST=broker.hivemq.com
MQTT_BROKER_PORT=1883
MQTT_TLS_PORT=8883
MQTT_USE_TLS=false
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_CLIENT_ID_PREFIX=panorama-scada-prod
MQTT_TELEMETRY_TOPIC=panorama/telemetry/+
MQTT_COMMAND_TOPIC_PREFIX=panorama/commands/
MQTT_STATUS_TOPIC=panorama/status/+

# CORS Allowed Origins
CORS_ORIGINS=["https://soumikbur.github.io","capacitor://localhost","https://localhost","http://localhost:3000","http://10.0.2.2:8000"]
```

---

## 3. PostgreSQL Database Setup

1. Install PostgreSQL 16 on the server:
   ```bash
   sudo apt update && sudo apt install -y postgresql postgresql-contrib
   ```

2. Create database and user:
   ```sql
   CREATE DATABASE panorama_db;
   CREATE USER panorama_user WITH ENCRYPTED PASSWORD 'SecurePassword123';
   GRANT ALL PRIVILEGES ON DATABASE panorama_db TO panorama_user;
   ALTER DATABASE panorama_db OWNER TO panorama_user;
   ```

3. Run Alembic database migrations:
   ```bash
   cd backend
   alembic upgrade head
   ```

---

## 4. Backend Service Launch (Systemd / Linux)

Create `/etc/systemd/system/panorama-backend.service`:

```ini
[Unit]
Description=Panorama Water Tank SCADA FastAPI Backend
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/PanoramaWaterTank_NextGen/backend
ExecStart=/opt/PanoramaWaterTank_NextGen/backend/venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers
Restart=always
RestartSec=5
EnvironmentFile=/opt/PanoramaWaterTank_NextGen/backend/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable panorama-backend
sudo systemctl start panorama-backend
```

---

## 5. Capacitor Android App Build

1. Build static frontend bundle:
   ```bash
   npm run build
   ```

2. Sync assets with Capacitor:
   ```bash
   npx cap sync android
   ```

3. Build debug or release APK:
   ```bash
   cd PanoramaWaterTank_Capacitor/android
   ./gradlew assembleDebug
   ```
   Output: `app/build/outputs/apk/debug/app-debug.apk`
