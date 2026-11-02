# Known Issues & Technical Debt Registry

**Project**: Panorama Water Tank Monitor  
**Audit Source**: `PanoramaWaterTank-Milestone2/PanoramaWaterTank`  
**Date**: October 30, 2026  

---

## 1. Verified Bugs in Legacy Implementation

### Issue 1: Offline Tank Selection Stale Reading Retention (Test Failure)
- **Severity**: Medium
- **Location**: `src/models/TankModel.cpp` & `tests/test_location_and_tanks.cpp:330`
- **Symptom**: `Assertion failed: tankModel.waterHeightCm() == 0.0, line 330`
- **Root Cause**: When switching from an online tank with active telemetry to an offline unassigned tank, `applyOfflineState()` set `m_hasValidData = false` but preserved the previous online tank's `m_waterHeightCm`, failing the zero-reading check for uninitialized offline tanks.
- **Resolution in NextGen**: Explicitly zero `m_waterHeightCm`, `m_waterVolumeLiters`, and `m_fillPercentage` upon explicit transition to an unassigned/unconfigured offline tank while preserving transient retention for temporarily disconnected online devices.

### Issue 2: QML Layout Anchors Warning
- **Severity**: Low (Warning)
- **Location**: `qml/pages/AlertsPage.qml:444:17`
- **Symptom**: `QML RowLayout: Detected anchors on an item that is managed by a layout. This is undefined behavior; use Layout.alignment instead.`
- **Root Cause**: An item child of a `RowLayout` specified `anchors.verticalCenter: parent.verticalCenter` instead of `Layout.alignment: Qt.AlignVCenter`.
- **Resolution in NextGen**: Replace layout anchors with `Layout.alignment`.

### Issue 3: Monolithic `main.cpp` Lifecycle Teardown Race Condition
- **Severity**: High (Crash hazard on exit)
- **Location**: `src/main.cpp:78-95`
- **Symptom**: Potential segmentation fault during application exit when asynchronous network requests or MQTT heartbeats fire while `QQmlApplicationEngine` is being destroyed.
- **Root Cause**: QML singletons are owned by the QML engine, while network controllers are declared on the stack in `main.cpp`. C++ stack destruction order tears down the QML engine before stack variables, leaving dangling pointers.
- **Resolution in NextGen**: Introduce `ApplicationController` that explicitly owns all services and domain models in a centralized dependency injection hierarchy, stopping network pollers and disconnecting brokers in a strictly controlled shutdown sequence before engine destruction.

### Issue 4: Obsolete 0-Byte Stub `UbidotsClient.cpp`
- **Severity**: Low (Code bloat)
- **Location**: `src/network/UbidotsClient.cpp`
- **Root Cause**: Legacy cloud service was replaced by direct ESP32 REST and MQTT, leaving an empty file in CMake.
- **Resolution in NextGen**: Eliminate dead files and standardize on clean `ApiClient` and `MqttService`.

