# Legacy Qt Application UI/UX Comprehensive Audit

**Reference Codebase**: `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank-Milestone2\PanoramaWaterTank`  
**Framework**: Qt 6.9 / 6.11 (QML / QtQuick / Quick.Controls / Quick.Shapes) with C++ backend models  
**Auditor**: Senior QA Engineer & React Native Desktop Specialist  
**Date**: October 29, 2026  

---

## 1. Executive Summary & Design System Philosophy

The original **Panorama Water Tank Monitor** is designed as a crisp, high-legibility industrial SCADA/HMI workstation application. Rather than relying on generic modern dark-mode dashboards, it uses a purposeful high-contrast industrial light theme:

- **Header / Window Frame**: Dark navy/charcoal (`#171C28`) providing high-contrast separation for titlebar branding and window controls.
- **Canvas Background**: Subtle neutral cool-gray (`#F8FAFC`).
- **Surfaces & Cards**: Pure white (`#FFFFFF`) with 1px light slate borders (`#E2E8F0`), subtle drop elevation, and rounded corners (12px).
- **Primary Brand / Liquid Accent**: High-visibility industrial blue (`#1479E8`), with fluid gradients transitioning from sky blue (`#0284C7`) down to royal blue (`#1D4ED8`).
- **Operational Status Colors**:
  - Normal / Operational: Emerald green (`#10B981` / `#059669`)
  - Warning (Level < 20%): Amber orange (`#F97316`)
  - Critical (Level < 10%): Vivid crimson (`#EF4444`)
  - Overflow (Level $\ge$ 100%): Deep red (`#DC2626` / `#EF4444`)
  - Offline: Slate gray (`#64748B`)
- **Typography**: Inter (with Segoe UI / system fallback), strict hierarchical sizing, high readability.

---

## 2. Complete Design Token Specification

### 2.1 Color Tokens (`qml/theme/Colors.qml`)

| Token Name | Hex Value | Role / Usage |
| :--- | :--- | :--- |
| `headerBackground` | `#171C28` | Application titlebar and top window header |
| `primary` | `#1479E8` | Primary button, active navigation icon/text, main percentage readouts |
| `primaryPressed` | `#0F62BD` | Pressed button state |
| `primarySurface` | `#EFF6FF` | Active navigation pill background, light blue badges and banners |
| `water` | `#1479E8` | Water fill color |
| `waterTop` | `#0284C7` | Fluid wave top gradient stop |
| `waterBottom` | `#1D4ED8` | Fluid wave bottom gradient stop |
| `background` | `#F8FAFC` | Page canvas background |
| `surface` | `#FFFFFF` | Card, sidebar, and table background surfaces |
| `surfaceAlt` | `#F1F5F9` | Hovered navigation items, secondary table rows, metric tags |
| `divider` | `#E2E8F0` | Card borders, list separators, table dividers |
| `dividerStrong` | `#CBD5E1` | Ruler scale lines, axis markers, input borders |
| `border` | `#E2E8F0` | BaseCard outline border |
| `success` | `#10B981` | Online dot, normal status badge, high quartile rank |
| `successText` | `#059669` | Success text labels and values |
| `successSurface` | `#ECFDF5` | Green badge backgrounds |
| `warning` | `#F97316` | Moderate rank, 10-20% warning alarms, amber pills |
| `warningSurface` | `#FFF7ED` | Amber warning banner backgrounds |
| `critical` | `#EF4444` | Low quartile rank, < 10% critical alarms, overflow state |
| `criticalSurface` | `#FEF2F2` | Red critical banner backgrounds |
| `overflow` | `#DC2626` | Overflow alert badge and water gradient |
| `sensorError` | `#8B5CF6` | ADC / Sensor fault purple alert |
| `offline` | `#64748B` | Offline status indicator, disconnected badge |
| `offlineSurface` | `#F1F5F9` | Offline badge background |
| `textPrimary` | `#172033` | Headings, card titles, primary values |
| `textSecondary` | `#64748B` | Labels, captions, subtitles, axis text |
| `textOnPrimary` | `#FFFFFF` | Text on buttons and filled badges |
| `tankOutline` | `#94A3B8` | Vessel outline border, scale tick marks |
| `waterHighlight` | `#60A5FA` | Crest wave reflection highlight |
| `sidebarInactive` | `#64748B` | Inactive navigation icon stroke |

### 2.2 Metrics & Spacing Tokens (`qml/theme/Metrics.qml`)

| Metric Token | Value | Applied To |
| :--- | :--- | :--- |
| `windowDefaultWidth` | 1536 px | Initial desktop window width |
| `windowDefaultHeight` | 1024 px | Initial desktop window height |
| `windowMinimumWidth` | 1280 px | Minimum responsive desktop width |
| `windowMinimumHeight` | 800 px | Minimum responsive desktop height |
| `compactBreakpoint` | 1200 px | Threshold for collapsing multi-column grids |
| `headerHeight` | 44 px | Top title bar height |
| `footerHeight` | 28 px | Copyright bottom strip height |
| `sidebarDefaultWidth` | 270 px | Fixed sidebar width |
| `cardPadding` | 16 px | Internal padding within BaseCards |
| `cardSpacing` | 14 px | Grid and column layout gaps |
| `contentMargin` | 14 px | Dashboard content outer margin |
| `radiusSmall` | 4 px | Input boxes, minor tags |
| `radiusMedium` | 8 px | Secondary cards, buttons |
| `radiusLarge` | 12 px | BaseCards, dialogs, main containers |
| `summaryCardHeight` | 122 px | Bottom summary tile height |
| `rankIndicatorHeight` | 124 px | Full-width rank bar card height |
| `tankCardMinHeight` | 280 px | Minimum top row card height |
| `tankCardWidthFraction` | 0.30 | Width fraction for Tank Visualization in top row |
| `trendCardWidthFraction` | 0.35 | Width fraction for Trend Chart in top row |
| `infoCardWidthFraction` | 0.35 | Width fraction for Tank Info Card in top row |

### 2.3 Typography Tokens (`qml/theme/Typography.qml`)

| Token | Size | Weight | Role |
| :--- | :--- | :--- | :--- |
| `dashTitle` | 30 px | Bold (700) | Major page header |
| `dashSectionTitle` | 22 px | DemiBold (600) | Section and group titles |
| `dashCardTitle` | 18 px | DemiBold (600) | Card title ("Water Level", "Level Trend", "Tank Information") |
| `dashPercentage` | 52 / 48 px | Bold (700) | Massive percentage value in TankVisualization |
| `dashValue` | 18 px | DemiBold (600) | Summary tile numerical values |
| `dashLabel` | 14 px | Medium (500) | Summary tile labels |
| `body` | 14 px | Medium (500) | Body copy, table cells |
| `caption` | 12 / 11 px | Normal (400) | Subtitles, helper text, axis coordinates |

---

## 3. Application Shell & Navigation Architecture

### 3.1 Custom Title Bar Header (`qml/components/Header.qml`)
- **Height**: 44 px
- **Color**: `#171C28` (Dark Charcoal)
- **Content**: Left-aligned `"Panorama Water Tank Monitor"` in white (`#FFFFFF`), 15 px, DemiBold, 16 px left margin.
- **Window Management**: Entire bar supports OS dragging (`-webkit-app-region: drag`) and double-click to toggle maximize.

### 3.2 Fixed Left Sidebar (`qml/components/Sidebar.qml`)
- **Width**: Exactly 270 px, solid white surface (`#FFFFFF`), right border 1px `#E2E8F0`.
- **Vertical Composition**:
  1. **Branding Header Area** (Height 74 px):
     - Water-drop icon badge: 46x46 px rounded square (radius 12 px, background `#EFF6FF`, border 1px `#DBEAFE`). Inside is a custom water droplet SVG glyph filled with `#1479E8`.
     - Brand text column: `"Panorama"` (22 px Bold `#172033`), `"Water Tank Monitor"` (13 px Medium `#64748B`).
  2. **Divider**: 1px `#E2E8F0`.
  3. **Primary Navigation Items** (Spacing 4 px):
     - Items: `Dashboard` (Index 0), `Water Tank` (Index 1), `Devices` (Index 2), `Alerts` (Index 3), `History` (Index 4).
     - Component (`NavItem.qml`): Height 50 px, radius 10 px. Active state has background `#EFF6FF` with text and icon in `#1479E8`. Inactive state has text `#1E293B`, icon `#64748B`, hover background `#F1F5F9`.
     - Custom Vector Icons (24x24 px):
       - *Dashboard*: 2x2 grid of 8.5x8.5 px rounded squares.
       - *Water Tank*: Cylindrical vessel outline with top collar neck.
       - *Devices*: Computer monitor screen outline with stand.
       - *Alerts*: Notification bell with clapper.
       - *History*: Clock circle with hour and minute hands.
  4. **SYSTEM Header**: Uppercase `"SYSTEM"`, 11 px Bold `#94A3B8`, letter spacing 1.2 px, left margin 12 px.
  5. **System Navigation**:
     - *Settings* (Index 5): Height 50 px, radius 10 px. Icon is a center gear circle with 6 radial teeth.
  6. **Spacer**: Flexible expanding spacer.
  7. **System Status Card**: Height 68 px, radius 10 px, white background, border 1px `#E2E8F0`. Contains a green pulsing dot (8px core, 14px outer halo at 25% opacity), `"System Status"` (12 px Medium `#64748B`), and `"All Systems Operational"` (13 px DemiBold `#059669`).
  8. **Copyright Footer**: `"© 2026 Panorama"`, `"All rights reserved."` in 11 px `#94A3B8`.

### 3.3 Copyright Footer Bar (`qml/components/Footer.qml`)
- **Height**: 28 px
- **Background**: Transparent
- **Content**: Centered `"© 2026 Panorama Water Tank Monitoring System"` in 12 px `#64748B`.

---

## 4. Screen-by-Screen Component Inventory

### 4.1 Dashboard Page (`qml/pages/DashboardPage.qml`)
The dashboard is assembled from three distinct stacked sections:

#### Section 1: Top 3-Card Split (`qml/components/DashboardTopSection.qml`)
- **Card 1 (Width 30%): Water Level (`TankVisualization.qml`)**
  - Left column:
    - Tank vessel (140 px width): Top pipe nozzle lid (36x12 px, cap 36x4 px, collar 24x9 px, border 1.5 px `#94A3B8`), cylindrical tank body (top radius 24 px, bottom radius 20 px, border 2 px `#94A3B8`).
    - Fluid wave animation: Dual animated sine waves driven by `wavePhase` (0 to $2\pi$ over 4s), gradient `#0284C7` to `#1D4ED8` (red `#EF4444` to `#B91C1C` if overflow), with 2px semi-transparent shimmering white crest stroke (`rgba(255,255,255,0.40)`).
    - Ruler scale column (42 px width): 21 tick marks (every 5%), major ticks every 25% with labels ("100%", "75%", "50%", "25%", "0%").
  - Right column:
    - Label: `"Current Level"` (14 px Medium `#64748B`).
    - Big Value: `fillPercentage.toFixed(2) + "%"` (48 px Bold `#1479E8`).
    - Sub-card 1: **Water Height** (Height 70 px, bg `#F8FAFC`, border `#E2E8F0`, radius 8 px): Ruler icon, `"Water Height"` label, value `waterHeightCm.toFixed(2) + " cm"` (18 px Bold), subtitle `"of " + tankHeightCm.toFixed(2) + " cm"`.
    - Sub-card 2: **Tank Volume** (Height 70 px, bg `#F8FAFC`, border `#E2E8F0`, radius 8 px): Vessel icon, `"Tank Volume"` label, value `waterVolumeLiters.toFixed(2) + " L"` (18 px Bold), subtitle `"of " + capacityLiters.toFixed(2) + " L"`.
    - Status Badge pill: `"Receiving Data"` (Green), `"Low Warning Alert"` (Amber), `"Low Critical Alert"` (Red), or `"OVERFLOW ALERT"`.
    - Footer text: `"Last Update: " + lastUpdated`.
  - Bottom Capacity Banner: Height 30 px, radius 6 px, bg `#EFF6FF`, border `#DBEAFE`. Left: `"Tank Height: " + tankHeightCm.toFixed(2) + " cm"` (12 px Bold `#1E40AF`). Right: `"Tank Capacity: " + capacityLiters.toFixed(2) + " L"` (12 px Bold `#1E40AF`).
- **Card 2 (Width 35%): Level Trend (`LevelTrendCard.qml`)**
  - Header: `"Level Trend (12 Hours)"` with ComboBox range selector ("12 Hours", "24 Hours", "7 Days").
  - Chart Body (`TrendChart.qml`): Fixed 0-100% Y-axis (48 px width left column with -90° rotated "Water Level (%)" label and 5 tick marks: 100%, 75%, 50%, 25%, 0%).
  - Curve: Smooth Bézier trend line (stroke `#1479E8`, 2.5 px width) with semi-transparent area fill (`rgba(20, 121, 232, 0.16)`).
  - Markers: Data point dots with white borders. Latest point features an active tooltip pill badge (e.g. `"74.50%"`) and outer ring dot.
  - X-Axis: 6 to 7 formatted time labels ("8:00 PM", etc.) directly aligned to chart coordinates with centered `"Time"` caption.
  - Card Footer: `"Last Update: " + lastUpdated`.
- **Card 3 (Width 35%): Tank Information (`TankInfoCard.qml`)**
  - Header: `"Tank Information"` (18 px DemiBold).
  - Rows with 1px dividers:
    - Tank Name
    - Device (Device UID or label)
    - Train / Coach (e.g. "12002 / B4")
    - Battery / Voltage (e.g. "12.60 V (12.45 V)")
    - GPS Location (e.g. "28.6139°, 77.2090°")
    - MQTT Status (Green if Connected)
    - Temperature (e.g. "25.00 °C")
    - Connection ("Connected")
    - Last Updated
    - Sensor Status ("Healthy")
    - Tank Height (cm)
    - Tank Capacity (L)

#### Section 2: Water Level Indicator Rank Bar (`RankIndicator.qml`)
- **Height**: 124 px
- **Card Title**: `"Water Level Indicator (Rank)"` (14 px Bold `#172033`).
- **Scale Row**: "0%", "25%", "50%", "75%", "100%" (11 px Medium `#64748B`).
- **Segmented Bar**: Height 26 px, 4 rounded colored segments:
  - `LOW` (0-25%): `#EF4444` (Red)
  - `MODERATE` (25-50%): `#F97316` (Orange)
  - `GOOD` (50-75%): `#EAB308` (Yellow)
  - `HIGH` (75-100%): `#22C55E` (Green)
- **Dynamic Pointer**: An animated upward-pointing triangle (width 14px, height 8px) with bold numerical readout (e.g. `"74.50%"`) tracking smoothly across the bar width.

#### Section 3: Summary Grid (`DashboardSummaryGrid.qml`)
- **Height**: 122 px
- **Layout**: 5 equal cards (2 columns when compact < 1200 px).
- **Cards**:
  1. *Water Level*: Drop icon in blue badge, value `74.50%`, subtitle `(37.25 cm / 50.00 cm)`.
  2. *Tank Volume*: Volume icon in blue badge, value `14.90 L`, subtitle `(of 20.00 L)`.
  3. *Status*: Activity pulse icon in green/amber/red badge, value `"Normal"`, subtitle `"(Normal Range)"`.
  4. *Temperature*: Thermometer icon in amber badge, value `25.00 °C`.
  5. *Last Updated*: Clock icon in blue badge, value formatted timestamp.

---

### 4.2 Water Tank Screen (`qml/pages/WaterTankPage.qml`)
- **Header**: `"Water Tank"` title, `"Real-time tank level and sensor monitoring"` subtitle. Right side: Device identifier badge (`"Device: 0026004D4B42501120353332"`), Connection State pill (`"Connected"`, Green dot), and `"Updated: <time>"`.
- **Alarm / Status Banner**: 52 px height banner with dynamic color (Green: Normal, Amber: Warning, Red: Critical / Overflow). Left status title (`"NORMAL OPERATION"`), descriptive message, and right-aligned `"Alarm Logic: ACTIVE"` pill.
- **Main Section (2 Columns)**:
  - Left: Large `TankVisualization` (height 460 px).
  - Right: `BaseCard` "Tank Geometry & Real-time Metrics" (height 460 px):
    - Row 1: Water Level (Percentage) & Current Water Height
    - Row 2: Current Liquid Volume & Total Tank Capacity
    - Row 3: Configured Max Height & Available Ullage / Space
    - Row 4: Capacity Quartile Rank & Sensor Connection Health
- **Environmental Sensors Grid (4 Tiles)**:
  - ATMOSPHERIC PRESSURE: `1013.2 hPa` (LIVE badge)
  - TEMPERATURE: `25.0 °C` (LIVE badge)
  - ADC PROCESSING: `0.5 cm Deadband` (FILTERED badge, Exponential Filter + LUT)
  - CLOUD / MODEM: `Connected` (EC200U badge, UploadTask: 90s)
- **Trend Graph**: Full-width `LevelTrendCard` (height 340 px).
- **Engineering Diagnostics & Firmware Calibration (EEPROM)**:
  - Accordion button: `"View Hardware Details ▼"` / `"Collapse Details ▲"`.
  - Column 1 (ADC Differential Pipeline): Raw Differential ADC, Exponential Filtered ADC, Air Baseline Offset, Calculated Net Offset, Raw Sensor Voltage.
  - Column 2 (Firmware Registers): Calibration Status, Interpolation LUT Range, Deadband Threshold, Configurable Height Range, Supported Field Protocols.

---

### 4.3 Devices Screen (`qml/pages/DevicesPage.qml`)
- **Header**: Title `"Devices"`, subtitle, and `"⟳ Refresh"` button.
- **Search & Filter Bar**:
  - Search input: `"Search devices by name, ID, or location..."`
  - Status dropdown: `All`, `Online`, `Offline`, `Warning`
  - Connection dropdown: `All`, `LTE`, `BLE`, `RS485`
  - Reset button
- **Overview Cards (4 Tiles)**: Total Devices, Online, Offline, Warnings.
- **Management Table**:
  - Header: `"Registered Water Monitoring Devices (N)"`
  - Columns: `DEVICE NAME / ID`, `STATUS`, `CONNECTION`, `WATER LEVEL`, `SENSOR HEALTH`, `FIRMWARE`, `LAST UPDATE`, `ACTION`
  - Level column includes a mini dual-tone progress bar.
  - Action button: `"View Details"`.
  - Zero-state when filter matches nothing with a "Reset All Filters" button.
- **Slide-in Detail Drawer**: 440 px slide-in drawer on the right showing comprehensive hardware telemetry for the selected device.

---

### 4.4 Alerts Screen (`qml/pages/AlertsPage.qml`)
- **Header**: Title `"Alerts"`, subtitle, right-side Alarm System status badge (`"Alarm System: ENABLED"`), `"Acknowledge All"` button, and `"Clear Resolved"` button.
- **Summary Cards (4 Tiles)**: `CRITICAL` (Red), `WARNING` (Amber), `ACTIVE ALARMS` (Blue), `RESOLVED` (Green).
- **System Status Strip**: Horizontal status card showing Current Water Level, Alert State, Sensor Health, and Last Telemetry Update.
- **Active Alerts List**:
  - Color-coded alert cards (Critical: red border/bg, Warning: amber border/bg).
  - Displays severity badge, timestamp, title, description, current level vs. threshold, acknowledgment status pill, and single-click `"Acknowledge"` button.
  - Zero-state green checkmark card when no active alarms exist.
- **Alert History Table**:
  - Columns: `TIME`, `ALERT TITLE`, `SEVERITY`, `MEASURED VALUE`, `THRESHOLD`, `STATUS`.

---

### 4.5 History Screen (`qml/pages/HistoryPage.qml`)
- **Header**: Title `"History"`, subtitle, cloud uplink pill, `"⟳ Refresh Trend"` button, and `"⤓ Download CSV"` button.
- **Time Range Bar**:
  - Interactive toggle buttons: `12 Hours`, `24 Hours`, `7 Days`.
  - Right date bounds display: `"From: <date> | To: <date>"`.
- **Primary Trend Graph**: Full-width `LevelTrendCard` (height 360 px).
- **Statistics Cards (4 Tiles)**:
  - `AVERAGE LEVEL` (%)
  - `MINIMUM LEVEL` (%)
  - `MAXIMUM LEVEL` (%)
  - `LEVEL CHANGE` (+/- %)
- **Historical Readings Table**:
  - Columns: `TIMESTAMP`, `WATER LEVEL`, `WATER HEIGHT`, `ESTIMATED VOLUME`, `STATUS`.
  - Formatted rows with status pills.

---

### 4.6 Settings Screen (`qml/pages/SettingsPage.qml`)
- **Width Constraint**: Centered column with maximum width of 920 px.
- **Header**: Title `"Settings"`, subtitle `"Configure the connection between the dashboard and your device."`.
- **Card 1 (Connection)**: API Host, API Token (with Show/Hide password toggle), Device API Label, Data Refresh Interval dropdown (1s, 5s, 10s, 30s, 60s).
- **Card 2 (Device Variables)**: Water Level label, Pressure label, Temperature label, Sensor Status label.
- **Card 3 & 4 (2 Columns)**:
  - Left: Connection Status Card (Pulsing status dot, last successful update, last error message).
  - Right: Latest Device Data Card (Live water level, pressure, temperature, sensor status).
- **Card 5 (Actions)**: `"Save Configuration"` (Primary blue), `"Test Connection"`, `"Restore Defaults"`, and status feedback alert box.

