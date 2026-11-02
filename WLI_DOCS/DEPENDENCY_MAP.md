# Codebase Dependency Map & Coupling Analysis

**Tool**: Graphify Code Knowledge Graph Engine  
**Nodes**: 1585 | **Edges**: 2889 | **Communities**: 72  
**Date**: October 30, 2026  

---

## 1. Top Inbound and Outbound Component Dependencies

| Component | Inbound Dependencies (Callers/Consumers) | Outbound Dependencies (Services Used) | Degree |
| :--- | :--- | :--- | :--- |
| **`TankModel`** | `TankRepository`, `TrainManager`, `RailwayManager`, `ConnectionManager`, `DashboardPage.qml`, `TankVisualization.qml`, `LevelTrendCard.qml`, `AlertsPage.qml`, `HistoryPage.qml` | `VolumeCalculator`, `Logger`, `QTimer`, `QSettings` | 188 |
| **`SettingsManager`** | `main.cpp`, `ConnectionManager`, `MqttService`, `LocationManager`, `TankModel`, `SettingsPage.qml` | `QSettings`, `Logger` | 177 |
| **`MqttService`** | `main.cpp`, `SettingsPage.qml` | `QMqttClient`, `QMqttSubscription`, `MqttConfig`, `Logger` | 85 |
| **`ApiClient`** | `ConnectionManager`, `TankRepository`, `SettingsPage.qml` | `QNetworkAccessManager`, `QNetworkReply`, `QNetworkRequest`, `Logger` | 84 |
| **`LocationManager`** | `main.cpp`, `TrainManager`, `MapPage.qml` | `SettingsManager`, `TrainConfigProvider`, `Logger`, `QGeoCoordinate` | 84 |
| **`TrainManager`** | `main.cpp`, `LocationManager`, `AllTanksPage.qml`, `TrainViewPage.qml` | `DatabaseManager`, `TankModel`, `TrainConfigProvider`, `Logger` | 63 |
| **`RailwayManager`** | `main.cpp`, `SearchManager` | `DatabaseManager`, `TankModel`, `Logger` | 57 |
| **`DatabaseManager`** | `AuthManager`, `TrainManager`, `RailwayManager`, `SearchManager`, `TankRepository` | `QSqlDatabase`, `QSqlQuery`, `Logger` | 52 |
| **`AuthManager`** | `main.cpp`, `PermissionManager`, `RoleSelectionView.qml`, `AdminLoginView.qml`, `UserLoginView.qml` | `DatabaseManager`, `QCryptographicHash`, `Logger` | 44 |
| **`ApplicationStateManager`** | `main.cpp`, `App.qml` | `TrainConfigProvider`, `QSettings`, `Logger` | 44 |

---

## 2. Dependency Graph Hotspots & Coupling Risks

1. **Tight Coupling between `main.cpp` and QML Singletons**:
   - `main.cpp` manually queries the QML engine for `qmlTypeId("PanoramaWaterTank", 1, 0, "...")` and retrieves raw C++ pointers from QML.
   - When Qt Quick teardown runs upon application exit, QML singletons are deleted first, leaving dangling pointers if C++ background workers attempt to notify them during graceful shutdown.

2. **Circular Signals Between `SettingsManager` and `TankModel`**:
   - `SettingsManager` emits `tankShapeChanged`, `tankDimensionsChanged`, etc., which triggers `TankModel::updateTankConfiguration`.
   - In return, `TankModel` configuration updates write back to `SettingsManager`.
   - Without careful guard flags, signal reverberation occurs.

3. **`TankRepository` / `TankModel` Bifurcation**:
   - Telemetry from MQTT flows into `TankRepository::processEsp32Status`, but REST telemetry flows into `TankModel::applyAuthoritativeReading` directly.
   - Telemetry paths must be unified behind a clean `TelemetryService` / `TelemetryRepository`.

