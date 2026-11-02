import QtQuick
import PanoramaWaterTank

// A real, if minimal, destination page - used for the five sidebar items
// that don't have dedicated content yet. Navigating to one of these is
// not a "dead button": it correctly switches pages via App.qml's
// StackLayout and honestly reports that the page isn't built yet, rather
// than doing nothing when clicked.
Item {
    id: root

    property string pageTitle: ""

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Column {
        anchors.centerIn: parent
        spacing: 8

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.pageTitle
            color: Theme.colors.textPrimary
            font.family: Theme.typography.fontFamily
            font.pixelSize: Theme.typography.dashSectionTitle.size
            font.weight: Theme.typography.dashSectionTitle.weight
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "This page has not been built yet."
            color: Theme.colors.textSecondary
            font.family: Theme.typography.fontFamily
            font.pixelSize: Theme.typography.dashLabel.size
        }
    }
}
