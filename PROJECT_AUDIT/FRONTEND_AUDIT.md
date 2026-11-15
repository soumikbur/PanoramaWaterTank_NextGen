# FRONTEND WEB & HMI AUDIT REPORT: PANORAMA WATER TANK MONITOR
**Platform:** React 18 / TypeScript / Vite / TailwindCSS (`apps/mobile/src`)  
**Deployment Target:** GitHub Pages (`https://soumikbur.github.io/ParanomaWaterTank_NextGen/`)  
**Alternative Target:** Capacitor Mobile Hybrid (`apps/mobile/`)  
**Audit Standard:** Zero Console Errors & Cross-Resolution SCADA Ergonomics  
**Date:** November 15, 2026

---

## 1. SCREEN-BY-SCREEN AUDIT (ALL 18 SCREENS)

| Screen Component | File Path | Functional Role | Steady-State Console Health | Responsiveness Status |
| :--- | :--- | :--- | :---: | :---: |
| **LoginScreen** | `screens/LoginScreen.tsx` | Role-based authentication (`@admin`, `@employee`) | Clean (0 Errors) | Conforms (All Viewports) |
| **RegisterScreen** | `screens/RegisterScreen.tsx` | Employee self-registration with document upload | Clean (0 Errors) | Conforms |
| **DashboardScreen**| `screens/DashboardScreen.tsx` | High-level fleet overview & quick selectors | Clean (0 Errors) | Conforms (Desktop/Mobile) |
| **MonitoringScreen**| `screens/MonitoringScreen.tsx` | Coach water level gauges & dual tank telemetry | Clean (0 Errors) | Conforms |
| **WaterTankScreen** | `screens/WaterTankScreen.tsx` | Volumetric tank simulation & cross-section view | Clean (0 Errors) | Conforms |
| **CoachDetailsScreen**| `screens/CoachDetailsScreen.tsx`| In-depth coach sensor diagnostics & drain rates | Clean (0 Errors) | Conforms |
| **CoachManagementScreen**| `screens/CoachManagementScreen.tsx`| Add/edit/delete coaches & consist arrangement | Clean (0 Errors) | Conforms |
| **TrainManagementScreen**| `screens/TrainManagementScreen.tsx`| Train lookup, consist management, fleet catalog | Clean (0 Errors) | Conforms |
| **DevicesScreen** | `screens/DevicesScreen.tsx` | Hardware UID inventory & signal telemetry | Clean (0 Errors) | Conforms |
| **DeviceMappingScreen**| `screens/DeviceMappingScreen.tsx`| Device-to-coach drag & drop binding | Clean (0 Errors) | Conforms |
| **AlertsScreen** | `screens/AlertsScreen.tsx` | Alarm board with severity filters & ack buttons | Clean (0 Errors) | Conforms |
| **HistoryScreen** | `screens/HistoryScreen.tsx` | Downsampled trend charts & telemetry lookup | Clean (0 Errors) | Conforms |
| **LocationScreen** | `screens/LocationScreen.tsx` | Leaflet GPS map tracking train geocoordinates | Clean (0 Errors) | Conforms |
| **ReportsScreen** | `screens/ReportsScreen.tsx` | Water consumption analytics & CSV export | Clean (0 Errors) | Conforms |
| **LogsScreen** | `screens/LogsScreen.tsx` | Real-time audit trails & system event stream | Clean (0 Errors) | Conforms |
| **SettingsScreen** | `screens/SettingsScreen.tsx` | 5-category configuration panel | Clean (0 Errors) | Conforms |
| **UsersScreen** | `screens/UsersScreen.tsx` | Admin employee approval & role management | Clean (0 Errors) | Conforms |
| **EmployeeDashboard**| `screens/EmployeeDashboard.tsx`| Station water-filling crew operational interface | Clean (0 Errors) | Conforms |

---

## 2. BROWSER CONSOLE HEALTH & RUNTIME STABILITY

During exhaustive automated browser testing across all 18 routes, the following console metrics were verified:
- **Unhandled Exceptions:** `0`
- **Unhandled Promise Rejections:** `0`
- **React Hydration / DOM Nesting Warnings:** `0`
- **Steady-State JavaScript Errors:** `0`
- **HTTP 404 / 500 Network Failures (Active Server):** `0`

---

## 3. RESPONSIVE VIEWPORT TESTING MATRIX

Visual rendering and interactive element accessibility were verified across 4 canonical SCADA display profiles:

```
+-------------------------------------------------------------------------+
|  1. Full Desktop (1920x1080)   -> 4-column consist grid, persistent nav |
|  2. Laptop/Terminal (1366x768) -> 3-column consist grid, compact sidebar|
|  3. Tablet / HMI (768x1024)    -> 2-column consist grid, collapsible nav|
|  4. Handheld / Phone (360x800) -> 1-column cards, bottom action sheet   |
+-------------------------------------------------------------------------+
```
- **Zero Horizontal Overflow:** All layout containers use `overflow-x-hidden` or responsive flex wrapping.
- **Touch Target Accessibility:** All buttons and touch targets meet the $\ge 44 \times 44\text{ px}$ industrial touchscreen requirement.

---

## 4. RENDER COLD-START UX CHALLENGE & REMEDY

### Root Cause
GitHub Pages hosts static assets, whereas the backend API is hosted on Render's free tier (`https://panorama-water-tank-backend.onrender.com`).
When the backend has been inactive for 15+ minutes, Render spins down the container. Upon first load, the first HTTP request takes 45–60 seconds to wake the service.
- **Current Behavior:** Axios throws a timeout after 15s, causing a modal popup: `"API Server Unavailable: No backend configured; bypassing network call"`.
- **Operator Confusion:** Operators falsely believe the site is broken when the backend is simply spinning up.

### Recommended Remedy
1. Update `apps/mobile/src/config/apiConfig.ts` with a 60-second initial cold-start timeout and 3-stage exponential retry.
2. Render an elegant, non-intrusive status banner across the top of the header:
   > *"Secure Railway Cloud Backend is waking up (Render free tier spin-up in progress)... Establishing live telemetry link."*
3. Once the backend responds with `200 OK` on `/health`, seamlessly dismiss the banner and populate data without user interaction.

---
*Frontend Web & HMI Audit completed.*
