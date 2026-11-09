# Panorama Water Tank Monitor — Database Setup & Migrations Guide

---

### 1. Supported Storage Engines

1. **Development Mode (SQLite WAL):**
   - No external database installation required.
   - Automatically initializes `panorama_dev.db` using `aiosqlite` in Write-Ahead Logging mode (`PRAGMA journal_mode=WAL`).
   - Connection URL: `sqlite+aiosqlite:///./panorama_dev.db`

2. **Production Mode (PostgreSQL 16):**
   - High availability, connection pooling, and multi-worker concurrent writes.
   - Connection URL: `postgresql+asyncpg://user:password@host:5432/dbname`

---

### 2. Alembic Database Migrations

Database schema changes are tracked and executed using Alembic:

```bash
cd backend

# Execute all pending schema migrations up to the latest revision
alembic upgrade head

# Generate a new auto-detected migration based on model changes
alembic revision --autogenerate -m "describe_schema_change"

# Rollback one migration step
alembic downgrade -1
```

---

### 3. Docker Compose Orchestration

To run a complete production-like database and MQTT broker locally:

```bash
# Start PostgreSQL 16 and Mosquitto MQTT container services
docker compose up -d

# Check service health
docker compose ps
```
