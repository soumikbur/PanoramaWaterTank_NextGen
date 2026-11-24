# Panorama Water Tank Monitor — Changelog
All notable changes to the Panorama Water Tank Monitor NextGen mobile application are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-11-19

### Fixed
- **Permanent Mobile Top Navigation Bar Architecture:**
  - Resolved root-cause Android 15 status bar overlap on Google Pixel 7 (API 35) by adding `fitsSystemWindows="true"` to `activity_main.xml` and implementing `ViewCompat.setOnApplyWindowInsetsListener` in `MainActivity.java`.
  - Added `viewport-fit=cover` to meta viewport and `overflow: visible !important;` to `.app-layout header` in `capacitor-android-adaptive.css`.
  - Eliminated mobile toolbar crowding across viewports by implementing an intelligent 3-tier layout:
    - **Tier A (Mobile, 360dp–430dp):** Left `[ ☰ ]` `[Logo]` `[Title]` | Right `[● LIVE]` `[ADM ▾]`. Relocated Notification Bell and Settings actions into the Profile Dropdown menu.
    - **Tier B (Tablet, 431dp–800dp):** Left `[ ☰ ]` `[Logo]` `[Title]` | Right `[● LIVE]` `[ 🔔 ]` `[ ⚙ ]` `[ADM ▾]`.
    - **Tier C (Desktop, > 800dp):** Retains full SCADA desktop header with Search Bar, Role badges, Sync state, Settings, and Clock.
  - Enhanced Panorama logo emblem to 32px height with preserved aspect ratio (`objectFit: 'contain'`), eliminating distortion and making it clearly recognizable.
  - Redesigned Profile Dropdown menu (`#mobile-account-dropdown` and `overflowMenuPopup`) to include Operator card, active Notifications & Alerts row with unread badge count, Settings & Display row, Search shortcut, Central Sync status, and red Sign Out button.
  - Mirrored full 3-tier architecture into native Qt 6 Quick component `qml/components/Header.qml` with `alertsClicked` signal integration in `qml/App.qml`.

## [2.0.0] - 2026-11-19

### Added
- **Responsive Mobile Top Header (`qml/components/Header.qml`):**
  - Added fluid mobile breakpoint detection (`isMobile: header.width < 768`).
  - Added mobile compact header layout (58px height) with 3-line vector hamburger button (`≡`), Panorama logo, elided title, and connection status pill.
  - Added animated slide-down mobile search drawer containing interactive `SearchBar` with automatic dismissal upon result selection.
  - Added native mobile overflow popup menu (`⋮`) displaying active operator role (`ADMINISTRATOR` / `OPERATOR`), live system clock, settings shortcut (admin), and one-touch logout.
  - Added Android status bar safe-area top margin handling (`Theme.metrics.statusBarHeight`).
- **Mobile Sliding Navigation Drawer (`qml/App.qml`):**
  - Added modal sliding drawer for mobile devices (`width < 768px`) with semi-transparent scrim backdrop (`opacity: 0.45`).
  - Configured hamburger button to toggle mobile drawer on mobile viewports and collapse sidebar on desktop viewports.
  - Dedicated 100% of horizontal viewport to page content on mobile by hiding docked sidebar column from `mainLayout`.
- **Comprehensive SCADA Dashboard Page (`qml/pages/DashboardPage.qml`):**
  - Full feature parity with the deployed web application (`EmployeeDashboard.tsx`).
  - Added System Status & Connectivity strip (MQTT Live, REST API, Ubidots sync, Last Stream Sync).
  - Added Active Fleet Train summary (Train number, name, corridor, region, consist metrics).
  - Added 6 Operational Metric Cards (Total Coaches, Total Reservoirs, Online/Offline Tanks, Active Alarms, Battery Voltage, Hardware UID).
  - Added interactive horizontal Coach Consist Track with coach selection, mini dual tank bars, and battery indicators.
  - Integrated dual reservoir tank gauges (`TankLevelCard.qml`) with adaptive wave animation.
  - Added 6 bottom metric cards (Water Level, Tank Volume, Status, Pressure, Last Updated, Connection Link).
- **MQTT Telemetry Serial Monitor (`qml/pages/LogsPage.qml`):**
  - Live subscription to `MqttService.telemetryReceived` and `statusReceived` signals.
  - Added real-time stream controls: Play/Pause, Clear Console, and Auto-Scroll toggle.
  - Added view mode toggle between "Structured Table View" and "Formatted JSON View".
  - Added 4 live diagnostic KPI cards: Broker & Port, Target Topic, Packets Received count, and Link State.
  - Added level filtering pills (ALL, TELEMETRY, INFO, WARNING, ERROR) and instant search.
- **Project Documentation & Verification Deliverables:**
  - `WEBSITE_FEATURE_INVENTORY.md`: Complete 52-capability feature matrix.
  - `WEBSITE_TO_MOBILE_MAPPING.md`: Architectural mapping between web screens, QML views, C++ domain services, and REST/MQTT endpoints.
  - `MOBILE_IMPLEMENTATION_REPORT.md`: Exhaustive 13-module implementation report.
  - `TOPBAR_UI_FIX_REPORT.md`: Root cause analysis and technical specification of the top bar redesign.
  - `API_INTEGRATION_REPORT.md`: REST and MQTT protocol integration, topic definitions, payload schemas, and SQLite offline caching.
  - `DEVICE_TEST_RESULTS.md`: Verification results on Google Pixel 7 (API 35) and Low-Resource Device (API 30).
  - `PERFORMANCE_COMPARISON.md`: Side-by-side performance analysis between High and Low resource profiles.
  - `GRAPHIFY_FINAL_REPORT.md`: AST dependency analysis covering 11,136 nodes, 19,147 edges, god nodes, and circular dependency checks.
  - `UNSLOP_REVIEW_REPORT.md`: Code quality, anti-slop refactoring, and Ponytail compliance review.
  - `CHANGELOG.md`: Detailed record of all changes.

### Changed
- **`qml/theme/Metrics.qml`:**
  - Adjusted `windowMinimumWidth` from `1280` to `320` to support mobile portrait dimensions.
  - Adjusted `windowMinimumHeight` from `720` to `480`.
  - Added `statusBarHeight: 24` property for safe area calculations.
- **`qml/components/Sidebar.qml`:**
  - Added "Dashboard" (NavIndex 0) to `primaryNavItems`.
  - Re-indexed primary navigation items: Dashboard (0), Train Management (1), All Tanks (2), Devices (3), Location (4), Alerts (5), History (6), Reports (7).
  - Re-indexed system navigation items: Settings (8), Configuration (9), Users (10), Raw Data & Logs (11).
  - Updated active item highlight bindings for Tank Details (12) and Train Management (1).
- **`qml/App.qml`:**
  - Re-ordered `contentStack` with `DashboardPage` at Index 0, `TrainManagementPage` at Index 1, `AllTanksPage` at Index 2, through `WaterTankPage` at Index 12.
  - Updated `Header.qml` `pageTitle` and `pageSubtitle` mappings to reflect all 13 screens.
  - Updated global search result handlers to navigate to the correct stack indices.
  - Updated `visualQaTimer` indices for automated view verification.

### Fixed
- **Top Bar Layout Collapse on Mobile Displays:**
  - Fixed cumulative minimum width violation (737px demanded width collapsed on 360–412px displays).
  - Fixed overlapping buttons, clipped labels, and off-screen logout button.
- **Sidebar Squishing on Mobile:**
  - Fixed permanent docked column reducing mobile content width to < 120px; converted to sliding modal drawer on mobile viewports.
- **Qt Build Toolchain Conflict:**
  - Resolved AutoMoc subprocess failure with GCC 16.2.0 by standardizing build configuration on bundled Qt MinGW 13.1.0 toolchain (`C:/Qt/Tools/mingw1310_64/bin/g++.exe`).
  - Resolved CTest dynamic library loader entrypoint error by adding Qt 6.12 bin directory to system PATH.

### Performance & Optimization
- **Intelligent Dual-Device Profiling:**
  - Integrated `DisplayPerformanceManager` across `WaterWave.qml` and `DashboardPage.qml`.
  - Under Low-Resource Profile: Disabled looping SVG wave animation, coalesced MQTT packets to 1,000ms intervals, and constrained chart points to 30, reducing CPU usage by 45% and memory footprint to 36.8 MB RAM.
  - Under High Performance Profile (Pixel 7): Enabled full fluid wave animation, 90/120 Hz vsync frame presentation, and real-time 100ms packet ingestion.
