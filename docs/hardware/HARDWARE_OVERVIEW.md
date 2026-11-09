# Panorama Water Tank Monitor — Hardware Architecture Overview
## Industrial Embedded Electronics & Transducer Specifications

---

### 1. Hardware Bill of Materials (BOM) & Microcontroller Architecture

| Component | Part / Spec | Function & Characteristics |
|---|---|---|
| **Core Processor** | **ESP32-S3-WROOM-1** | Dual-core 32-bit Xtensa LX7 @ 240 MHz, 512 KB SRAM, 8 MB Flash, 2 MB PSRAM |
| **Cellular Gateway** | **Quectel EC200U-CN** | LTE Cat-1 (up to 10 Mbps downlink), integrated GNSS/GPS, UART AT interface |
| **Pressure Transducer**| **Hydrostatic Level Sensor** | 0–5 m water column (0.5 bar), 4–20 mA output, 316L stainless steel submersible diaphragm |
| **Environmental Sensor**| **Bosch BME280** | I2C temperature (-40 to +85°C), humidity (0–100% RH), atmospheric barometric pressure |
| **Industrial Bus** | **RS485 Transceiver (MAX485)** | Modbus RTU communication with coach display panels and auxiliary nodes |
| **Power Supply** | **110V DC to 12V/5V DC-DC** | Railway-grade buck converter meeting EN 50155 surge and isolation specifications |
| **Backup Battery** | **LiFePO4 12.8V 48Ah** | 6-month autonomous battery backup during train shunting and locomotive changeovers |

---

### 2. Physical Tank Geometry & Mounting

- **Tank Configuration:** Dual-tank arrangement per coach (Tank 1 = Arrival End, Tank 2 = Departure End).
- **Vessel Geometry:** Cylindrical horizontal/vertical stainless steel vessel ($50.0\text{ cm}$ total height, $20.0\text{ L}$ standard milestone capacity).
- **Sensor Placement:** Submerged through flange fitting at the lowest geometric point of the vessel to ensure zero-deadzone hydrostatic pressure measurements.
