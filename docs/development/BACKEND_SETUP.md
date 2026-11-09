# Panorama Water Tank Monitor — Backend Development Guide
## Python 3.12, FastAPI & Asynchronous SCADA Daemon

---

### 1. Structure of Backend Directory (`backend/`)

```
backend/
├── requirements.txt           # Python dependency specifications
├── pytest.ini                 # Pytest configuration
├── alembic.ini                # Alembic database migration settings
├── run_server.py              # CLI launcher for Uvicorn daemon
├── app/
│   ├── main.py                # FastAPI lifecycle, CORS, and HTTP middleware
│   ├── core/                  # Database connection, bcrypt security, settings
│   ├── models/                # SQLAlchemy 2.0 async ORM declarations
│   ├── schemas/               # Pydantic v2 validation contracts
│   ├── repositories/          # Type-safe async database queries
│   ├── services/              # VolumeCalculator, AlarmService, Downsampler
│   ├── mqtt/                  # Paho MQTT ingestion client and parser
│   ├── websocket/             # Active WebSocket connection manager
│   └── api/v1/                # Modular REST route handlers
└── tests/                     # Comprehensive automated test suites (58 tests)
```

---

### 2. Virtual Environment Setup & Testing

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate environment
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the complete test suite
pytest tests/ -v

# Run the backend server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

---

### 3. Interactive API Documentation

When the backend daemon is running, Swagger UI and ReDoc are accessible locally at:
- **Swagger UI:** `http://127.0.0.1:8000/docs`
- **ReDoc:** `http://127.0.0.1:8000/redoc`
- **OpenAPI JSON Schema:** `http://127.0.0.1:8000/openapi.json`
