# Panorama Water Tank Monitor — MQTT Architecture & Telemetry Contracts

---

### 1. Topic Hierarchy & Namespace Design

```
panorama/
├── telemetry/
│   └── {device_uid}           # Published by Edge Nodes (QoS 1)
├── commands/
│   └── {device_uid}           # Subscribed by Edge Nodes (QoS 1)
├── status/
│   └── {device_uid}           # LWT (Last Will & Testament) Presence (QoS 1, Retain)
└── broadcast/
    └── emergency              # Broadcast Fleet Alerts
```

---

### 2. Edge Telemetry Contract Payload (JSON)

Standard payload published by edge hardware nodes every 30–90 seconds:

```json
{
  "uid": "0023004D4B42501120353332",
  "trainNumber": "225256",
  "coachNumber": "B4",
  "timestamp": "2026-11-09T06:30:00Z",
  "levelPercent": 84.5,
  "volumeLiters": 16.9,
  "heightCm": 42.3,
  "batteryV1": 12.8,
  "auxiliaryV2": 3.28,
  "temperatureC": 26.4,
  "humidityPercent": 61.2,
  "pressureHpa": 1012.8,
  "gps": {
    "latitude": 22.5839,
    "longitude": 88.3426,
    "altitudeMeters": 14.5,
    "speedKmh": 78.4,
    "satellites": 9
  },
  "flags": {
    "sensorValid": true,
    "overflow": false,
    "batteryLow": false
  }
}
```

---

### 3. Edge Staleness & Watchdog Architecture

- **Nominal Sampling Interval:** 30 seconds (active rail transit) to 90 seconds (depot standby).
- **Backend Staleness Watchdog:** 30.0 seconds. Any tank without fresh telemetry within 30 seconds transitions to `STALE_DATA`.
- **HMI Connectivity Timeout:** Configurable 120 seconds. Tanks exceeding this threshold without new packets transition automatically to `OFFLINE`.
