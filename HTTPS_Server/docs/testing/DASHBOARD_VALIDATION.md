# HTTPS Laboratory Dashboard — Manual Validation Protocol

This document details the step-by-step verification protocol for laboratory engineers and developers validating the **HTTPS Laboratory Dashboard** locally or in staging environments.

---

## 1. Prerequisites & Startup

1. Open PowerShell and navigate to the project directory:
   ```powershell
   cd "C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\HTTPS_Server"
   ```
2. Activate the virtual environment:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```
3. Ensure `.env` is configured with a test token:
   ```ini
   ENVIRONMENT=development
   API_TOKEN=dev_secret_token_123
   PORT=8000
   HOST=127.0.0.1
   ```
4. Start the local server:
   ```powershell
   uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
   ```
5. Open a web browser to:
   ```
   http://127.0.0.1:8000/
   ```

---

## 2. Step-by-Step Validation Checklist

### Check A: Initial Page Load
- [x] The dashboard loads with title **Panorama WLI — HTTPS Laboratory**.
- [x] Clean light-mode industrial layout appears without layout shift or broken styles.
- [x] Live date/time clock in the top-right updates every second.
- [x] Protocol badge displays `HTTP (Local Development)`.

### Check B: Accurate Backend Status
- [x] Status indicator dot displays **green** with status **ONLINE**.
- [x] Backend Gateway displays **Connected (HTTP 200 OK)**.
- [x] Tracked Devices and Total Ingested reflect actual in-memory counts.
- [x] Last health probe timestamp updates every 15 seconds.

### Check C: Zero Fabricated Telemetry
- [x] On initial load before any data is sent, the device card displays **WAITING FOR DEVICE DATA**.
- [x] Primary metrics display placeholders (`—`).
- [x] Dynamic variable table displays: `Waiting for telemetry data...`.
- [x] History table displays: `No history recorded yet.`.
- [x] Raw JSON viewer displays: `{"status": "waiting_for_data"}`.
- [x] Zero fake or simulated values are shown.

### Check D: Authentication Enforcement & Token Entry
- [x] Without a token, protected routes show: **Authentication required: Enter your API Token in the toolbar above**.
- [x] Enter `dev_secret_token_123` into the token input.
- [x] Click **Show** to verify token text, click **Hide** to mask.
- [x] Click **Apply Token**. The badge updates to **Token Active (In-Memory)**.
- [x] Verify that opening Developer Tools > Application > LocalStorage / SessionStorage confirms **zero tokens stored**.

### Check E: Manual JSON POST Testing
- [x] Scroll to **Manual JSON POST Testing** panel.
- [x] The editor is pre-filled with valid sample telemetry including STM32 and EC200U attributes (`device_id: "WLI_LAB_NODE_01"`).
- [x] Click **Validate JSON** -> Alert confirms valid JSON syntax.
- [x] Click **Send POST /api/telemetry**.
- [x] Response box displays **HTTP 200**, request latency (e.g. `4ms`), and returned JSON.
- [x] The **API Communication Monitor** immediately appends a `POST /api/telemetry` row.

### Check F: Live Dynamic Variable Extraction
- [x] Live Telemetry section immediately populates:
  - Water Level: `156.4 cm`
  - Capacity Percentage: `62.5%` with progress bar filled to 62.5%
  - Transducer Voltage: `2.15 V`
  - Battery Voltage: `12.50 V`
  - Sensor Status: `NORMAL` (green tag)
  - Alarm Condition: `NORMAL` (green tag)
- [x] Dynamic extra variables (`signal_csq: 28`, `firmware_rev: STM32_2026_V1.2`) appear in the **Dynamic Firmware Variables** card grid.
- [x] The **Dynamic Telemetry Variable Table** lists all 13 attributes with their correct data types (`Float`, `Integer`, `String`, `Boolean`).
- [x] Typing into the table filter box filters rows instantly.
- [x] Clicking **Copy** on any value copies it to clipboard and displays temporary **Copied!** feedback.

### Check G: GNSS / GPS Mapping
- [x] GNSS coordinates `28.613900°, 77.209000°` appear with badge **VALID FIX**.
- [x] Clicking **Open Location in Map** opens a Google Maps tab at `https://www.google.com/maps?q=28.6139,77.209`.

### Check H: Multipart File Upload Testing
- [x] Scroll to **JSON File Upload Testing** panel.
- [x] Create or select a sample `.json` file.
- [x] The local preview box displays formatted JSON syntax.
- [x] Click **Upload Telemetry File**.
- [x] Server response displays **HTTP 200** with message `"Telemetry file ingested"`.
- [x] History and live telemetry update immediately.

### Check I: Communication History & Inspector
- [x] History table displays all ingested records with newest entries at the top.
- [x] Click **Inspect** on any record row -> Clean modal opens showing formatted JSON.
- [x] Click **&times;** or **Close** to dismiss the modal.

### Check J: Raw JSON Viewer & Export
- [x] Raw JSON pre block displays the unadulterated payload matching the backend response.
- [x] Click **Copy JSON** -> Copies JSON to clipboard with visual feedback.
- [x] Click **Download JSON** -> Triggers browser download of `telemetry_WLI_LAB_NODE_01_<timestamp>.json`.
- [x] Click **Collapse** -> Collapses viewer to compact 80px scrollable view.

### Check K: Stale Telemetry Detection
- [x] Stop sending telemetry for 60 seconds.
- [x] Device Communication card changes status to **STALE DATA**.
- [x] Alert banner appears: **Warning: Stale telemetry data. No new readings received within the active threshold window.**
- [x] The elapsed time is displayed accurately (e.g. `74s ago`).

### Check L: Server Offline & Recovery Behavior
- [x] In the terminal, terminate the Uvicorn server (`Ctrl+C`).
- [x] Within 15 seconds, the dashboard status dot changes to **red** and displays **SERVER UNAVAILABLE**.
- [x] Backend Availability displays **Offline / Unreachable**.
- [x] Restart the Uvicorn server.
- [x] On the next polling tick (or upon clicking **Re-check**), status automatically recovers to **ONLINE** (green dot).

### Check M: Responsive Mobile Viewport
- [x] Resize browser window down to 375px width (iPhone / mobile view).
- [x] Layout transitions to a clean single column.
- [x] Header and auth bar wrap vertically without overlapping.
- [x] Tables remain horizontally scrollable within their wrappers without causing whole-page horizontal scrolling.
