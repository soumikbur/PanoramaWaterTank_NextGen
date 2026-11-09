# 10. MQTT & SCADA Protocol Security Audit
## Panorama Water Tank Monitor (Edge-to-Cloud Telemetry)

**Audit Date:** November 9, 2026  
**Target Modules:** `backend/app/mqtt/`, `apps/mobile/src/services/mqttService.ts`, ESP32 Firmware  

---

### 1. MQTT Broker & Transport Layer Security (TLS)

| Dimension | Current Development Configuration | Enterprise SCADA Production Requirement |
|---|---|---|
| **Broker Host** | `broker.hivemq.com` (Public Sandbox) | Dedicated Private Mosquitto / EMQX / HiveMQ Enterprise cluster |
| **Transport Port** | Port 1883 (Plaintext TCP) / Port 8884 (WSS) | Port 8883 (mTLS TCP) / Port 8884 (Secure WSS) |
| **Encryption** | Optional / Disabled in local `.env` | **Mandatory TLS 1.3** with certificate validation |
| **Authentication** | Anonymous (Null Username/Password) | Strong x509 Client Certificates or Token Credentials |
| **Topic Namespace** | `0023004D4B42501120353332` | Hierarchical: `railway/{division}/{train}/{coach}/telemetry` |

---

### 2. Telemetry Ingestion Attack Surface & Defenses

#### 1. Payload Spoofing & Replay Attacks
- **Risk:** In an unauthenticated public broker environment, any network observer can publish counterfeit JSON packets to topic `0023004D4B42501120353332`, tricking the HMI into displaying false water tank levels.
- **Backend Defense:** `TelemetryParser` validates packet syntax against rigorous Pydantic contracts:
  - Numerical bounds check ($0 \le \text{levelPercent} \le 100$, $0 \le \text{batteryVoltage} \le 16\text{V}$).
  - Negative anomaly detection and flag tagging.
  - Sensor fault bit validation (`flags.sensorFault`).
- **Production Recommendation:** Implement HMAC-SHA256 payload signing at the ESP32 firmware level using a pre-shared hardware key stored in secure element / eFuse.

#### 2. Reconnection Logic & Stale Data Watchdogs
- Both backend and frontend implement an exponential backoff reconnection strategy when MQTT connection drops.
- A 30-second watchdog timer automatically transitions tanks from `NORMAL` to `STALE_DATA` or `OFFLINE` if consecutive packets cease arriving, preventing operators from acting on frozen telemetry.
