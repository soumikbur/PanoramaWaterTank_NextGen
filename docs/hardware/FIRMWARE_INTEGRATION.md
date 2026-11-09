# Panorama Water Tank Monitor — Firmware Integration Guide
## ESP-IDF / FreeRTOS Edge Firmware Architecture

---

### 1. FreeRTOS Task Architecture

The edge firmware operates under FreeRTOS with partitioned real-time tasks:

1. **`sensor_task` (Priority: High, Core 1):**
   - Samples hydrostatic ADC and reads BME280 every 1.0 second.
   - Applies median filtering and moving average smoothing across 10 samples to eliminate slosh-induced reading spikes.
2. **`telemetry_task` (Priority: Medium, Core 0):**
   - Formats JSON telemetry contract payload.
   - Enqueues packets to the LTE transmission queue.
3. **`lte_worker_task` (Priority: Normal, Core 0):**
   - Manages Quectel EC200U AT command state machine.
   - Handles network registration (`+CREG`), PDP context activation (`+QIACT`), and MQTT socket sessions (`+QMTPUB`).
4. **`watchdog_task` (Priority: Highest, Core 1):**
   - Hardware Task Watchdog Timer (TWDT) supervising sensor and LTE tasks with 30-second panic timeout.

---

### 2. Quectel EC200U AT Command Sequence

```ini
; 1. Verify cellular network registration
AT+CPIN?
AT+CREG?
AT+CGATT?

; 2. Configure APN (Private Railway APN)
AT+QICSGP=1,1,"railway.iot.apn","",""
AT+QIACT=1

; 3. Open MQTT TLS Socket (Port 8883)
AT+QMTCFG="ssl",0,1,2
AT+QMTOPEN=0,"mqtt.scada.railways.internal",8883

; 4. Connect with Client Credentials
AT+QMTCONN=0,"wli-edge-0023004D","scada_edge","StrongEdgeSecret!"

; 5. Publish Telemetry Payload
AT+QMTPUB=0,1,1,0,"panorama/telemetry/0023004D4B42501120353332"
> {"uid":"0023004D4B42501120353332","levelPercent":84.5,...}
```
