# Complete Codebase Inventory

**Project Source**: `PanoramaWaterTank-Milestone2/PanoramaWaterTank`  
**Total C++ Files**: 49 (Headers & Implementation)  
**Total QML Files**: 32 (Pages, Components, Auth, Theme)  
**Total Test Files**: 7  
**Build & Config**: CMakeLists.txt, .clang-format, .editorconfig  

---

## 1. C++ Backend Source Files (`src/`)

| File Path | Lines | Size (Bytes) | Module / Responsibility |
| :--- | :--- | :--- | :--- |
| `src/main.cpp` | 556 | 21,751 | Application entry point, QML engine startup, manual singleton resolution and signal wiring |
| `src/backend/AuthManager.h` | 92 | 2,981 | Authentication service header, login/logout, password hashing |
| `src/backend/AuthManager.cpp` | 248 | 8,375 | Salted SHA-256 implementation, user validation, SQLite synchronization |
| `src/backend/PermissionManager.h` | 74 | 2,186 | RBAC permission matrix definitions |
| `src/backend/PermissionManager.cpp` | 112 | 3,462 | Role-based permission evaluation (Admin vs Operator) |
| `src/backend/Types.h` | 65 | 1,748 | Shared enumerations (UserRole, AlertLevel, ConnectionState) |
| `src/calculations/VolumeCalculator.h` | 102 | 3,414 | Mathematical formulas for cylinder & rectangular tank geometry |
| `src/calculations/VolumeCalculator.cpp` | 134 | 4,308 | Volume, surface area, and height-to-liter mathematical conversions |
| `src/controllers/DashboardController.h` | 32 | 787 | Dashboard presenter interface |
| `src/controllers/DashboardController.cpp` | 12 | 165 | Presenter stub |
| `src/logging/Logger.h` | 118 | 4,373 | Thread-safe logging facility interface |
| `src/logging/Logger.cpp` | 196 | 6,990 | File and stderr logging, log rotation (14-day retention) |
| `src/models/LocationTypes.h` | 145 | 4,959 | GNSS data structures, RailwayStation, TrainLocation, WaterEndurance |
| `src/models/RailwayManager.h` | 168 | 6,439 | Railway route management, timetable, multi-train tracking |
| `src/models/RailwayManager.cpp` | 742 | 29,040 | Station database queries, route loading, distance calculations |
| `src/models/TankModel.h` | 332 | 16,502 | Central tank QObject, properties, alarm states, geometry |
| `src/models/TankModel.cpp` | 1,068 | 42,989 | Reading ingestion, alarm evaluation, history downsampling, transient spike rejection |
| `src/models/TrainConfigProvider.h` | 242 | 10,116 | Hardcoded railway reference data, stations, coach layouts |
| `src/models/TrainConfigProvider.cpp` | 1,650 | 90,284 | Seed data for Indian Railways routes, stations, coordinates |
| `src/models/TrainManager.h` | 158 | 5,721 | Consist management (24 coaches), coach tank mapping |
| `src/models/TrainManager.cpp` | 825 | 33,285 | Coach assignment, consist grid derivation, train summaries |
| `src/mqtt/MqttConfig.h` | 55 | 1,344 | MQTT broker configuration data structure |
| `src/mqtt/MqttConfig.cpp` | 10 | 123 | Default configuration constructor |
| `src/mqtt/MqttService.h` | 175 | 6,769 | QtMqtt client wrapper, SSL/TLS, reconnection logic |
| `src/mqtt/MqttService.cpp` | 612 | 23,720 | Subscription handling, EC200U telemetry JSON parsing |
| `src/network/ApiClient.h` | 164 | 5,909 | REST HTTP client interface for ESP32 and Ubidots |
| `src/network/ApiClient.cpp` | 1,350 | 53,901 | QNetworkAccessManager requests, retry policies, response parsing |
| `src/network/ConnectionManager.h` | 68 | 1,714 | Network polling coordinator |
| `src/network/ConnectionManager.cpp` | 184 | 6,304 | State machine (Connected, Disconnected, Reconnecting), poll timers |
| `src/network/UbidotsClient.h` | 12 | 75 | Obsolete header stub |
| `src/network/UbidotsClient.cpp` | 0 | 0 | Obsolete 0-byte stub |
| `src/repository/DatabaseManager.h` | 134 | 4,773 | SQLite repository interface |
| `src/repository/DatabaseManager.cpp` | 1,842 | 85,425 | SQL schema creation, migrations, CRUD for users/tanks/logs/stations |
| `src/repository/TankRepository.h` | 42 | 1,070 | Bridge between persistence and live TankModel |
| `src/repository/TankRepository.cpp` | 315 | 12,200 | Telemetry database logging, historical retrieval |
| `src/services/LocationManager.h` | 162 | 6,428 | GNSS tracking and water endurance computation service |
| `src/services/LocationManager.cpp` | 780 | 33,075 | Haversine formula, ETA calculation, refill recommendation |
| `src/services/SearchManager.h` | 84 | 2,836 | Global search coordinator |
| `src/services/SearchManager.cpp` | 310 | 12,341 | Fuzzy search across trains, coaches, stations, and tanks |
| `src/settings/SettingsManager.h` | 275 | 12,638 | QSettings manager interface |
| `src/settings/SettingsManager.cpp` | 620 | 25,959 | Configuration persistence, defaults, property change signals |
| `src/state/ApplicationStateManager.h` | 95 | 3,435 | Session state preservation interface |
| `src/state/ApplicationStateManager.cpp` | 195 | 7,472 | Restores active train, selected coach, view index on startup |
| `src/utilities/DisplayPerformanceManager.h` | 105 | 3,894 | High-DPI and screen refresh rate tracker |
| `src/utilities/DisplayPerformanceManager.cpp` | 162 | 6,159 | VSync synchronization, monitor switch detection |
| `src/utilities/HistoryExporter.h` | 55 | 1,776 | Historical telemetry CSV exporter interface |
| `src/utilities/HistoryExporter.cpp` | 280 | 11,991 | Downsampling to ~100 points, LTTB sorting, RFC 4180 CSV generation |
| `src/utilities/TimeManager.h` | 78 | 2,904 | System time and uptime formatting service |
| `src/utilities/TimeManager.cpp` | 74 | 2,433 | Timezone-aware date/time string generation |

---

## 2. QML User Interface Files (`qml/`)

| File Path | Size (Bytes) | Category | Purpose |
| :--- | :--- | :--- | :--- |
| `qml/App.qml` | 18,427 | Shell | Root ApplicationWindow, sidebar navigation, view stack, notification toast banner |
| `qml/auth/AdminLoginView.qml` | 9,666 | Auth | Administrator authentication dialog, password input, validation |
| `qml/auth/CapabilityItem.qml` | 1,164 | Auth | RBAC capability indicator item |
| `qml/auth/CapabilityStrip.qml` | 2,289 | Auth | Horizontal capability list |
| `qml/auth/FeatureTile.qml` | 1,941 | Auth | Role feature description card |
| `qml/auth/LandingHeader.qml` | 2,770 | Auth | Header for role selection screen |
| `qml/auth/RoleCard.qml` | 6,544 | Auth | Interactive role selection card (Admin vs Operator) |
| `qml/auth/RoleSelectionView.qml` | 11,947 | Auth | Initial landing screen for selecting role |
| `qml/auth/UserLoginView.qml` | 11,341 | Auth | Employee/Operator login screen |
| `qml/auth/VectorIcon.qml` | 5,042 | Auth | Vector icon helper component |
| `qml/components/AlertLevelIndicator.qml` | 11,481 | Component | Visual alarm status pill (Normal/Warning/Critical/Overflow/Offline) |
| `qml/components/BaseCard.qml` | 2,844 | Component | Fundamental surface card with 12px radius, 1px border, elevation shadow |
| `qml/components/ConnectionCard.qml` | 5,358 | Component | Communication status card |
| `qml/components/DashboardConnectionCard.qml` | 4,405 | Component | Mini connection badge for dashboard header |
| `qml/components/DashboardLayout.qml` | 2,053 | Component | Responsive grid layout for dashboard panels |
| `qml/components/DashboardStatus.qml` | 3,339 | Component | High-level status banner |
| `qml/components/DeviceCommissioningCard.qml` | 9,936 | Component | Commissioning UI to assign device label, MAC, and coach position |
| `qml/components/HeaderBar.qml` | 6,837 | Component | Top titlebar with train selector, connection status, clock, and user badge |
| `qml/components/LevelTrendCard.qml` | 17,984 | Component | Historical trend chart with 12h/24h/7d pills, Canvas curve, hover tooltip, CSV export |
| `qml/components/NavigationSidebar.qml` | 7,633 | Component | 8-item navigation sidebar with industrial active states |
| `qml/components/SensorsCard.qml` | 6,867 | Component | Dual sensor telemetry card (wlp1, wlp2, pressure, battery, temperature) |
| `qml/components/TankVisualization.qml` | 17,215 | Component | Industrial tank visualizer, fluid physics wave, ruler ticks, capacity ranking |
| `qml/components/WaterLevelIndicator.qml` | 4,404 | Component | Linear percentage gauge |
| `qml/pages/AlertsPage.qml` | 20,490 | Page | Active alarm log, acknowledgment workflow, historical incident table |
| `qml/pages/AllTanksPage.qml` | 16,846 | Page | Fleet-wide tank grid with filter pills (All, Online, Offline, Low Level) |
| `qml/pages/DashboardPage.qml` | 14,846 | Page | Main operational view: TankVisualization, SensorsCard, LevelTrendCard, Commissioning |
| `qml/pages/HistoryPage.qml` | 18,252 | Page | Full analytics view with data filters, downsampled graphs, and CSV download |
| `qml/pages/MapPage.qml` | 15,340 | Page | Route map view showing train position, speed, next station, refill advice |
| `qml/pages/SettingsPage.qml` | 25,689 | Page | System configuration: ESP32 REST, MQTT credentials, tank geometry, user management |
| `qml/pages/TrainViewPage.qml` | 19,450 | Page | 24-coach train consist view, coach cards, tank assignments |
| `qml/search/SearchPopup.qml` | 8,924 | Search | Global search dropdown overlay |
| `qml/theme/Colors.qml` | 3,695 | Theme | Master color palette (headerBackground, primary, water, status colors) |
| `qml/theme/Icons.qml` | 1,211 | Theme | Unicode and SVG icon glyph constants |
| `qml/theme/Metrics.qml` | 6,841 | Theme | Standard spacing, radii, font sizes, card heights |
| `qml/theme/Theme.qml` | 8,001 | Theme | Composite theme provider |
| `qml/theme/Typography.qml` | 4,694 | Theme | Inter font definitions, letter spacing, font weights |

---

## 3. Test Files (`tests/`)

| Test File | Size (Bytes) | Test Coverage |
| :--- | :--- | :--- |
| `tests/test_csv_export.cpp` | 7,491 | HistoryExporter downsampling, LTTB preservation, RFC 4180 CSV formatting |
| `tests/test_e2e_integration.cpp` | 13,147 | Full pipeline integration from network request to model update |
| `tests/test_esp32_rest.cpp` | 33,325 | ESP32 REST endpoints, spike rejection, transient retention, offline state |
| `tests/test_location_and_tanks.cpp` | 29,986 | Dynamic tank filtering, GNSS processing, water endurance decision engine |
| `tests/test_mqtt_service.cpp` | 14,875 | MQTT connection, topic filter, EC200U 12-field telemetry parsing, rapid stream |
| `tests/test_qml_loads.cpp` | 4,869 | Headless QML component compilation and loading validation |
| `tests/test_role_railway_architecture.cpp` | 35,946 | RBAC security, 24-coach consist grid, device assignment, 10-operator limit |

---

## 4. Visual & Static Assets (`resources/`)

- `resources/images/panorama_icon.png` (4,549 B): Window and taskbar icon.
- `resources/images/panorama_logo.png` (17,685 B): Industrial header branding logo.
- `resources/images/railway_hero.jpg` (877,674 B): Train visual asset used on landing screen.

