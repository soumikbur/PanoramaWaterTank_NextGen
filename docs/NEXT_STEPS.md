# Panorama Water Tank Monitor — Engineering Roadmap & Next Steps

This document outlines the sequenced development roadmap for subsequent engineering iterations, prioritized from **P0** (Critical / Hardening) to **P3** (Future Architectural Evolution).

---

## 1. Roadmap Overview & Priority Matrix

| Priority | Focus Area | Target Timeline | Impact & Rationale |
| :--- | :--- | :--- | :--- |
| **P0** | Security Hardening & Automated CI/CD | Immediate (Next Sprint) | Mitigates brute-force exposure, automates regression testing on every commit. |
| **P1** | Fine-Grained RBAC & Enterprise Audit | Near-term | Enables divisional supervision, bulk staff onboarding, and TOTP two-factor security. |
| **P2** | Predictive Analytics & Edge Telemetry | Mid-term | Adds machine learning consumption forecasting and active hydrant refill detection. |
| **P3** | Platform Scale & PWA Offline Sync | Long-term | Multi-tenant railway division isolation and disconnected yard inspection support. |

---

## 2. Detailed Work Packages

### 2.1 P0: Immediate Security & CI/CD Hardening

#### Work Package P0.1: Rate Limiting & Brute-Force Throttling
- **Priority**: P0 (Immediate)
- **Affected Files**:
  - `backend/app/main.py`
  - `backend/app/api/v1/auth.py`
  - `backend/requirements.txt`
- **Dependencies**: `slowapi` or Redis-backed rate limiter.
- **Sequence & Execution Plan**:
  1. Add `slowapi` dependency to `backend/requirements.txt`.
  2. Configure Limiter in `backend/app/main.py` keyed on client IP and username.
  3. Apply `@limiter.limit("5/minute")` decorator to `POST /api/v1/auth/login`.
  4. Write unit tests in `backend/tests/test_api.py` verifying HTTP 429 Too Many Requests response.
- **Implementation Guidelines**: Return standard RFC 7807 problem details with `Retry-After` header.

#### Work Package P0.2: GitHub Actions Automated Regression Pipeline
- **Priority**: P0 (Immediate)
- **Affected Files**:
  - `.github/workflows/ci.yml`
- **Dependencies**: Node.js 20, Python 3.11, Ubuntu runner.
- **Sequence & Execution Plan**:
  1. Create `.github/workflows/ci.yml` triggered on push to `main` and pull requests.
  2. Job 1: Backend tests (`pytest backend/tests -v --cov=app`).
  3. Job 2: Frontend typecheck (`npx tsc --noEmit`) and production build (`npm run build`).
  4. Job 3: Headless Electron verification runs (`verify_ui_scaling_e2e.cjs`, `comprehensive_e2e_audit.cjs`).
- **Implementation Guidelines**: Fail builds if any test fails or TypeScript emits warnings.

---

### 2.2 P1: Fine-Grained RBAC & Enterprise Staff Onboarding

#### Work Package P1.1: Multi-Factor Authentication (TOTP) for Administrators
- **Priority**: P1 (Near-term)
- **Affected Files**:
  - `backend/app/models/user.py`
  - `backend/app/api/v1/auth.py`
  - `apps/mobile/src/screens/LoginScreen.tsx`
  - `apps/mobile/src/screens/UsersScreen.tsx`
- **Dependencies**: `pyotp`, `qrcode`.
- **Sequence & Execution Plan**:
  1. Add `totp_secret` (nullable string) to `User` model.
  2. Implement `POST /api/v1/auth/mfa/setup` and `POST /api/v1/auth/mfa/verify`.
  3. Update login flow: if `user.totp_enabled`, require 6-digit one-time code before token issuance.
  4. Build QR setup drawer in User Management profile.
- **Implementation Guidelines**: Store TOTP secrets encrypted with AES-256 using backend secret key.

#### Work Package P1.2: Bulk Employee Onboarding via CSV
- **Priority**: P1 (Near-term)
- **Affected Files**:
  - `backend/app/api/v1/users.py`
  - `apps/mobile/src/screens/UsersScreen.tsx`
- **Dependencies**: Standard library `csv` module.
- **Sequence & Execution Plan**:
  1. Implement `POST /api/v1/users/bulk-import` accepting `multipart/form-data` CSV.
  2. Validate mandatory columns: `full_name`, `username`, `employee_id`, `department`, `designation`.
  3. Generate secure temporary passwords and trigger automated credentials export for dispatch.
  4. Add **Import Roster** button in `UsersScreen.tsx` with modal file selector and error preview.

---

### 2.3 P2: Predictive Analytics & Smart Refill Integrations

#### Work Package P2.1: Predictive Time-to-Empty Estimation
- **Priority**: P2 (Mid-term)
- **Affected Files**:
  - `backend/app/services/analytics_service.py`
  - `backend/app/api/v1/tanks.py`
  - `apps/mobile/src/screens/DashboardScreen.tsx`
- **Dependencies**: `numpy`, `scipy`.
- **Sequence & Execution Plan**:
  1. Ingest historical train speed, passenger load, and ambient temperature telemetry.
  2. Implement rolling regression model estimating consumption rate ($\text{liters/hour}$).
  3. Expose `estimated_hours_remaining` in `GET /api/v1/tanks/live`.
  4. Render predictive depletion countdown pill on the primary HMI tank gauge.

#### Work Package P2.2: Automated Station Refill Detection & Logging
- **Priority**: P2 (Mid-term)
- **Affected Files**:
  - `backend/app/services/alarm_service.py`
  - `backend/app/models/telemetry.py`
  - `apps/mobile/src/screens/HistoryScreen.tsx`
- **Dependencies**: Geo-fencing database of railway station refill hydrants.
- **Sequence & Execution Plan**:
  1. Detect positive $\frac{dh}{dt} > 5\text{ cm/min}$ while GPS speed is $0\text{ km/h}$.
  2. Cross-reference GPS coordinates with nearest station corridor waypoint.
  3. Log an immutable `REFILL_EVENT` recording station code, start time, end time, and volume added.
  4. Display Refill Event markers on the historical trend chart.

---

### 2.4 P3: Platform Scale & Disconnected Operations

#### Work Package P3.1: Offline-First Progressive Web App (PWA)
- **Priority**: P3 (Long-term)
- **Affected Files**:
  - `apps/mobile/public/sw.js`
  - `apps/mobile/src/services/offlineStorageService.ts`
- **Dependencies**: `idb` (IndexedDB wrapper), Service Worker API.
- **Sequence & Execution Plan**:
  1. Register Service Worker with cache-first strategy for static assets.
  2. Store the latest 1,000 telemetry readings locally in IndexedDB.
  3. Permit yard operators to inspect tanks and take manual notes during cellular outages, synchronizing when connectivity is restored.

#### Work Package P3.2: Multi-Zone / Multi-Division Data Partitioning
- **Priority**: P3 (Long-term)
- **Affected Files**:
  - `backend/app/models/base.py`
  - `backend/app/core/database.py`
  - All API routes
- **Dependencies**: PostgreSQL row-level security (RLS).
- **Sequence & Execution Plan**:
  1. Add `division_code` column to all asset and telemetry tables.
  2. Configure PostgreSQL RLS policies matching the user's assigned division.
  3. Enable multi-zone super-administrators to monitor national railway networks through a single consolidated console.

