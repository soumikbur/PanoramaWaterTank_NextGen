# Component Boundaries & Interface Contracts

**Project**: Panorama Water Tank NextGen Rebuild  
**Architecture**: Layered Modular C++20 / Qt 6.12  
**Date**: October 30, 2026  

---

## 1. Component Boundaries & Responsibilities

### 1.1 Application Layer (`app/`)
- **`ApplicationController`**:
  - Owns the lifespan of all backend singletons and services.
  - Initializes `Logger`, `DatabaseManager`, `SettingsManager`, `AuthManager`, `TrainManager`, `TankModel`, `LocationManager`, `MqttService`, `ApiClient`, and `ConnectionManager`.
  - Exposes QML context properties and registers QML types.
  - Coordinates graceful startup and safe teardown.
  - **Inbound**: Called by `main.cpp`.
  - **Outbound**: Manages all domain and infrastructure services.

### 1.2 Telemetry & Networking Layer (`src/telemetry/`, `src/networking/`)
- **`MqttService`**:
  - Handles authenticated TLS 1.2+ connection to Mosquitto/HiveMQ broker.
  - Subscribes to `panorama/telemetry/#`.
  - Emits `telemetryReceived(const QJsonObject&)` and `connectionStateChanged(MqttState)`.
- **`ApiClient`**:
  - Executes asynchronous HTTP requests via `QNetworkAccessManager`.
  - Queries direct ESP32 REST endpoints: `GET /api/status`, `GET /api/health`, `GET /api/history`, `POST /api/config`.
  - Emits `statusReceived(const QJsonObject&)` and `networkError(const QString&)`.
- **`ConnectionManager`**:
  - Orchestrates poll timer (default 5000 ms), timeout watchdog (default 4000 ms), and retry backoff.
  - Manages health check probes prior to state transition to `Connected`.

### 1.3 Domain & Calculation Layer (`src/domain/`, `src/core/`)
- **`VolumeCalculator`**:
  - Pure stateless mathematical library for cylindrical and rectangular volume and surface area.
- **`TankModel`**:
  - Authoritative representation of single tank state.
  - Validates readings against physical height and applies deadband hysteresis ($\pm 1.0\%$).
  - Derives 4-tier alarm level: `Normal`, `Warning` (<20%), `Critical` (<10%), `Overflow` ($\ge 100\%$), `SensorFault`, `Offline`.
  - Manages downsampled historical trend array (~100 points).
- **`TrainManager`**:
  - Manages 24-coach consist hierarchy (`01` through `24`).
  - Tracks coach-to-tank assignments and device registrations.
- **`LocationManager`**:
  - Ingests GPS NMEA coordinates (lat, lon, alt, speed).
  - Determines nearest refill station along railway route.
  - Calculates water consumption rate ($L/h$) and estimated hours of endurance.

### 1.4 Persistence & Security Layer (`src/repository/`, `src/security/`)
- **`DatabaseManager`**:
  - Executes SQL migrations and manages tables: `users`, `trains`, `coaches`, `tanks`, `telemetry_logs`, `stations`.
- **`AuthManager` & `PermissionManager`**:
  - Validates credentials against salted SHA-256 hashes.
  - Enforces RBAC permissions (Administrator vs Operator).
  - Limits maximum operators to 10.

