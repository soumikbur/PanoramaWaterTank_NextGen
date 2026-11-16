# Comprehensive Diagnostic & Verification Report: Raw Data / Live MQTT Monitor

**Project:** Panorama Water Tank Monitor – NextGen  
**Target Environment:** Web (Desktop & Mobile Responsive) & Capacitor Android (Low-Resource AVD)  
**MQTT Broker:** `broker.hivemq.com:8884` (WSS) / `1883` (TCP)  
**Target Hardware Topic:** `002F00654B42501203203533332`  
**Date:** 2026-11-16  
**Status:** **VERIFIED & OPERATIONAL**

---

## 1. Executive Summary & Root Cause Analysis

### Identified Problem
In previous iterations:
1. The feature was labelled "Live MQTT Monitor" and mounted at `#/mqtt-monitor`, whereas standard SCADA and operator specifications expected a dedicated **Raw Data** page accessible directly via `#/raw-data`.
2. The user was checking the live deployed production site at `https://soumikbur.github.io/PanoramaWaterTank_NextGen/#/devices` (where changes had not yet been deployed).

### Solution Implemented
1. **Dedicated Navigation Item:** Added **Raw Data** directly underneath `Devices` and above `Location` in both the Desktop Sidebar and Mobile Navigation Drawer.
2. **Standard Route:** Mapped `#/raw-data` as the primary route (maintaining backward compatibility for `#/mqtt-monitor`).
3. **Dedicated Screen:** Implemented `RAW MQTT DATA MONITOR` matching the look and feel of industrial MQTT analyzers (MQTT Explorer / MQTT.fx).
4. **End-to-End Validation:** Fully tested and verified across both the ultra-low-resource Android Virtual Device (`Panorama_ULTRA_LOW_RESOURCE`, 1024 MB RAM, API 30) and Desktop Chrome at 1440×900.

---

## 2. Navigation & Routing Specification

### Sidebar Integration Order
The navigation structure strictly follows the required sequence:
1. **Dashboard** (`#/dashboard`)
2. **Train Management** (`#/trains`)
3. **All Tanks** (`#/watertank`)
4. **Devices** (`#/devices`)
5. **Raw Data** (`#/raw-data`) *(Admin exclusive)*
6. **Location** (`#/location`)
7. **Alerts** (`#/alerts`)
8. **History** (`#/history`)
9. **Reports** (`#/reports`)

### Access Control & Security
- **Admin Users:** Full visibility of the "Raw Data" menu item with active route indicator and complete access to all stream controls.
- **Operator / Employee Users:** Menu item is completely hidden from the sidebar. Direct deep-link navigation to `#/raw-data` triggers the industrial `AccessDeniedScreen` ("Access Restricted: Administrator privileges are required").

---

## 3. Real-Time MQTT Architecture & Capabilities

### Top Control Bar
- **Header:** `RAW MQTT DATA MONITOR` with terminal icon.
- **Connection Indicators:**
  - `● Broker Online`: Live status connected to `wss://broker.hivemq.com:8884/mqtt`.
  - `● LIVE STREAMING` / `PAUSED`: Real-time stream toggle indicator.
  - `((•)) broker.hivemq.com:8884`: Broker endpoint pill.
  - `Messages: X (Y KB)`: Live frame and throughput accumulator.
- **Controls:**
  - `Pause / Resume Stream`: Freezes DOM rendering without dropping broker subscriptions.
  - `Auto-Scroll ON/OFF`: Toggles automated pinning to latest frames.
  - `Clear Console`: Empties the circular buffer.
  - `Export JSON`: Downloads received messages as timestamped JSON dump.
  - `Buffer Capacity Selector`: Configurable bounded in-memory limit (100, 250, 500, 1000 messages) preventing OOM on resource-constrained devices.

### Searchable Device Selector
Allows filtering frames by:
- `ALL DEVICES` (Wildcard stream across all subscribed topics)
- Target Hardware Node: `002F00654B42501203203533332` (Shatabdi Coach C1 / WLI Node)
- All registered and auto-discovered SCADA nodes in the fleet registry.

### Industrial Terminal-Style Frame Viewer
Incoming frames strictly follow the requested industrial terminal format:
```text
[YYYY-MM-DD HH:mm:ss.SSS] MQTT MESSAGE RECEIVED

TOPIC:
002F00654B42501203203533332

PAYLOAD:
{
  "uid": "002F00654B42501203203533332",
  "lat": 22.556949,
  "long": 88.352447,
  "speed": 0.9,
  "time": "12:20:14",
  "cm1": 0.0,
  "cm2": 0.0,
  "wlp1": 0.0,
  "wlp2": 0.0,
  "wlv1": false,
  "wlv2": false,
  "bat": 97.1,
  "temp": 25.7,
  "chno": "pano123",
  "trno": "abcd123"
}
```

Features included:
- Syntax highlighting for JSON keys, numbers, booleans, and strings.
- Copy Payload, Copy Topic, and Copy Full Log Block buttons.
- Collapsible frame views with summary pills (Battery, Temp, Water Level, Coordinates).

---

## 4. Verification Evidence & Visual Test Results

All test evidence has been captured and verified:

| # | Screenshot Artifact | Platform | View / Verification Scope |
|---|---|---|---|
| 1 | [01_sidebar_raw_data_visible.png](file:///C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots/raw_data_monitor/01_sidebar_raw_data_visible.png) | Android AVD (720×1280) | Mobile drawer: `Raw Data` visible directly below `Devices` and above `Location` |
| 2 | [02_raw_data_screen.png](file:///C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots/raw_data_monitor/02_raw_data_screen.png) | Android AVD (720×1280) | `RAW MQTT DATA MONITOR` screen loaded with status pills & controls |
| 3 | [03_real_mqtt_message_captured.png](file:///C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots/raw_data_monitor/03_real_mqtt_message_captured.png) | Android AVD (720×1280) | Live frame reception from HiveMQ on topic `002F00654B42501203203533332` |
| 4 | [04_real_payload_expanded.png](file:///C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots/raw_data_monitor/04_real_payload_expanded.png) | Android AVD (720×1280) | Expanded syntax-highlighted JSON matching MQTT.fx hardware packet |
| 5 | [05_desktop_devices_sidebar.png](file:///C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots/raw_data_monitor/05_desktop_devices_sidebar.png) | Desktop Web (1440×900) | `Devices` page with left sidebar showing `Devices` → `Raw Data` → `Location` |
| 6 | [06_desktop_raw_data_screen.png](file:///C:/Users/User/.gemini/antigravity/brain/9e3514ab-7eb1-481b-ac5b-d7edda1def58/screenshots/raw_data_monitor/06_desktop_raw_data_screen.png) | Desktop Web (1440×900) | Full desktop `RAW MQTT DATA MONITOR` with terminal console & active stream |

---

## 5. Automated Verification Checklist

- [x] Dedicated navigation entry labelled **Raw Data** with Terminal icon.
- [x] Positioned directly underneath **Devices** and above **Location**.
- [x] Registered under route `#/raw-data` with hash-routing persistence across browser refreshes.
- [x] Highlighting active state when selected.
- [x] Role-based access control restricts screen to `ADMIN` users; hidden from `EMPLOYEE`.
- [x] Real MQTT broker connectivity to `broker.hivemq.com:8884`.
- [x] Subscribed to target hardware topic `002F00654B42501203203533332`.
- [x] Live frame formatting with millisecond timestamps and pretty-printed JSON.
- [x] Pause/Resume, Auto-Scroll toggle, Clear Console, and Export JSON working as specified.
- [x] Tested and verified on both Desktop Chrome and Android low-resource AVD.
