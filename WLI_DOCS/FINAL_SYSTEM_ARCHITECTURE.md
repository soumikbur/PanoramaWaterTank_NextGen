# Final System Architecture Specification

**Project:** Panorama Water Tank Monitor (WLI) — NextGen  
**Document:** Final System Architecture & Telemetry Pipeline  
**Version:** v2.2.0-https  
**Status:** Certified Architecture for Controlled Production Deployment  
**Date:** 2026-11-17  

---

## 1. System Overview

The Panorama Water Tank Monitor (WLI) is an industrial SCADA-grade IoT telemetry and water level monitoring system designed for railway passenger coaches. It provides real-time level measurement, alarm tripping, local diagnostics, and secure wide-area cellular telemetry transmission to a centralized cloud receiver.

```mermaid
flowchart TD
    subgraph EdgeNode ["Railway Rooftop Unit (Edge Node)"]
        Sensor["4-20mA Hydrostatic Sensor<br/>(0-150cm Head)"] -->|Analog ADC| STM32["STM32F401RE Main MCU<br/>ADC Sampling & Tank Math"]
        RS485["RS485 Modbus RTU<br/>Coach Display Unit"] <-->|Modbus Protocol| STM32
        STM32 -->|Atomic Copy (< 1 us)| TelemetryStruct["TelemetrySnapshot Buffer<br/>(Monotonic sequence_id)"]
        TelemetryStruct --> Coordinator["FreeRTOS Coordinator Task<br/>Priority: Normal"]
        Coordinator -->|UART2 (115200 8-N-1)| RingBuffer["2048-Byte Circular Ring Buffer"]
        RingBuffer --> EC200U["Quectel EC200U-CN Cat-1<br/>Cellular & GNSS Baseband"]
        ESP32["ESP32 Module<br/>(BLE Only)"] <-->|Local BLE GATT| Tablet["Technician Diagnostic Tablet"]
    end

    subgraph WideAreaNetwork ["Public Cellular & Internet Infrastructure"]
        EC200U -->|LTE Cat-1 RF (Airtel India)| Tower["Cellular Base Station (NITZ)"]
        Tower --> CarrierCore["Carrier Core Network & DNS"]
        CarrierCore --> InternetGateway["Public Internet Gateway"]
    end

    subgraph CloudPlatform ["Cloud Hosting Infrastructure (Render)"]
        InternetGateway -->|HTTPS POST (:443)| EdgeProxy["Cloudflare / Envoy Edge Proxy<br/>Let's Encrypt TLS Termination"]
        EdgeProxy -->|HTTP with ProxyHeaders| FastAPIApp["FastAPI Ingestion Server<br/>(Uvicorn 0.30.0 / Python 3.11+)"]
        FastAPIApp --> InMemStore["Thread-Safe Bounded Storage<br/>(Max 1000 History Records)"]
        InMemStore --> LabDash["HTTPS Laboratory Dashboard<br/>Dynamic Telemetry Visualizer"]
    end
```

---

## 2. Hardware Subsystem Architecture

### A. STM32 Main Controller (Core MCU)
- **Processor:** STMicroelectronics STM32F401RE (ARM Cortex-M4 @ 84MHz, 512 KB Flash, 96 KB SRAM).
- **Core Functions:** High-speed analog sampling, digital filtering, linear hydrostatic calibration, alarm state evaluation, local RS485 Modbus slave communications, and periodic telemetry snapshot packaging.
- **Independence:** The MCU operates autonomously. Sensor acquisition and local alarm tripping remain 100% active even during total cellular network loss or modem failure.

### B. Quectel EC200U-CN Cellular Subsystem (Network Gateway)
- **Module:** Quectel EC200U-CN (LTE Cat-1, single antenna, integrated GNSS/GPS).
- **Firmware Reference:** `EC200UCNAAR03A03M08`.
- **Core Functions:** SIM card interfacing, cellular network registration, carrier APN PDP context activation, DNS resolution, hardware-accelerated TLS 1.2/1.3 mutual certificate verification, authenticated HTTP POST transmission, and GNSS coordinate parsing.
- **Crypto Engine:** Offloads all public-key verification and symmetric AES-GCM crypto processing from the main STM32 MCU.

### C. ESP32 Auxiliary Subsystem (Local BLE Only)
- **Module:** Espressif ESP32-WROOM-32.
- **Dedicated Function:** Local Bluetooth Low Energy (BLE) GATT server for maintenance personnel.
- **Strict Boundary:** Completely isolated from cloud, internet, Wi-Fi, and MQTT telemetry. Never connects to wide-area networks.

### D. Sensor Interface & Conditioning Circuitry
- **Sensor:** Submersible 4–20mA hydrostatic pressure transmitter (0–5m range calibrated to 0–150cm coach overhead tank span).
- **Conditioning:** Precision $250\,\Omega$ ($0.1\%$) shunt resistor with rail-to-rail operational amplifier providing $0.500\,\text{V}$ (Empty) to $4.500\,\text{V}$ (Full) input to STM32 ADC1.
- **Safety Bounds:** Open-circuit detection ($<0.200\,\text{V}$) and short-circuit detection ($>4.850\,\text{V}$) trigger immediate hardware fault alarms.

---

## 3. Firmware Architecture & FreeRTOS Concurrency

The STM32 firmware runs on FreeRTOS with strict priority partitioning to guarantee real-time determinism:

```
┌──────────────────────┬──────────┬────────────┬────────────────────────────────────────────────────────┐
│ FreeRTOS Task        │ Priority │ Stack Size │ Role & Timing Behavior                                 │
├──────────────────────┼──────────┼────────────┼────────────────────────────────────────────────────────┤
│ SensorAcquisitionTask│ High (4) │ 512 words  │ Runs every 100ms; samples ADC, filters, trips alarms   │
│ ModbusSlaveTask      │ Med (3)  │ 384 words  │ Serves RS485 queries from in-coach passenger display   │
│ EC200UCoordinatorTask│ Norm (2) │ 768 words  │ Runs every 30-300s; manages AT commands & HTTPS POST   │
│ BleInterfaceTask     │ Low (1)  │ 256 words  │ Serves local BLE GATT characteristic updates           │
│ IdleHook / Watchdog  │ Idle (0) │ 128 words  │ Feeds hardware independent watchdog (IWDG)             │
└──────────────────────┴──────────┴────────────┴────────────────────────────────────────────────────────┘
```

### Mutex Isolation Design
To eliminate the risk of cellular network delays (which can reach 5–15 seconds in remote rural sections) starving the real-time sensor tasks:
1. `EC200UCoordinatorTask` acquires the shared telemetry mutex only long enough to perform a memory copy (`memcpy`) of the 64-byte `TelemetrySnapshot` structure.
2. The lock hold time is guaranteed to be **less than 1 microsecond**.
3. All UART transmissions, cellular waiting, and HTTP response parsing are executed on the local copy.
4. The task feeds the system watchdog before and after each network transaction.

---

## 4. Communication & Transport Security Architecture

### A. Layer-by-Layer Protocol Stack
```
┌───────────────────────────────────────────────────────────────┐
│ Layer 7: Application  │ JSON Telemetry Schema (15 fields)     │
├───────────────────────┼───────────────────────────────────────┤
│ Layer 6: Session      │ HTTP/1.1 POST with Bearer Auth Token  │
├───────────────────────┼───────────────────────────────────────┤
│ Layer 5: Security     │ TLS 1.2 / TLS 1.3 (ISRG Root X1 CA)   │
├───────────────────────┼───────────────────────────────────────┤
│ Layer 4: Transport    │ TCP Port 443 (Server Name Indication) │
├───────────────────────┼───────────────────────────────────────┤
│ Layer 3: Network      │ IPv4 via Dynamic PDP (airtelgprs.com) │
├───────────────────────┼───────────────────────────────────────┤
│ Layer 2: Data Link    │ 4G LTE Cat-1 Packet Service           │
├───────────────────────┼───────────────────────────────────────┤
│ Layer 1: Physical RF  │ FDD-LTE Band 1/3/5/8, TDD-LTE Band 40 │
└───────────────────────┴───────────────────────────────────────┘
```

### B. Hardware TLS Security Rules
- **Server Authentication:** `AT+QSSLCFG="seclevel",1,1` enforces full X.509 server certificate validation against Let's Encrypt `ISRG Root X1` (`cacert.pem`) stored in modem UFS.
- **Cipher Suites:** Enforces TLS 1.2/1.3 modern ciphers (`0xFFFF`).
- **Clock Drift Safeguard:** `AT+QSSLCFG="ignorelocaltime",1,1` prevents TLS handshake failures in cases where the local cellular tower omits NITZ time synchronization.
- **Server Name Indication (SNI):** Mandatory for Cloudflare and reverse-proxy hosts (`AT+QSSLCFG="sni",1,1`).

---

## 5. Cloud Backend & Storage Architecture

The cloud backend is deployed as an isolated Python application in `HTTPS_Server/`:
- **Framework:** FastAPI 0.115.0 on Uvicorn with ASGI architecture.
- **Reverse Proxy Support:** `ProxyHeadersMiddleware` automatically parses `X-Forwarded-Proto` and `X-Forwarded-For` from Cloudflare/Render edge proxies, avoiding internal HTTP-to-HTTPS redirect loops.
- **Gateway Security:** `limit_request_size` middleware drops any payload exceeding `MAX_UPLOAD_SIZE` (1 MB) with `HTTP 413 Payload Too Large`.
- **CORS Policy:** Restricted to explicit safe origins (`soumikbur.github.io` and localhost).
- **Storage Subsystem:** High-performance, thread-safe in-memory circular storage (`deque` bounded to `MAX_HISTORY_RECORDS=1000`). Features zero database dependencies, zero ORM overhead, and native duplicate sequence detection.

---

## 6. Dashboard Visualizer Architecture

The HTTPS Laboratory Dashboard is served directly from `GET /`:
- **Zero Token Leakage:** The dashboard HTML and JavaScript contain zero hardcoded authentication tokens. Tokens are stored exclusively in in-memory session variables entered by authorized laboratory technicians.
- **Dynamic P&ID View:** Renders arrival and departure tanks with calibrated fill levels, visual alarm thresholds, voltage readings, battery rails, and cellular signal indicators.
- **Telemetry Freshness Watchdog:** Automatically transitions readings to a yellow `"STALE"` state if no new updates arrive within the watchdog window ($>180\,\text{s}$).
- **Integrity Inspection:** Includes an interactive JSON inspector and manual JSON file upload validator for bench testing.
