# Troubleshooting & Diagnostic Guide — Panorama NextGen

This guide outlines practical resolution steps for common technical issues across the frontend, backend, PostgreSQL database, MQTT transport, and Capacitor mobile application.

---

## 1. Diagnostic Matrix

### 1.1 Remote Backend Unreachable
- **Symptom**: Dashboard displays `"Save Failed: Remote backend unreachable at http://...; using cached local store"`.
- **Cause**: The frontend cannot establish a network connection to `http://127.0.0.1:8000` (desktop) or `http://10.0.2.2:8000` (Android emulator loopback).
- **Remediation**:
  1. Verify the backend daemon is running: `curl http://127.0.0.1:8000/api/v1/health`.
  2. If running on an Android Emulator, ensure the API base resolves to `10.0.2.2:8000` (handled automatically by `apiConfig.ts`).
  3. Verify `CORS_ORIGINS` in `backend/.env` permits the calling origin.

---

### 1.2 PostgreSQL Connection Failure
- **Symptom**: Backend raises `asyncpg.exceptions.CannotConnectNowError` or `ConnectionRefusedError: [Errno 111]`.
- **Cause**: PostgreSQL service is down or database credentials in `DATABASE_URL` are incorrect.
- **Remediation**:
  1. Verify PostgreSQL container or service is active: `docker ps` or `pg_isready -h localhost -p 5432`.
  2. Verify credentials in `DATABASE_URL`: `postgresql+asyncpg://<user>:<password>@localhost:5432/<dbname>`.
  3. Probe database health directly via `GET /api/v1/health/database`.

---

### 1.3 MQTT Broker Disconnected
- **Symptom**: Top navigation shows amber `Broker: Offline` pill or Raw Data Monitor displays `DISCONNECTED`.
- **Cause**: Network block on WebSocket port `8884` or TCP port `1883`, or broker outage.
- **Remediation**:
  1. Verify HiveMQ broker reachability: `curl -I https://broker.hivemq.com:8884/mqtt`.
  2. Ensure WebSocket TLS protocol (`wss://`) is allowed by local network firewalls.
  3. Check backend client logs in `backend/app/mqtt/client.py`.

---

### 1.4 Device Telemetry Not Arriving
- **Symptom**: Raw Data Monitor terminal displays `Waiting for live MQTT telemetry on topic...` without incoming packets.
- **Cause**: Edge hardware modem is off, SIM is out of data, or topic mismatch.
- **Remediation**:
  1. Confirm the exact physical device UID: verified test UID is `002F00654B42501320353332`.
  2. In the Raw Data Monitor toolbar, enter `002F00654B42501320353332` and click **Subscribe**.
  3. Verify cellular carrier link on Quectel EC200U modem status LED (NET_LIGHT blinking).

---

### 1.5 Incorrect Device UID Alignment
- **Symptom**: Telemetry frames appear in Raw Data Monitor but coach tanks remain unmapped.
- **Cause**: Device UID has extra/missing characters (e.g. `...33332` instead of `...3332`).
- **Remediation**:
  1. Navigate to **Devices** (`#/devices`).
  2. Verify the UID in the Discovered Nodes section matches `002F00654B42501320353332`.
  3. Click **Assign Consist** to bind the device to the desired train and coach.

---

### 1.6 Device Shows Offline Status on Dashboard
- **Symptom**: Coach tank cards turn gray with an `Offline` indicator.
- **Cause**: No new telemetry has arrived within the 120-second dead-man timeout window.
- **Remediation**:
  1. Check timestamp of last received packet.
  2. If sensor transmission interval is $> 120\text{s}$, increase the telemetry timeout in **Settings** (`#/settings`).
  3. When the device broadcasts new telemetry, it automatically returns to **Online**.

---

### 1.7 GPS Location Unavailable
- **Symptom**: Map marker remains at default depot coordinates or displays `GPS No Fix`.
- **Cause**: GNSS antenna is indoors or obstructed by railway coach metal roof.
- **Remediation**:
  1. Inspect the `lat` and `long` values in the Raw Data Monitor. If `(0, 0)` or `null`, the GPS receiver is searching for satellites.
  2. Relocate the external active GNSS antenna to an unobstructed window or roof mount.

---

### 1.8 Missing Environment Variables
- **Symptom**: Backend crashes on startup with `pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings`.
- **Cause**: `backend/.env` is missing required parameters (e.g. `SECRET_KEY`).
- **Remediation**:
  1. Copy `config/.env.example` to `backend/.env`.
  2. Generate a secure secret key: `python -c "import secrets; print(secrets.token_hex(32))"`.

---

### 1.9 Capacitor Android Build Failure
- **Symptom**: Gradle error `A problem occurred evaluating project ':app'. Could not find method...`.
- **Cause**: Android Gradle Plugin or JDK version mismatch.
- **Remediation**:
  1. Ensure JDK 17 or JDK 21 is configured: `java -version`.
  2. Run `npm run build` in root before syncing: `npx cap sync android`.
  3. Clean Gradle cache: `./gradlew clean`.

---

### 1.10 Mobile Notification Permission Issues
- **Symptom**: Critical low water alarms do not trigger notification shade popups.
- **Cause**: Android 13+ runtime notification permissions (`POST_NOTIFICATIONS`) not granted.
- **Remediation**:
  1. Open Android System Settings -> Apps -> **Panorama Water Tank Monitor** -> Notifications -> Allow all notifications.
  2. Ensure the `critical-water-alerts` channel has "Make sound and pop on screen" enabled.

---

### 1.11 GitHub Pages Route 404 on Refresh
- **Symptom**: Refreshing a subpage on GitHub Pages returns a 404 error.
- **Cause**: GitHub Pages does not support native SPA path rewrites.
- **Remediation**:
  1. Ensure all navigation uses hash routing (e.g. `#/devices`, `#/raw-data`, `#/alerts`).
  2. The application includes `dist/404.html` which automatically redirects path routes back into hash routes via `AppRouter.ts`.
