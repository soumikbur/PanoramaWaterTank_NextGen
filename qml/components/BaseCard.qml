import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Effects

import "../theme"

Rectangle {
    id: root

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    default property alias content: contentLayout.data

    property color backgroundColor: Theme.colors.surface
    property color borderColor: Theme.colors.border
    property color shadowColor: "#0A111827"

    property int cardRadius: Metrics.radiusXLarge
    property int padding: Metrics.cardPadding

    property bool elevated: true
    property bool showBorder: true

    // ------------------------------------------------------------------
    // Layout
    // ------------------------------------------------------------------

    Layout.fillWidth: true
    Layout.fillHeight: true

    Layout.minimumWidth: Metrics.cardMinimumWidth
    Layout.minimumHeight: Metrics.cardMinimumHeight

    // Derived from contentLayout's own content-driven implicit size, so
    // a card with no explicit Layout.preferredWidth/Height (every
    // SettingsPage.qml section) sizes itself to fit its actual content
    // instead of collapsing to Layout.minimumWidth/Height. Strictly
    // downward (content -> contentLayout -> root, never the reverse),
    // so it introduces no binding loop, and it's only consulted when a
    // consumer hasn't already set Layout.preferredWidth/Height
    // explicitly (every dashboard card does, and is unaffected).
    implicitWidth: contentLayout.implicitWidth + padding * 2
    implicitHeight: contentLayout.implicitHeight + padding * 2

    color: backgroundColor

    radius: cardRadius

    border.width: showBorder ? 1 : 0
    border.color: borderColor

    clip: true

    antialiasing: true

    // ------------------------------------------------------------------
    // Shadow
    // ------------------------------------------------------------------

    layer.enabled: elevated

    layer.effect: MultiEffect {

        shadowEnabled: true

        shadowColor: root.shadowColor

        shadowBlur: 0.25

        shadowVerticalOffset: 2

        shadowHorizontalOffset: 0
    }

    // ------------------------------------------------------------------
    // Hover Effect
    // ------------------------------------------------------------------

    Behavior on border.color {
        ColorAnimation {
            duration: Metrics.animationFast
        }
    }

    // ------------------------------------------------------------------
    // Content Container
    // ------------------------------------------------------------------

    ColumnLayout {

        id: contentLayout

        anchors.fill: parent

        anchors.margins: root.padding

        spacing: Metrics.space12
    }
}