# UI Reference & Visual Design Specification: Train Management Dashboard

**Application**: Panorama Water Tank Monitor (NextGen SCADA Architecture)  
**Page**: Train Management (Railway Fleet Operations & Consist Management)  
**Reference Asset**: Industrial Desktop SCADA (1424 × 749, High-DPI Pass-Through)  
**Date**: October 30, 2026  
**Status**: 100% Implemented & Live Runtime Verified  

---

## 1. Visual Hierarchy & Window Composition

The Train Management interface adheres to a clean, high-contrast industrial light theme partitioned into three distinct visual zones:

```text
+-------------------------------------------------------------------------------------------------------------------------------+
| TOP HEADER (Height 72px, Surface #FFFFFF, Border-Bottom #E2E8F0)                                                               |
| [Logo] [Home]  [Train Management | Railway Fleet Operations & Consist Management]  [Search...]  [ADMIN] [ONLINE] [⚙] [Logout] [Clock]|
+-----------------------+-------------------------------------------------------------------------------------------------------+
| LEFT SIDEBAR          | MAIN CONTENT CANVAS (Surface #F8FAFC, Padding 18px)                                                   |
| (Width 224px,         |                                                                                                       |
|  Surface #FFFFFF,     | +---------------------------------------------------------------------------------------------------+ |
|  Border-Right #E2E8F0)| | Top Breadcrumb & Action Header (Height 46px, Surface #FFFFFF, Border #E2E8F0)                      | |
|                       | | [🚆 Train Management]       [REGIONS (Active / Reset)]                       [+ Add Train (Blue)] | |
| [Branding: PANORAMA]  | +---------------------------------------------------------------------------------------------------+ |
|                       |                                                                                                       |
| [Train Summary Card]  | RAILWAY REGIONS                                                                                       |
| - Train ID & Name     | Select a railway region to inspect and configure its assigned train consists                          |
| - Region: E. Railway  |                                                                                                       |
| - Coaches: 1          | +-------------------------+ +-------------------------+ +-------------------------+                  |
| - Tanks: 1            | | NORTH                   | | SOUTH                   | | EAST                    |                  |
| - Online: 1           | | 0 Configured Trains     | | 0 Configured Trains     | | 1 Configured Trains     |                  |
| - Offline: 0          | | ----------------------- | | ----------------------- | | ----------------------- |                  |
| - Alerts: 0           | | Coaches: 0   Tanks: 0   | | Coaches: 0   Tanks: 0   | | Coaches: 1   Tanks: 1   |                  |
|                       | | Online Trains: 0        | | Online Trains: 0        | | Online Trains: 1        |                  |
| [Navigation: 7 Main]  | | View Trains in Region → | | View Trains in Region → | | View Trains in Region → |                  |
| 1. Train Management*  | | Status: [All Normal]    | | Status: [All Normal]    | | Status: [All Normal]    |                  |
| 2. All Tanks          | +-------------------------+ +-------------------------+ +-------------------------+                  |
| 3. Devices            |                                                                                                       |
| 4. Location           | +-------------------------+                                                                           |
| 5. Alerts             | | WEST                    |                                                                           |
| 6. History            | | 0 Configured Trains     |                                                                           |
| 7. Reports            | | ----------------------- |                                                                           |
|                       | | Coaches: 0   Tanks: 0   |                                                                           |
| [Navigation: 4 System]| | Online Trains: 0        |                                                                           |
| - Settings, Config,   | | View Trains in Region → |                                                                           |
|   Users, Logs         | | Status: [All Normal]    |                                                                           |
|                       | +-------------------------+                                                                           |
| [System Status Card]  |                                                                                                       |
| [Collapse Navigation] |                                                                                                       |
| [Copyright 2026]      |                                                                                                       |
+-----------------------+-------------------------------------------------------------------------------------------------------+
```

---

## 2. Design Tokens & Visual Specifications

### 2.1 Color Tokens
- **Canvas Background**: `#F8FAFC` (Cool Slate Canvas)
- **Chrome Surfaces (Sidebar & Header)**: `#FFFFFF` (Pure White) with 1px border `#E2E8F0`
- **Primary Action Accent**: `#2563EB` (Industrial Royal Blue)
- **Primary Hover / Pressed**: `#1D4ED8` (Hover) / `#1E40AF` (Pressed)
- **Primary Surface**: `#EFF6FF` (Subtle Ice Blue) with border `#BFDBFE`
- **Status Indicators & Badges**:
  - `All Normal` / `Online`: `#16A34A` (Emerald Green) | Surface: `#ECFDF5` | Border: `#DCFCE7`
  - `Warning`: `#D97706` (Amber Orange) | Surface: `#FEF3C7` | Border: `#FDE68A`
  - `Critical`: `#DC2626` (Crimson Red) | Surface: `#FEE2E2` | Border: `#FCA5A5`
  - `Offline` / `Unassigned`: `#64748B` (Slate Neutral) | Surface: `#F1F5F9` | Border: `#E2E8F0`
- **Typography Colors**:
  - Primary Headers & Labels: `#0F172A` / `#1E293B`
  - Secondary Readouts & Counts: `#64748B`
  - Muted Placeholders: `#94A3B8`

### 2.2 Typography Scale (Inter Font Family)
- **Page Header**: 16px / SemiBold (Weight 600)
- **Page Subtitle**: 11px / Regular (Weight 400)
- **Section Title**: 18px / Bold (Weight 700)
- **Card Region Name**: 15px / Bold (Weight 700)
- **Metric Big Digits**: 16px / Bold (Weight 700)
- **Metric Labels**: 10px / Medium (Weight 500)
- **Breadcrumb / Action Links**: 12px / Bold (Weight 700)
- **Status Badges**: 10px / Bold (Weight 700)

---

## 3. Structural Component Breakdown

### 3.1 Left Navigation Sidebar (`Sidebar.qml`)
- **Width**: Fixed 224px (collapsible to 68px).
- **Brand Header**: Vector water drop icon in `#EFF6FF` box, "PANORAMA" bold title, "Water Tank Monitor" subtitle.
- **Train Summary Card**:
  - Displays real-time context: `12301 · Rajdhani Express` (Eastern Railway).
  - 2×2 metric grid: Coaches (1), Tanks (1), Online (1), Offline (0).
  - Alerts row: `0` (or active alarm count).
- **Primary Navigation**: 7 items (Train Management highlighted with active blue bar and `#EFF6FF` fill).
- **System Navigation**: 4 items (Settings, Configuration, Users, Logs) guarded by RBAC permissions.
- **System Status Card**: Real-time cloud connectivity readout (`HiveMQ MQTT TLS Connected`).
- **Collapse Control**: Interactive toggle button beneath system status.

### 3.2 Top Header (`Header.qml`)
- **Dimensions**: Full width, 72px height, 1px bottom border `#E2E8F0`.
- **Navigation Controls**: Panorama emblem, Home button (`🏠`).
- **Titles**: `Train Management` (Primary) + `Railway Fleet Operations & Consist Management` (Subtitle).
- **Global Search**: Center debounced search input with placeholder: `Search trains, coaches, tanks, locations...`.
- **Access & System Status**:
  - `[ADMIN]` / `[OPERATOR]` RBAC badge.
  - `[ONLINE]` connection pill with pulsating status indicator.
  - Settings shortcut icon (`⚙`).
  - `[Logout]` action button.
  - Dynamic live clock (`h:mm:ss AP`) and date (`dd MMMM yyyy`) timer.

### 3.3 Main Content Area (`TrainManagementPage.qml`)
- **Top Bar**:
  - Level 1-4 interactive breadcrumb (`Train Management / Eastern Railway / 12301 / Coach B1`).
  - Action button: `REGIONS` (navigates/resets to 4-region overview from any drill-down level).
  - Action button: `+ Add Train` (opens modal dialog).
- **Section Header**:
  - `RAILWAY REGIONS` (18px, bold).
  - Subtitle: `Select a railway region to inspect and configure its assigned train consists`.
- **4 Region Cards**:
  - Responsive 3-column layout at desktop resolution: 3 cards on Row 1 (NORTH, SOUTH, EAST), 1 card on Row 2 (WEST).
  - Vector SVG location pin icon in `#EFF6FF` container.
  - Dynamic counts: Configured trains, Coaches, Tanks, Online trains.
  - `View Trains in Region →` link.
  - Status Badge: `All Normal` (Emerald) or `X Critical` / `X Warning`.
