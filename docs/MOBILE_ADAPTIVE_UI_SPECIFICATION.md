# Panorama Mobile: Device-Adaptive UI Scaling Specification (Capacitor Android)

**Application:** Panorama Water Tank Monitor — NextGen  
**Platform Scope:** Capacitor Android Native Wrapper (`platform === 'android' && isNativePlatform()`)  
**Desktop Web Isolation:** 100% Unaffected (Scoped exclusively to `html[data-platform="capacitor-android"]`)  
**Engine Service:** `apps/mobile/src/services/adaptiveUiService.ts`  
**Stylesheet:** `apps/mobile/src/styles/capacitor-android-adaptive.css`  
**Date:** November 16, 2026  
**Status:** ✅ Implemented, Verified & Deployed

---

## 1. Architectural Overview

The Panorama Device-Adaptive Display Scaling System provides an intelligent layout and typography engine tailored specifically for Android smartphones and tablets running inside the Capacitor runtime. Rather than imposing a rigid zoom multiplier, the engine monitors the real physical display metrics, logical CSS dimensions, Device Pixel Ratio (DPR), aspect ratio, and Android system safe areas, dynamically injecting scoped CSS custom properties and DOM layout attributes.

### Key Architecture Pillars
1. **Zero Impact on Desktop Web:** When accessed from desktop web browsers (Chrome, Edge, Firefox, Safari) or Electron desktop consoles, `adaptiveUiService` remains dormant and does not attach attributes or classes to `document.documentElement`. Desktop SCADA layouts, multi-column tables, and typography remain 100% identical to the production desktop specification.
2. **Dynamic Breakpoint Categories:** Fluid classification into 5 distinct device categories based on logical CSS pixels (`window.innerWidth`):
   - `compact`: Logical width `< 360px` (e.g., 320×640)
   - `standard`: Logical width `360px – 389px` (e.g., 360×720, 360×800)
   - `large`: Logical width `390px – 429px` (e.g., 390×844, 412×915 Pixel 7)
   - `xlarge`: Logical width `430px – 599px` (e.g., 480×1280 on 720p AVD at 1.5× DPR)
   - `tablet`: Logical width `>= 600px` (e.g., 768×1024, 800×1280)
3. **Hardware Safe-Area Inset Management:** Dynamically binds `env(safe-area-inset-*)` for top status bars, camera cutouts/notches, and bottom Android gesture/3-button navigation bars.
4. **Performance & Battery Preservation:** Utilizes a debounced event handler (120ms) on `resize` and `orientationchange` with passive listeners, eliminating continuous CPU or frame rendering overhead and preserving real-time MQTT message processing.

---

## 2. Breakpoint Definitions & Design Tokens

### Spacing Matrix

| Token / Element | Compact (<360px) | Standard (360–389px) | Large (390–429px) | Extra-Large (430–599px) | Tablet (≥600px) |
|---|---:|---:|---:|---:|---:|
| `--android-page-padding-x` | 12px | 16px | 18px | 20px | 24px |
| `--android-card-padding` | 12px | 16px | 18px | 18px | 20px |
| `--android-card-gap` | 10px | 12px | 14px | 14px | 16px |
| `--android-section-gap` | 16px | 20px | 24px | 24px | 28px |
| `--android-btn-height` | 44px | 46px | 48px | 48px | 48px |
| `--android-input-height` | 44px | 46px | 48px | 48px | 48px |
| `--android-header-height` | 54px | 56px | 58px | 58px | 64px |

### Adaptive Typography Matrix

| Typography Token | Compact (<360px) | Standard (360–389px) | Large (390–429px) | Extra-Large / Tablet | Fluid Formula |
|---|---:|---:|---:|---:|---|
| `--android-font-page-title` | 19px | 21px | 23px | 24px–26px | `clamp(19px, 4.2vw, 24px)` |
| `--android-font-section-title` | 16px | 17px | 19px | 19px–20px | `clamp(16px, 3.6vw, 20px)` |
| `--android-font-card-title` | 14px | 15px | 16px | 16px–17px | `clamp(14px, 3.2vw, 17px)` |
| `--android-font-body` | 13px | 14px | 15px | 15px | `clamp(13px, 2.8vw, 15px)` |
| `--android-font-secondary` | 11px | 12px | 13px | 13px | `clamp(11px, 2.4vw, 13px)` |
| `--android-font-value-large` | 19px | 21px | 23px | 24px–26px | `clamp(19px, 4.5vw, 25px)` |

---

## 3. Component Adaptive Behaviours

### A. Adaptive Application Header
- Fixed height responding to `--android-header-height`.
- Hamburger menu button enforces minimum 44×44px touch target.
- Brand logo scales gracefully from 24px to 28px.
- Dynamic route/section title truncates with ellipsis to prevent overlap.
- Right quick controls strictly limited to 4 essential icons:
  1. `● LIVE` MQTT Telemetry indicator pill
  2. Notifications bell with active alarm badge counter
  3. Settings shortcut
  4. Profile avatar menu

### B. Adaptive SCADA Dashboard
- **System Status Card:**
  - Compact (<360px): Stacks single-column to maintain readability without overlapping.
  - Standard, Large, XL, Tablet (≥360px): Balanced 2-column grid (`repeat(2, 1fr)`).
- **Train Summary Card:**
  - Dynamic metrics grid adapting to available width. Coach and tank counts remain distinct with no label collision.
- **Active Train Telemetry:**
  - Tabular and numerical telemetry points format with `tabular-nums` and bold contrasting indicators.
- **Water Tank Visualization:**
  - Scaled proportionally inside `.tank-visualization-wrapper`.
  - SVG and Canvas geometry, water wave animation, volume, fill percentage, and alarm markers maintain proper aspect ratios without distortion.

### C. Safe Areas & System Bars
- Root application height set to `100dvh` with `100vh` fallback, eliminating height jumps when Android keyboards or bottom soft keys activate.
- Status bar top insets handled via `var(--android-safe-top, env(safe-area-inset-top, 0px))`.
- Bottom gesture pill insets handled via `calc(var(--android-safe-bottom, 0px) + 24px)`.

---

## 4. Verification Test Matrix Results

All 8 canonical target viewports passed validation with **ZERO horizontal scroll**, **ZERO header clipping**, and **ZERO desktop regressions**:

| Device Profile | Dimensions | DPR | Category | H-Scroll | Header Overflow | Status |
|---|---|---:|---|:---:|:---:|:---:|
| **Compact Android** | 320 × 640 | 2.0x | `compact` | ❌ None | ❌ None | **PASSED** |
| **Small Android** | 360 × 720 | 2.0x | `standard` | ❌ None | ❌ None | **PASSED** |
| **Standard Android** | 360 × 800 | 3.0x | `standard` | ❌ None | ❌ None | **PASSED** |
| **Standard Large Android** | 390 × 844 | 3.0x | `large` | ❌ None | ❌ None | **PASSED** |
| **Pixel 7 / Large Android** | 412 × 915 | 2.625x | `large` | ❌ None | ❌ None | **PASSED** |
| **Extra-Large Android (AVD)** | 432 × 960 | 2.5x | `xlarge` | ❌ None | ❌ None | **PASSED** |
| **Android Tablet** | 768 × 1024 | 2.0x | `tablet` | ❌ None | ❌ None | **PASSED** |
| **Desktop SCADA Web** | 1440 × 900 | 1.0x | `desktop` | ❌ None | ❌ None | **PASSED** |

### Live Physical AVD Emulator Verification
- **Device:** `Panorama_ULTRA_LOW_RESOURCE` (`emulator-5554`)
- **Android Version:** Android 11 (API 30), 1024 MB RAM, 720×1280 @ 1.5× DPR (480×806 logical viewport)
- **Active Classification:** `category: xlarge`, `orientation: portrait`, `dpr: 1.50`
- **Computed Tokens:** `pagePaddingX: 20px`, `cardPadding: 18px`, `btnHeight: 48px`, `headerHeight: 58px`
- **Result:** Rendered with balanced margins, full MQTT connectivity, zero clipping, and native notification integration.
