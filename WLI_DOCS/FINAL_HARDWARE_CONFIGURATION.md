# Final Hardware Configuration & Pinout Specification

**Project:** Panorama Water Tank Monitor (WLI) — NextGen  
**Document:** Final Hardware Configuration & Interconnect Guide  
**Hardware Revision:** Railway WLI Edge Node Rev 2.1  
**Date:** 2026-11-17  

---

## 1. System Component Hardware Inventory

| Component Role | Manufacturer & Part Number | Key Specifications | Operating Voltage |
|---|---|---|:---:|
| **Main Microcontroller** | STMicroelectronics `STM32F401RET6` | ARM Cortex-M4 @ 84MHz, 512KB Flash, 96KB SRAM, LQFP-64 | $3.3\,\text{V}$ DC |
| **Cellular LTE Modem** | Quectel `EC200U-CN` (`EC200U-CNAA-N05-SGNSA`) | LTE Cat-1 (10 Mbps DL, 5 Mbps UL) + GNSS/GPS | $3.4\,\text{V} - 4.3\,\text{V}$ (3.8V nom) |
| **BLE Auxiliary MCU** | Espressif `ESP32-WROOM-32D` | Dual Tensilica LX6 @ 160MHz, BLE 4.2 / 5.0 BR/EDR | $3.3\,\text{V}$ DC |
| **Level Transducer** | Industrial Submersible Hydrostatic Sensor | $4–20\,\text{mA}$ 2-wire current loop, $0–5\,\text{m}$ $\text{H}_2\text{O}$ span | $12\,\text{V} - 24\,\text{V}$ Loop Supply |
| **Pressure Transducer** | Piezoresistive Pressure Sensor | $0.5–4.5\,\text{V}$ ratiometric output, $0–5\,\text{bar}$ gauge | $5.0\,\text{V}$ DC |
| **Signal Conditioning** | Rail-to-Rail Precision Op-Amp (TI `OPA340`) | Low-offset buffer, $250\,\Omega$ $0.1\%$ $25\,\text{ppm}$ shunt resistor | $3.3\,\text{V}$ DC |
| **RS485 Transceiver** | Maxim `MAX3485ESA+` | $3.3\,\text{V}$ Half-Duplex RS485/RS422 Driver, $\pm15\,\text{kV}$ ESD | $3.3\,\text{V}$ DC |
| **DC-DC Step-Down** | Texas Instruments `TPS54302` | Synchronous Buck, $4.5\text{V}-28\text{V}$ In, $3.8\text{V}$ Out @ 3.0A | High Efficiency (92%) |

---

## 2. Master Pin Assignment & Interconnect Matrix

### A. STM32F401RE Pinout Table
| Pin Name | Function / Peripheral | Direction | Signal Level | Connected Peripheral | Description |
|---|---|:---:|:---:|---|---|
| **PA0** | `ADC1_IN0` | Input | $0.0–3.3\,\text{V}$ | 12V/24V Battery Voltage Divider | System DC power rail voltage monitoring ($R_1=100\text{k}, R_2=10\text{k}$) |
| **PA1** | `ADC1_IN1` | Input | $0.5–3.0\,\text{V}$ | Hydrostatic Sensor Conditioning | $4–20\,\text{mA}$ level loop signal (scaled through op-amp divider) |
| **PA2** | `USART2_TX` | Output | $3.3\,\text{V}$ | EC200U RXD (Pin 35) | AT command serial transmission (115200 8-N-1) |
| **PA3** | `USART2_RX` | Input | $3.3\,\text{V}$ | EC200U TXD (Pin 36) | AT response serial reception (Interrupt-driven ring buffer) |
| **PA4** | `GPIO_Input` | Input | $3.3\,\text{V}$ | Optical Leak Sensor | Active LOW digital leak detection probe |
| **PA9** | `USART1_TX` | Output | $3.3\,\text{V}$ | MAX3485 DI (Pin 4) | RS485 Modbus RTU transmission to coach display |
| **PA10** | `USART1_RX` | Input | $3.3\,\text{V}$ | MAX3485 RO (Pin 1) | RS485 Modbus RTU reception from coach display |
| **PA11** | `GPIO_Output` | Output | $3.3\,\text{V}$ | MAX3485 DE/~RE (Pins 2,3) | RS485 transmit/receive direction control (HIGH = TX) |
| **PB0** | `GPIO_Output` | Output | Open-Drain | EC200U PWRKEY (Pin 21) | Power pulse control (Active LOW, $500\,\text{ms}$ duration) |
| **PB1** | `GPIO_Output` | Output | Open-Drain | EC200U RESET_N (Pin 18) | Emergency hardware reset (Active LOW, $250\,\text{ms}$ duration) |
| **PB2** | `GPIO_Input` | Input | $3.3\,\text{V}$ | EC200U STATUS (Pin 20) | Modem baseband status monitor (HIGH = Operational) |
| **PB10** | `GPIO_Input` | Input | $3.3\,\text{V}$ | EC200U NET_STATUS (Pin 19) | Cellular network registration indicator |
| **PC6** | `USART6_TX` | Output | $3.3\,\text{V}$ | ESP32 U0RXD (Pin 34) | Local BLE communication bridge |
| **PC7** | `USART6_RX` | Input | $3.3\,\text{V}$ | ESP32 U0TXD (Pin 35) | Local BLE communication bridge |
| **PC13** | `GPIO_Input` | Input | Pull-Up | Tamper / Enclosure Switch | Enclosure lid intrusion detection switch |

---

## 3. Peripheral Interface Configurations

### 1. Cellular Modem Serial (USART2)
- **Baud Rate:** `115200 bps`
- **Data Bits:** `8`
- **Parity:** `None`
- **Stop Bits:** `1`
- **Flow Control:** None (Hardware RTS/CTS disabled)
- **Buffer:** Static 2048-byte circular ring buffer in STM32 SRAM

### 2. Modbus RTU Serial (USART1)
- **Baud Rate:** `9600 bps`
- **Data Bits:** `8`
- **Parity:** `None`
- **Stop Bits:** `1`
- **Direction Pin:** `PA11` (Assert HIGH during transmit, LOW for receive)
- **Slave ID:** `0x01` (Calibrated Indian Railways coach standard)

### 3. Local Maintenance BLE Serial (USART6)
- **Baud Rate:** `115200 bps`
- **Data Bits:** `8`
- **Parity:** `None`
- **Stop Bits:** `1`
- **Role:** Exclusively local diagnostic command exchange

### 4. I2C Bus Status
- **Status:** **Disabled & Deprecated**.
- **Historical Note:** The BME280 temperature/humidity sensor has been permanently removed from the active architecture. All I2C clock and data lines (`PB6`/`PB7`) are pulled to high-impedance safe state.

---

## 4. Power Supply & Decoupling Requirements

The Quectel EC200U-CN RF power amplifier produces high-current transmission bursts during LTE Cat-1 packet transmissions.

```
+12V / +24V DC Coach Rail
       │
       ▼
[TPS54302 Buck Regulator] ──> +3.8V DC Main Power Rail (3.0A Continuous, 4.0A Peak)
                                 │
                                 ├───> [100 uF Low-ESR Tantalum + 100 nF + 33 pF] ──> EC200U VBAT
                                 │
                                 ▼
                     [AMS1117-3.3 Linear LDO] ──> +3.3V DC (STM32, ESP32, RS485, Op-Amps)
```

- **Supply Voltage Tolerance:** $3.4\,\text{V}$ minimum, $3.8\,\text{V}$ nominal, $4.3\,\text{V}$ maximum.
- **Supply Droop Limit:** Under-voltage drop during $+23\,\text{dBm}$ RF bursts must remain $<200\,\text{mV}$. A drop below $3.4\,\text{V}$ triggers immediate baseband shutdown.
- **Decoupling Array:** A minimum of $1 \times 100\,\mu\text{F}$ low-ESR polymer/tantalum capacitor, $1 \times 100\,\text{nF}$ ceramic capacitor, and $1 \times 33\,\text{pF}$ ceramic capacitor must be placed within $5\,\text{mm}$ of EC200U `VBAT` pins (Pins 62, 63).
