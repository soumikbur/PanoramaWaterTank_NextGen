# Device Online Status Fix Report (Website)

**Commit:** `394d16bcb9b91e7fa0c30c64233c8f3e6c422208`  
**Live Deployment:** `https://soumikbur.github.io/PanoramaWaterTank_NextGen/` (`./assets/index.js?v=1795610490752`)  
**Target Hardware:** Device UID `0023004D4B42501120353332` (`Train 12249 — Swarn Nagari Express`, `Coach SLRD`)  
**Scope:** Website frontend and website verification scripts only. `PanoramaWaterTank_Capacitor/` and Android build outputs were not modified.

---

## 1. Problem Statement

Physical node `0023004D4B42501120353332` transmitted valid MQTT telemetry frames while the website UI displayed `OFFLINE` in `Edit Coach SLRD` (`ManageCoachModal.tsx`) and showed stale or inconsistent connectivity counts across `Devices`, `Dashboard`, `Coach Details`, `All Tanks`, and `Train Management`.

---

## 2. Root Causes Found Across the Pipeline

1. **Missing Topic Subscriptions and Single Global Watchdog (`apps/mobile/src/services/mqttService.ts`, `apps/mobile/src/screens/MqttMonitorScreen.tsx`)**
   - `mqttService` maintained a single global watchdog state instead of tracking per-device reception timestamps (`lastReceivedAtByUid`) and per-UID liveness transitions (`staleEmittedUids`, `offlineEmittedUids`).
   - Registered UID wildcard topics (`${uid}/#`) and `DEFAULT_SIMULATOR_TOPIC` (`'/sensor/topic/soumik'`) were not consistently retained in `buildSubscriptionMap()` and `syncRegisteredDeviceUids()`.
   - Switching the active topic filter in `MqttMonitorScreen.tsx` called `unsubscribeTopic(previous)` on background telemetry streams and populated its selector from `availableDevices` rather than `availableTopics`.
   - `disconnect()` needed explicit cleanup of per-UID telemetry maps and `lastPayloadSignature` so reconnecting or receiving matching frames again resumes cleanly.

2. **Binary Online/Offline Model and Zeroed `Last Seen` Timestamps (`apps/mobile/src/services/deviceRegistry.ts`, `apps/mobile/src/types/device.ts`, `apps/mobile/src/types/tank.ts`)**
   - `deviceRegistry` lacked a 3-state `DeviceConnectivityState` (`'ONLINE' | 'STALE' | 'OFFLINE'`), collapsing transient watchdog expiry (`T`) directly into `OFFLINE`.
   - `markAllOffline()` and `reconcileRemoteDevices()` overwrote valid device timestamps with `lastSeenTimestamp: 0` when Render returned `is_online: false` or `null` liveness fields, erasing the last known MQTT frame timestamp.
   - No periodic liveness sweep (`evaluateLivenessStates()`) transitioned idle UIDs through `STALE` `(T, 2T]` and `OFFLINE` `> 2T` independently.

3. **Consist Lookup Ordering and Uncalibrated Registry Updates (`apps/mobile/src/state/AppContext.tsx`)**
   - Incoming simulator payloads containing `"trno": "0101010101"` and `"chno": "WB11R2262"` needed deterministic resolution through `deviceRegistry` -> `activeConsistRef` -> `localFleetStore.getTrainConsist(...)` before falling back to raw payload identifiers.
   - `refreshData()` (`mergedDevs`) and `deviceRegistry.subscribe` needed to merge live in-memory `deviceRegistry` connectivity fields over static backend device records.
   - Height-calibrated `arrivalLevelPct` and `departureLevelPct` had to be computed prior to `deviceRegistry.recordDiscoveredDevice(...)` so `Devices` displays height-scaled tank percentages instead of raw sensor values.

4. **UI Components Bypassing Live Registry State**
   - `ManageCoachModal.tsx` read `coach.is_online` instead of registered `deviceRegistry` live connectivity (`ONLINE` / `STALE` / `OFFLINE`) and preserved `Last Seen`.
   - `DevicesScreen.tsx` displayed a hardcoded `2 Online | 2 Offline` summary string and omitted unified 3-state badges and live telemetry overlay rows.
   - `EmployeeDashboard.tsx` risked displaying a fallback `Train 0101010101` card for raw simulator payloads, while `CoachDetailsScreen.tsx`, `TrainManagementScreen.tsx`, `WaterTankScreen.tsx`, and `WaterTankStatusCard.tsx` lacked consistent `STALE` and disconnect-reason (`TIMED_OUT` vs `DEVICE_DISCONNECTED`) handling.

---

## 3. Changes Implemented (`394d16b`)

| File | Change Summary |
|---|---|
| `apps/mobile/src/types/device.ts` | Added `DeviceConnectivityState = 'ONLINE' \| 'STALE' \| 'OFFLINE'`, `connectivityState`, `isStale`, and `lastSeenTimestamp` on `Device`. |
| `apps/mobile/src/types/tank.ts` | Added `offlineReason?: string \| null` on `TankLiveStatus`. |
| `apps/mobile/src/services/mqttService.ts` | Exported `DEFAULT_SIMULATOR_TOPIC = '/sensor/topic/soumik'`; loaded `panorama_mqtt_selected_device` and `panorama_mqtt_target_topic`; subscribed `DEFAULT_SIMULATOR_TOPIC` and `${uid}/#` in `buildSubscriptionMap()` / `syncRegisteredDeviceUids()` and protected them in `unsubscribeTopic()`; tracked `lastTelemetryByUid`, `lastReceivedAtByUid`, `staleEmittedUids`, and `offlineEmittedUids`; upgraded `resetStaleTimer()` to emit per-UID `STALE` at `T` and `OFFLINE` at `2T`; added `getLatestTelemetryForUid(uid)`; cleared per-UID state and `lastPayloadSignature` in `disconnect()`. Note: `getWatchdogTimeoutMs()` reads `panorama_telemetry_timeout_sec` when `>= 10`, falling back to `180000` ms otherwise. |
| `apps/mobile/src/screens/MqttMonitorScreen.tsx` | Added `frameMatchesTarget()` matching wildcards or 24-hex payload UID; removed `unsubscribeTopic(previous)` on topic filter switch; switched selector dropdown to `availableTopics` including `/sensor/topic/soumik (Simulator)`. |
| `apps/mobile/src/services/deviceRegistry.ts` | Added `resolveDeviceConnectivityState()`, 2 s `evaluateLivenessStates()` timer, and `markBrokerConnected()`; updated `markAllOffline()` and `reconcileRemoteDevices()` to keep `lastSeen` and `Math.max(existingLastSeenMs, backendLastSeenMs)`; updated `recordDiscoveredDevice()`, `loadFromStorage()`, `handleCentralSync()`, `getDevices()`, and canonical `deleteDevice()`. |
| `apps/mobile/src/services/tankStatusService.ts` | Separated `TIMED_OUT` (`> timeoutMs`) from `DEVICE_DISCONNECTED` (`> timeoutMs * 2`). |
| `apps/mobile/src/state/AppContext.tsx` | Merged live `deviceRegistry` fields into `refreshData()` `mergedDevs` and `deviceRegistry.subscribe`; wired `STALE` -> `evaluateLivenessStates()` and `CONNECTED` -> `markBrokerConnected()` in `onStatusChange`; resolved mapped `trainNumber` / `coachNumber` via `deviceRegistry` -> `activeConsistRef` -> `localFleetStore.getTrainConsist(...)` in `unsubMqttTelemetry`; computed `arrivalLevelPct` and `departureLevelPct` before calling `deviceRegistry.recordDiscoveredDevice(...)`. |
| `apps/mobile/src/components/coach/ManageCoachModal.tsx` | Rendered 3-state `ONLINE` / `STALE` / `OFFLINE` badges and preserved `Last Seen` in the hardware section of `Edit Coach`. |
| `apps/mobile/src/screens/CoachDetailsScreen.tsx` | Rendered `Online (Active)`, `Stale` (`STALE`), and `Offline (Standby)` states while retaining `Last Seen` timestamps and tank measurements. |
| `apps/mobile/src/screens/DevicesScreen.tsx` | Removed hardcoded `2 Online | 2 Offline` text; rendered height-calibrated tank percentages and live telemetry table values. |
| `apps/mobile/src/screens/EmployeeDashboard.tsx` | Prevented unmapped raw `"trno": "0101010101"` simulator frames from generating a separate train card when mapped to `12249 / SLRD`. |
| `apps/mobile/src/screens/TrainManagementScreen.tsx` | Added live height-calibrated tank bars (`100%` / `0%`) and `DEVICE ONLINE` / `DEVICE OFFLINE` coach badges. |
| `apps/mobile/src/screens/WaterTankScreen.tsx` & `apps/mobile/src/components/dashboard/WaterTankStatusCard.tsx` | Added `Stale` state handling alongside `Online` and `Offline`. |
| `apps/mobile/scripts/test_device_online_liveness.cjs` | Added esbuild-backed unit checks for `deviceRegistry`, `tankStatusService`, and `mqttService` 3-state transitions and SLRD height scaling. |

---

## 4. Verification Results

All JS unit tests and live website checks below were observed running against commit `394d16bcb9b91e7fa0c30c64233c8f3e6c422208`.

| Check | Command / Target | Result |
|---|---|---|
| Production build | `cd apps/mobile && npm run build` | Passed (`533ms`) |
| Liveness & SLRD unit suite | `node scripts/test_device_online_liveness.cjs` | Passed (`ALL DEVICE LIVENESS, MQTT & SLRD HEIGHT UNIT CHECKS PASSED`) |
| Tank online count suite | `node scripts/test_online_tank_status.cjs` | Passed (Scenarios 1–5) |
| Online coach filter suite | `node scripts/test_online_coaches_filter.cjs` | Passed (Tests 1–6) |
| Alert & reconnect suite | `node scripts/test_alert_notification_unit.cjs` | Passed (Tests 1–7) |
| TypeScript typecheck | `cd apps/mobile && npx tsc --noEmit` | Exited `2` with `25` pre-existing strict-null / type errors in untouched blocks of `client.ts(1980)`, `HistoryScreen.tsx(103)`, `ReportsScreen.tsx(124-140)`, `mqttService.ts(1217)`, `tankStatusService.ts(320-322)`, and `AppContext.tsx(1831-2275)`; `0` errors in edited online/stale lifecycle code |
| GitHub Actions CI | Run `45616113715` (`Continuous Integration & Automated Verification`) | `completed` (`success`) |
| GitHub Pages deploy | Run `45616113150` (`CI & GitHub Pages Deployment`) | `completed` (`success`) |
| Live E2E Playwright (`verify_live_12249_slrd.cjs`) | `https://soumikbur.github.io/PanoramaWaterTank_NextGen/` | Passed Tests 1–10 (`exit code 0`, `server5xx: []`, verified `ONLINE` -> `STALE` -> `OFFLINE` -> `ONLINE` recovery and preserved `Last Seen`) |
| Legacy GPS script (`test_mqtt_gps_tracking.cjs`) | Pre-existing `_tmp_mqtt_gps_driver.cjs:69` | Failed earlier (`AssertionError: Button must be renamed to Live Train Position`), unrelated to online lifecycle changes |
