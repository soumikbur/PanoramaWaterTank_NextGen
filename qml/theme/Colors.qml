pragma Singleton
import QtQuick

// Professional Industrial SCADA Blue Theme for Panorama Water Tank Monitor.
// Primary Identity: Panorama Blue (#2563EB), Deep Navy (#0F172A / #1E3A8A), Light Blue accents (#EAF2FD / #DBEAFE).
// Supporting: White (#FFFFFF), Surface Alt (#F8FAFC), Light Gray (#F4F6F9), Dark Charcoal (#1E293B), Subtle Blue-Gray borders (#E2E8F0).
// Semantic status: Green = Normal/Online, Amber = Warning, Red = Critical, Dark Red = Overflow, Gray = Offline.
QtObject {
    // Brand Identity (Restored Professional Blue)
    readonly property color primary: "#2563EB"
    readonly property color primaryHover: "#1D4ED8"
    readonly property color primaryPressed: "#1E40AF"
    readonly property color primarySurface: "#EAF2FD"
    readonly property color panoramaBlue: "#2563EB"
    readonly property color navy: "#0F172A"
    readonly property color darkBlue: "#1E3A8A"
    readonly property color mediumBlue: "#3B82F6"
    readonly property color lightBlue: "#DBEAFE"

    // Preserved for backward-compatibility / semantic red
    readonly property color panoramaRed: "#DC2626"
    readonly property color deepRed: "#991B1B"
    readonly property color black: "#0F172A"
    readonly property color darkCharcoal: "#1E293B"
    readonly property color mediumGray: "#64748B"
    readonly property color lightGray: "#F4F6F9"

    // Functional & Interactive
    readonly property color headerBackground: "#FFFFFF"

    // Water level representation (Fluid blue used for water visualization)
    readonly property color water: "#1677E8"
    readonly property color waterTop: "#38BDF8"
    readonly property color waterBottom: "#0284C7"
    readonly property color waterHighlight: "#60A5FA"

    // Surfaces & Backgrounds
    readonly property color background: "#F4F6F9"
    readonly property color surface: "#FFFFFF"
    readonly property color surfaceAlt: "#F8FAFC"

    // Borders & Dividers
    readonly property color divider: "#E5E9F0"
    readonly property color dividerStrong: "#CBD5E1"
    readonly property color border: "#E2E8F0"

    // Operational Status Indicators
    readonly property color success: "#16A34A"
    readonly property color successText: "#16A34A"
    readonly property color successSurface: "#E8F8EE"

    readonly property color warning: "#D97706"
    readonly property color warningSurface: "#FEF3E2"

    readonly property color critical: "#DC2626"
    readonly property color criticalSurface: "#FDECEC"

    readonly property color good: "#10B981"
    readonly property color goodSurface: "#ECFDF5"

    readonly property color purple: "#7C3AED"
    readonly property color purpleSurface: "#F5F3FF"

    readonly property color gold: "#EAB308"
    readonly property color goldSurface: "#FEFCE8"

    readonly property color overflow: "#991B1B"
    readonly property color sensorError: "#7C3AED"

    readonly property color offline: "#64748B"
    readonly property color offlineSurface: "#F1F5F9"

    readonly property color disabled: "#CBD5E1"

    // Typography Colors
    readonly property color textPrimary: "#0F172A"
    readonly property color textSecondary: "#64748B"
    readonly property color textMuted: "#94A3B8"
    readonly property color textOnPrimary: "#FFFFFF"

    readonly property color tankOutline: "#CBD5E1"
    readonly property color sidebarInactive: "#64748B"
}
