# FIRMWARE & HARDWARE INTEGRATION AUDIT: PANORAMA WATER TANK MONITOR
**Subsystem:** Edge Sensing, Embedded Processing & Cellular Telemetry  
**Edge Controllers:** STM32F401 / ESP32-S3 Microcontroller  
**Cellular Transceiver:** Quectel EC200U-CN / EU 4G LTE Cat-1 Modem  
**Sensors:** Hydrostatic Submersible Pressure Transducer (4-20mA) / Ultrasonic (UART)  
**Audit Standard:** Embedded Protocol & Volumetric Calibration Integrity  
**Date:** November 15, 2026

---

## 1. HARDWARE ARCHITECTURE & EDGE SENSING

Each railway coach is equipped with an autonomous monitoring box containing:
1. **Microcontroller:** STM32F4 / ESP32-S3 running embedded C/C++ firmware.
2. **Modem:** Quectel EC200U interfacing via UART AT commands (PPP / TCP / MQTT stack).
3. **Power Subsystem:** 110V/24V coach battery input $\rightarrow$ isolated DC-DC buck converter $\rightarrow$ 3.7V Li-ion backup cell with charging circuit.
4. **Analog Frontend:** Precision 16-bit ADC reading 4-20mA current loop through a $100\ \Omega$ precision shunt resistor ($0.4\text{V} - 2.0\text{V}$ range).

```mermaid
flowchart LR
    Transducer["Hydrostatic 4-20mA Sensor"] --> Shunt["100Ω Shunt & Filter"]
    Shunt --> ADC["16-Bit ADC"]
    ADC --> MCU["STM32F4 / ESP32-S3"]
    MCU -- "UART (AT+QMTPUB)" --> Modem["Quectel EC200U LTE"]
    Modem -- "MQTT / TLS 8883" --> Broker["HiveMQ Cloud"]
```

---

## 2. TELEMETRY PAYLOAD SPECIFICATION & NORMALIZATION

The edge modem publishes JSON packets on `panorama/telemetry/{uid}` every 30 to 60 seconds (or immediately on sudden level drops $> 5\%$).

### Canonical Payload Schema:
```json
{
  "uid": "0023004D4B42501120353332",
  "trno": "12002",
  "chno": "B4",
  "wlp1": 84.5,
  "cm1": 42.25,
  "wlp2": 82.0,
  "cm2": 41.0,
  "wlvl": true,
  "bat": 92.0,
  "v1": 4.12,
  "lat": 28.6139,
  "lon": 77.2090,
  "alt": 215.4,
  "speed": 78.5,
  "sats": 11,
  "dt": "2026-11-15T03:30:00Z"
}
```

### Parser Compatibility Matrix (`TelemetryParser`):
- **UID Alias:** Maps `deviceId` $\rightarrow$ `uid`.
- **Train/Coach Aliases:** Maps `trainNumber` $\rightarrow$ `trno`, `coachNumber` $\rightarrow$ `chno`.
- **Sensor Validity:** Reconciles `wlv1` and `wlvl`.
- **Battery Estimation:** If `bat` percentage is supplied without `v1`, approximates voltage:
  $$V \approx 3.2 + \left(\frac{\text{bat}}{100}\right) \times 1.0\text{ Volts}$$

---

## 3. VOLUMETRIC TANK FORMULAS & CALIBRATION

The backend `VolumeCalculator` and ESP32 REST server (`tests/test_esp32_rest.cpp`) support two geometric profiles:

### 1. Rectangular Tank Profile
$$\text{Volume (Liters)} = \frac{L \times W \times h}{1000}$$
Where $L, W, h$ are length, width, and liquid height in centimeters.

### 2. Cylindrical Horizontal Tank Profile
$$\text{Area}_{\text{segment}} = R^2 \arccos\left(\frac{R - h}{R}\right) - (R - h)\sqrt{2Rh - h^2}$$
$$\text{Volume (Liters)} = \frac{\text{Area}_{\text{segment}} \times L}{1000}$$

### Remote Calibration API:
The ESP32 REST interface exposes `/config` and `/calibrate` endpoints allowing technicians to write physical tank parameters over HTTP when connected to the coach AP:
- `shape`: `"CYLINDER"` or `"RECTANGLE"`
- `height_cm`: Total tank height (e.g. 50.0 cm)
- `capacity_liters`: Total capacity (e.g. 450.0 L)
- `warning_percent`: 20.0%
- `critical_percent`: 10.0%

---

## 4. IDENTIFIED FIRMWARE INTEGRATION GAPS

### Gap 1: Cellular Dead-Zone Buffering Protocol
- **Issue:** Railway routes pass through tunnels and remote valleys where 4G LTE coverage drops for 10–45 minutes.
- **Current Behavior:** The EC200U AT command drops un-transmitted telemetry packets if connection fails.
- **Recommended Remedy:** Implement circular ring buffering in SPI Flash (W25Q64) on the MCU. When LTE reconnects, drain the buffer using burst MQTT publishes with the original sample timestamps.

### Gap 2: GPS Clock vs Network NITZ Time Drift
- **Issue:** When GPS lock is lost in covered platforms or tunnels, the internal RTC drifts up to 5 seconds per day.
- **Recommended Remedy:** Use cellular NITZ network time sync as primary fallback whenever GPS `sats` $< 4$.

---
*Firmware & Hardware Integration Audit completed.*
