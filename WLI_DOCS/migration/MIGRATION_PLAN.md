# Migration Plan & Execution Strategy

**Project**: Panorama Water Tank NextGen Rebuild  
**Source Directory (Read-Only)**: `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank-Milestone2\PanoramaWaterTank`  
**Destination Directory (New Build)**: `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen`  
**Date**: October 30, 2026  

---

## 1. Migration Protocol & Principles

1. **Strict Read-Only Source**: The original project `PanoramaWaterTank-Milestone2/PanoramaWaterTank` must remain 100% untouched.
2. **Preservation of Existing NextGen Work**: The pre-existing files in `PanoramaWaterTank_NextGen` (`apps/mobile`, `backend`, `config`, `docs`, `installer`, `release`) are preserved and documented in the destination checkpoint inventory.
3. **Modular Architecture Implementation**:
   - Reorganize monolithic source files into modern layered modules: `app/`, `src/core/`, `src/networking/`, `src/telemetry/`, `src/domain/`, `src/services/`, `src/repository/`, `src/security/`, `src/configuration/`.
   - Implement `ApplicationController` to encapsulate lifecycle management, eliminate monolithic wiring in `main.cpp`, and eliminate teardown crashes.
   - Resolve known bugs identified during audit (Test 7 offline zeroing bug, QML RowLayout anchor warnings).
   - Carry over visual QML components and static assets (`resources/images/`).
4. **Complete Toolchain Verification**:
   - Configure CMakeLists.txt with C++20 and Qt 6.12.0 MinGW 64-bit (`Core`, `Quick`, `QuickControls2`, `Svg`, `Network`, `Sql`, `Mqtt`).
   - Build using Ninja.
   - Run automated unit test suite.
   - Verify QML visual parity against reference screenshots in `WLI_DOCS/screenshots/reference/`.

---

## 2. Migration Phases

- **Phase 1: Foundation & Build System**: Setup root `CMakeLists.txt`, `CMakePresets.json`, and `app/main.cpp` + `app/ApplicationController`.
- **Phase 2: Core & Utility Modules**: Port `VolumeCalculator`, `Logger`, `TimeManager`, `HistoryExporter`, `DisplayPerformanceManager`.
- **Phase 3: Domain & Security Modules**: Port `AuthManager`, `PermissionManager`, `TankModel`, `TrainManager`, `TrainConfigProvider`, `RailwayManager`.
- **Phase 4: Networking & Telemetry**: Port `ApiClient`, `ConnectionManager`, `MqttService`, `MqttConfig`.
- **Phase 5: Persistence & Services**: Port `DatabaseManager`, `TankRepository`, `LocationManager`, `SearchManager`, `ApplicationStateManager`, `SettingsManager`.
- **Phase 6: Visual QML Presentation & Assets**: Port and refine all QML components (`qml/App.qml`, `qml/pages/`, `qml/components/`, `qml/auth/`, `qml/theme/`, `qml/search/`) and copy image assets.
- **Phase 7: Test Suite & Verification**: Port and build unit tests (`test_csv_export`, `test_mqtt_service`, `test_esp32_rest`, `test_role_railway_architecture`, `test_location_and_tanks`).
- **Phase 8: Build, Test & Report**: Execute CMake configure, Ninja build, run tests, capture verification logs, and generate final reports.

