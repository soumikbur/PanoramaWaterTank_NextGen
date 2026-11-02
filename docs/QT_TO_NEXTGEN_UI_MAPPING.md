# Qt to NextGen UI/UX Mapping Matrix

**Reference Application**: `PanoramaWaterTank-Milestone2` (Qt 6 QML)  
**Target Application**: `PanoramaWaterTank_NextGen` (`apps/mobile` React Native Web + Electron)  
**Date**: October 29, 2026  

---

## 1. Component & Screen Mapping Table

| Original Qt Component | New Frontend Component | Measured Discrepancies & Missing Elements | Required Action |
| :--- | :--- | :--- | :--- |
| **`theme/Colors.qml`** | `src/theme/colors.ts` | Primary color was `#1976D2` instead of `#1479E8`; header was missing `#171C28`; background was `#F5F7FB` instead of `#F8FAFC`; divider was `#E0E0E0` instead of `#E2E8F0`; rank colors differed from Qt tokens (`#EF4444`, `#F97316`, `#EAB308`, `#22C55E`). | **Replace** `colors.ts` with exact Qt color definitions. |
| **`theme/Metrics.qml`** | `src/theme/spacing.ts`, `metrics.ts` | Missing exact layout metrics (sidebar 270px, header 44px, footer 28px, summaryCardHeight 122px, rankIndicatorHeight 124px, 30/35/35 top row card width ratios). | **Create** `metrics.ts` matching Qt dimensions. |
| **`theme/Typography.qml`** | `src/theme/typography.ts` | Lacked specific dashboard tokens (`dashTitle` 30px, `dashSectionTitle` 22px, `dashCardTitle` 18px, `dashPercentage` 48/52px, `dashValue` 18px, `dashLabel` 14px). | **Update** typography tokens to mirror `Typography.qml`. |
| **`qml/components/Header.qml`** | `src/components/common/Header.tsx` | New app used a 60px white header with train metadata pills. Qt original uses 44px dark navy (`#171C28`) title bar with clean left-aligned white title `"Panorama Water Tank Monitor"` (15px DemiBold). | **Refactor** `Header.tsx` to 44px `#171C28` with window dragging and white title. |
| **`qml/components/Sidebar.qml`** | `src/components/common/Sidebar.tsx` | New sidebar was 240px wide, lacked 46x46 water-drop logo badge, lacked `"SYSTEM"` uppercase section divider, lacked 68px "System Status" operational card with pulsing dot, and lacked copyright text. | **Refactor** `Sidebar.tsx` to 270px width, replicate exact water-drop badge, add `"SYSTEM"` divider, add 68px operational health card, add copyright footer. |
| **`qml/components/NavItem.qml`** | `src/components/common/Sidebar.tsx` | Used Lucide React generic icons. Qt original has 50px height items with specific vector geometries (2x2 grid, tank silhouette, monitor stand, bell, clock, gear). | **Replicate** vector SVG icons and active state (`#EFF6FF` bg, `#1479E8` tint). |
| **`qml/components/Footer.qml`** | `src/components/common/Footer.tsx` | New footer was 32px with status tags. Qt original is 28px transparent bar with centered `"© 2026 Panorama Water Tank Monitoring System"`. | **Refactor** `Footer.tsx` to match Qt footer exactly. |
| **`qml/pages/DashboardPage.qml`** | `src/screens/DashboardScreen.tsx` | New screen inverted layout (put rank indicator and summary cards on top) and omitted `TankInfoCard`. Qt layout strictly stacks: 1. Top Section (3 cards: Tank 30%, Trend 35%, Info 35%), 2. Rank Indicator (124px), 3. Summary Grid (5 cards, 122px). | **Restructure** `DashboardScreen.tsx` to replicate exact 3-section Qt hierarchy. |
| **`qml/components/TankVisualization.qml`** | `src/components/tank/TankVisualization.tsx` | New component centered a single vessel with no right-side metrics. Qt original has a two-column split: left side has 140px cylindrical vessel with top pipe nozzle, fluid wave, and 21-tick ruler; right side has big level %, 70px Water Height card, 70px Tank Volume card, Status badge, and bottom capacity banner. | **Rewrite** `TankVisualization.tsx` to match the exact dual-column layout, sub-cards, ruler, and bottom banner. |
| **`qml/components/TankInfoCard.qml`** | `src/components/dashboard/TankInfoCard.tsx` | Entire component was **MISSING** from the NextGen frontend. | **Implement** `TankInfoCard.tsx` with all 12 metadata rows and dividers. |
| **`qml/components/LevelTrendCard.qml`** | `src/components/charts/LevelTrendCard.tsx` | Lacked exact time-range dropdown ("12 Hours", "24 Hours", "7 Days"), Y-axis rotated label ("Water Level (%)") with 48px fixed axis width, tooltip pill badge at latest point, and dynamic date formatting. | **Refactor** `LevelTrendCard.tsx` to match Qt visual design and temporal normalization. |
| **`qml/components/TrendChart.qml`** | `src/components/charts/TrendChart.tsx` | Lacked Bézier curve smoothing, semi-transparent area fill (`rgba(20, 121, 232, 0.16)`), horizontal grid lines at 0/25/50/75/100%, and latest data point marker ring. | **Implement** SVG Bézier curve renderer matching Qt ShapePath. |
| **`qml/components/RankIndicator.qml`** | `src/components/dashboard/RankIndicator.tsx` | Used different segment colors and lacked upward-pointing triangle pointer with smooth tracking animation and text readout. | **Refactor** `RankIndicator.tsx` to match Qt dimensions (124px), 4 segment colors, scale row, and upward triangle pointer. |
| **`qml/components/DashboardSummaryGrid.qml`** | `src/components/dashboard/SummaryGrid.tsx` | Cards lacked Qt's exact 38x38px icon badge with `Qt.rgba(color, 0.12)`, exact typography sizes (18px value, 14px label, 12px subtitle), and exact subtitles. | **Refactor** `SummaryGrid.tsx` and `SummaryCard.tsx` to match Qt component design. |
| **`qml/pages/WaterTankPage.qml`** | `src/screens/WaterTankScreen.tsx` | New screen differed substantially: lacked header device badge, lacked 52px alarm banner, lacked 2-column main section (TankVisualization + Geometry Metrics), lacked 4 environmental tiles, lacked EEPROM diagnostic collapsible accordion. | **Rebuild** `WaterTankScreen.tsx` to match Qt `WaterTankPage.qml` section-by-section. |
| **`qml/pages/DevicesPage.qml`** | `src/screens/DevicesScreen.tsx` | New screen lacked search and filter bar, lacked 4 overview cards, lacked device table format with mini progress bars, and lacked 440px slide-in detail drawer. | **Rebuild** `DevicesScreen.tsx` to replicate Qt `DevicesPage.qml` table, filters, and drawer. |
| **`qml/pages/AlertsPage.qml`** | `src/screens/AlertsScreen.tsx` | New screen lacked header Alarm System badge, lacked 4 summary cards (Critical, Warning, Active, Resolved), lacked live status strip, lacked acknowledge actions, and lacked alert history table. | **Rebuild** `AlertsScreen.tsx` to mirror Qt `AlertsPage.qml` layout and transition history. |
| **`qml/pages/HistoryPage.qml`** | `src/screens/HistoryScreen.tsx` | New screen lacked 12h/24h/7d toggle buttons, lacked CSV download trigger, lacked 4 trend statistics cards (Average, Min, Max, Change), and lacked 15-row historical readings table. | **Rebuild** `HistoryScreen.tsx` to match Qt `HistoryPage.qml` features and layout. |
| **`qml/pages/SettingsPage.qml`** | `src/screens/SettingsScreen.tsx` | New screen lacked 920px max-width container, lacked two-column connection parameters, lacked 2-column status and preview cards, and lacked "Restore Defaults" / "Test Connection" actions. | **Rebuild** `SettingsScreen.tsx` to mirror Qt `SettingsPage.qml` structure. |

---

## 2. Implementation Execution Plan

1. **Step 1: Design Tokens Alignment**
   - Update `src/theme/colors.ts` with exact Qt Hex values.
   - Update `src/theme/typography.ts` with exact Qt font sizes and weights.
   - Create `src/theme/metrics.ts` with exact Qt layout measurements.
   - Export all design tokens via `src/theme/index.ts`.

2. **Step 2: Replicate Application Shell & Layout**
   - Refactor `Header.tsx` to 44px `#171C28` with left-aligned white title and window dragging.
   - Refactor `Sidebar.tsx` to 270px width, water-drop badge, custom SVG icons, "SYSTEM" divider, and 68px operational card.
   - Refactor `Footer.tsx` to 28px transparent copyright bar.
   - Update `App.tsx` layout to match `App.qml`.

3. **Step 3: Replicate Dashboard Components**
   - Rebuild `TankVisualization.tsx` with dual-column layout (140px animated wave tank, scale ruler, right-side metrics, and bottom banner).
   - Implement `TankInfoCard.tsx` with all 12 metadata rows and dividers.
   - Refactor `TrendChart.tsx` and `LevelTrendCard.tsx` with Bézier curves, 0-100% Y-axis, tooltip badge, and 12h/24h/7d ranges.
   - Refactor `RankIndicator.tsx` to 124px height with upward triangle pointer.
   - Refactor `SummaryGrid.tsx` with 5x summary tiles (38px icon badge, value, label, subtitle).
   - Reconstruct `DashboardScreen.tsx` to stack Top Row (3 cards), Rank Indicator, and Summary Grid.

4. **Step 4: Replicate Water Tank Screen**
   - Header with device badge, connection pill, and updated timestamp.
   - 52px dynamic status banner.
   - 2-column main grid (TankVisualization + Geometry & Metrics).
   - 4 environmental telemetry tiles (Pressure, Temperature, ADC Processing, Cloud Uplink).
   - Full-width LevelTrendCard.
   - Collapsible Engineering Diagnostics & EEPROM Calibration card.

5. **Step 5: Replicate Devices Screen**
   - Search bar and status/connection filter dropdowns.
   - 4 overview metric cards (Total, Online, Offline, Warning).
   - Data table with status pills, mini progress bar, and "View Details" button.
   - 440px slide-in detail drawer.

6. **Step 6: Replicate Alerts Screen**
   - Header with Alarm System badge and Acknowledge All / Clear Resolved buttons.
   - 4 summary cards.
   - Live system status strip.
   - Active alerts list with single-click Acknowledge buttons.
   - Alert history log table.

7. **Step 7: Replicate History Screen**
   - Header with CSV download button and refresh trend button.
   - 12h / 24h / 7d toggle buttons with From/To time bounds.
   - Full-width LevelTrendCard.
   - 4 statistics cards (Average, Min, Max, Change).
   - Historical readings log table.

8. **Step 8: Replicate Settings Screen**
   - Max width 920px container.
   - Connection card, Device variables card, 2-column status and live data preview cards, action buttons.

9. **Step 9: Compile, Package & Verify**
   - Type check with `tsc --noEmit`.
   - Build frontend with Vite.
   - Repackage with Electron.
   - Launch and verify pixel-perfect parity.

