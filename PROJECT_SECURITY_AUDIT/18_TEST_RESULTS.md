# 18. Automated Verification & Regression Test Results
## Panorama Water Tank Monitor (WLI SCADA NextGen)

**Audit Date:** November 9, 2026  
**Test Harnesses:** Pytest 9.2.0 (Backend), Node.js Custom Assertion Runners (Frontend & Online Status Engine), Electron CDP Automation  

---

### 1. Backend Pytest Execution Summary

- **Total Test Cases Executed:** **58**
- **Passed:** **58**
- **Failed:** **0**
- **Skipped / Warning:** **0**
- **Total Duration:** 37.03 seconds

#### Test Suite Breakdown:
1. `tests/test_alarm_service.py` (6/6 Passed):
   - Critical low water level alarm trigger ($\le 10\%$).
   - Warning low water level alarm trigger ($\le 20\%$).
   - Normal nominal water level ($> 20\%$).
   - Overflow alarm trigger ($> 100\%$).
   - Sensor fault detection ($0\text{V}$ / out-of-range).
   - Battery voltage low fault trigger ($< 10.5\text{V}$).
2. `tests/test_api.py` (10/10 Passed):
   - Root endpoint API metadata JSON.
   - Root HTML React SPA shell delivery.
   - SPA fallback route routing.
   - Health check endpoint (`/api/v1/health`).
   - Authentication login endpoint (`/api/v1/auth/login`).
   - Tank live status endpoint (`/api/v1/tanks/live`).
   - Telemetry history downsampling endpoint (`/api/v1/telemetry/history`).
   - CSV telemetry export endpoint (`/api/v1/export/csv`).
   - Hardware device connection test endpoint (`/api/v1/settings/test-device`).
   - CORS preflight options handshake.
3. `tests/test_calculator.py` (6/6 Passed):
   - Default cylindrical geometry constants.
   - Hydrostatic water height calculation.
   - Water volume in litres calculation.
   - Fill percentage calculation.
   - Capacity rank classification (FULL, ADEQUATE, LOW, CRITICAL).
   - Unconstrained physical overflow volume calculation.
4. `tests/test_downsampler.py` (3/3 Passed):
   - LTTB point reduction from 1,000 points to 100 points.
   - Peak preservation during extreme fill events.
   - Valley preservation during rapid consumption events.
5. `tests/test_extreme_water_level_calculations.py` (10/10 Passed):
   - Numerical boundary: $0\%$ fill level.
   - Numerical boundary: $1\%$ fill level.
   - Numerical boundary: $10\%$ critical threshold.
   - Numerical boundary: $20\%$ warning threshold.
   - Numerical boundary: $50\%$ nominal level.
   - Numerical boundary: $99\%$ fill level.
   - Numerical boundary: $100\%$ full capacity.
   - Negative raw sensor level anomaly handling.
   - Physical unconstrained overflow calculation.
   - Transducer voltage fault handling.
6. `tests/test_history_service.py` (2/2 Passed):
   - Aggregate statistics calculation (min, max, mean, consumption rate).
   - Empty dataset graceful fallback handling.
7. `tests/test_performance_and_concurrency.py` (2/2 Passed):
   - Concurrent read queries under simultaneous client requests.
   - High-throughput telemetry ingestion (100 sequential readings).
8. `tests/test_registration_and_approval.py` (1/1 Passed):
   - Employee self-registration, admin queue review, and account activation workflow.
9. `tests/test_security_audit.py` (11/11 Passed):
   - Security headers presence (`nosniff`, `DENY`, `strict-origin-when-cross-origin`).
   - RBAC mutation endpoints enforcement (Admin-only guards).
   - Session invalidation on user logout.
   - Session invalidation on user password change.
   - Session invalidation on administrator account reset.
   - Login endpoint rate limiting (burst protection).
   - Document upload validation (magic bytes, extension whitelist, traversal blocks).
   - **Path traversal mitigation (SPA fallback directory sandboxing).**
   - **CORS tenant isolation (rejection of unauthorized GitHub Pages origins).**
   - **CSP hardening (absence of `'unsafe-eval'`).**
   - **CSV formula injection defense (`sanitize_csv_cell`).**
10. `tests/test_telemetry_parser.py` (4/4 Passed):
    - Valid JSON telemetry parsing.
    - Legacy firmware key normalization.
    - Invalid JSON syntax graceful rejection.
    - Railway SCADA contract payload parsing.
11. `tests/test_users_and_rbac.py` (3/3 Passed):
    - Employee RBAC access restrictions.
    - Admin user management lifecycle.
    - Admin password policy restrictions.

---

### 2. Frontend & Online Status Engine Test Results

- **Test Suite:** `apps/mobile/scripts/test_online_tank_status.cjs`
- **Total Scenarios:** 5
- **Passed:** 5 (100%)
- **Verified Invariants:**
  1. Default fleet without live device: 48 total, 0 online, 48 offline. Invariant $48 = 0 + 48$ holds.
  2. Single coach device online: 48 total, 2 online (Tank 1 & 2), 46 offline. Invariant $48 = 2 + 46$ holds.
  3. Stale telemetry timeout (> 120s): Tank transitions from online to offline.
  4. MQTT disconnection: Carrier disconnect marks all tanks offline.
  5. Unmapped tanks: Configured unmapped tanks are never falsely reported online.
