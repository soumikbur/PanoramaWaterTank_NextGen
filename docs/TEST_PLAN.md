# Panorama Water Tank Monitor — Verification & Test Plan

This document defines the comprehensive test strategy, verification matrices, and automated test cases for the NextGen Panorama Water Tank Monitor system.

---

## 1. Testing Strategy & Pyramid

```
       / \
      / E2E \       --> End-to-End WebSocket, MQTT & React Native UI flows
     /-------\
    /  Integ  \     --> FastAPI Routers, Database CRUD, Broker Ingestion
   /-----------\
  /    Unit     \   --> Volume Calculations, LTTB Downsampling, Alarms
 /---------------\
```

---

## 2. Test Cases & Acceptance Criteria

### 2.1 Volume & Fluid Math Test Cases
| Test ID | Function Under Test | Inputs | Expected Output | Tolerance |
| :--- | :--- | :--- | :--- | :--- |
| **TC-CALC-01** | Geometry Initialization | Defaults | Area = $0.04 \text{ m}^2$, $r \approx 0.112838 \text{ m}$, $H = 50.0 \text{ cm}$ | $\pm 0.0001$ |
| **TC-CALC-02** | Height at 0% Level | Level = $0.0\%$ | Height = $0.0 \text{ cm}$ | $\pm 0.001 \text{ cm}$ |
| **TC-CALC-03** | Height at 50% Level | Level = $50.0\%$ | Height = $25.0 \text{ cm}$ | $\pm 0.001 \text{ cm}$ |
| **TC-CALC-04** | Height at 100% Level | Level = $100.0\%$ | Height = $50.0 \text{ cm}$ | $\pm 0.001 \text{ cm}$ |
| **TC-CALC-05** | Volume at 76.5% Level | Level = $76.5\%$ | Volume = $15.3 \text{ L}$, Height = $38.25 \text{ cm}$ | $\pm 0.01 \text{ L}$ |
| **TC-CALC-06** | Volume at 100% Level | Level = $100.0\%$ | Volume = $20.0 \text{ L}$ | $\pm 0.001 \text{ L}$ |
| **TC-CALC-07** | Overflow Metric | Level = $105.0\%$ | Raw = $105.0\%$, Clamped = $100.0\%$, Overflow = `True` | Exact |
| **TC-CALC-08** | Negative Level Guard | Level = $-5.0\%$ | Level clamped to $0.0\%$, Height = $0.0 \text{ cm}$ | Exact |

### 2.2 Alarm Evaluation Test Cases
| Test ID | Trigger Scenario | Test Data | Expected Alarm | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ALRM-01** | Critical Low Level | Level = $8.5\%$ | `CRITICAL_LOW` | `CRITICAL` |
| **TC-ALRM-02** | Warning Low Level | Level = $15.2\%$ | `WARNING_LOW` | `WARNING` |
| **TC-ALRM-03** | Normal Operating Level | Level = $45.0\%$ | No Alarm (`NORMAL`) | None |
| **TC-ALRM-04** | Overflow Condition | Level = $101.5\%$ | `OVERFLOW` | `WARNING` |
| **TC-ALRM-05** | Sensor Signal Fault | $wlvl = \text{false}$ | `SENSOR_FAULT` | `CRITICAL` |
| **TC-ALRM-06** | Voltage Low Fault | $v_1 = 10.2 \text{ V}$ | `VOLTAGE_FAULT` | `WARNING` |
| **TC-ALRM-07** | Alarm Hysteresis | 19.5% $\rightarrow$ 20.5% | Clear when crossing $20.0\% + 1.0\%$ | State change |

### 2.3 LTTB Downsampling & Historical Aggregation
| Test ID | Feature | Dataset | Expected Output |
| :--- | :--- | :--- | :--- |
| **TC-LTTB-01** | Point Reduction | 1,000 raw points | Exactly $\sim 100$ downsampled points |
| **TC-LTTB-02** | Extrema Preservation | Peak spike at $t=500$ ($99.9\%$) | Peak is retained in downsampled output |
| **TC-LTTB-03** | Minimum Preservation | Dip at $t=250$ ($5.0\%$) | Minimum valley is retained in downsampled output |
| **TC-HIST-01** | Statistics Calculation | Array of levels [50, 60, 70, 80] | Avg = 65.0%, Min = 50.0%, Max = 80.0%, Delta = +30.0% |

### 2.4 Telemetry Parsing & Ingestion
| Test ID | Input Payload | Expected Result |
| :--- | :--- | :--- |
| **TC-ING-01** | Full Valid JSON Frame | Parsed to Pydantic model with all GPS, levels, and voltages |
| **TC-ING-02** | Missing Optional GPS | Successfully parsed with `lat=None, lon=None, speed=0.0` |
| **TC-ING-03** | Malformed JSON String | Caught gracefully without crashing worker, logged as error |
| **TC-ING-04** | Out-of-Range ADC | Flagged as sensor invalid, alarm raised |

---

## 3. Automated Test Execution Commands

```powershell
# Run backend unit tests with pytest and coverage reporting
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\backend
pytest -v --cov=app tests/

# Run frontend tests
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\apps\mobile
npm test
```

