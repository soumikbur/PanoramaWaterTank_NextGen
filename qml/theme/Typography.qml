pragma Singleton
import QtQuick

// Typography design tokens (docs/03-ui-ux-design-system.md, Section 2.2).
// Each named style bundles size/weight/line-height/letter-spacing
// together so a component never assembles a text style from loose,
// independently-hardcoded values.
//
// fontFamily is updated to Inter per the industrial dashboard redesign
// spec (docs/07). Inter is not guaranteed to be present on a fresh
// Windows 11 machine - bundle its font files under resources/fonts/ and
// load them with FontLoader (or install system-wide) before shipping;
// until then this falls back to the platform default (Segoe UI on
// Windows 11), which is a safe, legible fallback, not a broken one.
//
// display/h1/h2/valueLarge/valueMedium/body/label/caption below are the
// original Phase 3 tokens and are left unchanged - Header, Sidebar, and
// Footer depend on their exact values and are explicitly out of scope
// for the dashboard redesign. The dash*-prefixed tokens are new,
// additive, and scoped specifically to the redesigned dashboard
// components so no existing component's text size shifts as a side
// effect of this change.
QtObject {
    readonly property string fontFamily: "Inter"

    readonly property QtObject display: QtObject {
        readonly property int size: 44
        readonly property int weight: Font.Bold
        readonly property real lineHeight: 1.1
        readonly property real letterSpacing: -0.5
    }
    readonly property QtObject h1: QtObject {
        readonly property int size: 20
        readonly property int weight: Font.DemiBold
        readonly property real lineHeight: 1.3
        readonly property real letterSpacing: 0
    }
    readonly property QtObject h2: QtObject {
        readonly property int size: 16
        readonly property int weight: Font.DemiBold
        readonly property real lineHeight: 1.3
        readonly property real letterSpacing: 0
    }
    readonly property QtObject valueLarge: QtObject {
        readonly property int size: 22
        readonly property int weight: Font.Bold
        readonly property real lineHeight: 1.2
        readonly property real letterSpacing: 0
    }
    readonly property QtObject valueMedium: QtObject {
        readonly property int size: 16
        readonly property int weight: Font.DemiBold
        readonly property real lineHeight: 1.3
        readonly property real letterSpacing: 0
    }
    readonly property QtObject body: QtObject {
        readonly property int size: 14
        readonly property int weight: Font.Medium
        readonly property real lineHeight: 1.4
        readonly property real letterSpacing: 0
    }
    readonly property QtObject label: QtObject {
        readonly property int size: 13
        readonly property int weight: Font.Medium
        readonly property real lineHeight: 1.3
        readonly property real letterSpacing: 0.1
    }
    readonly property QtObject caption: QtObject {
        readonly property int size: 12
        readonly property int weight: Font.Normal
        readonly property real lineHeight: 1.3
        readonly property real letterSpacing: 0.15
    }

    // --- Dashboard redesign tokens (docs/07), additive only -----------

    readonly property QtObject dashTitle: QtObject {
        readonly property int size: 30
        readonly property int weight: Font.Bold
        readonly property real lineHeight: 1.2
        readonly property real letterSpacing: 0
    }
    readonly property QtObject dashSectionTitle: QtObject {
        readonly property int size: 22
        readonly property int weight: Font.DemiBold
        readonly property real lineHeight: 1.25
        readonly property real letterSpacing: 0
    }
    readonly property QtObject dashCardTitle: QtObject {
        readonly property int size: 18
        readonly property int weight: Font.DemiBold
        readonly property real lineHeight: 1.3
        readonly property real letterSpacing: 0
    }
    readonly property QtObject dashPercentage: QtObject {
        readonly property int size: 36
        readonly property int weight: Font.Bold
        readonly property real lineHeight: 1.0
        readonly property real letterSpacing: -1
    }
    readonly property QtObject dashValue: QtObject {
        readonly property int size: 20
        readonly property int weight: Font.DemiBold
        readonly property real lineHeight: 1.2
        readonly property real letterSpacing: 0
    }
    readonly property QtObject dashLabel: QtObject {
        readonly property int size: 14
        readonly property int weight: Font.Medium
        readonly property real lineHeight: 1.3
        readonly property real letterSpacing: 0
    }
}

