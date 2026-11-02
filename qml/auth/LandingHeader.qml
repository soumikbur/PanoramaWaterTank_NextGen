import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window
import PanoramaWaterTank

// ============================================================================
// LandingHeader.qml — Professional Enterprise SCADA Header (50px)
// Clean brand typography, railway mission tagline, v2.0 badge, minimal window controls.
// ============================================================================
Rectangle {
    id: root

    implicitHeight: 52
    color: "#FFFFFF"
    border.width: 0
    z: 20

    // Bottom subtle border
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: 1
        color: "#E3E9F2"
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 24
        anchors.rightMargin: 24
        spacing: 12

        // Left: Water drop icon
        VectorIcon {
            name: "water_drop"
            size: 22
            color: "#246BEB"
            Layout.alignment: Qt.AlignVCenter
        }

        // Brand Title: PANORAMA WATER TANK MONITOR
        Text {
            text: "PANORAMA WATER TANK MONITOR"
            font.family: Theme.typography.fontFamily
            font.pixelSize: 17
            font.weight: Font.Bold
            font.letterSpacing: 0.5
            color: "#102A56"
            Layout.alignment: Qt.AlignVCenter
        }

        // Thin Vertical Divider
        Rectangle {
            width: 1
            height: 18
            color: "#DCE5F0"
            Layout.leftMargin: 6
            Layout.rightMargin: 6
            Layout.alignment: Qt.AlignVCenter
        }

        // Technical Descriptor
        Text {
            text: "Railway Water Telemetry Platform"
            font.family: Theme.typography.fontFamily
            font.pixelSize: 13
            font.weight: Font.Normal
            color: "#617493"
            Layout.alignment: Qt.AlignVCenter
        }

        // Flexible spacer
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true
        }

        // Right side: v2.0 Badge
        Rectangle {
            Layout.preferredHeight: 22
            Layout.preferredWidth: versionLabel.implicitWidth + 16
            radius: 11
            color: "#F4F8FE"
            border.width: 1
            border.color: "#DCE5F0"
            Layout.alignment: Qt.AlignVCenter

            Text {
                id: versionLabel
                anchors.centerIn: parent
                text: "v2.0"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 11
                font.weight: Font.Bold
                font.letterSpacing: 0.5
                color: "#246BEB"
            }
        }
    }
}
