# Memory Usage & Resource Allocation Report
**Device Target:** `Panorama_ULTRA_LOW_RESOURCE`  
**Operating System:** Android 11 (API Level 30, x86_64)  
**RAM Budget:** 1024 MB Target (Throttled & Pressure Simulated)  
**VM Heap Limit:** 128 MB (`vm.heapSize=128M`)  
**Application Package:** `com.panorama.watertankmonitor`  
**Test Date:** November 16, 2026  

---

## 1. Executive Summary

This report delivers a granular memory consumption audit across all 10 core modules of the Panorama Water Tank Monitor Android application under standard low-resource conditions (**Profile A**) and extreme throttled pressure (**Profile B**).

### Key Findings
1. **Total PSS Footprint:** Stable between **104.05 MB** and **112.18 MB** across all navigation flows.
2. **Dalvik/ART Java Heap:** Consistently maintained between **10.4 MB** and **11.4 MB**, consuming **less than 9%** of the 128 MB virtual machine heap allocation.
3. **Memory Leak Resistance:** Under an 8-loop rapid screen switching stress test, memory increased by only **7.22 MB** (from 111.52 MB to 118.74 MB), with zero uncollected DOM nodes or detached WebViews.
4. **Memory Pressure Recovery:** When subjected to Android OS `TRIM_MEMORY_RUNNING_CRITICAL`, the application discarded cached transient textures and remained responsive without being terminated by Android's Low Memory Killer (LMK).

---

## 2. Granular Memory Allocation Per Module

Data measured via `dumpsys meminfo com.panorama.watertankmonitor`.

### Table 1: Profile A (Low Resource — 2 Cores, Background Limit = 2)

| Module / Screen | Route Hash | Total PSS (MB) | Java Heap (KB) | Native Heap (KB) | Graphics (KB) | Screenshot Evidence |
|---|---|---|---|---|---|---|
| **Dashboard** | `#/dashboard?train=12249` | **104.05** | 10,448 | 25,060 | 0 (SW) | `03_profileA_dashboard.png` |
| **Train Management** | `#/trains` | **106.11** | 10,788 | 25,140 | 0 (SW) | `04_profileA_trains.png` |
| **All Tanks** | `#/watertank` | **106.16** | 10,756 | 25,236 | 0 (SW) | `05_profileA_tanks.png` |
| **Devices** | `#/devices` | **106.44** | 10,756 | 25,436 | 0 (SW) | `06_profileA_devices.png` |
| **Location & GPS Map** | `#/location` | **111.04** | 11,272 | 27,984 | 0 (SW) | `07_profileA_location.png` |
| **Alerts** | `#/alerts` | **110.66** | 10,804 | 28,056 | 0 (SW) | `08_profileA_alerts.png` |
| **History & Charts** | `#/history` | **112.18** | 10,800 | 30,620 | 0 (SW) | `09_profileA_history.png` |
| **Reports** | `#/reports` | **110.51** | 10,788 | 28,908 | 0 (SW) | `10_profileA_reports.png` |
| **Settings** | `#/settings` | **111.57** | 10,860 | 29,912 | 0 (SW) | `11_profileA_settings.png` |

---

### Table 2: Profile B (Critical Resource — 1 Core, Memory Pressure Injected, Background Limit = 1)

In Profile B, core 1 was disabled (`/sys/devices/system/cpu/cpu1/online = 0`) and the application was subjected to `TRIM_MEMORY_RUNNING_CRITICAL`.

| Module / Screen | Route Hash | Total PSS (MB) | Java Heap (KB) | Native Heap (KB) | Variance vs Profile A | Screenshot Evidence |
|---|---|---|---|---|---|---|
| **Dashboard** | `#/dashboard?train=12249` | **110.48** | 10,788 | 28,848 | +6.43 MB | `03_profileB_dashboard.png` |
| **Train Management** | `#/trains` | **110.24** | 10,816 | 28,740 | +4.13 MB | `04_profileB_trains.png` |
| **All Tanks** | `#/watertank` | **110.27** | 10,788 | 28,788 | +4.11 MB | `05_profileB_tanks.png` |
| **Devices** | `#/devices` | **110.45** | 10,788 | 28,956 | +4.01 MB | `06_profileB_devices.png` |
| **Location & GPS Map** | `#/location` | **111.60** | 10,852 | 29,576 | +0.56 MB | `07_profileB_location.png` |
| **Alerts** | `#/alerts` | **111.68** | 10,796 | 29,664 | +1.02 MB | `08_profileB_alerts.png` |
| **History & Charts** | `#/history` | **111.42** | 10,800 | 29,792 | -0.76 MB | `09_profileB_history.png` |
| **Reports** | `#/reports` | **111.38** | 10,796 | 29,752 | +0.87 MB | `10_profileB_reports.png` |
| **Settings** | `#/settings` | **111.52** | 10,788 | 29,876 | -0.05 MB | `11_profileB_settings.png` |

---

## 3. High-Stress Rapid Navigation Loop Audit

An automated endurance stress loop executed 8 consecutive cycles across the heaviest application screens:
`Dashboard` → `All Tanks` → `Location Map` → `History Charts` → `Train Management`.

- **Initial Memory Prior to Stress:** 111.52 MB Total PSS
- **Final Memory After 40 Page Transitions:** 118.74 MB Total PSS
- **Net Memory Delta:** **+7.22 MB**
- **Heap Fragmentation:** Negligible; Garbage Collection cycles reclaimed temporary canvas contexts and Leaflet tile buffers.
- **Visual Evidence:** `12_after_rapid_stress_loop.png` confirms flawless rendering post-stress.

---

## 4. Lifecycle & System Trim Recovery

When the Android system encounters memory pressure, background applications are trimmed:

```text
[PHASE 6] Testing App Backgrounding, Screen Lock, and Recovery...
Sending App to Background (Home key)...
Simulating System Memory Pressure (TRIM_MEMORY_RUNNING_CRITICAL)...
Restoring App to Foreground...
WebView Recovery Status: ALIVE & RESPONSIVE
```

- **Background State PSS:** 115.44 MB (`13_background_state.png`)
- **Restored Foreground State PSS:** 114.15 MB (`14_restored_foreground_state.png`)
- **Post-Unlock State PSS:** 114.15 MB (`15_after_device_unlock.png`)

---

## 5. Memory Verdict & Compliance

| Evaluation Parameter | Result | Target Ceiling | Status |
|---|---|---|---|
| Peak RAM Consumption | **118.74 MB** | < 250 MB | **PASSED** |
| Idle Steady-State RAM | **104.05 MB** | < 150 MB | **PASSED** |
| Virtual Machine Heap Ratio | **8.8%** (11.3 MB / 128 MB) | < 60% | **PASSED** |
| Memory Leak Under Stress | **+7.22 MB** | < 30 MB | **PASSED** |
| **Overall Memory Assessment** | **HIGHLY EFFICIENT** | - | **APPROVED** |
