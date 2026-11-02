# UI Component Inventory & Structural Breakdown

**Scope**: Panorama Water Tank NextGen Rebuild  
**Framework**: Qt Quick 2 / QML with Qt Quick Controls 2  
**Date**: October 30, 2026  

---

## 1. Shell & Navigation Components

| Component | Source File | QML Base Type | Visual Characteristics & Capabilities |
| :--- | :--- | :--- | :--- |
| `App` | `qml/App.qml` | `ApplicationWindow` | 1280x800 default, 1024x600 minimum; dark header bar, left navigation sidebar, center dynamic stack view, overlay notifications |
| `HeaderBar` | `qml/components/HeaderBar.qml` | `Rectangle` | Height 56px, background `#171C28`, logo, active train selector dropdown, connection dot, live digital clock, user role indicator |
| `NavigationSidebar` | `qml/components/NavigationSidebar.qml` | `Rectangle` | Width 220px, surface `#FFFFFF`, 8 navigation destinations with icons, active highlight pill `#EFF6FF` with blue indicator stripe |
| `SearchPopup` | `qml/search/SearchPopup.qml` | `Popup` | Global search overlay querying trains, coaches, stations, and tanks with auto-complete |

---

## 2. Page Components

| Component | Source File | Primary Purpose |
| :--- | :--- | :--- |
| `DashboardPage` | `qml/pages/DashboardPage.qml` | Primary SCADA dashboard hosting TankVisualization, SensorsCard, LevelTrendCard, and Commissioning card |
| `AllTanksPage` | `qml/pages/AllTanksPage.qml` | Fleet-wide tank overview with 4 count pills (All, Online, Offline, Low Level) and dynamic search |
| `TrainViewPage` | `qml/pages/TrainViewPage.qml` | 24-coach train consist grid (`01` to `24`), assigned devices, real-time aggregate capacity |
| `AlertsPage` | `qml/pages/AlertsPage.qml` | Active and historical alarm list, acknowledgment buttons, alarm count badges |
| `HistoryPage` | `qml/pages/HistoryPage.qml` | Historical analytics, 12h/24h/7d range selectors, interactive trend curve, CSV export |
| `DevicesPage` | `qml/pages/DevicesPage.qml` / Settings | Device inventory table, primary indicator (`wli`), MAC address, RSSI, battery |
| `MapPage` | `qml/pages/MapPage.qml` | Route tracking, current GPS coordinates, speed, next refill station, water endurance advice |
| `SettingsPage` | `qml/pages/SettingsPage.qml` | Commissioning: REST endpoint, MQTT broker, TLS, tank dimensions, user account administration |

---

## 3. Reusable UI Widgets & Cards

| Component | Source File | Key Visual Features & Geometry |
| :--- | :--- | :--- |
| `BaseCard` | `qml/components/BaseCard.qml` | Surface `#FFFFFF`, 12px border radius, 1px border `#E2E8F0`, subtle shadow drop |
| `TankVisualization` | `qml/components/TankVisualization.qml` | Industrial tank SVG container, Canvas sine fluid wave animation, ruler tick marks (0 to 50 cm), 4-tier alarm badge, percentage hero |
| `LevelTrendCard` | `qml/components/LevelTrendCard.qml` | Canvas-drawn downsampled historical trend line (~100 pts), 12h/24h/7d filter pills, hover tooltip, CSV export trigger |
| `SensorsCard` | `qml/components/SensorsCard.qml` | Primary sensor (wlp1), auxiliary sensor (wlp2), pressure in mbar, battery voltage, temperature |
| `AlertLevelIndicator` | `qml/components/AlertLevelIndicator.qml` | Color-coded status badge (Normal `#10B981`, Warning `#F97316`, Critical `#EF4444`, Overflow `#DC2626`, Offline `#64748B`) |
| `WaterLevelIndicator` | `qml/components/WaterLevelIndicator.qml` | Linear gauge showing fill % with smooth spring animation |
| `DeviceCommissioningCard` | `qml/components/DeviceCommissioningCard.qml` | Text inputs for device label, coach ID, and save/commission button |

---

## 4. Authentication Views

| Component | Source File | Purpose |
| :--- | :--- | :--- |
| `RoleSelectionView` | `qml/auth/RoleSelectionView.qml` | Hero landing screen with railway background, Administrator vs Operator selection cards |
| `AdminLoginView` | `qml/auth/AdminLoginView.qml` | Password modal with salted SHA-256 verification and secure masked input |
| `UserLoginView` | `qml/auth/UserLoginView.qml` | Operator username & password login dialog |
| `RoleCard` | `qml/auth/RoleCard.qml` | Card with role icon, title, description, and capability checklist |

