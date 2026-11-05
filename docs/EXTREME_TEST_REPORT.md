# Extreme Functional Test Report

**Project:** Panorama Water Tank Monitor – NextGen  
**Test Suite:** `backend/tests/test_extreme_water_level_calculations.py`, `backend/tests/test_calculator.py`, `backend/tests/test_alarm_service.py`  
**Execution Environment:** Python 3.14 + Pytest 9.2  
**Total Tests in Suite:** 22 mathematical & physics boundary tests (53 tests across full suite)  
**Pass Rate:** 100%  

---

## 1. Objective & Scope

This report documents the rigorous verification of the SCADA mathematical calculation engine, fluid level conversions, physical vessel geometry, sensor anomaly handling, and alarm boundary rules under extreme boundary conditions.

### Standard Cylindrical Tank Test Baseline:
- **Rated Capacity:** 20.0 Liters
- **Total Physical Height ($H_{\text{max}}$):** 50.0 cm ($0.50\text{ m}$)
- **Cross-Sectional Area ($A$):** $0.04\text{ m}^2$
- **Low Water Warning Threshold:** $20.0\%$
- **Critical Low Water Threshold:** $10.0\%$
- **Overflow Threshold:** $100.0\%$

---

## 2. Complete Boundary Matrix Results

| Test Case | Fill % | Column Height ($h$) | Computed Volume | Capacity Rank | Alarm Classification | Evaluation Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Zero Level (Dry Tank)** | $0.0\%$ | $0.00\text{ cm}$ | $0.00\text{ L}$ | `LOW` | `CRITICAL_LOW` (Critical) | **PASSED** |
| **Extreme Low Level** | $1.0\%$ | $0.50\text{ cm}$ | $0.20\text{ L}$ | `LOW` | `CRITICAL_LOW` (Critical) | **PASSED** |
| **Critical Threshold Sub-boundary** | $9.9\%$ | $4.95\text{ cm}$ | $1.98\text{ L}$ | `LOW` | `CRITICAL_LOW` (Critical) | **PASSED** |
| **Critical Threshold Exact** | $10.0\%$ | $5.00\text{ cm}$ | $2.00\text{ L}$ | `LOW` | `WARNING_LOW` (Warning) | **PASSED** |
| **Warning Threshold Sub-boundary** | $19.9\%$ | $9.95\text{ cm}$ | $3.98\text{ L}$ | `LOW` | `WARNING_LOW` (Warning) | **PASSED** |
| **Warning Threshold Exact** | $20.0\%$ | $10.00\text{ cm}$ | $4.00\text{ L}$ | `LOW` | `NORMAL` (Threshold met) | **PASSED** |
| **Quarter Capacity** | $25.0\%$ | $12.50\text{ cm}$ | $5.00\text{ L}$ | `MODERATE` | `NORMAL` (Normal) | **PASSED** |
| **Nominal Mid-Level** | $50.0\%$ | $25.00\text{ cm}$ | $10.00\text{ L}$ | `GOOD` | `NORMAL` (Normal) | **PASSED** |
| **Three-Quarter Level** | $75.0\%$ | $37.50\text{ cm}$ | $15.00\text{ L}$ | `HIGH` | `NORMAL` (Normal) | **PASSED** |
| **Near Capacity** | $99.0\%$ | $49.50\text{ cm}$ | $19.80\text{ L}$ | `HIGH` | `NORMAL` (Normal) | **PASSED** |
| **Full Rated Capacity** | $100.0\%$ | $50.00\text{ cm}$ | $20.00\text{ L}$ | `HIGH` | `OVERFLOW` (Exact boundary) | **PASSED** |
| **Overflow Condition** | $115.0\%$ | $57.50\text{ cm}$ ($50.0\text{ cm}$ visual) | $23.00\text{ L}$ ($20.0\text{ L}$ visual) | `HIGH` | `OVERFLOW` (Warning) | **PASSED** |
| **Sensor Undershoot / Negative** | $-5.0\%$ | $0.00\text{ cm}$ (clamped) | $0.00\text{ L}$ (clamped) | `LOW` | `CRITICAL_LOW` | **PASSED** |
| **Sensor Hardware Disconnect** | $50.0\%$ | N/A (`wlvl=False`) | N/A | `GOOD` | `SENSOR_FAULT` (Critical) | **PASSED** |
| **Battery Undervoltage** | $50.0\%$ | $25.00\text{ cm}$ | $10.00\text{ L}$ | `GOOD` | `VOLTAGE_FAULT` ($V < 10.0\text{V}$) | **PASSED** |

---

## 3. Mathematical Consistency Analysis

### 3.1 Cylindrical Geometry Parity
- Given cross-sectional area $A = 0.04\text{ m}^2$:
  $$r = \sqrt{\frac{A}{\pi}} = \sqrt{\frac{0.04}{\pi}} \approx 0.112838\text{ m} \quad (\approx 22.57\text{ cm diameter})$$
- Maximum vessel height for rated volume $V = 20.0\text{ L} = 0.02\text{ m}^3$:
  $$H_{\text{max}} = \frac{V}{A} = \frac{0.02}{0.04} = 0.50\text{ m} \quad (50.0\text{ cm})$$
- All computed values match the legacy C++ SCADA definitions within an absolute tolerance of $\epsilon < 10^{-5}$.

### 3.2 Dynamic Downsampling & Data Integrity
- Tested historical downsampler (`LTTBDownsampler` - Largest Triangle Three Buckets):
  - Preserved critical local maxima (e.g. rapid refilling events).
  - Preserved critical local minima (e.g. sharp water depletion drops).
  - Maintained temporal monotonicity across downsampled series.

---

## 4. Conclusion

The fluid mechanics and volume calculation modules are mathematically consistent, handle negative anomalies and overflow gracefully without runtime exceptions, and trigger alarm states with zero jitter across all boundary thresholds.

