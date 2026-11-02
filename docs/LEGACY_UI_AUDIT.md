# Panorama Water Tank Monitor — Legacy UI/UX Audit & Design System Specification

This document provides a complete audit of the UI/UX architecture, layout specifications, visual tokens, responsive behaviors, and component blueprints from the legacy Qt/QML implementation (`PanoramaWaterTank-Milestone2`). It serves as the visual contract for the NextGen React Native implementation.

---

## 1. Visual Token Catalog (Design System)

### 1.1 Color Palette
The legacy application implements an industrial SCADA/HMI light theme designed for clean legibility under ambient depot and control room lighting.

| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `colorBackground` | `#F5F7FB` | Main application canvas background |
| `colorSurface` | `#FFFFFF` | Card containers, modals, table surfaces |
| `colorSurfaceElevated`| `#FAFCFE` | Hovered surfaces, nested card backgrounds |
| `colorPrimary` | `#1976D2` | Primary buttons, active tabs, brand accents |
| `colorPrimaryDark` | `#0D47A1` | Header bars, deep container borders |
| `colorPrimaryLight` | `#E3F2FD` | Selected item background, subtle badge tint |
| `colorAccent` | `#00ACC1` | Secondary highlights, water wave secondary crest |
| `colorTextPrimary` | `#212121` | Headings, primary data values, labels |
| `colorTextSecondary`| `#757575` | Captions, units, secondary timestamps |
| `colorTextDisabled` | `#BDBDBD` | Inactive controls, placeholder text |
| `colorBorder` | `#E0E0E0` | Card borders, dividers, table gridlines |
| `colorSuccess` | `#43A047` | Normal status, Good rank (50–75%), Connected |
| `colorWarning` | `#FB8C00` | Warning alarm (10–20%), Moderate rank (25–50%) |
| `colorDanger` | `#E53935` | Critical alarm (<10%), Low rank (0–25%), Disconnected |
| `colorHighRank` | `#2E7D32` | High rank (75–100%) |
| `colorFluidNormal` | `#0288D1` | Normal water fill gradient base |
| `colorFluidWarning`| `#FFA000` | Low water warning fill gradient |
| `colorFluidCritical`| `#D32F2F` | Critical water fill gradient |
| `colorFluidOverflow`| `#7B1FA2` | Overflow fluid pulse color |

### 1.2 Typography Hierarchy
Tabular figures (`font-variant-numeric: tabular-nums` / monospace numerals) are strictly used for all dynamic engineering readouts to prevent layout jittering during real-time updates.

| Style Role | Font Size | Font Weight | Line Height | Letter Spacing | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Metric** | 36 px | 700 (Bold) | 44 px | -0.5 px | Center Tank % readout |
| **Heading 1** | 22 px | 700 (Bold) | 28 px | -0.2 px | Page titles, major section headers |
| **Heading 2** | 18 px | 600 (SemiBold)| 24 px | 0 px | Card headers, table titles |
| **Heading 3** | 15 px | 600 (SemiBold)| 20 px | 0.1 px | Sub-section labels, modal titles |
| **Body Primary** | 14 px | 400 (Regular) | 20 px | 0.2 px | Default table rows, dialog body |
| **Body Secondary**| 13 px | 400 (Regular) | 18 px | 0.2 px | Secondary metadata, descriptions |
| **KPI Value** | 24 px | 700 (Bold) | 30 px | 0 px | Summary grid numbers |
| **KPI Unit** | 13 px | 500 (Medium) | 16 px | 0.5 px | Units beside KPI numbers (`L`, `cm`, `%`) |
| **Caption / Tag**| 11 px | 600 (SemiBold)| 14 px | 0.5 px | Status badges, timestamp chips |

### 1.3 Elevation & Border Radii
- **Radii**:
  - Small (Tags, Badges, Buttons): `6px`
  - Medium (Cards, Dialogs, Charts): `12px`
  - Large (Vessel Cylindrical Base): `20px`
  - Circular (Pills, Pointers): `9999px`
- **Shadows**:
  - Card Resting: `0px 2px 8px rgba(0, 0, 0, 0.06)`
  - Card Hover/Elevated: `0px 6px 16px rgba(0, 0, 0, 0.10)`
  - Modal Backdrop: `rgba(0, 0, 0, 0.45)`

---

## 2. Master Application Shell & Layout Grid

### 2.1 Viewport Constraints
- **Target Baseline**: `1536 x 1024 px` (Desktop / Tablet HMI Standard)
- **Minimum Viewport**: `1280 x 800 px`
- **Fluid Layout**: Adapts gracefully down to mobile screen widths (360px+) with vertical stacking.

### 2.2 Shell Component Structure
```
+-----------------------------------------------------------------------------------+
| Top Navigation Header (Height: 60px)                                              |
| [Logo + App Title]          [Train: 12002 | Coach: B4]       [Sync Status] [Time] |
+------------------+----------------------------------------------------------------+
| Sidebar (240px)  | Main Screen Router / Content Surface                           |
|                  |                                                                |
| - Dashboard      |  +----------------------------------------------------------+  |
| - Water Tank     |  | Operational Status Top Card                              |  |
| - Devices        |  +----------------------------------------------------------+  |
| - Alerts (2)     |  | 4-Tier Rank Indicator Bar (Low/Mod/Good/High)            |  |
| - History        |  +----------------------------------------------------------+  |
| - Settings       |  | 5x KPI Summary Grid (Level, Volume, Height, Volt, Health)|  |
|                  |  +----------------------------------------------------------+  |
|                  |  | Split Panel:                                             |  |
| [Status Badge]   |  |   [Tank Vessel Visualization]   [12h/24h/7d Trend Card]  |  |
| [Version 2.0]    |  +----------------------------------------------------------+  |
+------------------+----------------------------------------------------------------+
| Footer Bar (Height: 32px)                                                         |
| System Healthy | MQTT: broker.hivemq.com:8883 (TLS 1.2) | Telemetry Rate: 10s     |
+-----------------------------------------------------------------------------------+
```

---

## 3. High-Fidelity Component Blueprints

### 3.1 Tank Visualization (`TankVisualization`)
- **Structure**:
  - Outer Vessel Container: Rounded cylindrical border (`#B0BEC5` 2px border, `#ECEFF1` background).
  - Left Vertical Scale: 0% at bottom, 100% at top, graduation lines every 10%, major labels at 0, 25, 50, 75, 100%.
  - Right Vertical Scale: 0 cm at bottom, 50.0 cm at top, matching physical liquid height.
  - Fluid Surface: Dual animated sine waves with 180° phase offset:
    $$y_1(x, t) = A \sin\left(\frac{2\pi x}{\lambda} + \omega t\right)$$
    $$y_2(x, t) = 0.7A \sin\left(\frac{2\pi x}{0.8\lambda} - 1.2\omega t + \pi\right)$$
  - Center Metric Readout: Dynamic percentage (e.g. `76.5%`) in 36px Bold with contrast backing.
  - Subcards:
    - *Water Height*: `38.3 cm`
    - *Tank Volume*: `15.3 L`
  - Bottom Footer Banner: Deep industrial blue band (`#0D47A1`), white text: `Total Capacity: 20.0 L`.

### 3.2 4-Tier Rank Indicator (`RankIndicator`)
- **Segments**:
  1. **LOW** (0% – 25%): Background `#FFCDD2`, Active Fill `#E53935`.
  2. **MODERATE** (25% – 50%): Background `#FFE0B2`, Active Fill `#FB8C00`.
  3. **GOOD** (50% – 75%): Background `#FFF9C4`, Active Fill `#FDD835`.
  4. **HIGH** (75% – 100%): Background `#C8E6C9`, Active Fill `#43A047`.
- **Dynamic Pointer**: An inverted isosceles triangle positioned horizontally via percentage:
  $$\text{Pointer Offset} = \text{Clamp}(\text{Fill Percentage}, 0.0, 100.0) \%$$
- **Value Badge**: Floating pill above the pointer displaying current fill percentage with 1 decimal precision.

### 3.3 Historical Trend Card (`LevelTrendCard`)
- **Header Controls**:
  - Range Segmented Control: `[ 12 Hours ]` `[ 24 Hours ]` `[ 7 Days ]`.
  - Refresh Button & Auto-refresh countdown indicator.
- **Chart Canvas**:
  - Y-Axis: 0% to 100% with 20% grid lines.
  - X-Axis: Time markers formatted appropriately (`HH:mm` for 12h/24h, `MMM DD` for 7d).
  - Data Plot: Downsampled LTTB series (100 points), smooth cubic Bezier curve, area gradient fill beneath the curve.
  - Tooltip: Hover/Touch scrubber displaying exact timestamp, level percentage, and volume in liters.

### 3.4 Summary Grid Cards (`DashboardSummaryGrid`)
- Each card conforms to a uniform card template:
  - Top Row: Icon (Left) + Status Tint Badge (Right)
  - Middle: Big Metric Value + Unit
  - Bottom: Subtitle / Comparison with previous reading ($\pm \Delta$).

---

## 4. Interaction & Motion Specifications

1. **Fluid Wave Physics**: 60 FPS animation loop with gentle damping to emulate industrial fluid stillness without excessive motion sickness.
2. **Page Transitions**: Tab transitions use subtle horizontal slide-fade (200ms ease-out).
3. **Alarm Flashing**: Critical alarms pulse their red badge between 100% and 40% opacity at a 1.2 Hz frequency.
4. **Touch Targets**: Minimum clickable/tappable area $\ge 44 \times 44 \text{ px}$ on all interactive elements.

