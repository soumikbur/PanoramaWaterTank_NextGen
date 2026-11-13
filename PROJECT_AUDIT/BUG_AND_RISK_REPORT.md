# Bug and Risk Assessment Report

**Project:** Panorama Water Tank Monitor (NextGen SCADA)  
**Date:** 2026-11-14  

---

## 1. Resolved Bugs & Stability Risks

| Risk / Bug | Severity | Original Impact | Remediation Applied |
|---|---|---|---|
| **WebSocket Console Storm** | High | Uncaught network errors logged continuously every 10s from `index.js:8`. | Implemented HTTP preflight health check, exponential backoff with jitter, and max retry ceiling in `websocket.ts`. |
| **CSP Blockage on Custom Ports** | High | Blocked network requests when connecting to custom SCADA hosts. | Updated `connect-src` in `main.py` to allow `http: https: ws: wss:`. |
| **Orphaned Alerts on Clean Fleets** | Medium | Showed active alerts for non-existent trains or empty coach configs. | Added train membership check before evaluating telemetry alerts. |
| **Service Worker Insecure Protocol Rejection** | Low | Threw DOMException on `file://` or non-secure contexts. | Guarded `window.isSecureContext` in `browserNotificationBridge.ts`. |
| **Fetch Request Hangs** | Medium | Indefinite promise pending on network drop. | Added 10-second `AbortController` timeout in `client.ts`. |

---

## 2. Operational & Deployment Risks

1. **Remote Cloud Backend Inactivity:**
   - *Risk:* Upstream Render URL returns 404.
   - *Mitigation:* The preflight probe prevents browser console errors. Users should point `panorama_backend_url` to a verified live server in production.
2. **High-Fleet Memory Utilization:**
   - *Risk:* If trains exceed 500, `localStorage` synchronous JSON parsing can pause the main thread.
   - *Mitigation:* Documented in debt ledger to upgrade to IndexedDB when scaling beyond 500 trains.

