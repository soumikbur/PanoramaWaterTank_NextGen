pragma Singleton
import QtQuick
import PanoramaWaterTank

// ============================================================================
// Theme.qml
//
// Central Design System Resolver
//
// All UI components should reference Theme instead of Colors,
// Typography, Metrics or Icons directly.
//
// This file acts as the single public interface for the design system,
// allowing future theme changes (Dark Mode, Customer Branding, etc.)
// without modifying component code.
// ============================================================================

QtObject {

    //=========================================================================
    // Base Design Tokens
    //=========================================================================

    readonly property QtObject colors: Colors
    readonly property QtObject typography: Typography
    readonly property QtObject metrics: Metrics
    readonly property QtObject icons: Icons

    //=========================================================================
    // Colors
    //=========================================================================

    readonly property color primary: Colors.primary
    readonly property color primaryPressed: Colors.primaryPressed
    readonly property color primarySurface: Colors.primarySurface

    readonly property color water: Colors.water

    readonly property color headerBackground: Colors.headerBackground
    readonly property color background: Colors.background
    readonly property color surface: Colors.surface
    readonly property color surfaceAlt: Colors.surfaceAlt

    readonly property color divider: Colors.divider
    readonly property color dividerStrong: Colors.dividerStrong

    readonly property color border: Colors.dividerStrong

    readonly property color success: Colors.success
    readonly property color successSurface: Colors.successSurface

    readonly property color warning: Colors.warning
    readonly property color warningSurface: Colors.warningSurface

    readonly property color critical: Colors.critical
    readonly property color criticalSurface: Colors.criticalSurface

    readonly property color overflow: Colors.overflow
    readonly property color sensorError: Colors.sensorError

    readonly property color offline: Colors.offline
    readonly property color offlineSurface: Colors.offlineSurface

    readonly property color disabled: Colors.disabled

    readonly property color textPrimary: Colors.textPrimary
    readonly property color textSecondary: Colors.textSecondary
    readonly property color textOnPrimary: Colors.textOnPrimary

    readonly property color tankOutline: Colors.tankOutline
    readonly property color waterHighlight: Colors.waterHighlight
    readonly property color sidebarInactive: Colors.sidebarInactive

    //=========================================================================
    // Typography
    //=========================================================================

    readonly property string fontFamily: Typography.fontFamily

    readonly property QtObject display: Typography.display

    readonly property QtObject h1: Typography.h1
    readonly property QtObject h2: Typography.h2

    readonly property QtObject valueLarge: Typography.valueLarge
    readonly property QtObject valueMedium: Typography.valueMedium

    readonly property QtObject body: Typography.body
    readonly property QtObject label: Typography.label
    readonly property QtObject caption: Typography.caption

    readonly property QtObject dashTitle: Typography.dashTitle
    readonly property QtObject dashSectionTitle: Typography.dashSectionTitle
    readonly property QtObject dashCardTitle: Typography.dashCardTitle
    readonly property QtObject dashPercentage: Typography.dashPercentage
    readonly property QtObject dashValue: Typography.dashValue
    readonly property QtObject dashLabel: Typography.dashLabel

    //=========================================================================
    // Metrics
    //=========================================================================

    // Radius

    readonly property int radiusSmall: Metrics.radiusSmall
    readonly property int radiusMedium: Metrics.radiusMedium
    readonly property int radiusLarge: Metrics.radiusLarge

    // Spacing

    readonly property int spacingTiny: Metrics.spacingTiny
    readonly property int spacingSmall: Metrics.spacingSmall
    readonly property int spacingMedium: Metrics.spacingMedium
    readonly property int spacingLarge: Metrics.spacingLarge
    readonly property int spacingXLarge: Metrics.spacingXLarge
    readonly property int spacingXXLarge: Metrics.spacingXXLarge

    // Layout

    readonly property int pageMargin: Metrics.pageMargin
    readonly property int contentMargin: Metrics.contentMargin

    readonly property int headerHeight: Metrics.headerHeight
    readonly property int footerHeight: Metrics.footerHeight

    readonly property int sectionSpacing: Metrics.sectionSpacing
    readonly property int cardSpacing: Metrics.cardSpacing
    readonly property int cardPadding: Metrics.cardPadding

    // Sidebar

    readonly property int sidebarDefaultWidth: Metrics.sidebarDefaultWidth
    readonly property int sidebarMinWidth: Metrics.sidebarMinWidth
    readonly property int sidebarMaxWidth: Metrics.sidebarMaxWidth

    readonly property real sidebarWidthFraction: Metrics.sidebarWidthFraction

    // Cards

    readonly property int cardMinimumWidth: Metrics.cardMinimumWidth
    readonly property int cardPreferredWidth: Metrics.cardPreferredWidth
    readonly property int cardMaximumWidth: Metrics.cardMaximumWidth
    readonly property int cardMinimumHeight: Metrics.cardMinimumHeight

    // Tank

    readonly property int tankCardMinHeight: Metrics.tankCardMinHeight
    readonly property real tankAspectRatio: Metrics.tankAspectRatio

    // Charts

    readonly property int chartMinimumHeight: Metrics.chartMinimumHeight
    readonly property int chartPreferredHeight: Metrics.chartPreferredHeight

    // Animation

    readonly property int animFast: 140
    readonly property int animNormal: 200
    readonly property int animSlow: 280

    readonly property int animationFast: animFast
    readonly property int animationNormal: animNormal
    readonly property int animationSlow: animSlow

    readonly property int animMicro: Metrics.animMicro
    readonly property int animHover: Metrics.animHover
    readonly property int animButtonState: Metrics.animButtonState
    readonly property int animSwitch: Metrics.animSwitch
    readonly property int animSmallPanel: Metrics.animSmallPanel
    readonly property int animPopup: Metrics.animPopup
    readonly property int animSidebar: Metrics.animSidebar
    readonly property int animPageTransition: Metrics.animPageTransition
    readonly property int animLargeDrawer: Metrics.animLargeDrawer
    readonly property int animDataInterpolation: Metrics.animDataInterpolation

    //=========================================================================
    // Display Performance (adaptive refresh-rate awareness)
    //=========================================================================

    readonly property real refreshRate: DisplayPerformanceManager.refreshRate
    readonly property int targetFrameRate: DisplayPerformanceManager.targetFrameRate
    readonly property real frameIntervalMs: DisplayPerformanceManager.frameIntervalMs
    readonly property string performanceMode: DisplayPerformanceManager.performanceMode
    readonly property bool reducedMotion: DisplayPerformanceManager.reducedMotion
    readonly property real animationScale: DisplayPerformanceManager.animationScale

    //=========================================================================
    // Icons
    //=========================================================================

    readonly property string iconBasePath: Icons.basePath

    function icon(name) {
        return Icons.source(name)
    }
}