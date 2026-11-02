import QtQuick
import QtQuick.Layouts
import PanoramaWaterTank

// Recent Alerts Card (Section 13)
// Displays 3 compact alert rows with circular colored badges, title, description, timestamp,
// and top-right "View All" action button.
BaseCard {
    id: root

    signal viewAllClicked()

    Layout.fillWidth: true
    Layout.preferredHeight: 168
    Layout.minimumHeight: 160

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 14
        spacing: 8

        // Header: "Recent Alerts" + "View All"
        RowLayout {
            Layout.fillWidth: true

            Text {
                Layout.fillWidth: true
                text: "Recent Alerts"
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 15
                font.weight: Font.Bold
            }

            Text {
                text: "View All"
                color: Theme.colors.primary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                font.weight: Font.DemiBold

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    hoverEnabled: true
                    onClicked: root.viewAllClicked()
                }
            }
        }

        // Alert Items Column
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 6

            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true

                Text {
                    anchors.centerIn: parent
                    text: "No active alerts"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                }
            }

        }
    }
}
