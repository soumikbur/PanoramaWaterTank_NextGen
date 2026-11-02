# MQTT Validation & Browser Verification Test Report

**Project:** Panorama Water Tank NextGen (Railway SCADA/HMI)  
**Workspace:** `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen`  
**Execution Date:** October 31, 2026  
**Test Harness:** Automated Python MQTT Validation Suite (`scripts/run_mqtt_validation.py`) + Electron Headless Chromium Audit (`apps/mobile/test_browser.cjs`)  
**Target URL:** `http://127.0.0.1:3001`  
**Backend API:** `http://127.0.0.1:8000`  
**Overall Result:** **ALL 5 PROTOCOL TESTS PASSED — 11 OF 11 SCREENS VERIFIED**

---

## 1. Protocol Test Execution Matrix (Tests A – E)

| Test ID | Test Scenario | Execution Description | Expected Behavior | Actual Observed Result | Verdict |
|---|---|---|---|---|---|
| **Test A** | **MQTT Disconnected** | Backend WebSocket disconnected / broker unreachable. | Header displays `OFFLINE` status pill in red. Operational views display empty states without fabricated metrics. | Header badge transitioned to `OFFLINE` (`#DC2626`). Reconnection loop engaged with `RECONNECT` without UI crashes. | **PASS** |
| **Test B** | **MQTT Connected, No Telemetry Received** | Clean database state, MQTT client connected to `broker.hivemq.com:1883`, 0 messages received. | All sensor values display `N/A`, status shows `Awaiting Telemetry`, GPS shows clean empty overlay banner, charts empty. | `tanks/live` returned `levelPercent: null`, `hasTelemetry: false`, `alarmStatus: "AWAITING_TELEMETRY"`. GPS rendered required overlay text. | **PASS** |
| **Test C** | **Valid MQTT Telemetry Received** | Published valid packet to `panorama/telemetry/0026004D4B42501120353332` with level `74.5%`, GPS `(27.1751, 78.0421)`, `sats=10`, `v1=12.8V`. | Only reported fields update. Calculated volume = `14.9 L`, height = `37.25 cm`, rank = `GOOD`. Map updates marker. | Telemetry ingested, committed to SQLite, broadcast over WebSocket. `levelPercent=74.5%`, `volumeLiters=14.9L`, GPS marker rendered at Agra coords. | **PASS** |
| **Test D** | **Malformed MQTT Message Handling** | 1. Injected unparseable string (`MALFORMED_NON_JSON_DATA_###`).<br>2. Injected out-of-range latitude (`lat: 999.0`). | Application handles error safely, drops message, logs validation warning, preserves previous valid data. | FastAPI server remained healthy and responsive. Pydantic raised `ValidationError`. Previous reading `74.5%` retained without zero-replacement. | **PASS** |
| **Test E** | **Stale Telemetry Transition** | Inactivity period > 30 seconds with no incoming MQTT telemetry. | Status switches to `STALE_DATA`. UI displays amber `Stale Data` badge. Offline duration tracked. | At $t = 31\,\text{s}$, `isStale` transitioned to `True`, `alarmStatus` switched to `STALE_DATA`. UI badge updated. | **PASS** |

---

## 2. Screen-by-Screen Browser Verification (11 Screens Audited)

All 11 screens were audited in the real browser environment at `http://127.0.0.1:3001` using automated Electron navigation. Screenshots were captured for each screen during Test B (Awaiting Telemetry) and Test C (Live Telemetry).

| # | Screen Name | Route / Screen ID | Test B Verified State (Awaiting Telemetry) | Test C Verified State (Live Telemetry) | Screenshot Artifact |
|---|---|---|---|---|---|
| 1 | **Dashboard** | `dashboard` | Level: `N/A`, Volume: `N/A`, Gauge: `Awaiting Telemetry`, Chart: Empty | Level: `74.5%`, Volume: `14.9 L`, Rank: `GOOD`, Trend line active | `audit_test_b_dashboard.png`<br>`audit_test_c_dashboard.png` |
| 2 | **Train Management** | `trains` | Fleet: Train 12002, Coaches: 1, Tanks: 2, Online: 0, Offline: 1 | Train 12002, Coaches: 1, Tanks: 2, Online: 1, Offline: 0 | `audit_test_b_trains.png`<br>`audit_test_c_trains.png` |
| 3 | **All Tanks** | `watertank` | Primary Level: `N/A`, Height: `N/A`, Volume: `N/A`, Status: `Awaiting Telemetry` | Level: `74.5%`, Height: `37.3 cm`, Volume: `14.9 L`, Status: `GOOD` | `audit_test_b_watertank.png`<br>`audit_test_c_watertank.png` |
| 4 | **Devices Fleet** | `devices` | Device `0026004D4B42501120353332` listed as `OFFLINE`, levels `N/A` | Device `0026004D4B42501120353332` listed as `ONLINE`, level `74.5%` | `audit_test_b_devices.png`<br>`audit_test_c_devices.png` |
| 5 | **Location & GPS** | `location` | GNSS Cards: `N/A`, Map Overlay Banner:<br>*"GPS data unavailable / Waiting for valid location telemetry from MQTT."* | Lat: `27.1751° N`, Lon: `78.0421° E`, Speed: `65.5 km/h`, Sats: `10`, Marker plotted | `audit_test_b_location.png`<br>`audit_test_c_location.png` |
| 6 | **Alerts & Alarms** | `alerts` | Active Alerts: `0`, Water Level: `N/A — Awaiting Telemetry`, State: `AWAITING_TELEMETRY` | Active Alerts: `0`, Water Level: `74.5%`, State: `NORMAL` | `audit_test_b_alerts.png`<br>`audit_test_c_alerts.png` |
| 7 | **History Logs** | `history` | Empty state: *"No historical water level telemetry recorded yet. Awaiting live MQTT telemetry..."* | 1 genuine point recorded at `74.5%`, table populated with exact packet timestamp | `audit_test_b_history.png`<br>`audit_test_c_history.png` |
| 8 | **Operational Reports** | `reports` | Table empty: *"No telemetry records in selected interval"*, Consumption: `0.0 L` | Interval telemetry stats updated from genuine records | `audit_test_b_reports.png`<br>`audit_test_c_reports.png` |
| 9 | **System Settings** | `settings` | Shows real broker `broker.hivemq.com:1883`, real geometry (20L, 50cm, 0.04m²) | Geometry saved and verified | `audit_test_b_settings.png`<br>`audit_test_c_settings.png` |
| 10 | **User Management** | `users` | Authenticated Administrator (`admin`) role | Security and RBAC verified | `audit_test_b_users.png`<br>`audit_test_c_users.png` |
| 11 | **System Logs** | `logs` | Event stream connected to live WebSocket | Real-time payload log frames displayed | `audit_test_b_logs.png`<br>`audit_test_c_logs.png` |

---

## 3. Required GPS Empty State Verification

The application was explicitly audited to verify the exact required empty-state banner when no GPS fix exists:

```text
GPS data unavailable
Waiting for valid location telemetry from MQTT.
```

### Verification Result
- When `has_gps == false` or `latitude == null`, `LocationScreen.tsx` hides the marker and displays a centered semi-transparent overlay banner containing this exact text string.
- In Test B, the overlay was successfully captured and verified in `audit_test_b_location.png`.
- In Test C, upon receiving valid coordinates `(27.1751, 78.0421)`, the overlay dismissed automatically, and the train marker rendered on the Leaflet map.

---

## 4. Acceptance Criteria Verification Checklist

| # | Acceptance Criterion | Implementation Evidence | Verdict |
|---|---|---|---|
| 1 | No fabricated operational telemetry appears anywhere in the production application. | All sine wave generators, random number loops, and fallback constants deleted. | **SATISFIED** |
| 2 | MQTT is the sole source of operational monitoring telemetry. | End-to-end pipeline verified from HiveMQ broker packet to DOM element. | **SATISFIED** |
| 3 | All pages use the authoritative telemetry model. | All 11 pages consume unified `AppContext` and `/api/v1` endpoints. | **SATISFIED** |
| 4 | Missing data is displayed as unavailable rather than zero or a placeholder. | Verified `N/A`, `Awaiting Telemetry`, and empty states across all views. | **SATISFIED** |
| 5 | GPS positions and routes are not fabricated. | Verified no coordinates rendered until genuine GNSS packet arrived. | **SATISFIED** |
| 6 | Historical charts contain only genuine recorded data. | Level trend and history screens query only database-persisted points. | **SATISFIED** |
| 7 | Connection status accurately reflects the actual MQTT client state. | Header pill tracks live WebSocket / backend broker connectivity. | **SATISFIED** |
| 8 | Device reporting status accurately reflects valid telemetry. | Device marked online only when valid frame is ingested; marks offline when idle. | **SATISFIED** |
| 9 | Invalid and stale messages are handled safely. | Pydantic validation rejects malformed packets; age > 30s triggers `STALE_DATA`. | **SATISFIED** |
| 10 | The application builds and runs successfully. | Frontend Vite build (`npm run build`) and backend tests (26/26 passed) clean. | **SATISFIED** |
| 11 | The running browser application has been tested with all scenarios (A–E). | Automated validation protocol executed and verified in Chromium browser. | **SATISFIED** |
| 12 | Documentation records actual implementation and test results. | Complete audit reports generated in `WLI_DOCS/reports/`. | **SATISFIED** |

