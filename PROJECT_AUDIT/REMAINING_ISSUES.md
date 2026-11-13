# Remaining Operational Issues & External Infrastructure Requirements

**Project:** Panorama Water Tank Monitor (NextGen SCADA)  
**Date:** 2026-11-14  

---

## 1. External Infrastructure Requirements

The following items relate to third-party cloud infrastructure and physical embedded devices outside the web/backend application boundary:

| External Item | Status / Finding | Action Required for Production Launch |
|---|---|---|
| **Remote Render Backend Container** | The default cloud fallback domain `https://panorama-water-tank-backend.onrender.com` currently returns `404 Not Found (no-server)` because the cloud instance is not actively deployed on Render. | Deploy the backend container to Render or a dedicated Railway SCADA virtual machine, and update the DNS record. |
| **Physical EC200U Hardware Modems** | Hardware modems transmitting telemetry must connect to the enterprise HiveMQ broker over port 1883 with assigned device UIDs matching configured train coach tanks. | Validate physical modem SIM cards and network coverage during rolling stock depot testing. |
| **Push Notification Service Worker SSL** | Native browser background push notifications require HTTPS with a valid CA certificate in production. | Deploy production frontend on an HTTPS origin with valid TLS termination. |

---

## 2. In-Code Debt Ledger & Upgrades

As documented during the audit under the Ponytail methodology:
1. **IndexedDB Migration:** When fleet registration exceeds 500 trains, transition local offline fleet storage from `localStorage` to IndexedDB for asynchronous query indexing.
2. **Persistent Audit Log Table:** If government railway compliance mandates permanent non-volatile user action audit logging, add a database-backed audit log export endpoint.

