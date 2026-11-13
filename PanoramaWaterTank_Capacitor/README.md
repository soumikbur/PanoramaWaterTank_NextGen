# Panorama Water Tank Monitor — Capacitor Android Mobile App

**Enterprise SCADA & Railway Consist Telemetry Mobile Application**  
**Package Identifier:** `com.panorama.watertankmonitor`  
**Application Name:** `Panorama Water Tank Monitor`  
**Target Platform:** Android 8.0+ (API Level 26–35)  
**Framework:** Capacitor 6 + React 18 + TypeScript + esbuild

---

## 1. Project Overview

`PanoramaWaterTank_Capacitor` is the production-grade Android mobile application for the **Panorama Water Tank Monitor** railway SCADA system. It wraps the NextGen React + TypeScript SCADA console into a native Android application using **Capacitor 6**, providing:

- **100% Feature Parity:** Real-time dual tank monitoring (Tank 1 & Tank 2), 24-coach graphical consist layouts, train fleet operations, IoT device telemetry, interactive GPS route maps with refill station intelligence, alert logs, and role-based access control (Admin & Employee).
- **Zero Mock Telemetry:** Native TLS WebSocket connection to live industrial MQTT brokers (`broker.hivemq.com:8884/mqtt` on topic `0023004D4B42501120353332`).
- **Native Android Subsystems:** Hardware status bar adaptation (`#FFFFFF` light theme with dark icons), automated splash screen dismissal, device network connectivity listeners, app lifecycle handlers (graceful MQTT reconnect on wake), and high-priority local notifications for critical water level alarms (< 10%).
- **Independent Buildability:** Built independently from the main web application (`apps/mobile/`), sharing business logic and UI components without source file duplication or cross-build contamination.
- **Unified Distribution:** Dual delivery via direct Android APK downloads (sideloadable from the web application's top navigation "Install App" button) and Google Play / enterprise MDM-ready Android App Bundles (`.aab`).

---

## 2. Directory Structure

```
PanoramaWaterTank_NextGen/
├── apps/mobile/                     # Core React + TypeScript SCADA web application
│   ├── src/
│   │   ├── components/common/
│   │   │   ├── Header.tsx           # Top navigation with dedicated "Install App" button
│   │   │   └── InstallAppModal.tsx  # Direct APK download, PWA trigger & iOS instructions
│   │   ├── services/
│   │   │   ├── nativeBridge.ts      # Zero-overhead bridge to Capacitor native plugins
│   │   │   ├── browserNotificationBridge.ts
│   │   │   └── mqttService.ts       # Unified Paho MQTT telemetry service
│   │   └── index.tsx                # App entry initializing native bridge on launch
│   └── public/downloads/            # Downloadable APK hosted for web clients
└── PanoramaWaterTank_Capacitor/     # Standalone Capacitor mobile project
    ├── android/                     # Complete native Android Studio project
    │   ├── app/
    │   │   ├── build.gradle         # Application ID, target SDK 35, dependencies
    │   │   └── src/main/
    │   │       ├── AndroidManifest.xml # Permissions (INTERNET, NOTIFICATIONS, GPS, etc.)
    │   │       └── res/             # SCADA launcher icons, splash screens & network configs
    │   ├── build.gradle             # Root Gradle build configuration
    │   ├── variables.gradle         # SDK versions: compileSdk 35, targetSdk 35, minSdk 22
    │   └── gradlew.bat              # Gradle wrapper (Gradle 8.2.1 on OpenJDK 17)
    ├── scripts/
    │   ├── build-web.cjs            # Bundles web assets from apps/mobile into www/
    │   ├── build-apk.cjs            # One-step Gradle build & artifact deployment
    │   ├── copy-apk.cjs             # Synchronizes APK to web & backend static folders
    │   └── generate-icons.ps1       # High-DPI icon & splash screen asset generator
    ├── www/                         # Bundled HTML5 assets deployed to Android WebView
    ├── capacitor.config.json        # Capacitor configuration
    ├── capacitor.config.ts          # Type-safe Capacitor configuration
    └── package.json                 # Scripts and Capacitor native dependencies
```

---

## 3. Toolchain Prerequisites

| Component | Minimum Version | Verified Host Version |
| :--- | :--- | :--- |
| **Node.js** | `v20.0.0+` | `v24.19.0` |
| **npm** | `v10.0.0+` | `11.17.0` |
| **Java JDK** | OpenJDK `17.0.0+` | Microsoft OpenJDK `17.0.10 LTS` |
| **Android SDK** | API Level 34+ | Android SDK Platform `android-35` |
| **Build-Tools** | `34.0.0` or `35.0.0` | `34.0.0` / `35.0.0` / `36.0.0` |
| **Gradle** | `8.2.1+` (via wrapper) | Gradle `8.2.1` |

---

## 4. Development & Build Commands

All commands are executed inside the `PanoramaWaterTank_Capacitor` directory:

```bash
cd PanoramaWaterTank_NextGen/PanoramaWaterTank_Capacitor
```

### 1. Build Web Assets
Compiles the React SCADA frontend targeting modern mobile WebViews and writes artifacts to `./www/`:
```bash
npm run build:web
```

### 2. Synchronize Web Assets to Android Project
Copies web assets from `www/` to Android assets and updates Capacitor plugins:
```bash
npx cap sync android
```

### 3. Build Debug APK (One-Step Build & Deploy)
Bundles web assets, syncs to Android, executes `./gradlew assembleDebug`, and deploys the APK to all website download endpoints:
```bash
npm run build:debug
```
*Output artifact:* `android/app/build/outputs/apk/debug/app-debug.apk`  
*Website download location:* `apps/mobile/public/downloads/panorama-water-tank-monitor.apk`

### 4. Build Release Android App Bundle (AAB for Google Play / MDM)
Compiles the optimized release bundle for Google Play Store or enterprise fleet distribution:
```bash
npm run build:bundle
```
*Output artifact:* `android/app/build/outputs/bundle/release/app-release.aab`

---

## 5. Native Capabilities & Subsystem Integration

### A. Status Bar Architecture
- Managed dynamically through `@capacitor/status-bar`.
- Uses a clean white background (`#FFFFFF`) with dark status bar icons (`style: 'DARK'`).
- `setOverlaysWebView: false` prevents Android system bars from clipping the SCADA header.

### B. Smooth Splash Screen
- Managed via `@capacitor/splash-screen`.
- Displays the official Panorama Railway SCADA icon centered on an industrial white background.
- Automatically fades out (`fadeOutDuration: 400ms`) once React DOM hydration completes.

### C. App Lifecycle & Background Reconnect
- Listens to `@capacitor/app` `appStateChange` events.
- When backgrounded, telemetry watchdog limits CPU wake cycles.
- When returning to the foreground (`isActive: true`), the app automatically evaluates MQTT broker reachability and resumes live WebSocket telemetry without requiring a manual page refresh.

### D. Critical Water Level Local Notifications
- Integrates `@capacitor/local-notifications`.
- Android 13+ runtime notification permissions requested seamlessly upon user login.
- When telemetry detects tank water levels below 10%, a high-priority alarm notification with audible chime and vibration pattern is issued directly to the Android notification drawer.

### E. Network Security & Local Development
- Configured in `android/app/src/main/res/xml/network_security_config.xml`.
- Strict TLS enforced for all remote traffic (HiveMQ MQTT over TLS, OSM tile servers, MapBox).
- Explicit cleartext domain exceptions allowed for `localhost`, `127.0.0.1`, and `10.0.2.2` (Android emulator host loopback) for local FastAPI backend debugging.

---

## 6. Sideloading Instructions for Railway Operators

1. Open the Panorama SCADA website in Google Chrome or any Android browser.
2. In the top navigation bar, tap the **Install App** button (blue smartphone icon).
3. Tap **Download Android APK (Direct)** to save `panorama-water-tank-monitor.apk`.
4. Open the downloaded file from Android Notifications or the **Files / Downloads** app.
5. If prompted by Android security (*"For your security, your phone is not allowed to install unknown apps"*):
   - Tap **Settings**.
   - Toggle **Allow from this source** to ON.
   - Tap the Back button.
6. Tap **Install**. Once installed, tap **Open** to launch the native SCADA console.

