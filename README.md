# Panorama Water Tank Monitor — NextGen Architecture

> **Complete Industrial SCADA & HMI Rebuild for Railway Coach Water Monitoring**

This repository contains the Next-Generation rebuild of the **Panorama Water Tank Monitor**, migrating completely away from legacy Qt 6.8, QML, and proprietary Ubidots cloud dependencies to an independent, modern, containerized stack:

- **Frontend**: React Native (TypeScript) cross-platform HMI with industrial light SCADA theme, dynamic 60 FPS fluid physics, 4-tier colored rank indicators, and LTTB historical trend charts.
- **Backend**: Python + FastAPI asynchronous framework with WebSockets, Pydantic v2 schemas, and Paho-MQTT worker.
- **Database**: PostgreSQL 16 with SQLAlchemy 2.x async ORM and Alembic declarative migrations.
- **Message Broker**: Authenticated Mosquitto / HiveMQ MQTT over TLS 1.2+ (Port 8883).

---

## 1. Project Directory Structure

```
PanoramaWaterTank_NextGen/
├── docker-compose.yml              # Local PostgreSQL 16 & Mosquitto container orchestration
├── config/
│   ├── .env.example                # Canonical environment variable template
│   ├── mosquitto.conf              # Mosquitto MQTT broker configuration
│   └── topic_schema.json           # JSON Schema for MQTT telemetry payloads
├── docs/                           # Architectural, protocol & verification specifications
│   ├── ARCHITECTURE.md             # High-level architecture, failure recovery & Mermaid diagrams
│   ├── DATABASE_SCHEMA.md          # PostgreSQL tables, indexes, constraints & ER diagram
│   ├── MQTT_PROTOCOL.md            # MQTT topic hierarchy, JSON schema, EC200U AT commands
│   ├── API_REFERENCE.md            # OpenAPI REST endpoints and WebSocket protocol reference
│   ├── SECURITY.md                 # RBAC, TLS cipher suites, and hardening guide
│   ├── MIGRATION_PLAN.md           # Transition strategy, firmware flashing, and cutover
│   ├── TEST_PLAN.md                # Verification test pyramid and test case specifications
│   ├── RUNBOOK.md                  # Deployment, simulation, and operational procedures
│   ├── LEGACY_FEATURE_INVENTORY.md # Complete audit of legacy C++ and QML features
│   ├── LEGACY_UI_AUDIT.md          # Visual tokens, typography, and component blueprints
│   └── FEATURE_PARITY_MATRIX.md    # 26-item audited parity matrix (100% Tested)
├── backend/                        # Python / FastAPI backend application
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── pytest.ini
│   ├── app/
│   │   ├── main.py                 # FastAPI application entrypoint & lifespan
│   │   ├── core/                   # Config, database engine, bcrypt security
│   │   ├── models/                 # SQLAlchemy 2.0 async ORM entities
│   │   ├── schemas/                # Pydantic v2 request/response & MQTT validation
│   │   ├── services/               # VolumeCalculator, AlarmService, LTTBDownsampler
│   │   ├── repositories/           # Async database CRUD operations
│   │   ├── mqtt/                   # Secure MQTT client & TelemetryParser
│   │   ├── websocket/              # Real-time WebSocket connection manager
│   │   └── api/v1/                 # REST routers (Auth, Devices, Tanks, Telemetry, Alarms, etc.)
│   ├── migrations/                 # Alembic migration scripts
│   ├── scripts/
│   │   └── simulate_telemetry.py   # Railway edge telemetry simulator (Train 12002, Coach B4)
│   └── tests/                      # 26 automated unit & integration tests (100% passing)
└── apps/mobile/                    # React Native / Web HMI frontend
    ├── package.json
    ├── tsconfig.json
    ├── public/index.html
    └── src/
        ├── App.tsx                 # Root application shell
        ├── theme/                  # Design system tokens (colors, typography, radii, spacing)
        ├── types/                  # TypeScript definitions for tanks, devices, alarms
        ├── api/client.ts           # REST API client
        ├── services/websocket.ts   # Auto-reconnecting WebSocket client
        ├── state/AppContext.tsx    # Global telemetry and alarm state store
        ├── components/
        │   ├── common/             # Header, Sidebar, Footer, BaseCard, StatusBadge, InfoRow
        │   ├── dashboard/          # RankIndicator (4-tier color bar), SummaryGrid (5 KPI cards)
        │   ├── tank/               # TankVisualization (Cylindrical vessel with animated dual sine waves)
        │   └── charts/             # LevelTrendCard (12h, 24h, 7d LTTB downsampled curves)
        └── screens/                # Dashboard, WaterTank, Devices, Alerts, History, Settings
```

---

## 2. Mathematical Parity & Calculation Formulas

The fluid calculation engine in `backend/app/services/calculator.py` matches the legacy C++ `VolumeCalculator` with exact numerical precision:

1. **Vessel Geometry**:
   $$\text{Area } A = \pi \cdot r^2 = 0.04 \text{ m}^2$$
   $$r = \sqrt{\frac{A}{\pi}} \approx 0.112838 \text{ m} \quad (11.28 \text{ cm})$$
   $$H_{\max} = \frac{V_{\max}}{A \cdot 1000} = \frac{20.0 \text{ L}}{0.04 \cdot 1000} = 0.50 \text{ m} \quad (50.0 \text{ cm})$$

2. **Real-Time Level & Volume**:
   $$h(t) = H_{\max} \cdot \left(\frac{\text{Level}\%(t)}{100}\right) = 0.50 \cdot \left(\frac{\text{Level}\%}{100}\right)$$
   $$V(t) = A \cdot h(t) \cdot 1000 \quad \text{[Liters]}$$

3. **4-Tier Capacity Ranks**:
   - **LOW**: $0\% \le \text{Level} < 25\%$ (Red `#E53935`)
   - **MODERATE**: $25\% \le \text{Level} < 50\%$ (Orange `#FB8C00`)
   - **GOOD**: $50\% \le \text{Level} < 75\%$ (Yellow `#FDD835`)
   - **HIGH**: $75\% \le \text{Level} \le 100\%$ (Green `#43A047`)

4. **Alarm Boundaries**:
   - **Critical Low**: Level $< 10.0\%$ ($< 5.0\text{ cm}$)
   - **Warning Low**: $10.0\% \le \text{Level} < 20.0\%$ ($5.0\text{ cm} \le h < 10.0\text{ cm}$)
   - **Normal Level**: $20.0\% \le \text{Level} < 100.0\%$
   - **Overflow Condition**: Level $\ge 100.0\%$ (Unclamped metric preserved)
   - **Sensor Fault**: ADC raw $< 100$, voltage $< 0.25\text{V}$, or $wlvl = \text{false}$

---

## 3. Quickstart & Deployment

### Step 1: Start Infrastructure (PostgreSQL & Mosquitto)
```powershell
docker-compose up -d
```

### Step 2: Start Backend
```powershell
cd backend
.\venv\Scripts\Activate.ps1
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- Interactive Swagger UI: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/api/v1/health`

### Step 3: Run Automated Test Suite
```powershell
cd backend
.\venv\Scripts\python -m pytest -v
```
*(Result: 26 passed in 1.24s)*

### Step 4: Run Telemetry Edge Simulator
```powershell
cd backend
.\venv\Scripts\python scripts\simulate_telemetry.py --train 12002 --coach B4 --interval 3
```

### Step 5: Start Frontend HMI
```powershell
cd apps/mobile
npm start
```
The SCADA HMI interface opens in the browser at `http://localhost:3000`.

---

## 4. Zero Ubidots Verification

The NextGen platform is completely independent of Ubidots:
- Zero Ubidots API tokens, URLs, or client libraries in runtime source code.
- Direct authenticated MQTT over TLS 1.2+ replaces all third-party cloud polling.
- Authoritative persistence stored directly in PostgreSQL 16.

