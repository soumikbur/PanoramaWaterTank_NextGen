import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// Dashboard page chrome: background, scroll container, and the
// responsive breakpoint state every section needs - computed once
// here instead of re-derived per section.
Item {
    id: root

    default property alias content: mainColumn.data

    readonly property real availableWidth: Math.max(0, width - Theme.metrics.contentMargin * 2)

    // 3-tier responsive layout system:
    // "large" : availableWidth >= 1140 (Window >= 1430px: 3 cols top, 5 cols bottom)
    // "medium": 760 <= availableWidth < 1140 (Window 1040-1430px: 2 cols top, 3 cols bottom)
    // "small" : availableWidth < 760 (Window < 1040px: 1 col top, 2 cols bottom)
    readonly property string layoutMode: availableWidth >= Theme.metrics.compactBreakpoint ? "large"
                                        : (availableWidth >= Theme.metrics.tabletBreakpoint ? "medium" : "small")
    readonly property bool compact: layoutMode !== "large"
    readonly property bool tablet: layoutMode === "medium"
    readonly property bool desktop: layoutMode === "large"

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Flickable {
        id: scrollArea
        anchors.fill: parent
        contentWidth: width
        contentHeight: Math.max(height, mainColumn.implicitHeight + Theme.metrics.contentMargin * 2)
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ScrollBar.vertical: ScrollBar {
            policy: ScrollBar.AsNeeded
            active: true
        }

        ColumnLayout {
            id: mainColumn
            width: Math.max(100, scrollArea.width - Theme.metrics.contentMargin * 2)
            height: Math.max(implicitHeight, scrollArea.height - Theme.metrics.contentMargin * 2)
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: Theme.metrics.contentMargin
            spacing: Theme.metrics.cardSpacing
        }
    }
}
