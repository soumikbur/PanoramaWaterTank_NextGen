import QtQuick
import QtQuick.Layouts
import PanoramaWaterTank

// Responsive top section: Tank Visualization / Level Trend / Tank Information.
// Supports 3-tier layout:
// - "large" : 3 columns: [Water Level][Level Trend][Tank Information]
// - "medium": 2 columns: Row 1 has [Water Level][Level Trend], Row 2 has [Tank Information (spans 2)]
// - "small" : 1 column : Vertical stack of all 3 cards
GridLayout {
    id: topRow

    property string layoutMode: "large"
    property bool compact: layoutMode !== "large"

    columns: layoutMode === "large" ? 3 : (layoutMode === "medium" ? 2 : 1)
    columnSpacing: Theme.metrics.cardSpacing
    rowSpacing: Theme.metrics.cardSpacing

    readonly property real cardAreaWidth: Math.max(0, width - (columns > 1 ? columnSpacing * (columns - 1) : 0))

    Layout.fillWidth: true
    Layout.fillHeight: layoutMode === "large"

    TankVisualization {
        Layout.fillWidth: true
        Layout.preferredWidth: topRow.cardAreaWidth * Theme.metrics.tankCardWidthFraction
        Layout.fillHeight: true
        Layout.columnSpan: 1
        Layout.minimumWidth: 0
        Layout.preferredHeight: Theme.metrics.tankCardMinHeight
        Layout.minimumHeight: Theme.metrics.tankCardMinHeight
    }

    LevelTrendCard {
        Layout.fillWidth: true
        Layout.preferredWidth: topRow.cardAreaWidth * Theme.metrics.trendCardWidthFraction
        Layout.fillHeight: true
        Layout.columnSpan: 1
        Layout.minimumWidth: 0
        Layout.preferredHeight: Theme.metrics.tankCardMinHeight
        Layout.minimumHeight: Theme.metrics.tankCardMinHeight
    }

    TankInfoCard {
        Layout.fillWidth: true
        Layout.preferredWidth: topRow.cardAreaWidth * Theme.metrics.infoCardWidthFraction
        Layout.fillHeight: topRow.layoutMode === "large"
        Layout.columnSpan: topRow.layoutMode === "medium" ? 2 : 1
        Layout.minimumWidth: 0
        Layout.preferredHeight: topRow.layoutMode === "large" ? Theme.metrics.tankCardMinHeight : -1
        Layout.minimumHeight: topRow.layoutMode === "large" ? Theme.metrics.tankCardMinHeight : 235
    }
}