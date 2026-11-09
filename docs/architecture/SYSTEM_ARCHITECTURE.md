# Panorama Water Tank Monitor — System Architecture Specification
## Industrial SCADA & IoT Telemetry Architecture for Railway Rolling Stock

**Document Version:** 2.0.0  
**Target Environment:** Railway Rolling Stock Monitoring & Operations Control Center (OCC)  
**Classification:** Engineering Specification  

---

### 1. High-Level Architectural Topology

The Panorama Water Tank Monitor (WLI) is designed as a distributed, resilient Industrial IoT SCADA platform:

```mermaid
flowchart TD
    subgraph EDGE_LAYER ["Rolling Stock Edge Hardware"]
        Sensor[Hydrostatic Sensor<br/>4-20mA Current Loop]
        MCU[ESP32-S3 Microcontroller<br/>Dual-Core Xtensa LX7]
        Modem[Quectel EC200U LTE Cat-1<br/>Cellular Gateway]
        Sensor -->|Analog Level Signal| MCU
        MCU -->|UART AT Command Pipeline| Modem
    end

    subgraph INGESTION_LAYER ["Telemetry Broker & Ingestion Gateway"]
        Broker[MQTT Message Broker<br/>Mosquitto / HiveMQ Port 8883/8884]
        Modem -->|Cellular MQTT Publish| Broker
    end

    subgraph BACKEND_LAYER ["FastAPI SCADA Daemon Services"]
        MqttWorker[MQTT Ingestion Background Service]
        CalcEngine[Volume & Capacity Engine]
        AlarmEngine[SCADA Alarm Evaluator]
        WsHub[WebSocket Telemetry Hub]
        RestApi[FastAPI REST API v1]
        DB[(PostgreSQL / SQLite<br/>Time-Series & State)]

        Broker -->|Subscribe: panorama/telemetry/+| MqttWorker
        MqttWorker --> CalcEngine
        CalcEngine --> AlarmEngine
        AlarmEngine --> DB
        AlarmEngine --> WsHub
        RestApi --> DB
    end

    subgraph OPERATOR_LAYER ["Responsive Operator HMI Workstations"]
        DesktopHMI[Desktop SCADA Console<br/>1920x1080 / 1366x768]
        MobileHMI[Mobile SCADA HMI<br/>Android / iOS Viewports]
        ElectronApp[Electron Desktop Shell<br/>Supervised Native App]

        WsHub -.->|Live Push (Sub-Second)| DesktopHMI
        WsHub -.->|Live Push| MobileHMI
        RestApi <---> DesktopHMI
        RestApi <---> MobileHMI
        RestApi <---> ElectronApp
    end
```

---

### 2. Component Subsystems & Responsibilities

#### 2.1 Edge Transducer & Embedded Controller
- **Hydrostatic Sensor:** Measures water head pressure at the bottom of the coach tank. Operates across a calibrated 4–20 mA current loop resistant to electrical noise and voltage drop along 25-meter coach wiring harnesses.
- **ESP32-S3 Controller:** Performs 12-bit ADC sampling, digital low-pass filtering, and polynomial hydrostatic height conversion. Formats telemetry into compact JSON contracts.
- **Quectel EC200U LTE Modem:** Maintains cellular data session on railway-grade SIMs, auto-reconnecting on signal loss through tunnels and rural corridors.

#### 2.2 Broker & Communication Backbone
- **Protocol:** MQTT 3.1.1 / 5.0 with QoS 1.
- **Topic Hierarchy:** `panorama/telemetry/{device_uid}` and `panorama/commands/{device_uid}`.
- **Keep-Alive & Watchdogs:** 45-second MQTT keep-alive with client-side 120-second telemetry staleness watchdog.

#### 2.3 Backend SCADA Services (`backend/app/`)
- **FastAPI Core:** Non-blocking async I/O handling concurrent REST requests and WebSocket telemetry broadcasts.
- **Volume & Fluid Calculation Engine:** Computes vessel geometry, volume in litres, fill percentage, and 4-tier capacity ranks (`FULL`, `ADEQUATE`, `LOW`, `CRITICAL`).
- **Alarm Evaluation Engine:** Assesses critical low water thresholds (< 10%), warning thresholds (< 20%), overflow (> 100%), and sensor circuit faults.

#### 2.4 Responsive Operator HMI (`apps/mobile/`)
- **Unified Codebase:** Built on React 18, React Native Web, and Vite, delivering seamless layouts across desktop workstations and mobile handhelds without code duplication.
- **Fluid Physics:** 60 FPS animated SVG dual sine waves illustrating realistic water surge and slosh.
- **Offline & Fault Tolerance:** Detects connection degradation and highlights stale or disconnected tanks with visual status badges.
