# Panorama Water Tank Monitor — Legacy Feature Inventory

This document provides a comprehensive technical inventory of all features, workflows, business logic, calculations, data models, communication protocols, and hardware interactions present in the legacy Qt/QML implementation (`PanoramaWaterTank-Milestone2`). This serves as the authoritative baseline for the NextGen migration.

---

## 1. System Overview & Domain Context

The **Panorama Water Tank Monitor** is an industrial IoT remote telemetry and supervisory control (SCADA/HMI) platform engineered for railway coach passenger water management. The system monitors dual water tanks per coach, tracks railway operational identifiers (train number, coach number), evaluates real-time fluid capacity, detects leakages and overflows, calculates GPS vehicle dynamics, and manages critical low-water alerts for passengers and maintenance depots.

---

## 2. Core Functional Modules & Feature Inventory

### 2.1 Dashboard & Overview Module
- **Primary Source Files**: 
  - `qml/pages/WaterTankPage.qml`
  - `qml/components/DashboardLayout.qml`
  - `qml/components/DashboardTopSection.qml`
  - `qml/components/DashboardStatus.qml`
  - `qml/components/DashboardSummaryGrid.qml`
  - `qml/components/RankIndicator.qml`
- **Features**:
  - **Live Tank Capacity Bar**: Displays overall capacity status using a 4-tier colored rank bar:
    - Low (0–25%): `#E53935` (Crimson)
    - Moderate (25–50%): `#FB8C00` (Orange)
    - Good (50–75%): `#FDD835` (Amber/Yellow)
    - High (75–100%): `#43A047` (Forest Green)
    - Dynamic triangular pointer indicator tracking the exact floating-point fill percentage.
  - **KPI Summary Grid (5 Cards)**:
    1. *Water Level*: Primary percentage (%) with trend icon and color coding.
    2. *Water Volume*: Liters (L) formatted to 1 decimal place.
    3. *Water Height*: Centimeters (cm) formatted to 1 decimal place.
    4. *Battery / Bus Voltage*: Volts (V) formatted to 2 decimal places.
    5. *System Status*: Operational health state (Normal, Warning, Critical, Offline).
  - **Operational Metadata Header**:
    - Train Number (`trno`, e.g., "12002")
    - Coach Number (`chno`, e.g., "B4")
    - Device UID (`uid`, e.g., "0026004D4B42501120353332")
    - Connectivity Badge: Real-time MQTT/API connection status (Connected, Disconnected, Reconnecting).
    - Last Update Timestamp: Formatted UTC/Local time with relative freshness counter.

### 2.2 Tank Visualization Module
- **Primary Source Files**:
  - `qml/components/TankVisualization.qml`
  - `src/calculations/VolumeCalculator.h`
  - `src/calculations/VolumeCalculator.cpp`
- **Features**:
  - **Cylindrical Vessel Graphic**: Scalable visual tank representation with realistic industrial vessel proportions.
  - **Dynamic Fluid Animation**: Smooth dual-sine wave fluid surface oscillation simulating fluid dynamics.
  - **Dual Calibration Scale**:
    - Left side: 0% to 100% fill height scale with 10% graduation ticks and labels.
    - Right side: Dynamic height graduation in centimeters (0 to 50.0 cm).
  - **Floating Metrics Overlays**:
    - Large center percentage readout with drop-shadow legibility.
    - Water Height Subcard (`cm`).
    - Tank Volume Subcard (`L`).
    - Capacity Banner at the bottom (`Total Capacity: 20.0 L`).
  - **Fluid Color States**:
    - Normal/Good: Industrial Blue gradient (`#0288D1` to `#01579B`).
    - Warning: Amber gradient (`#FFA000` to `#E65100`).
    - Critical: Red gradient (`#E53935` to `#B71C1C`).
    - Overflow: High-visibility Pulsing Violet/Red (`#8E24AA` / `#D32F2F`).

### 2.3 Volume & Fluid Mathematical Model
- **Primary Source Files**:
  - `src/calculations/VolumeCalculator.h`
  - `src/calculations/VolumeCalculator.cpp`
- **Mathematical Formats**:
  - Standard Cylindrical Tank Geometry:
    $$\text{Cross-Sectional Area } A = \pi \cdot r^2 = 0.04 \text{ m}^2$$
    $$\text{Calculated Radius } r = \sqrt{\frac{A}{\pi}} \approx 0.1128379 \text{ m} \quad (11.28 \text{ cm})$$
    $$\text{Max Physical Height } H_{\max} = \frac{V_{\max}}{A \cdot 1000} = \frac{20.0 \text{ L}}{0.04 \cdot 1000} = 0.50 \text{ m} \quad (50.0 \text{ cm})$$
  - Real-Time Formulas:
    $$\text{Current Height } h(t) = H_{\max} \cdot \left(\frac{\text{Level}\%(t)}{100}\right)$$
    $$\text{Current Volume } V(t) = A \cdot h(t) \cdot 1000 \quad \text{[Liters]}$$
    $$\text{Fill Percentage } = \left(\frac{V(t)}{V_{\max}}\right) \cdot 100$$
  - **Overflow Preservation**:
    - While the UI visual bar clamps to 100% for vessel bounds, the raw calculated level percentage is unconstrained ($\ge 100.0\%$) to drive the Overflow Alarm engine.

### 2.4 Multi-Device & Fleet Management Module
- **Primary Source Files**:
  - `qml/pages/DevicesPage.qml`
  - `src/models/TankModel.h`
  - `src/models/TankModel.cpp`
- **Features**:
  - **Device List / Table**: Displays all monitored coach units with columns:
    - Status Indicator (Online/Offline)
    - Device UID
    - Coach Number (`chno`)
    - Train Number (`trno`)
    - Primary Tank Level (`wlp1`)
    - Secondary Tank Level (`wlp2`)
    - GPS Coordinates & Speed
    - Last Seen Time
  - **Search & Filtering**: Search by Coach ID, Train Number, or Device UID; filter by Alarm State (All, Warning, Critical, Offline).
  - **Device Diagnostics Drawer**: Slide-over panel inspecting raw ADC values, battery voltages ($v_1, v_2$), signal strength (CSQ), firmware version, and MQTT keepalive heartbeat.
  - *Legacy Defect Identified*: Legacy Qt app hardcoded secondary devices in QML mock objects. The NextGen system eliminates all mocks, making PostgreSQL the authoritative multi-tenant/multi-device store.

### 2.5 Alert & Alarm Engine
- **Primary Source Files**:
  - `qml/pages/AlertsPage.qml`
  - `src/backend/Types.h`
  - `src/repository/TankRepository.cpp`
- **Alarm Categories & Thresholds**:
  1. **Critical Low**: Level $< 10.0\%$ ($< 5.0\text{ cm}$). Visual badge: Crimson (`#E53935`), urgent flashing indicator.
  2. **Warning Low**: $10.0\% \le \text{Level} < 20.0\%$ ($5.0\text{ cm} \le h < 10.0\text{ cm}$). Visual badge: Amber (`#FB8C00`).
  3. **Normal Level**: $20.0\% \le \text{Level} < 100.0\%$. Visual badge: Green (`#43A047`).
  4. **Overflow**: Level $\ge 100.0\%$ ($\ge 50.0\text{ cm}$). Visual badge: Violet/Red.
  5. **Sensor Fault**: ADC raw $< 100$ or $> 32767$, voltage $< 0.25\text{ V}$, or 5 consecutive validation failures ($wlvl = \text{false}$).
- **Alarm Actions**:
  - Acknowledgement workflow: User acknowledges active alarm with timestamp and user tag.
  - Alarm history log: Tracks state transitions (TRIGGERED $\rightarrow$ ACKNOWLEDGED $\rightarrow$ RESOLVED).

### 2.6 Historical Trends & Data Export Module
- **Primary Source Files**:
  - `qml/pages/HistoryPage.qml`
  - `qml/components/LevelTrendCard.qml`
  - `src/utilities/HistoryExporter.h`
  - `src/utilities/HistoryExporter.cpp`
- **Features**:
  - **Time Range Selectors**: 12 Hours, 24 Hours, 7 Days.
  - **LTTB Downsampling**:
    - Employs the Largest-Triangle-Three-Buckets downsampling algorithm to reduce thousands of raw data points to a performant ~100-point curve for chart rendering while preserving peak and valley extrema.
  - **Aggregated Statistics**:
    - Average Fill Level (%)
    - Minimum Level Observed (%)
    - Maximum Level Observed (%)
    - Net Level Change ($\Delta\%$) over selected duration
  - **CSV Data Export**:
    - Generates downloadable CSV with columns: `Timestamp`, `Train`, `Coach`, `Device_UID`, `Level_Percent`, `Volume_Liters`, `Height_cm`, `Battery_V1`, `Status`.

### 2.7 Configuration & Settings Module
- **Primary Source Files**:
  - `qml/pages/SettingsPage.qml`
  - `src/settings/SettingsManager.h`
  - `src/settings/SettingsManager.cpp`
- **Settings Categories**:
  - **Connection Settings**: MQTT Broker Host, Port, Client ID, Username, Password, Use TLS (v1.2+).
  - **Tank Physical Dimensions**: Tank Type (Cylindrical / Rectangular), Cross-Sectional Area ($m^2$), Max Capacity ($L$), Height ($cm$).
  - **Alarm Thresholds**: Warning Low Threshold (%), Critical Low Threshold (%), Overflow Threshold (%).
  - **Telemetry Intervals**: Polling frequency, Telemetry publish rate, Inactivity timeout.
  - **Diagnostics & Test**: "Test Connection" button with live status ping.

---

## 3. Communication & Telemetry Specification

### 3.1 Legacy Telemetry Schema
Parsed by `src/mqtt/TelemetryParser.cpp`:
```json
{
  "uid": "0026004D4B42501120353332",
  "trno": "12002",
  "chno": "B4",
  "wlp1": 76.5,
  "wlp2": 74.8,
  "wlvl": true,
  "wlv2": true,
  "lat": 28.6139,
  "long": 77.2090,
  "alt": 216.5,
  "speed": 64.2,
  "sats": 8,
  "v1": 12.65,
  "v2": 12.58,
  "dt": "2026-10-28T12:00:00Z"
}
```

### 3.2 Field Definition Table
| Field Name | Type | Description | Unit / Range |
| :--- | :--- | :--- | :--- |
| `uid` / `deviceId` | String | Unique hardware identity (IMEI / MAC) | Hex string (e.g. 24 chars) |
| `trno` | String | Railway Train Number | e.g., "12002" |
| `chno` | String | Coach Identifier | e.g., "B4", "A1", "S3" |
| `wlp1` | Float | Primary Tank Water Level Percentage | 0.0 to 105.0% |
| `wlp2` | Float | Secondary Tank Water Level Percentage | 0.0 to 105.0% |
| `wlvl` | Boolean| Primary Sensor Validity Flag | true = valid, false = fault |
| `wlv2` | Boolean| Secondary Sensor Validity Flag | true = valid, false = fault |
| `lat` | Float | GPS Latitude | -90.0 to +90.0 |
| `long` / `lon`| Float | GPS Longitude | -180.0 to +180.0 |
| `alt` | Float | Altitude above sea level | Meters |
| `speed` | Float | Train Ground Speed | km/h |
| `sats` | Integer| Number of locked GPS Satellites | 0 to 32 |
| `v1` | Float | Primary Battery / Supply Voltage | 0.0 to 36.0 V |
| `v2` | Float | Auxiliary Sensor Voltage | 0.0 to 36.0 V |
| `dt` / `time` | String | ISO 8601 UTC Timestamp | Timestamp |

---

## 4. Hardware Architecture & Firmware Reference

From `PanoramaWaterTank-Milestone2/Hardware/WaterLevelMonitor`:
- **Microcontroller**: Espressif ESP32-S3 (Dual-core 240MHz, FreeRTOS).
- **Cellular Modem**: Quectel EC200U LTE Cat 1 module.
  - Pinout: `RX=7`, `TX=8`, `PWRKEY=10`, `STATUS=2`.
  - Protocol: Standard AT command set (`AT+QMTOPEN`, `AT+QMTCONN`, `AT+QMTPUB`).
- **Analog-to-Digital Converter**: ADS1115 (16-bit Delta-Sigma ADC at I2C address `0x48`).
- **Sensor Calibration Formula**:
  $$\text{Zero Voltage} = 0.3901 \text{ V}$$
  $$\text{Scale Factor} = 0.0028643 \text{ V/cm} \quad (22.9143 \text{ ADC counts/cm})$$
  $$\text{Deadband} = 0.5 \text{ cm}$$
- **Communication Buses**:
  - RS-485 Modbus RTU (`RX=16`, `TX=17`, `DE=4`)
  - I2C Sensor Bus (`SDA=21`, `SCL=22`)
- **Indicators**: Piezo Buzzer (`GPIO 21`), WS2812 RGB LED (`GPIO 39`).

---

## 5. Migration Strategy & Replacement Plan

| Legacy Element | Legacy Implementation | NextGen Implementation | Reason for Change |
| :--- | :--- | :--- | :--- |
| **Framework** | Qt 6.8 / C++20 / QML | React Native + TypeScript / Python FastAPI | Cross-platform web/mobile/desktop, modern web ecosystem, zero C++ compile barriers |
| **Cloud / Telemetry** | Ubidots REST API + HiveMQ Public | Authenticated Mosquitto MQTT TLS 1.2+ & FastAPI WebSockets | Total independence from proprietary cloud; zero telemetry fees; enterprise control |
| **Database** | None (in-memory SQLite / QSettings) | PostgreSQL 16 + Async SQLAlchemy 2.x + Alembic | Enterprise persistence, audit logs, scalable multi-tenant telemetry |
| **Charts** | QML Canvas custom draw | SVG / React Native Chart Kit with LTTB Downsampling | High frame rate, GPU acceleration, touch gestures |
| **Mock Devices** | Hardcoded in `DevicesPage.qml` | Normalized database records in PostgreSQL | Production multi-device fleet support without fake data |

