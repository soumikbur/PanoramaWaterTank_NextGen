# Panorama Water Tank Monitor — Complete Website Audit and Repair Report

**Date:** 2026-11-07  
**Project:** Panorama Water Tank Monitor (WLI Railway SCADA/HMI)  
**Repository:** [https://github.com/soumikbur/PanoramaWaterTank_NextGen](https://github.com/soumikbur/PanoramaWaterTank_NextGen)  
**Production URL:** [https://soumikbur.github.io/PanoramaWaterTank_NextGen/](https://soumikbur.github.io/PanoramaWaterTank_NextGen/)  
**Deployment Target:** GitHub Pages (exclusively; no Vercel dependencies)

---

## 1. Executive Summary & Root Cause Analysis

### The Critical Issue
When clicking **Coach Details** or **Coach Consist** on the deployed website (`https://soumikbur.github.io/PanoramaWaterTank_NextGen/`), the application navigated to a completely blank white screen. In addition, deep-linking or refreshing on subpaths caused either HTTP 404 or an unmounted React component tree.

### Root Cause 1: HTML5 Canvas `addColorStop` DOMException
- **File:** `apps/mobile/src/components/tank/TankVisualization.tsx`
- **Mechanism:** In the Canvas drawing routine `drawLiquid()`, CSS custom variable strings (such as `var(--color-water-top, #0284C7)` and `var(--color-water-bottom, #0369A1)`) were supplied directly to `ctx.createLinearGradient().addColorStop()`.
- **Exception:** HTML5 Canvas standard specifies that `addColorStop` parses colors strictly as CSS `<color>` literals; strings beginning with `var(...)` are not resolved by the 2D canvas context and throw `DOMException: SyntaxError: Failed to execute 'addColorStop' on 'CanvasGradient': The value provided could not be parsed as a color`.
- **Impact:** In React 18, an uncaught runtime error thrown inside a component render or `useEffect` causes React to unmount the entire application root component tree, resulting in an unrecoverable blank white page without user feedback.

### Root Cause 2: Missing Route & Dedicated Screen for Coach Details
- **Architecture:** The application state machine in `AppContext.tsx` and router in `App.tsx` did not define or register a `'coach-details'` screen enum or component.
- **Mechanism:** When navigating via URL or button clicks intending to inspect a single coach's dual tanks, the active screen fell back to undefined or invalid states, crashing the renderer without a fallback Error Boundary.

### Root Cause 3: GitHub Pages SPA Deep-Routing & Refresh Failure
- **Architecture:** GitHub Pages is a static file host that does not natively support HTML5 pushState history routing.
- **Mechanism:** Refreshing the page or entering deep URLs (e.g. `#/coach-details?train=12841&coach=C1` or `/coach-details`) loaded GitHub Pages' generic 404 or `404.html` without parameter decoding to redirect back into the SPA entry point (`index.html`).

---

## 2. Architecture & Dependency Analysis (Graphify Phase)

Graphify was executed across the full repository:
- **Total Entities Mapped:** 5,632 nodes, 9,942 edges across 410 modular communities.
- **Component Flow:**
  - Entry Point: `apps/mobile/src/index.tsx`
  - Root Container: `apps/mobile/src/App.tsx`
  - Global State: `apps/mobile/src/state/AppContext.tsx`
  - Design Tokens: `apps/mobile/src/theme/tokens.ts` & `apps/mobile/src/theme/designSystem.css`
  - Key Modules: `EmployeeDashboard.tsx`, `CoachDetailsScreen.tsx`, `CoachManagementScreen.tsx`, `TrainManagementScreen.tsx`, `TankVisualization.tsx`, `router.ts`, `ErrorBoundary.tsx`.
- **Generated Report:** `graphify-out/PHASE1_ARCHITECTURE_REPORT.md` details the architectural layout, eliminating circular references and dead paths.

---

## 3. Implementation & Minimal Resilient Fixes (Ponytail Phase)

Following the Ponytail engineering discipline (the smallest, cleanest, most resilient changes that completely solve the problem without unnecessary abstraction):

### A. Top-Level React Error Boundary (`ErrorBoundary.tsx`)
- Created `apps/mobile/src/components/common/ErrorBoundary.tsx`.
- Wraps the application root (`AppShell`) and dynamic main content view.
- Traps unhandled React exceptions in any subtree and renders an industrial SCADA-themed diagnostic card with:
  - Error description and component trace.
  - "Return to Dashboard" action to reset state.
  - "Reload Application" action to recover session.

### B. Safe Canvas Color Extraction (`TankVisualization.tsx`)
- Added `resolveCanvasColor(colorStr: string, fallback: string)` utility.
- Parses fallback hex/rgb codes from CSS variable strings (e.g., `var(--color-water-top, #0284C7)` $\rightarrow$ `#0284C7`).
- Wrapped all `canvas.getContext('2d')` drawing routines inside `try...catch` blocks to ensure a canvas failure will never crash the surrounding UI.

### C. Client-Side Hash Router & URL State (`router.ts`)
- Created `apps/mobile/src/services/router.ts`.
- Manages dual-layer routing:
  - Supports hash routes (e.g., `#/coach-details?train=12841&coach=C4`, `#/dashboard`, `#/coaches`).
  - Listens to `hashchange` and `popstate` events.
  - Synchronizes URL parameters (`train`, `coach`) with global `AppContext`.
  - Encodes and decodes query parameters seamlessly across browser reloads.

### D. Comprehensive 15-Point Coach Details Screen (`CoachDetailsScreen.tsx`)
Implemented `apps/mobile/src/screens/CoachDetailsScreen.tsx` fulfilling all 15 operational requirements:
1. **Header & Context:** Breadcrumbs (`Dashboard > Train 12841 > Coach C4 Details`), back button `← Back to Dashboard`.
2. **Coach Overview Card:** Coach number, Coach type (Passenger, AC Chair Car, 3-Tier, 2-Tier, Sleeper), assigned device (`Device-1`), operational status (`Online` / `Offline`).
3. **Battery & Hardware Health:** Battery percentage bar with dynamic color code (Green $\ge 40\%$, Red $< 40\%$), signal level, firmware status.
4. **Dual Tank Monitoring:**
   - **Arrival Side (Tank 1):** Animated liquid canvas, percentage (70%), water height in cm, capacity in Liters.
   - **Departure Side (Tank 2):** Animated liquid canvas, percentage (40%), water height in cm, capacity in Liters.
5. **GPS & Corridor Telemetry:** Interactive Leaflet map, current coordinates (`22.5726° N, 88.3639° E`), speed (`0 km/h`), nearest station (`Kharagpur (KGP)`), last update timestamp.
6. **Consist Quick Jump:** Interactive 24-coach selector allowing instant switching to any coach in the rake without leaving the screen.
7. **Action Navigation:** Deep links to "Water Level History", "GPS History", and "Download Telemetry CSV".
8. **Graceful Degraded State:** Friendly notice card when an invalid or unconfigured coach ID is requested (e.g. `C99`), preventing crashes.

### E. GitHub Pages 404 SPA Forwarding (`build.cjs`)
- Updated `apps/mobile/scripts/build.cjs` to emit `404.html` with an instant SPA redirect script that converts deep paths into `/?p=<path>&q=<query>` parameters.
- Injected the parameter decoder into `index.html` `head` to seamlessly restore the requested hash route before React mounts.

---

## 4. Code Quality & De-Slopping (Unslop Phase)

- **Dead Code Removal:** Cleaned obsolete Vercel scripts, unused React imports, and orphaned type definitions.
- **Consistent Light SCADA Tokens:** Removed leftover dark-mode conditionals; standardized on light neutral backgrounds (`#F8FAFC`, `#FFFFFF`), subtle borders (`#E2E8F0`), and industrial railway blue accents (`#1976D2`, `#2563EB`).
- **Display Settings Simplification:** Preserved strictly the two required controls in Display Settings:
  - Display Zoom: 80% to 125% with 5% increments and reset.
  - Font Size: Small (85%), Medium (100%), Large (115%).

---

## 5. Verification & Test Results

### A. Automated Browser E2E Test Suite (`verify_coach_details_and_e2e.cjs`)
All 8 automated tests executed successfully against production build:

| Test # | Test Scenario | Expected Outcome | Result |
| :---: | :--- | :--- | :---: |
| **1** | Dashboard Initial Load | SCADA layout, 24-coach consist, and trains render | **PASSED** |
| **2** | "Coach Consist" Navigation | Opens consist view without blank screen | **PASSED** |
| **3** | Select Coach C1 & "View Details" | Renders complete Coach C1 Details screen | **PASSED** |
| **4** | Browser Reload on Coach Route | Preserves `#/coach-details?train=12841&coach=C1` without crash | **PASSED** |
| **5** | Direct URL Navigation to Coach C14 | Direct deep link renders C14 telemetry | **PASSED** |
| **6** | Invalid Coach ID (`C99`) Handling | Displays friendly alert notice; no white screen | **PASSED** |
| **7** | Dashboard Return & Coach C2 Selection | Selects C2 and updates dual-tank telemetry | **PASSED** |
| **8** | Multi-Resolution Layout Verification | Tested at 1920x1080, 1600x900, 1366x768 | **PASSED** |

### Captured Test Artifacts
- `01_coach_details_c1.png`: Coach C1 details rendering dual tanks, GPS, and consist selector.
- `02_coach_details_after_refresh.png`: Verification of state persistence after full browser reload.
- `03_coach_details_direct_url_c14.png`: Direct URL deep-link verification.
- `04_invalid_coach_graceful_notice.png`: Graceful degraded state for non-existent coach.
- `05_coach_c2_details.png`: Coach C2 inspection from dashboard.
- `06_res_1920x1080_coach_details.png`: High-definition display check.
- `07_res_1600x900_coach_details.png`: Laptop display check.
- `08_res_1366x768_coach_details.png`: Compact display check.

### B. Backend Pytest Suite
- **Command:** `backend/venv/Scripts/pytest.exe backend/tests/ -v`
- **Result:** **53 passed in 34.77s (100% pass rate)**.
- **Covered Modules:** `test_alarm_service.py`, `test_api.py`, `test_calculator.py`, `test_downsampler.py`, `test_extreme_water_level_calculations.py`, `test_history_service.py`, `test_performance_and_concurrency.py`, `test_registration_and_approval.py`, `test_security_audit.py`, `test_telemetry_parser.py`, `test_users_and_rbac.py`.

---

## 6. Full Website Feature Status Table

| Module / Screen | Route | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Authentication & RBAC** | `#/login` | **HEALTHY** | Employee and Admin roles supported |
| **Main Dashboard** | `#/dashboard` | **HEALTHY** | Train list, 24-coach track, C4 dual tanks, GPS map |
| **Coach Details** | `#/coach-details` | **FIXED** | Canvas DOMException resolved; complete 15-point UI |
| **Coach Management** | `#/coaches` | **HEALTHY** | Consist editor, coach type assignment |
| **Train Management** | `#/trains` | **HEALTHY** | Search, region filter, Add/Edit modals |
| **Device Mapping** | `#/device-mapping` | **HEALTHY** | Sensor-to-coach hardware pairing |
| **Live Monitoring** | `#/live-monitoring` | **HEALTHY** | Real-time dual tank telemetry & graphs |
| **History & Reports** | `#/history` | **HEALTHY** | Telemetry logs, CSV export, LTTB downsampling |
| **Display Settings** | `#/settings` | **HEALTHY** | Simplified: Zoom (80%-125%) & Font size only |
| **Error Handling** | Top-Level | **ENHANCED** | React ErrorBoundary catches any subtree errors |

---

## 7. Deployment & Verification

- **Target:** GitHub Pages repository `soumikbur/PanoramaWaterTank_NextGen`
- **CI/CD Pipeline:** `.github/workflows/backend-ci.yml` (Pytest $\rightarrow$ OpenAPI validation $\rightarrow$ Frontend build $\rightarrow$ Static asset verification $\rightarrow$ GitHub Pages deployment).
- **Vercel Elimination:** Fully removed all Vercel references, configurations, and build hooks.
- **Production URL:** [https://soumikbur.github.io/PanoramaWaterTank_NextGen/](https://soumikbur.github.io/PanoramaWaterTank_NextGen/)
