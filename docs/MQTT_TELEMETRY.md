# MQTT Protocol & Hardware Telemetry Specification

The **Panorama Water Tank Monitor — NextGen** uses the **MQTT (Message Queuing Telemetry Transport)** protocol for edge-to-cloud bidirectional communication. Physical telemetry is collected by coach-mounted edge controllers and published over 4G LTE cellular links.

---

## 1. Broker Infrastructure

| Parameter | Development / Verification | Production Target |
|:---|:---|:---|
| **Broker Host** | `broker.hivemq.com` | `mqtt.panorama.railways.internal` |
| **TCP Port (Standard)** | `1883` | `1883` |
| **TLS / SSL Port** | `8883` | `8883` (mTLS) |
| **WebSocket Port (WSS)** | `8884` (`/mqtt`) | `8884` (`/mqtt`) |
| **Default QoS** | QoS 0 / QoS 1 | QoS 1 |
| **Protocol Versions** | MQTT v3.1.1 / MQTT v5.0 | MQTT v5.0 |

---

## 2. Topic Hierarchy

### 2.1 Hardware Telemetry Topics
- `002F00654B42501320353332`: Direct hardware publish topic for verified physical WLI test node.
- `002F00654B42501320353332/s`: Compressed status packet stream.
- `002F00654B42501320353332/#`: Subscribed wildcard for all sub-topics of target device.
- `panorama/telemetry/+`: Fleet-wide wildcard subscribed by the FastAPI background worker.
- `panorama/status/+`: Device online/offline carrier status heartbeat.

### 2.2 System Synchronization Topics
- `panorama/sync/events`: Global distributed mutation bus (published by transactional outbox worker).
- `panorama/central/fleet/v2`: Fleet-wide consist updates.
- `panorama/central/devices/v2`: Hardware auto-discovery and registration events.
- `panorama/central/settings/v2`: Real-time SCADA parameter and threshold updates.

---

## 3. Verified Telemetry JSON Payload Specification

The following JSON payload structure represents actual physical telemetry transmitted by the Quectel EC200U LTE Cat-1 hardware module and verified in the **Raw Data Monitor**:

```json
{
  "uid": "002F00654B42501320353332",
  "lat": 22.556949,
  "long": 88.352447,
  "speed": 0.9,
  "time": "12:20:14",
  "cm1": 0.0,
  "cm2": 0.0,
  "wlp1": 0.0,
  "wlp2": 0.0,
  "wlv1": false,
  "wlv2": false,
  "bat": 97.1,
  "temp": 25.7,
  "chno": "pano123",
  "trno": "abcd123"
}
```

### Field Definitions

| Field | Type | Unit | Description |
|:---|:---:|:---:|:---|
| `uid` | `string` | — | Unique Hardware Identifier (24-character hexadecimal factory serial). |
| `lat` | `float` | Deg | Latitude from Quectel GNSS receiver (WGS 84). |
| `long` | `float` | Deg | Longitude from Quectel GNSS receiver (WGS 84). |
| `speed` | `float` | km/h | Ground speed calculated from GNSS Doppler measurements. |
| `time` | `string` | UTC | Time of sensor acquisition (`HH:mm:ss`). |
| `cm1` | `float` | cm | Hydrostatic column water height in Primary Tank (Arrival End). |
| `cm2` | `float` | cm | Hydrostatic column water height in Secondary Tank (Departure End). |
| `wlp1` | `float` | % | Computed volume percentage in Primary Tank ($0.0 - 100.0\%$). |
| `wlp2` | `float` | % | Computed volume percentage in Secondary Tank ($0.0 - 100.0\%$). |
| `wlv1` | `boolean` | — | Valve actuation state for Tank 1 (`true` = Open, `false` = Closed). |
| `wlv2` | `boolean` | — | Valve actuation state for Tank 2 (`true` = Open, `false` = Closed). |
| `bat` | `float` | % / V | Battery charge level / voltage ($97.1 = 97.1\%$). Normalized as `battery_v1`. |
| `temp` | `float` | °C | Ambient electronics enclosure temperature from onboard sensor. |
| `chno` | `string` | — | Coach number identifier configured on edge node. |
| `trno` | `string` | — | Train number identifier configured on edge node. |

---

## 4. Reconnection & Offline Dead-Man Watchdog

1. **Client Reconnection Strategy**:
   - Paho JavaScript and Python clients utilize exponential backoff with random jitter starting at 1.0 second up to 30.0 seconds maximum.
   - Dynamic subscriptions are persisted in memory and re-registered immediately upon connection re-establishment.

2. **120-Second Stale Watchdog Engine**:
   - The SCADA status engine evaluates device link freshness:
     $$\Delta t = t_{\text{current}} - t_{\text{last\_seen}}$$
   - If $\Delta t > 120\text{ seconds}$, the device is marked **OFFLINE**, and connected tanks transition to gray/offline status on the dashboard.
   - When new telemetry arrives, the device immediately transitions back to **ONLINE**.
