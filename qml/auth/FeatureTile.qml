import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// FeatureTile.qml — Compact Hero Highlight Card (148 × 114 px)
// White surface, subtle #D9E3EF border, direct blue vector icon, dark navy text.
// No circular background behind icon.
// ============================================================================
Rectangle {
    id: root

    property string iconName: "analytics"
    property string title: "Real-Time\nMonitoring"

    implicitWidth: 148
    implicitHeight: 114
    radius: 11
    color: "#FFFFFF"
    border.width: 1
    border.color: tileMouse.containsMouse ? "#246BEB" : "#D9E3EF"

    // Subtle elevation lift on hover
    y: tileMouse.containsMouse ? -2 : 0
    Behavior on y { NumberAnimation { duration: 140; easing.type: Easing.OutQuad } }
    Behavior on border.color { ColorAnimation { duration: 140 } }

    // Soft drop shadow
    Rectangle {
        anchors.fill: parent
        anchors.topMargin: 3
        z: -1
        radius: 11
        color: "#102A56"
        opacity: tileMouse.containsMouse ? 0.06 : 0.03
    }

    MouseArea {
        id: tileMouse
        anchors.fill: parent
        hoverEnabled: true
    }

    ColumnLayout {
        anchors.centerIn: parent
        spacing: 10

        // Direct blue vector icon (NO circle background)
        VectorIcon {
            name: root.iconName
            size: 28
            color: "#246BEB"
            Layout.alignment: Qt.AlignHCenter
        }

        // Two-line dark navy text
        Text {
            text: root.title
            font.family: Theme.typography.fontFamily
            font.pixelSize: 13
            font.weight: Font.DemiBold
            color: "#102A56"
            horizontalAlignment: Text.AlignHCenter
            lineHeight: 1.15
            Layout.alignment: Qt.AlignHCenter
        }
    }
}
