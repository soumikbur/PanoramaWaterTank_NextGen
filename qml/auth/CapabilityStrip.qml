import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// CapabilityStrip.qml — Compact 44px bottom capabilities bar
// Single-line horizontal layout with dot separators.
// ============================================================================
Rectangle {
    id: root

    implicitHeight: 44
    color: "#FFFFFF"
    z: 15

    // Top border line
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: 1
        color: "#E3E9F2"
    }

    RowLayout {
        anchors.centerIn: parent
        spacing: 0

        CapabilityItem {
            iconName: "water_drop"
            title: "LIVE TELEMETRY"
        }

        Text {
            text: "·"
            font.pixelSize: 14
            font.weight: Font.Bold
            color: "#CBD5E1"
            Layout.leftMargin: 16
            Layout.rightMargin: 16
            Layout.alignment: Qt.AlignVCenter
        }

        CapabilityItem {
            iconName: "train"
            title: "FLEET MANAGEMENT"
        }

        Text {
            text: "·"
            font.pixelSize: 14
            font.weight: Font.Bold
            color: "#CBD5E1"
            Layout.leftMargin: 16
            Layout.rightMargin: 16
            Layout.alignment: Qt.AlignVCenter
        }

        CapabilityItem {
            iconName: "analytics"
            title: "TANK ANALYTICS"
        }

        Text {
            text: "·"
            font.pixelSize: 14
            font.weight: Font.Bold
            color: "#CBD5E1"
            Layout.leftMargin: 16
            Layout.rightMargin: 16
            Layout.alignment: Qt.AlignVCenter
        }

        CapabilityItem {
            iconName: "connectivity"
            title: "DEVICE CONNECTIVITY"
        }

        Text {
            text: "·"
            font.pixelSize: 14
            font.weight: Font.Bold
            color: "#CBD5E1"
            Layout.leftMargin: 16
            Layout.rightMargin: 16
            Layout.alignment: Qt.AlignVCenter
        }

        CapabilityItem {
            iconName: "location"
            title: "LOCATION TRACKING"
        }
    }
}
