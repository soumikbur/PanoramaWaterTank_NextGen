# 11. Network Security & Perimeter Hardening
## Panorama Water Tank Monitor (Railway Communications)

**Audit Date:** November 9, 2026  
**Perimeter Scope:** LTE Modem Ingress, Cloud CDN Edge, Internal Daemon Binding  

---

### 1. Network Boundary Segmentation

```
+-------------------------------------------------------------------------------+
|                             ZONE 1: SENSOR PERIMETER                          |
|  - Transducer current loop: 4-20mA isolated hardware signaling                |
|  - Local MCU bus: RS485 Modbus RTU (Half-Duplex) / BLE pairing               |
+---------------------------------------+---------------------------------------+
                                        |
                            Cellular APN (Private VPN)
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                             ZONE 2: CLOUD & EDGE CDN                          |
|  - Fastly / GitHub Pages Edge CDN: HTTPS with TLS 1.3                         |
|  - MQTT Broker Gateway: Port 8883/8884 TLS                                   |
+---------------------------------------+---------------------------------------+
                                        |
                             Reverse Proxy / Ingress
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                             ZONE 3: SCADA WORKSTATION                         |
|  - Backend daemon bound strictly to loopback: 127.0.0.1:8000                  |
|  - Local preview server bound to: 127.0.0.1:3001                              |
|  - Electron IPC isolated from operating system kernel                         |
+-------------------------------------------------------------------------------+
```

---

### 2. Daemon Binding & Port Exposure

1. **Loopback Address Enforcement:**
   - Both the FastAPI server (`run_server.py`) and the Vite/Node preview server (`scripts/preview.cjs`) bind explicitly to `127.0.0.1` rather than wildcard `0.0.0.0`.
   - This ensures that workstations on railway corporate LANs do not unintentionally expose the SCADA daemon to peer machines without firewall controls.
2. **Cellular APN Recommendation:**
   - In production rolling stock deployments, SIM cards in the EC200U modem must operate on a dedicated Private Access Point Name (APN) terminating in the railway datacenter VPN, completely isolating edge nodes from the public internet.
