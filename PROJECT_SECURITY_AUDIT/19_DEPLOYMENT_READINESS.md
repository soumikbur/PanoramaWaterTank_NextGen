# 19. Production Deployment Readiness & Infrastructure Hardening Runbook
## Panorama Water Tank Monitor (Railway SCADA System)

**Audit Date:** November 9, 2026  
**Deployment Target:** Production Railway Operations Center & Edge Rolling Stock Nodes  

---

### 1. Production Readiness Checklist

| Category | Component / Parameter | Current Status | Deployment Readiness Checklist |
|---|---|:---:|---|
| **Secrets Management** | `SECRET_KEY` | Development Static Key | **MANDATORY:** Inject cryptographically random 64-character secret via environment variable (`openssl rand -hex 32`). Never commit secrets. |
| **Database** | Database Engine | SQLite WAL Mode | For multi-node high availability, migrate connection string to `postgresql+asyncpg://user:pass@host:5432/panorama_scada`. Execute `alembic upgrade head`. |
| **MQTT Broker** | Connectivity | HiveMQ Public Broker | **MANDATORY:** Deploy private Mosquitto / EMQX cluster. Configure mutual TLS (mTLS) with internal Railway CA certificates. Disable anonymous access. |
| **Reverse Proxy** | Nginx / Caddy | Not deployed locally | Deploy Nginx / Caddy reverse proxy with HTTP/2 or HTTP/3, TLS 1.3 only, and rate limiting at the ingress level. |
| **Edge Hardware** | ESP32-S3 Firmware | Development | Flash production firmware with disabled JTAG, enabled flash encryption, and secure boot. Store MQTT credentials in encrypted NVS. |
| **Cellular APN** | EC200U LTE Modem | Public Internet SIM | **MANDATORY:** Provision dedicated private railway APN SIM cards routing directly into the railway operations intranet. |
| **Monitoring** | System Telemetry | Local logs | Deploy Prometheus + Grafana metrics endpoint (`/metrics`) and centralized log forwarding (ELK / Vector). |

---

### 2. Enterprise Environment Configuration (`.env.production`)

```ini
# Production Environment Configuration
ENV=production
DEBUG=false
APP_NAME="Panorama Water Tank Monitor"
APP_VERSION="2.0.0"

# Cryptographic Keys (Auto-generated per cluster instance)
SECRET_KEY=<GENERATE_SECURE_64_CHAR_HEX_TOKEN>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Production PostgreSQL Database
DATABASE_URL=postgresql+asyncpg://scada_admin:<STRONG_PASSWORD>@db.railways.internal:5432/panorama_production

# Enterprise Private MQTT Broker
MQTT_BROKER_HOST=mqtt.scada.railways.internal
MQTT_BROKER_PORT=8883
MQTT_TLS_PORT=8883
MQTT_USE_TLS=true
MQTT_USERNAME=scada_backend_worker
MQTT_PASSWORD=<STRONG_MQTT_WORKER_PASSWORD>
MQTT_CLIENT_ID_PREFIX=panorama-scada-prod
MQTT_TELEMETRY_TOPIC_FILTER=railway/telemetry/+
MQTT_COMMAND_TOPIC_PREFIX=railway/commands/
MQTT_STATUS_TOPIC_FILTER=railway/status/+

# CORS Allowed Origins (Strictly locked to internal operational hostnames)
CORS_ORIGINS=["https://scada.railways.internal","https://soumikbur.github.io"]
```

---

### 3. Step-by-Step Deployment Runbook

1. **Host Server Preparation:**
   - Ubuntu 22.04 LTS / 24.04 LTS Server with Docker and Docker Compose (or bare-metal systemd services).
2. **Database Provisioning:**
   - Spin up PostgreSQL 16 cluster with automated daily backup snapshots and replication.
3. **Backend Service Launch:**
   - Run Alembic migrations: `alembic upgrade head`.
   - Launch Uvicorn with Gunicorn process manager: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app`.
4. **Frontend Delivery:**
   - Compile production static assets: `npm run build`.
   - Serve static assets via Nginx with aggressive caching for hashed assets and zero-cache for `index.html`.
