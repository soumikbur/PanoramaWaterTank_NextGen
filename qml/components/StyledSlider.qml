import QtQuick
import QtQuick.Controls
import PanoramaWaterTank

// Standard Light SCADA Themed Slider
// Neutral light-gray track (#E2E8F0), Panorama blue active track,
// white circular handle with blue border.
Slider {
    id: control

    implicitHeight: 32
    implicitWidth: 200

    property color activeColor: Theme.colors.primary

    background: Rectangle {
        x: control.leftPadding
        y: control.topPadding + control.availableHeight / 2 - height / 2
        implicitWidth: 200
        implicitHeight: 6
        width: control.availableWidth
        height: implicitHeight
        radius: 3
        color: "#E2E8F0" // neutral light track

        Rectangle {
            width: control.visualPosition * parent.width
            height: parent.height
            color: control.activeColor // Panorama blue active track
            radius: 3
        }
    }

    handle: Rectangle {
        x: control.leftPadding + control.visualPosition * (control.availableWidth - width)
        y: control.topPadding + control.availableHeight / 2 - height / 2
        implicitWidth: 18
        implicitHeight: 18
        radius: 9
        color: "#FFFFFF"
        border.color: control.pressed ? Theme.colors.primaryPressed : Theme.colors.primary
        border.width: 2.5

        Rectangle {
            anchors.centerIn: parent
            width: 6
            height: 6
            radius: 3
            color: control.activeColor
            visible: control.hovered || control.pressed
        }

        scale: control.pressed ? 1.15 : (control.hovered ? 1.08 : 1.0)

        Behavior on scale {
            NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad }
        }
    }
}
