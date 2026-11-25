# Website SLRD Integration and Readiness Report

**Commit:** `394d16bcb9b91e7fa0c30c64233c8f3e6c422208`  
**Live Website:** `https://soumikbur.github.io/PanoramaWaterTank_NextGen/` (`./assets/index.js?v=1795610490752`)  
**Live API:** `https://panorama-water-tank-backend.onrender.com/api/v1`  
**Scope:** Website frontend and Render fleet integration only. Android / `PanoramaWaterTank_Capacitor/` was left out of scope.

---

## 1. Confirmed Live Backend Fleet Configuration

Direct queries against `https://panorama-water-tank-backend.onrender.com/api/v1/trains` and `/api/v1/trains/12249/consist` returned the untouched fleet configuration:

- **Trains:** `1` (`train_number: "12249"`, `name: "Swarn Nagari Express"`, `type: "Superfast Express"`, `region: "NORTH"`, `railway_zone: "NR"`, route `Shakurbasti (SSB)` -> `Jaisalmer (JSM)`).
- **Consist Totals:** `6` coaches (`SLRD`, `D1`, `D2`, `C1`, `C2`, `B1`), `12` water tanks (`tank_height_cm: 50.0` default on unmapped coaches).
- **Coach `SLRD` Configuration:**
  - `device_uid`: `"0023004D4B42501120353332"`
  - `Arrival Side (Tank 1)`: `height_cm: 50.0`
  - `Departure Side (Tank 2)`: `height_cm: 100.0`
- **Volume / Capacity UI:** No `Capacity (L)` or tank volume inputs remain in `Edit Coach SLRD` on the website.

---

## 2. Simulator Payload Ingestion & Height Mapping (`0023004D4B42501120353332`)

The website subscribes to both `/sensor/topic/soumik` (`DEFAULT_SIMULATOR_TOPIC`) and `0023004D4B42501120353332/#` (plus `panorama/telemetry/#`) and processes the 17-field simulator JSON frame:

```json
{
  "uid": "0023004D4B42501120353332",
  "lat": 22.557559,
  "long": 88.352439,
  "speed": 1.5,
  "time": "18:28:52",
  "cm1": 93.5,
  "cm2": 0.0,
  "wlp1": 93.5,
  "wlp2": 0.0,
  "wlv1": true,
  "wlv2": true,
  "bat": 47.8,
  "temp": 22.5,
  "press": 1.014,
  "chno": "WB11R2262",
  "trno": "0101010101"
}
```

Verified field mapping in the live website after frame arrival:

| Payload Field | Raw Value | Rendered Output on Website |
|---|---|---|
| `uid` | `0023004D4B42501120353332` | Mapped to Train `12249` / Coach `SLRD` (`Node (353332)`) |
| `trno` / `chno` | `"0101010101"` / `"WB11R2262"` | Overridden by UID assignment (`12249 / SLRD`); no fallback `Train 0101010101` card created |
| `cm1` (Arrival Tank, `50.0 cm` max) | `93.5` | `100.0%` (`93.5 cm` shown; `Overflow Alert (100%)` badge) |
| `cm2` (Departure Tank, `100.0 cm` max) | `0.0` | `0.0%` (`0.0 cm` shown; `Critical Low (< 10%)` alert) |
| `bat` | `47.8` | `47.8%` |
| `lat` / `long` | `22.557559` / `88.352439` | `22.5576° N, 88.3524° E` |
| `time` | `"18:28:52"` | Shown in `Last Update` / `Last Seen: 18:28:52` |

---

## 3. End-to-End Verification Matrix (`https://soumikbur.github.io/PanoramaWaterTank_NextGen/`)

All Playwright browser checks in `verify_live_12249_slrd.cjs` passed (`exit code 0`, `server5xx: []`) against the live GitHub Pages deployment serving `./assets/index.js?v=1795610490752`. Console errors during the run consisted only of `3` expected `CRITICAL_LOW` alert logs (`0.0% < 10%`) triggered by Tank 2 (`0.0 cm`).

| Test Group | Verified Behavior & Observed Evidence | Status |
|---|---|---|
| Test 1: Dashboard initial load | Desktop and mobile views display Train `12249`; absent phantom `15120`; `0` server 5xx errors (`server5xxCount: 0`). | PASS |
| Test 2: Raw Data simulator intake | Topic selector includes `/sensor/topic/soumik (Simulator)`; simulator JSON frame renders; header status reads `MQTT LIVE` (desktop) / `LIVE` (mobile) (`live_slrd_test2_raw_data.png`). | PASS |
| Tests 3–4: Train Management & Edit SLRD | No `Train not found` error; `6` coaches (`12` tanks); `SLRD` displays `DEVICE ONLINE`, `100%` (`93.5 cm / 50 cm`), and `0%` (`0 cm / 100 cm`); `Edit Coach SLRD` displays `REGISTERED`, `ONLINE`, `Last Seen: 18:28:52`, and zero Volume / Capacity fields (`live_slrd_test3_manage_coaches.png`, `live_slrd_test4_edit_coach_online.png`). | PASS |
| Test 5: Coach Details | Displays `12249 • SLRD`, `Online (Active)`, `Last Seen: 18:28:52`, `100.0%` (`93.5 cm` / `50.0 cm`), `0.0%` (`0.0 cm` / `100.0 cm`), and `NODE BATTERY 47.8%` (`live_slrd_test5_coach_details.png`). | PASS |
| Test 6: Devices table & fleet cards | No hardcoded `2 Online \| 2 Offline` string; table row displays `0023004D4B42501120353332`; fleet card `Node (353332)` displays `Warning` (low level on Tank 2), `12249/SLRD`, `Water Level: 100% / 0%`, `Signal: Active Link`, `Last Seen: 18:28:52` (`live_slrd_test6a_devices_table.png`, `live_slrd_test6b_devices_fleet.png`). | PASS |
| Tests 7–8: Dashboard & All Tanks | Desktop & mobile dashboards display `12249`, `SLRD`, `ONLINE`, `100.0%` / `0.0%`, `Battery: 47.8%`, `LIVE MQTT STREAM`, and no `0101010101` card; `All Tanks` filters both `Online` and `Offline` coaches (`live_slrd_test7_dashboard_desktop.png`, `live_slrd_test7_dashboard_mobile.png`, `live_slrd_test8_all_tanks.png`). | PASS |
| Tests 9–10: Watchdog transitions & persistence | Timed telemetry pause moves header badge to `STALE` after `T`, moves `Coach Details` to `Offline (Standby)` while retaining `Last Seen: 18:29:10` after `2T`, recovers to `ONLINE` on new frame, and retains `12249` consist after reload (`live_slrd_test9a_stale_state.png`, `live_slrd_test9b_offline_state.png`). | PASS |

### Repository & Build Checks

- **GitHub Actions (`394d16b`):**
  - `Continuous Integration & Automated Verification` (`45616113715`): `completed` / `success`
  - `CI & GitHub Pages Deployment` (`45616113150`): `completed` / `success`
- **Local JS Unit Checks (after final code edit):**
  - `test_device_online_liveness.cjs`: PASS
  - `test_online_tank_status.cjs`: PASS
  - `test_online_coaches_filter.cjs`: PASS
  - `test_alert_notification_unit.cjs`: PASS
- **Knowledge Graph:** `graphify-out/` updated for `394d16b` (`12,704` nodes, `22,174` edges, `808` communities).
- **Not Re-Run / Excluded / Known Failures:**
  - Backend pytest suites were not re-executed locally after `394d16b` because zero Python files changed (GitHub Actions run `45616113715` executed backend checks on `394d16b`).
  - `npx tsc --noEmit` exits `2` on `25` pre-existing strict-null/type mismatches in untouched lines of `client.ts`, `HistoryScreen.tsx`, `ReportsScreen.tsx`, `mqttService.ts`, `tankStatusService.ts`, and `AppContext.tsx`.
  - Pre-existing `test_mqtt_gps_tracking.cjs` failed earlier inside `_tmp_mqtt_gps_driver.cjs:69` (`AssertionError: Button must be renamed to Live Train Position`).
  - Manual broker `Disconnect -> Reconnect` UI toggle was covered by unit checks rather than repeated in `verify_live_12249_slrd.cjs`.
  - Capacitor / Android workspace was excluded and not tested.

---

## 4. Operational Risks Before Presentation

1. **Ephemeral Backend Storage:** Render backend storage is ephemeral across container restarts/redeploys; if Render restarts, verify `/api/v1/trains/12249/consist` still holds `SLRD` (`0023004D4B42501120353332`, `50.0 cm` / `100.0 cm`).
2. **Simulator Override Dependency:** Raw payloads sending `"trno": "0101010101"` rely on UID `0023004D4B42501120353332` remaining assigned to `12249 / SLRD` to map away from `0101010101`.
3. **Watchdog Floor Setting:** `panorama_telemetry_timeout_sec` enforces a minimum of `10` seconds; smaller overrides revert to `180000` ms (`180` s).
4. **Pre-Existing Uncommitted Workspace Files:** `PanoramaWaterTank_Capacitor/scripts/build-web.cjs`, `apps/mobile/public/downloads/panorama-water-tank-monitor.apk`, and `backend/data/express_trains_db.json` contain pre-existing local modifications outside commit `394d16b` and were intentionally left unstaged.
