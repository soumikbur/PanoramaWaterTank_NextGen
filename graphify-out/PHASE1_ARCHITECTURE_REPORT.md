# PHASE 1: Graphify Architecture & Component Relationship Analysis

**Project:** Panorama Water Tank Monitor — NextGen Railway SCADA/HMI  
**Repository:** `https://github.com/soumikbur/PanoramaWaterTank_NextGen`  
**Deployment Target:** `https://soumikbur.github.io/PanoramaWaterTank_NextGen/`  
**Knowledge Graph Topology:** 5,632 nodes, 9,942 edges across 410 communities (`graphify-out/graph.json`)

---

## 1. Application Architecture & Component Inventory

### A. Entry Point & Provider Hierarchy
- **Entry Point:** `apps/mobile/src/index.tsx`
  - Mounts to `#root` via `ReactDOM.createRoot()`.
- **Top-Level Providers:**
  - `DisplayPreferencesProvider` (`apps/mobile/src/context/DisplayPreferencesContext.tsx`)
  - `AppProvider` (`apps/mobile/src/state/AppContext.tsx`)
- **Shell Structure:**
  - `AppShell` (`apps/mobile/src/App.tsx`) wraps the application with `Header`, `Sidebar`, `MainContent`, and `Footer`.

### B. Routing & Navigation Mechanism
- **Current Router Implementation:**
  - State-based routing driven by `activeScreen: ScreenName` in `AppContext.tsx`.
  - Registered screens: `login`, `dashboard`, `trains`, `coaches`, `watertank`, `devices`, `location`, `monitoring`, `alerts`, `history`, `reports`, `settings`, `users`, `logs`.
- **Identified Routing Gaps:**
  - **No URL Synchronization:** `window.location.hash`, `window.location.pathname`, and `window.history` are not synchronized with `activeScreen`.
  - **No Dedicated Coach Details Route:** Screen list contains `'coaches'` (`CoachManagementScreen`), but does not have a distinct `'coach-details'` screen or parameterized route (e.g. `coach-details?train=12841&coach=C4`).
  - **Direct URL / Refresh Vulnerability:** Navigating directly or refreshing on deep paths (e.g. `/PanoramaWaterTank_NextGen/coach-details`) triggers GitHub Pages 404. Without relative path correction and client-side SPA fallback in `404.html`, assets fail to load resulting in a blank screen.

### C. Coach Management & Coach Details Inspection
- **Button Click Handlers:**
  - In `EmployeeDashboard.tsx`: Primary action button "View Details" calls `setActiveScreen('coaches')`.
  - In `Sidebar.tsx`: "Coach Management" item calls `setActiveScreen('coaches')`.
  - In `TrainManagementScreen.tsx`: "Inspect in Water Tank Monitor" calls `setActiveScreen('watertank')`.
- **Destination Component:** `apps/mobile/src/screens/CoachManagementScreen.tsx`
  - Contains state `selectedCoach: CoachRecord | null`.
  - Initializes `selectedCoach` as `null`. It does **not** read `selectedCoachNumber` from `AppContext`, leaving the detail panel in an empty/prompt state unless a coach card is clicked.
  - If navigated with invalid or missing coach parameters, or if telemetry fields are null, unhandled exceptions in calculations or subcomponents can unmount the React component tree.
  - No `<ErrorBoundary>` exists around `MainContent` or screens.

### D. Subsystem Mapping & Key Components
- **Dashboard:** `EmployeeDashboard.tsx` (industrial SCADA layout with train fleet table, 24-coach graphical consist, 3-column monitoring grid, and bottom action bar).
- **Train Management:** `TrainManagementScreen.tsx` (fleet registry, train addition/editing, route metadata, coach counting).
- **Coach Management:** `CoachManagementScreen.tsx` (consist visualization, coach addition/editing, dual-tank sight glass).
- **Tank Monitoring:** `WaterTankScreen.tsx` & `components/tank/TankVisualization.tsx` (SVG 3D metallic cylindrical tanks, dual sensor indicators).
- **GPS Tracking:** `LocationScreen.tsx` (Leaflet polyline corridor, station markers, GPS coordinates, train centering).
- **Authentication & RBAC:** `LoginScreen.tsx`, `AppContext.tsx` (`login()`, `logout()`, `currentUser.role === 'ADMIN' | 'EMPLOYEE'`). Protected admin routes: `users`, `logs`, system hardware config.
- **Display Preferences & Styling:** `DisplaySettingsPanel.tsx`, `variables.css` (Strictly light industrial SCADA theme, display zoom 80%–125%, font sizes small/medium/large).

---

## 2. Identified Vulnerabilities & Root Causes of Blank Page

1. **Absence of Dedicated `CoachDetailsScreen` & Route:**
   - When users click "Coach Details" or expect a full coach view, navigating to an undefined route or failing to initialize `selectedCoach` leaves the screen unrendered.
2. **Missing Client-Side URL Router & SPA Fallback:**
   - GitHub Pages serves `404.html` on direct subpath URLs. Because static asset links were relative (`./assets/index.js`), nested paths resolve to `.../coach-details/assets/index.js` (404 Not Found), leaving a blank screen.
   - Browser refresh does not preserve state because the URL was not synchronized with `trainNumber` and `coachNumber`.
3. **Absence of React Error Boundary:**
   - In React 18, any unhandled JavaScript exception during render (such as reading properties of null/undefined coach telemetry) triggers unmounting of the entire DOM, resulting in a blank screen with zero feedback.
4. **Missing Empty & Loading States:**
   - If telemetry for a coach is loading or absent, components must display robust placeholder indicators rather than throwing runtime errors.

---

## 3. Planned Ponytail Repair Strategy

1. **Create `CoachDetailsScreen.tsx`:** Full dedicated screen with Train No, Train Name, Coach No, Coach Type, Device, Status, Battery %, Dual Tank Visualizations (Arrival Sensor 1, Departure Sensor 2), Water %, Water Height, GPS info, History links, and Back button.
2. **Create Global Client-Side Router with Hash & Path Fallback:**
   - Synchronize `activeScreen`, `selectedTrainNumber`, and `selectedCoachNumber` with `window.location.hash` (`#/coach-details?train=12841&coach=C1`) and `window.history`.
   - Update `404.html` and `index.html` with SPA redirect scripts to ensure browser refreshes and direct URLs work seamlessly on GitHub Pages.
3. **Implement Application-Level `<ErrorBoundary>`:**
   - Wrap the entire app in `App.tsx` and `MainContent` to catch runtime exceptions and render a professional SCADA recovery card with a "Return to Dashboard" action.
4. **Wire Up Dashboard & Consist Actions:**
   - Add explicit "Coach Consist" and "Coach Details" buttons in `EmployeeDashboard.tsx`.
   - Allow seamless navigation between Dashboard, Coach Consist, and Coach Details.
5. **Execute E2E Browser Testing:**
   - Verify login, train selection, Coach Consist, coach selection (C1), Coach Details rendering, browser refresh on nested route, direct URL access, and invalid data resilience.
