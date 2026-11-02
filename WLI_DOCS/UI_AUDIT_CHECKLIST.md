# Panorama Water Tank NextGen — Quality Audit Checklist

**Audit Standard**: Industrial SCADA/HMI Design System & Functional Validation  
**Date**: October 31, 2026  
**Auditor**: Automated Chromium/Electron Test Suite & Manual Browser Inspection  

---

## Audit Checklist & Verification Status

### 1. Navigation & Global Chrome
- [x] **Top Header (72px)**: Panorama emblem, home shortcut, dynamic page title/subtitle, search input, role badge, online indicator, settings shortcut, logout button, and live clock/date.
- [x] **Left Sidebar (224px / 64px)**: Fixed width, collapsible to 64px rail, active blue highlight with 3px indicator, accessible tooltips in collapsed mode, train summary card, and system status card.
- [x] **Footer (28px)**: System telemetry link, version indicator, copyright.

### 2. Location & GPS Tracking
- [x] **Geographic Map Engine**: Leaflet OpenStreetMap tiles integrated.
- [x] **Map Container Sizing**: Fixed 460px height; no clipping; re-evaluates size smoothly when sidebar collapses.
- [x] **Station Coordinates**: 6 verified corridor stations (NDLS, MTJ, AGC, GWL, VGLJ, BPL) plotted with interactive tooltips.
- [x] **Corridor Track Axis**: Explicitly labeled dashed polyline connecting stations.
- [x] **Live Train Marker**: Pulsing animated marker placed at live coordinates.
- [x] **Popup Telemetry**: Train number, coach, speed (km/h), GPS coordinates, altitude, satellites, and freshness indicator.
- [x] **Controls**: "Center on Train" and "Fit Corridor" functional.
- [x] **Offline / Error Handling**: Visible retry alert banner if tiles fail to load.

### 3. System Settings & Geometry
- [x] **Device & Connectivity**: MQTT Broker, port, TLS toggle, topic, device IP/port, refresh interval, and Ubidots secondary bridge.
- [x] **Interactive Tests**: "Test MQTT Broker" and "Test Edge REST" return live status and latency.
- [x] **Tank Geometry**: Height, diameter, dynamically derived capacity ($V = \pi \times r^2 \times h / 1000$ L) and cross-sectional area.
- [x] **Sensor Calibration**: Hydrostatic 4-20mA sensor offset, span, damping, and inversion.
- [x] **Alarm Thresholds**: Warning, critical, and overflow sliders with ordering validation ($\text{Critical} < \text{Warning} < \text{Overflow}$) and colored scale preview.
- [x] **Actions**: Read From Device, Apply Configuration, Reset Changes, and Factory Reset (Admin-protected confirmation modal).
- [x] **Secret Protection**: Ubidots token masked with show/hide toggle.

### 4. Fleet & Train Management
- [x] **4 Region Cards**: NORTH, SOUTH, EAST, WEST cards with train counts, coach counts, tank counts, and status badges.
- [x] **Interactive Drilldown**: Region overview → Trains in region → Consist coaches & tanks with level bars.
- [x] **Add Train Modal**: Validates 5-digit train number, name, region, coach number, and tank capacity.
- [x] **Delete Train**: Admin authorization check and confirmation dialog.

### 5. Water Tank Monitor & Dashboard
- [x] **Dual Sine-Wave Fluid Animation**: Animated canvas with shimmering wave crest.
- [x] **Resolved CanvasGradient Bug**: Fixed missing `waterTop`/`waterBottom` color tokens that caused runtime `addColorStop` errors.
- [x] **Resolved Unpassed Prop Bug**: Fixed `<TankVisualization />` in `WaterTankScreen` to pass `tank={liveTank}`.
- [x] **Responsive Grid**: Auto-fit `minmax(320px, 1fr)` ensuring cards never squeeze below legible widths.
- [x] **4-Tier Rank Bar**: Visual capacity indicator (EMPTY / LOW / MEDIUM / HIGH).
- [x] **Summary Grid**: 5 diagnostic tiles with auto-wrapping on smaller viewports.

### 6. Edge Devices & Health
- [x] **Device Inventory**: Gateway UIDs, modem models, signal RSSI, IP addresses.
- [x] **Filters**: Search by UID, train number, or coach; filter by online/warning status.

### 7. Alerts & Alarms
- [x] **Active Alarms**: Severity badges (NORMAL, WARNING, CRITICAL).
- [x] **Acknowledgment Flow**: Operator comment input and status update.

### 8. Historical Telemetry & Reports
- [x] **Time Series Downsampling**: LTTB algorithm preserving extrema across 12h, 24h, 7d.
- [x] **Operational Reports**: Consumption audit, refill logs, SLA metrics.
- [x] **CSV Export**: Direct download link to `/api/v1/export/csv`.

### 9. User Management & RBAC
- [x] **User Accounts Table**: Roles (ADMIN, OPERATOR, VIEWER), active status.
- [x] **RBAC Enforcement**: Admin-only restrictions on fleet deletion, user creation, and factory reset.
- [x] **Role Impersonation**: One-click role switching in UI to test operator vs administrator views.

### 10. System Logs
- [x] **Live Event Feed**: Diagnostic console for MQTT frame reception and broker handshakes.

