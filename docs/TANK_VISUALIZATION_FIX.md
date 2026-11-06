# Water Tank Visualization 4-State Engine & Telemetry Truthfulness Audit

## 1. Executive Summary & Root Cause Analysis

### Problem Description
In earlier versions of the Panorama Water Tank Monitor HMI, the water tank visualization component displayed an oscillating horizontal cyan/blue band at approximately 75% height, even while the textual telemetry readouts explicitly reported:
- **Current Level:** `Awaiting Telemetry`
- **Water Height:** `Awaiting Data`
- **Tank Volume:** `Awaiting Data`
- **Sensor Status:** `Awaiting Data`

This discrepancy created critical cognitive confusion for railway operators, violating the foundational principle of industrial SCADA/HMI design: **strict data truthfulness**. Under no circumstances should decorative, placeholder, or ambient animations simulate fluid presence when sensor telemetry is absent.

### Root Cause Identification
Inspection of `apps/mobile/src/components/tank/TankVisualization.tsx` identified an ambient radar scanning beam implemented in the fallback branch:

```typescript
// Legacy defective snippet in TankVisualization.tsx
const scanY = (Math.sin(wavePhase * 0.5) * 0.5 + 0.5) * (h - 40) + 20;
const scanGrad = ctx.createLinearGradient(0, scanY - 14, 0, scanY + 14);
scanGrad.addColorStop(0, 'rgba(14, 165, 233, 0)');
scanGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.12)');
scanGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
ctx.fillStyle = scanGrad;
ctx.fillRect(0, scanY - 14, w, 28);
```

In static screenshots, paused animation phases, or high-contrast displays, this cyan/blue bar rendered at $y \approx 0.75 \times h$, directly mimicking a 75% water level.

---

## 2. The 4-State Deterministic Visualization Architecture

To eliminate visual ambiguity and enforce strict state isolation, `TankVisualization.tsx`, `SummaryGrid.tsx`, `TankInfoCard.tsx`, and `RankIndicator.tsx` were re-architected into four mutually exclusive operational states:

$$\text{State} \in \{\text{NO\_TELEMETRY}, \text{VALID\_ZERO}, \text{VALID\_READING}, \text{STALE}\}$$

```typescript
// Deterministic State Evaluation
const isTelemetryAvailable = Boolean(tank && tank.hasTelemetry !== false && tank.levelPercent != null);
const isStale = Boolean(tank && (tank.isStale || tank.alarmStatus === 'STALE_DATA'));
const isZero = isTelemetryAvailable && (tank!.levelPercent === 0 || (tank!.heightCm !== null && tank!.heightCm === 0));

const state: TankVisualizationState = !isTelemetryAvailable
  ? 'NO_TELEMETRY'
  : isStale
  ? 'STALE'
  : isZero
  ? 'VALID_ZERO'
  : 'VALID_READING';
```

### State Matrix & Behavior

| Property | State A: No Telemetry | State B: Valid Zero | State C: Valid Reading | State D: Stale Telemetry |
| :--- | :--- | :--- | :--- | :--- |
| **Telemetry Condition** | `tank == null` or `hasTelemetry === false` or `levelPercent == null` | `hasTelemetry === true && (levelPercent === 0 \|\| heightCm === 0)` | `hasTelemetry === true && levelPercent > 0 && !isStale` | `hasTelemetry === true && (isStale === true \|\| alarmStatus === 'STALE_DATA')` |
| **Vessel Appearance** | Completely empty vessel. Zero fluid, zero wave, zero scan gradient. | Empty vessel with red 2px baseline at $y = h - 2$. | Fluid height proportional to level. Smooth dual-sine wave animation. | Desaturated/frozen flat fluid with diagonal hatch pattern (`#D97706` line). |
| **Central Canvas Text** | "Awaiting Telemetry" (12px) / "No Sensor Stream" (10px) | "Tank Empty (0.00%)" in red (`#EF4444`) | None (Fluid wave renders fill percentage) | Stale hatch pattern overlay |
| **Current Level Readout**| `Awaiting Telemetry` | `0.00%` | `65.00%` | `65.00% (Stale)` |
| **Water Height Readout** | `Awaiting Data` | `0.00 cm` | `32.50 cm` | `32.50 cm (Stale)` |
| **Tank Volume Readout** | `Awaiting Data` | `0.00 L` | `13.00 L` | `13.00 L (Stale)` |
| **Status Badge** | `Awaiting Telemetry` (Neutral) | `Critical Low (Empty)` (Critical) | `Receiving Data` / `Normal` (Success) | `Stale Data (Offline)` (Warning) |
| **Rank Indicator** | Centered "Awaiting Telemetry", triangle hidden | Pointer at 0.00% LOW | Pointer at 65.00% NORMAL | Pointer at 65.00% with amber `(Stale)` badge |
| **Wave Animation** | Inactive (`setWavePhase` halted) | Inactive | Active (`requestAnimationFrame`) | Inactive (Frozen) |

---

## 3. Calibrated Physical Geometry

The physical vessel model is strictly calibrated based on Indian Railways coach water storage parameters:
- **Maximum Height ($H$):** $50.00\text{ cm}$
- **Total Capacity ($V$):** $20.00\text{ Liters}$
- **Cross-Sectional Area ($A$):** $0.04\text{ m}^2$

### Mathematical Formulations
1. **Fill Percentage from Height:**
   $$\text{Fill Percentage} = \min\left(100, \max\left(0, \frac{h_{\text{cm}}}{H_{\text{cm}}} \times 100\right)\right)$$

2. **Volume from Fill Percentage:**
   $$\text{Volume (L)} = \frac{\text{Fill Percentage}}{100} \times V_{\text{max}} = 0.4 \times h_{\text{cm}}$$

- At $h = 0.00\text{ cm}$: $\text{Percent} = 0.00\%$, $\text{Volume} = 0.00\text{ L}$.
- At $h = 32.50\text{ cm}$: $\text{Percent} = 65.00\%$, $\text{Volume} = 13.00\text{ L}$.
- At $h = 50.00\text{ cm}$: $\text{Percent} = 100.00\%$, $\text{Volume} = 20.00\text{ L}$.

---

## 4. Automated E2E Verification & Test Artifacts

The test suite [`apps/mobile/scripts/verify_tank_states_e2e.cjs`](file:///c:/Users/User/Documents/Antigravity_soumik/PanoramaWaterTank_NextGen/apps/mobile/scripts/verify_tank_states_e2e.cjs) was executed with headless Electron, cycling through all 4 states dynamically and asserting the DOM and canvas:

```bash
cd PanoramaWaterTank_NextGen
node apps/mobile/scripts/verify_tank_states_e2e.cjs
```

### Test Results
```text
======================================================
 WATER TANK 4-STATE VERIFICATION SUMMARY
======================================================
 Total Assertions: 18
 Passed:           18
 Failed:           0
 Console Errors:   0
======================================================
[SUCCESS] ALL 4 WATER TANK STATES VERIFIED WITH ZERO ERRORS!
```

### Visual Verification Artifacts
- **State A (No Telemetry):** `test_artifacts/tank_state_a_no_telemetry.png` (127 KB)
- **State B (Valid Zero):** `test_artifacts/tank_state_b_zero.png` (119 KB)
- **State C (Valid Reading):** `test_artifacts/tank_state_c_reading.png` (118 KB)
- **State D (Stale Telemetry):** `test_artifacts/tank_state_d_stale.png` (122 KB)
