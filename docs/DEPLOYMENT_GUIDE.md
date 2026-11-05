# Panorama Water Tank Monitor — Production Deployment Guide

## 1. System Topology Overview

The Panorama Water Tank Monitor NextGen employs a decoupled micro-architecture:
1. **Frontend**: Static React Single Page Application (SPA) deployed to Vercel global CDN edge network.
2. **Backend**: Async Python FastAPI application serving REST endpoints, WebSocket push streams, and MQTT telemetry listeners.
3. **Database**: PostgreSQL 16 (or high-performance SQLite in development/embedded scenarios).
4. **IoT Message Broker**: Mosquitto / HiveMQ MQTTS broker on TLS port 8883.

---

## 2. Frontend Deployment (Vercel)

### 2.1 Repository Setup & Vercel Configuration
The repository root contains a configured `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "handle": "filesystem"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

### 2.2 Build Pipeline
- **Build Command**: `npm run build`
  *(Executes `npm run build --workspace=apps/mobile && node scripts/sync_dist.js`, compiling TypeScript/JSX with esbuild and populating `dist/` and `backend/static/`)*.
- **Output Directory**: `dist`
- **Node.js Version**: 18.x or 20.x

### 2.3 Frontend Environment Variables

| Variable Name | Required | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | No | `https://api.panorama.railways.gov` | Base URL for REST API. If omitted, frontend uses relative paths or origin. |
| `VITE_WS_URL` | No | `wss://api.panorama.railways.gov/api/v1/ws/live` | WebSocket endpoint for live tank levels. |
| `VITE_MAP_TILES_URL` | No | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | OpenStreetMap tile server source. |

---

## 3. Backend Deployment (Docker / Linux Server / Cloud)

### 3.1 System Prerequisites
- **Python**: 3.11 to 3.14
- **Database Engine**: PostgreSQL 14+ (Recommended for multi-coach clusters) or SQLite 3.35+
- **Process Manager**: Systemd or Docker / Kubernetes

### 3.2 Backend Environment Variables

| Variable Name | Required | Example | Purpose |
| :--- | :--- | :--- | :--- |
| `SECRET_KEY` | **Yes** | `7f8a9b2c3d4e5f60718293a4b5c6d7e8` | Cryptographic secret key for signing JWT tokens. |
| `ALGORITHM` | No | `HS256` | JWT signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `1440` (24 hours) | Token lifespan. |
| `DATABASE_URL` | **Yes** | `postgresql+asyncpg://scada_usr:pwd@db.internal:5432/panorama` | Async connection string. |
| `CORS_ORIGINS` | **Yes** | `https://panorama-water-tank-next-gen.vercel.app,http://localhost:3000` | Allowed origins. |
| `MQTT_BROKER_HOST` | No | `broker.railways.gov` | Cellular IoT ingestion broker. |
| `MQTT_BROKER_PORT` | No | `8883` | MQTTS TLS port. |

### 3.3 Production Launch Command
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers --forwarded-allow-ips='*'
```

---

## 4. Database Migrations & Initial Account Seeding

The application implements self-healing, automated startup schema migration and seeding:

1. **Schema Synchronization**: `_sync_schema_migration()` detects missing columns in existing tables and executes idempotent `ALTER TABLE` statements (defensive against existing deployments).
2. **Root Account Seeding**: `seed_initial_accounts()` runs on startup. If accounts do not exist:
   - **Root Administrator**: Username `@admin`, Password `Admin@123`, Role `ADMIN`.
   - **Standard Employee**: Username `@employee`, Password `Employee@123`, Role `EMPLOYEE`.
   *(If accounts already exist, the routine ensures their role and active status are correctly established without altering updated passwords).*

---

## 5. Security & Disaster Recovery Procedures

### 5.1 Admin Recovery CLI
If the administrator credentials are lost, locked, or corrupted:

```bash
# 1. Inspect current status of the root administrator
python backend/scripts/recover_admin.py --status

# 2. Reset the administrator password directly via host shell
python backend/scripts/recover_admin.py --reset "YourNewSecureAdminPassword@2026"
```

### 5.2 Verification Checklist
- [ ] Call `GET /api/v1/health` -> verify status is `HEALTHY`.
- [ ] Navigate to the production login page -> verify no test credentials or debug buttons are visible.
- [ ] Authenticate with `@admin` / `Admin@123` -> verify full access to all 11 modules.
- [ ] Authenticate with `@employee` / `Employee@123` -> verify access to operational views, and verify that navigating to `/settings`, `/users`, or `/logs` renders the **Access Restricted** screen.
- [ ] Test temporary password change workflow for an employee flagged with `must_change_password: true`.

