# Panorama Water Tank Monitor — MQTT Protocol & Ingestion Specification

This document defines the formal MQTT communication specification for the NextGen Panorama Water Tank Monitor. It replaces the legacy Ubidots platform with a private, authenticated, TLS 1.2+ encrypted message bus.

---

## 1. Network & Connection Parameters

| Parameter | Specification | Default Production Value |
| :--- | :--- | :--- |
| **Protocol** | MQTT v3.1.1 / v5.0 | MQTT v3.1.1 (Standard IoT) |
| **Transport** | TCP over TLS 1.2+ | Encrypted TLS |
| **Port** | 8883 (Standard MQTTS) | `8883` |
| **Broker Host** | Configurable via `.env` | `broker.hivemq.com` or local `mosquitto` |
| **Authentication** | Username / Password or mTLS | Basic Credential Auth / Client Cert |
| **Client ID Format** | Edge: `edge-{deviceId}`<br/>Backend: `backend-worker-{workerId}` | `edge-0026004D4B42501120353332` |
| **Keepalive** | 30 to 60 seconds | `45 seconds` |
| **Clean Session** | `false` (Persistent session for Edge) | `false` |

---

## 2. Topic Namespace Hierarchy

```
panorama/
  |-- telemetry/
  |     +-- {deviceId}             --> Edge PUBLISH (QoS 1)
  |-- status/
  |     +-- {deviceId}             --> LWT / Online State (QoS 1, Retained)
  |-- commands/
  |     +-- {deviceId}             --> Backend PUBLISH / Edge SUBSCRIBE (QoS 1)
  |-- config/
  |     +-- {deviceId}             --> Backend PUBLISH / Edge SUBSCRIBE (QoS 1, Retained)
  +-- diagnostics/
        +-- {deviceId}             --> Edge PUBLISH on request (QoS 0)
```

---

## 3. Telemetry Payload Specification

### 3.1 Topic: `panorama/telemetry/{deviceId}`
- **Publisher**: Edge Microcontroller (ESP32-S3 via EC200U modem)
- **Subscriber**: FastAPI MQTT Ingestion Engine
- **QoS**: `1` (At least once delivery)
- **Retained**: `false`

#### JSON Schema:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PanoramaTelemetryPayload",
  "type": "object",
  "required": ["uid", "trno", "chno", "wlp1", "wlvl", "dt"],
  "properties": {
    "uid": {
      "type": "string",
      "description": "Unique device identifier (IMEI / Hardware UUID)",
      "pattern": "^[0-9A-Fa-f]{16,32}$",
      "example": "0026004D4B42501120353332"
    },
    "trno": {
      "type": "string",
      "description": "Indian Railways Train Number",
      "example": "12002"
    },
    "chno": {
      "type": "string",
      "description": "Coach Identification Code",
      "example": "B4"
    },
    "wlp1": {
      "type": "number",
      "description": "Primary water tank level percentage (unclamped for overflow)",
      "minimum": 0.0,
      "maximum": 120.0,
      "example": 76.5
    },
    "wlp2": {
      "type": "number",
      "description": "Secondary water tank level percentage",
      "minimum": 0.0,
      "maximum": 120.0,
      "example": 74.8
    },
    "wlvl": {
      "type": "boolean",
      "description": "Primary sensor validity flag (true = valid, false = fault)",
      "example": true
    },
    "wlv2": {
      "type": "boolean",
      "description": "Secondary sensor validity flag",
      "example": true
    },
    "lat": {
      "type": "number",
      "description": "GPS Latitude in decimal degrees",
      "minimum": -90.0,
      "maximum": 90.0,
      "example": 28.6139
    },
    "long": {
      "type": "number",
      "description": "GPS Longitude in decimal degrees",
      "minimum": -180.0,
      "maximum": 180.0,
      "example": 77.2090
    },
    "alt": {
      "type": "number",
      "description": "GPS Altitude above sea level in meters",
      "example": 216.5
    },
    "speed": {
      "type": "number",
      "description": "GPS Ground speed in km/h",
      "minimum": 0.0,
      "example": 64.2
    },
    "sats": {
      "type": "integer",
      "description": "Number of tracked GPS satellites",
      "minimum": 0,
      "maximum": 36,
      "example": 8
    },
    "v1": {
      "type": "number",
      "description": "Primary power bus / battery voltage",
      "minimum": 0.0,
      "maximum": 36.0,
      "example": 12.65
    },
    "v2": {
      "type": "number",
      "description": "Auxiliary sensor supply voltage",
      "minimum": 0.0,
      "maximum": 36.0,
      "example": 12.58
    },
    "dt": {
      "type": "string",
      "format": "date-time",
      "description": "UTC ISO-8601 edge sample timestamp",
      "example": "2026-10-28T12:00:00Z"
    }
  }
}
```

---

## 4. Lifecycle & Last Will and Testament (LWT)

### 4.1 Topic: `panorama/status/{deviceId}`
- **QoS**: `1`
- **Retained**: `true`
- **LWT Configuration** (registered upon CONNECT):
```json
{
  "uid": "0026004D4B42501120353332",
  "status": "OFFLINE",
  "timestamp": "2026-10-28T12:05:00Z",
  "reason": "CONNECTION_LOST"
}
```
- **Online Announcement** (published immediately after successful CONNECT):
```json
{
  "uid": "0026004D4B42501120353332",
  "status": "ONLINE",
  "firmware": "2.0.0",
  "timestamp": "2026-10-28T12:00:00Z"
}
```

---

## 5. Downlink Commands Specification

### 5.1 Topic: `panorama/commands/{deviceId}`
- **Publisher**: Backend REST API or Administrator
- **Subscriber**: Edge Node
- **QoS**: `1`

#### Example Payload: Request Immediate Sensor Calibrate / Flush
```json
{
  "command": "REBOOT_MODEM",
  "commandId": "cmd-89e4-4fa9-b883",
  "parameters": {
    "delaySeconds": 5
  },
  "timestamp": "2026-10-28T12:10:00Z"
}
```

---

## 6. Quectel EC200U AT Command Sequence for Firmware Migration

This reference outlines the exact AT commands required on the EC200U cellular modem to connect to the NextGen TLS MQTT broker without Ubidots:

```text
// 1. Configure SSL Context 1 to use TLS 1.2
AT+QSSLCFG="sslversion",1,4
AT+QSSLCFG="ciphersuite",1,0xFFFF
AT+QSSLCFG="seclevel",1,0

// 2. Configure MQTT SSL mode
AT+QMTCFG="ssl",0,1,1

// 3. Set Last Will and Testament
AT+QMTCFG="will",0,1,1,1,"panorama/status/0026004D4B42501120353332","{\"status\":\"OFFLINE\"}"

// 4. Open Network Session to Secure Broker
AT+QMTOPEN=0,"broker.hivemq.com",8883
// Wait for +QMTOPEN: 0,0

// 5. Connect to Broker with Client ID and Credentials
AT+QMTCONN=0,"edge-0026004D4B42501120353332","username","password"
// Wait for +QMTCONN: 0,0

// 6. Publish Telemetry Frame
AT+QMTPUB=0,0,1,0,"panorama/telemetry/0026004D4B42501120353332"
> {"uid":"0026004D4B42501120353332","trno":"12002","chno":"B4","wlp1":76.5,"wlvl":true,"dt":"2026-10-28T12:00:00Z"}^Z
// Wait for +QMTPUB: 0,0,0
```

