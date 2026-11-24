# GRAPHIFY ARCHITECTURE & DEPENDENCY REPORT

**Project:** Panorama Water Tank Monitoring System (NextGen & Capacitor)  
**Date:** 2026-11-24  
**Audit Stage:** Post-Implementation Architecture Verification  
**Commit:** `0b8b1b8d8ce174a3671cda6676747c5b847c31f3`  
**Dedicated Branch:** `feat/telemetry-table-and-capacitor-sync`  

---

## 1. Graph Overview

- **Nodes:** 11,769
- **Edges:** 20,194
- **Communities:** 756
- **Edge Breakdown:** 91% EXTRACTED, 9% INFERRED, 0% AMBIGUOUS

---

## 2. Identified Subsystems & Dependency Mappings

### A. Frontend Architecture (`apps/mobile`)
- **Root Entry & Router:** `apps/mobile/src/App.tsx` controls top-level screen switching (`Dashboard`, `Devices`, `Raw Data Monitor`, `Tanks`, `Trains`, `Location`, `Settings`).
- **Devices Screen Component:** `apps/mobile/src/screens/DevicesScreen.tsx`
  - Integrated 13-column SCADA telemetry table with sticky dark-navy header (`#0F172A`).
  - Alternating rows (`#FFFFFF` and `#F0F7FF`).
  - Strict absence of IMEI and SIM Number.
  - Controls: Search by Device ID, Device dropdown, Date Range picker (`From`/`To`), Validity dropdowns (`AI1`, `GPS`, `Altitude`), Sort selector, and RFC 4180 CSV export.
  - Tab Switcher: "Telemetry Data Table" (default) and "Fleet & Device Management" (preserving Add/Edit/Delete modals and diagnostics drawer).
- **Raw Data Monitor Screen Component:** `apps/mobile/src/screens/MqttMonitorScreen.tsx`
  - Approved pure-white SCADA visual design.
  - Retains Raw View & JSON View with syntax highlighting.
  - Full client-side buffer controls (Auto Scroll, Pause, Clear, Download, Copy, Buffer size selector).
  - MQTT broker host/port/topic configuration completely removed from visible UI while keeping the underlying MQTT stream and live reception 100% active.
- **Client & Fallback Layer:** `apps/mobile/src/api/client.ts`
  - Communicates with FastAPI backend (`/api/v1/devices/telemetry-history` and `/api/v1/devices/telemetry-csv`).
  - Offline-resilient fallback to `apps/mobile/src/data/telemetrySeed.json` (841 genuine readings from `panorama_dev.db`).

### B. Backend Services & Repositories (`backend`)
- **FastAPI Endpoints:**
  - `GET /api/v1/devices/telemetry-history`: Paginated, filtered, and sorted historical telemetry table endpoint.
  - `GET /api/v1/devices/telemetry-csv`: 13-column CSV streaming endpoint with formula injection sanitization.
  - `GET /api/v1/export/telemetry-csv`: Alternative export path.
- **Repository Layer:** `backend/app/repositories/telemetry_repo.py`
  - `get_paginated_telemetry_records()`: Queries `telemetry_readings` outer-joined with `devices`, computes total count, total pages, and maps rows.
  - `get_all_telemetry_records_for_export()`: Extracts up to 5,000 rows for bulk CSV export without IMEI/SIM.
  - `format_telemetry_table_row()`: Formats row data, computing `AI1 mA`, `Level 1 %`, `Battery V`, `Battery %`, coordinates, and strictly formatted UTC timestamps.
- **Data Models:** `backend/app/models/telemetry.py` (`TelemetryReading`) and `backend/app/models/device.py` (`Device`).
- **Schemas:** `backend/app/schemas/telemetry.py` (`TelemetryTableRow`, `TelemetryTableResponse`).

### C. Capacitor Application Architecture (`PanoramaWaterTank_Capacitor`)
- **Bundler:** `scripts/sync_dist.js` synchronizes the production build from `apps/mobile/dist` into `PanoramaWaterTank_Capacitor/www` and `PanoramaWaterTank_Capacitor/android/app/src/main/assets/public`.
- **Sync:** `npx cap sync android` synchronizes plugins (`@capacitor/app`, `@capacitor/network`, `@capacitor/preferences`, `@capacitor/geolocation`, etc.).
- **Native Android Build:** Gradle debug APK built at `PanoramaWaterTank_Capacitor/android/app/build/outputs/apk/debug/app-debug.apk`.
- **Live Device:** Connected `emulator-5554` (Android 17, 1080x2400).

---

## 3. Scope & Unmodified Modules

The following systems were verified as **strictly untouched**:
- `DashboardScreen.tsx`
- `TrainManagementScreen.tsx`
- `CoachDetailsScreen.tsx`
- `WaterTankScreen.tsx`
- `LocationScreen.tsx`
- `AlarmsScreen.tsx`
- `ReportsScreen.tsx`
- `SettingsScreen.tsx`
- `LoginScreen.tsx`
- Firmware files (`app/`, `src/core/`, MCU code)
