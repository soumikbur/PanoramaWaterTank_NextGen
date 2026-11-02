// Metrics.qml
pragma Singleton
import QtQuick

QtObject {

    // ====================================================================
    // Window
    // ====================================================================

    readonly property int windowDefaultWidth: 1672
    readonly property int windowDefaultHeight: 941

    readonly property int windowMinimumWidth: 1280
    readonly property int windowMinimumHeight: 720

    readonly property int compactBreakpoint: 1350
    readonly property int tabletBreakpoint: 700
    readonly property int desktopBreakpoint: 1600
    readonly property int ultrawideBreakpoint: 2400

    // ====================================================================
    // Spacing Scale (8pt Design System)
    // ====================================================================

    readonly property int space4: 4
    readonly property int space8: 8
    readonly property int space12: 12
    readonly property int space14: 14
    readonly property int space16: 16
    readonly property int space20: 20
    readonly property int space24: 24
    readonly property int space32: 32
    readonly property int space40: 40
    readonly property int space48: 48
    readonly property int space64: 64

    // Semantic spacing
    readonly property int spacingTiny: space4
    readonly property int spacingSmall: space8
    readonly property int spacingMedium: space16
    readonly property int spacingLarge: space24
    readonly property int spacingXLarge: space32
    readonly property int spacingXXLarge: space48

    // ====================================================================
    // Radii
    // ====================================================================

    readonly property int radiusSmall: 4
    readonly property int radiusMedium: 8
    readonly property int radiusLarge: 12
    readonly property int radiusXLarge: 14

    // ====================================================================
    // App Layout
    // ====================================================================

    readonly property int pageMargin: 12
    readonly property int contentMargin: 12
    readonly property int headerHeight: 72
    readonly property int footerHeight: 0
    readonly property int sectionSpacing: 10

    // ====================================================================
    // Sidebar
    // ====================================================================

    readonly property int sidebarDefaultWidth: 240
    readonly property int sidebarMinWidth: 232
    readonly property int sidebarMaxWidth: 256
    readonly property real sidebarWidthFraction: 0.18

    // ====================================================================
    // Cards & Layout
    // ====================================================================

    readonly property int cardPadding: 16
    readonly property int cardSpacing: 10
    readonly property int cardMinimumWidth: 200
    readonly property int cardPreferredWidth: 320
    readonly property int cardMaximumWidth: 1200
    readonly property int cardMinimumHeight: 100

    readonly property real tankCardWidthFraction: 0.33
    readonly property real trendCardWidthFraction: 0.34
    readonly property real infoCardWidthFraction: 0.33

    // ====================================================================
    // Tank Visualization
    // ====================================================================

    readonly property int tankMinimumWidth: 300
    readonly property int tankMaximumWidth: 520
    readonly property real tankAspectRatio: 0.42
    readonly property int tankTopPadding: 12
    readonly property int tankBottomPadding: 12
    readonly property int tankCardMinHeight: 496

    // ====================================================================
    // Trend Chart
    // ====================================================================

    readonly property int chartMinimumHeight: 180
    readonly property int chartPreferredHeight: 240
    readonly property int chartMargin: 12
    readonly property int chartLegendSpacing: 8
    readonly property int chartLineThickness: 3
    readonly property int chartPointRadius: 4

    // ====================================================================
    // Dashboard Components
    // ====================================================================

    readonly property int summaryCardHeight: 164
    readonly property int summaryIconBadgeSize: 48
    readonly property int summaryIconBadgeRadius: 14
    readonly property int infoRowSpacing: 6
    readonly property int dividerThickness: 1

    // ====================================================================
    // Rank Indicator
    // ====================================================================

    readonly property int rankIndicatorHeight: 137
    readonly property int rankBarHeight: 28
    readonly property int rankBarRadius: 8
    readonly property int rankSegmentGap: 3
    readonly property int rankMarkerWidth: 14
    readonly property int rankMarkerHeight: 9
    readonly property int rankMarkerGap: 4
    readonly property int rankMarkerAnimationDuration: 300

    // ====================================================================
    // Icons
    // ====================================================================

    readonly property int iconSmall: 16
    readonly property int iconMedium: 20
    readonly property int iconLarge: 24
    readonly property int iconXLarge: 32

    // ====================================================================
    // Animation
    // ====================================================================

    readonly property int animationFast: 120
    readonly property int animationNormal: 200
    readonly property int animationSlow: 350

    // Centralized Design System Animation Policy Tokens
    readonly property int animMicro: 100          // 80–120ms: micro-interactions, press feedback
    readonly property int animHover: 120          // 100–140ms: hover color transitions
    readonly property int animButtonState: 120    // 100–140ms: button active/toggle changes
    readonly property int animSwitch: 180         // 150–200ms: switch thumb slide + track color
    readonly property int animSmallPanel: 180     // 150–200ms: accordion, small banners, tooltips
    readonly property int animPopup: 200          // 160–220ms: popups, dropdowns, modal overlays
    readonly property int animSidebar: 200        // 180–240ms: sidebar navigation indicators
    readonly property int animPageTransition: 220 // 180–260ms: page cross-fade transitions
    readonly property int animLargeDrawer: 240    // 200–280ms: right details drawer slide & collapse
    readonly property int animDataInterpolation: 600 // sensor value smooth visual transition
}