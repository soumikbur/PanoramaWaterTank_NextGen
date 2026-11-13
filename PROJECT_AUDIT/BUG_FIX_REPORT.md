# Bug Fix & Technical Remediation Report

**Project:** Panorama Water Tank Monitor (NextGen SCADA)  
**Date:** 2026-11-14  

---

## Detailed Defect Log & Permanent Solutions

### Defect 1: Indefinite WebSocket Connection Error Storm
- **Observed Log:** `WebSocket connection to 'wss://panorama-water-tank-backend.onrender.com/api/v1/ws/live' failed (index.js:8)`
- **Impact:** Flooded browser developer console with hundreds of errors every 10 seconds; degraded browser performance.
- **Root Cause:** Upstream Render server returned `404 / no-server`. `scheduleReconnect()` called `new WebSocket()` without checking network or server availability.
- **Solution:** Created centralized connection manager in [websocket.ts](file:///C:/Users/soumi/OneDrive/Documents/Antigravity/PanoramaWaterTank_NextGen/apps/mobile/src/services/websocket.ts). Implemented `checkBackendHealth()` preflight HTTP probe; backoff with randomized jitter (2s-25s); max 5 retries before switching to slow 60s idle polling; network offline pause.

### Defect 2: Content Security Policy Connection Refusal
- **Observed Log:** `Refused to connect because it violates the document's Content Security Policy: "connect-src 'self' ws: wss: ..."`
- **Impact:** Prevented connecting to custom backend SCADA URLs or alternate local development ports.
- **Root Cause:** `main.py` restricted HTTP `connect-src` to `'self'`.
- **Solution:** Updated CSP in [main.py](file:///C:/Users/soumi/OneDrive/Documents/Antigravity/PanoramaWaterTank_NextGen/backend/app/main.py) to `connect-src 'self' ws: wss: http: https: https://broker.hivemq.com:8884 https://industrial.api.ubidots.com;`.

### Defect 3: Service Worker DOMException in Insecure Contexts
- **Observed Log:** `[BrowserNotification] Service Worker registration skipped/failed: DOMException: Failed to register a ServiceWorker: The URL protocol of the current origin ('file:') is not supported.`
- **Impact:** Threw DOMException error during Electron tests or when loading from local file assets.
- **Root Cause:** Invoked `navigator.serviceWorker.register()` without verifying `window.isSecureContext` or whether protocol was `file:`.
- **Solution:** Added protocol and secure context checks in [browserNotificationBridge.ts](file:///C:/Users/soumi/OneDrive/Documents/Antigravity/PanoramaWaterTank_NextGen/apps/mobile/src/services/browserNotificationBridge.ts).

### Defect 4: Missing Request Timeout & Network Exception Handling
- **Observed Log:** `fetchRegionsSummary failed: TypeError: Failed to fetch`
- **Impact:** Component fetch promises hung indefinitely when server was slow, or threw unhandled rejections on network drops.
- **Root Cause:** `ApiClient.request` lacked an `AbortController` timeout.
- **Solution:** Injected 10-second `AbortController` timeout and clean error abstraction in [client.ts](file:///C:/Users/soumi/OneDrive/Documents/Antigravity/PanoramaWaterTank_NextGen/apps/mobile/src/api/client.ts).

### Defect 5: Phantom / Orphaned Alerts for Unconfigured Trains
- **Observed Log:** Active alerts persisted for trains that were never configured or had 0 coaches.
- **Impact:** Displayed misleading critical alerts to technicians when no trains were active.
- **Root Cause:** Alert evaluation engine did not verify train existence against configured train set before evaluating telemetry.
- **Solution:** Added strict membership verification in [AppContext.tsx](file:///C:/Users/soumi/OneDrive/Documents/Antigravity/PanoramaWaterTank_NextGen/apps/mobile/src/state/AppContext.tsx) and [alertNotificationService.ts](file:///C:/Users/soumi/OneDrive/Documents/Antigravity/PanoramaWaterTank_NextGen/apps/mobile/src/services/alertNotificationService.ts).

