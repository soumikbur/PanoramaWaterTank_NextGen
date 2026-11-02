# Demo Data Removal & Codebase Cleansing Audit Report

**Project:** Panorama Water Tank NextGen (Railway SCADA/HMI)  
**Workspace:** `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen`  
**Audit Date:** October 31, 2026  
**Status:** COMPLETE — 100% Zero-Demo-Data Verified

---

## 1. Executive Summary

A comprehensive architectural audit was performed across the entire Panorama Water Tank NextGen codebase (frontend, backend, storage, services, and scripts) to eliminate all simulated telemetry, hardcoded operational values, random-number generators, mock APIs, and fake connection states.

The application has been converted to an **MQTT-only operational data architecture**. When telemetry has not yet arrived or a field is omitted by the edge hardware, the interface presents strict `N/A`, `Awaiting Telemetry`, or designated empty-state banners. No placeholder measurements or synthetic coordinates are ever fabricated.

---

## 2. Complete Inventory of Discovered Demo Sources & Removals

### 2.1 Backend Operational Services & Database

| File Path | Discovered Demo / Mock Logic | Action Taken & Replacement |
|---|---|---|
| `backend/scripts/simulate_telemetry.py` | Continuous background loop generating random water levels (sine wave 60–85%), artificial GPS coordinate drift around Delhi/Agra corridor (`27.8500, 77.8000`), simulated speed, and battery voltages. | **Terminated and disabled**. Process `task-1100` killed. All simulated data rows purged from `telemetry_readings`. |
| `backend/app/schemas/tank.py` | `TankLiveStatus` schema required non-null floats for `levelPercent`, `volumeLiters`, `heightCm`, `batteryVoltage`, forcing callers to substitute fake defaults. | Modified all measurement fields to `Optional[float] = None`, added explicit booleans `hasTelemetry: bool = False` and `isStale: bool = False`. |
| `backend/app/api/v1/tanks.py` | Fallback values in live tank status (`level=0.0`, `rank="EMPTY"`, `voltage=12.0`) when no telemetry existed. | Replaced with `has_telemetry=False`, `rank="N/A"`, `alarmStatus="AWAITING_TELEMETRY"`, `level=None`, `vol=None`. Added freshness check `age_seconds > 30.0` triggering `STALE_DATA`. |
| `backend/app/api/v1/location.py` | `TrainLocation` returned hardcoded fallback coordinates (`28.6139, 77.2090`, altitude `216.0m`, speed `0.0`, `8 sats`) whenever GPS telemetry was absent. | Replaced with nullable latitude/longitude (`None`), `has_gps=False`, empty waypoint trail `[]`. Only genuine GNSS fixes are reported. |
| `backend/app/api/v1/trains.py` | `list_trains` and `get_regions_summary` iterated over hardcoded mock train numbers (`12002`, `12301`, `12951`, `12431`) across Southern, Eastern, and Western railways without database backing. | Completely purged. Rewritten to query real configured `Device` and `Tank` records in SQLite/PostgreSQL. Regions with no registered devices report 0 trains. |
| `backend/app/schemas/device.py` & `backend/app/api/v1/devices.py` | `DeviceDiagnostics` defaulted voltage to `12.0V`, satellites to `0`, uptime to fake strings when offline. | Set all diagnostic readings to `None` when no telemetry reading is on record. |
| `backend/app/api/v1/settings.py` | `/api/v1/settings/test-device` endpoint returned hardcoded mock ping `{ "status": "ONLINE", "latency_ms": 18.4 }` regardless of connectivity. | Replaced with genuine TCP socket probe against `device_host:device_port` with a 1.0-second timeout. |
| `backend/app/schemas/telemetry.py` | Satellite counts and speed defaulted to `0` instead of `None`. Lacked coordinate boundary validation. | Set default values to `None`. Added `@field_validator` for latitude `[-90, 90]`, longitude `[-180, 180]`, and water level percentage `[0, 200]`. |
| `backend/app/mqtt/client.py` | Forced `satellites = payload.sats or 0` (turning null GPS into 0 sats). Truncated ISO date string parsing when separate `dt` and `time` were supplied. | Fixed satellite assignment to preserve `None`. Added composite timestamp parsing `f"{payload.dt}T{payload.time}"` ensuring precise sub-second freshness tracking. |
| `backend/app/core/config.py` | Relative `./panorama_dev.db` path caused split databases when run from parent directories. | Anchored database path to `_BACKEND_DIR / "panorama_dev.db"` to prevent duplicate demo databases. |

---

### 2.2 Frontend Components & Screens (11 Screens Cleaned)

| Screen / Component | Discovered Demo / Mock Logic | Action Taken & Replacement |
|---|---|---|
| `components/dashboard/SummaryGrid.tsx` | Assumed non-null level and volume; displayed `0.0%` and `0.0 L` when no telemetry was present. | Displays `N/A` for level, volume, temperature, and battery voltage. Badges display `Awaiting Telemetry` or `Stale Data`. |
| `components/dashboard/TankInfoCard.tsx` | Hardcoded fallback voltage (`12.60 V`), fake Delhi coordinates (`28.6139, 77.2090`), hardcoded BME280 temperature (`25.0 °C`), and device UID. | Replaced with `N/A` for all unmeasured fields; displays true MQTT broker status and live device UID from database. |
| `components/dashboard/RankIndicator.tsx` | Handled null as 0%, drawing a red "CRITICAL" empty tank gauge. | Safely branches when `fillPercentage == null` to display a neutral centered `Awaiting Telemetry` indicator. |
| `components/tank/TankVisualization.tsx` | Rendered blue water level fill at 0% with active wave animations when data was absent. | Renders a neutral, dimmed idle tank wireframe with `N/A` metrics and an `Awaiting Telemetry` / `Stale Data` badge. |
| `components/charts/LevelTrendCard.tsx` | Generated synthetic 24-hour sine wave data points `Array.from({ length: 24 })` with `Math.sin(i / 3) * 15`. | Completely deleted synthetic generator. Now renders `No historical water level telemetry recorded yet.` empty state when history is empty. |
| `screens/LocationScreen.tsx` | Fallback train coordinates plotted at `27.8500, 77.8000` with fake speed `88.5 km/h` and `9 satellites`. | Removed fallback marker. Implemented required empty-state overlay banner: <br>`GPS data unavailable`<br>`Waiting for valid location telemetry from MQTT.`<br>Displays `N/A` for all GNSS metrics cards. |
| `screens/WaterTankScreen.tsx` | Fallback level `68.4%`, height `34.2 cm`, volume `13.68 L`, hardcoded BME280 pressure/temp metrics. | Replaced with `N/A`. Added `hasData` guarding. Renders `Alarm Logic: IDLE` and `Awaiting Telemetry` status banner. |
| `screens/DevicesScreen.tsx` | Static array of 4 hardcoded demo devices ("Water Level Sensor 01", "WLS-002", "WLS-003", "WLS-004"). | Replaced with dynamic mapping from `useApp().devices` (database backed). Properly handles empty fleets and null telemetry readings. |
| `screens/ReportsScreen.tsx` | Static consumption rows with fabricated Agra/Delhi refill events and hardcoded SLA percentages (98.4%). | Connected directly to `ApiClient.fetchTelemetryHistory()`. Displays clean empty state `No telemetry records in selected interval` when no records exist. |
| `screens/LogsScreen.tsx` | Static mock payload array simulating ESP32 JSON logs. | Replaced with live WebSocket event stream (`TELEMETRY_UPDATE`, `ALARM_TRIGGERED`). Displays empty terminal awaiting live packets. |
| `screens/AlertsScreen.tsx` | Hardcoded mock alerts array ("Low Water Level Critical", "Sensor Voltage Dip"). Fallback calling `.toFixed(2)` on nulls. | Replaced with `activeAlarms` and real historical events via `ApiClient.fetchAlarms()`. Fixed null reference bug on `alarmLevel`. Displays `No active alarms`. |
| `screens/HistoryScreen.tsx` | Artificial sine-wave time-series generator producing fake hourly readings. | Removed synthetic generator. Fetches real telemetry from `/api/v1/telemetry/history`. Displays `No historical water level telemetry recorded yet.` when empty. |
| `components/common/Sidebar.tsx` | Fallback counts `{devices.length || 1}`, `{totalTanksCount || 2}`, `{onlineDevicesCount || 1}`. | Replaced with true numerical lengths `{devices.length}`, `{totalTanksCount}`, `{onlineDevicesCount}` without fake defaults. |

---

## 3. Database State Reset

- Existing demo records in `telemetry_readings`, `alarms`, and `alarm_history` created by previous simulation scripts were completely cleared.
- Registered device `0026004D4B42501120353332` was reset to `is_online = 0`, `last_seen_at = NULL`.
- Duplicate database file `c:\Users\User\Documents\Antigravity_soumik\panorama_dev.db` was permanently deleted.

---

## 4. Verification Conclusion

No simulated, fabricated, or fallback operational data remains in any frontend component, backend endpoint, or database table. Every displayed telemetry metric is strictly derived from verified MQTT packets received from the hardware gateway.

