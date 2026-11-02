# System Settings & Configuration Architecture Audit

**Application**: Panorama Water Tank Monitor NextGen  
**Component**: `SettingsScreen.tsx` & `backend/app/api/v1/settings.py`  
**Date**: October 31, 2026  
**Status**: 100% Operational & Verified  

---

## 1. Original Defect & Root Cause

The previous `SettingsScreen.tsx` presented an outdated Ubidots-only form ported from an old prototype. It required Ubidots API tokens, variables, and hosts, while ignoring the core MQTT broker over TLS, the ESP32-S3 HTTP REST Gateway, hydrostatic physical tank dimensions, sensor calibration, and alarm threshold ordering.

### Root Causes:
1. Disconnect between the FastAPI backend data models (`Setting`, `Tank`, `Device`) and the frontend view.
2. Hardcoded Ubidots credentials presented as the sole configuration mechanism.
3. Lack of mathematical recalculation for tank geometry.
4. Non-functional action buttons ("Read From Device", "Apply Configuration", "Factory Reset").

---

## 2. Redesigned 5-Section Configuration Architecture

### Section A: Device and Connectivity
* **Primary SCADA Broker (MQTT)**:
  * Hostname (`broker.hivemq.com`), Port (`1883`), Protocol selection (Standard vs TLS/SSL `8883`).
  * Subscription topic pattern (`panorama/telemetry/+`).
  * **Interactive Test**: `📡 Test MQTT Broker` triggers live ping via `/api/v1/settings/test-mqtt` returning latency in ms.
* **Edge Device Gateway (HTTP REST)**:
  * IP/Hostname (`192.168.4.1`), Port (`80`), Refresh interval (`3.0s`).
  * **Interactive Test**: `📶 Test Edge REST` verifies gateway reachability via `/api/v1/settings/test-device`.
* **Secondary Cloud Bridge (Ubidots)**:
  * Preserved as an optional telemetry relay.
  * API host, device label, and masked API token with show/hide toggle.

### Section B: Tank Physical Geometry
* **Tank Shapes**: Cylindrical and Rectangular.
* **Mathematical Capacity Recalculation**:
  For Cylindrical Reservoirs:
  $$V = \frac{\pi \times (\frac{D}{2})^2 \times H}{1000} \quad [\text{Litres}]$$
  $$\text{Internal Area } A = \pi \times \left(\frac{D / 2}{100}\right)^2 \quad [\text{m}^2]$$
  For default $H = 50.0\text{ cm}$ and $D = 22.56\text{ cm}$, the system accurately derives $V = 20.00\text{ Litres}$ and $A = 0.0400\text{ m}^2$.
* Inputs are validated for positive values, and capacity is recalculated dynamically on user input.

### Section C: Sensor Calibration & Damping
* **Transducer Technology**: 4-20mA Hydrostatic Pressure Sensor.
* **Zero Offset**: Configurable in centimeters (compensating for transducer mounting elevation above tank sump).
* **Full-Scale Span**: Configurable in centimeters.
* **Damping Time Constant**: Low-pass digital filter coefficient (seconds) to eliminate liquid slosh noise during train acceleration and braking.
* **Polarity**: Standard vs Inverted slope.

### Section D: Operational Alarm Setpoints
* **Thresholds**:
  * Critical Low: Slider ($1 - 30\%$, default $10.0\%$)
  * Warning Low: Slider ($10 - 50\%$, default $20.0\%$)
  * Overflow: Slider ($90 - 110\%$, default $100.0\%$)
* **Ordering Rule Enforcement**:
  $$\text{Critical Threshold} < \text{Warning Threshold} < \text{Overflow Threshold}$$
  A validation badge updates dynamically in the UI and blocks submission if invalid.
* **Visual Scale Preview**: Color-coded representation bar displaying operational bands.

### Section E: Edge Diagnostics & Persistence State
* Shows Gateway UID, firmware version, nominal battery voltage ($12.65\text{ V}$), and synchronization state (`✓ Synchronized with DB` vs `⚠️ Pending Unapplied Changes`).

---

## 3. Configuration Action Workflows

| Action | API Endpoint | Verification & Behavior |
| :--- | :--- | :--- |
| **Read From Device** | `POST /api/v1/settings/read-device` | Retrieves parameters from active edge entity in DB and populates form controls. |
| **Apply Configuration** | `POST /api/v1/settings/apply` | Validates thresholds and dimensions; atomically writes to `settings` and updates primary `Tank` record. |
| **Reset Changes** | Local State Restore | Discards unsaved edits and restores last confirmed server state. |
| **Factory Reset** | `POST /api/v1/settings/factory-reset` | Admin-only; opens modal warning; restores defaults ($20.0\text{ L}$, $50.0\text{ cm}$, $0.04\text{ m}^2$, $10\% / 20\% / 100\%$). |

