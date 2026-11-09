# 07. Database Security & Data Integrity Audit
## Panorama Water Tank Monitor (WLI SCADA Persistence)

**Audit Date:** November 9, 2026  
**Target Engines:** SQLite (Local Dev / Edge Standalone) & PostgreSQL (Industrial Serverless/Enterprise)  
**ORM Framework:** SQLAlchemy 2.0 (Async Engine) with Alembic Migrations  

---

### 1. Database Architecture & Connection Management

- **Engine Driver:** `sqlite+aiosqlite` for local dev/desktop HMI; `postgresql+asyncpg` for multi-node enterprise deployments.
- **Connection Pooling:** SQLAlchemy `AsyncEngine` with scoped sessions generated per-request via FastAPI dependency `get_db`.
- **Concurrency & WAL Mode:** SQLite is configured with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) to allow concurrent non-blocking reads while writing time-series telemetry.
- **Serverless Support:** Explicit directory failover detects AWS Lambda / read-only filesystems and routes local SQLite writes to `/tmp/panorama_dev.db`.

---

### 2. SQL Injection Resistance & Parameterization

#### Analysis of Data Access Layer:
All data queries across `backend/app/repositories/` utilize SQLAlchemy 2.0 type-safe expressions (`select()`, `where()`, `order_by()`).

- **Zero String Concatenation:** No raw SQL strings or interpolated f-strings are used for user inputs.
- **Type Coercion & Schema Validation:** Column datatypes are strictly enforced by SQLAlchemy model definitions.
- **Dynamic Filtering Security:** In `users.py` and `devices.py`, search terms are escaped into SQL parameter wildcards (`f"%{search.strip()}%"` passed as bind variables to `.ilike()`), eliminating SQL injection risks.

---

### 3. Data Integrity & Constraint Validation

1. **Foreign Key Integrity:**
   - `tanks.device_id` references `devices.id` with `ondelete="CASCADE"`.
   - `telemetry_readings.device_id` and `tank_id` maintain referential constraints.
   - `audit_events.user_id` references `users.id` with `ondelete="SET NULL"` to preserve audit history even if a user account is deleted.
2. **Unique Constraints:**
   - `users.username` and `users.employee_id` are unique and indexed.
   - `devices.uid` is unique and indexed for sub-millisecond telemetry ingestion lookup.
3. **Database Migration State:**
   - Alembic migration scripts in `backend/migrations/versions/` govern schema schema evolution, tracking revision history.
