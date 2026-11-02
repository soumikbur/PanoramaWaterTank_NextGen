import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// Standard Light SCADA Themed TextField
// Height 38px, 12px padding, subtle blue-gray border (#CBD5E1),
// white background (#FFFFFF), dark navy text, Panorama blue focus outline.
TextField {
    id: control

    Layout.fillWidth: true
    Layout.minimumWidth: 50

    implicitHeight: 38
    font.family: Theme.typography.fontFamily
    font.pixelSize: 13
    color: enabled ? Theme.colors.textPrimary : "#94A3B8"
    placeholderTextColor: "#94A3B8"
    verticalAlignment: TextInput.AlignVCenter
    leftPadding: 12
    rightPadding: 12
    topPadding: 0
    bottomPadding: 0
    selectByMouse: true
    selectedTextColor: "#FFFFFF"
    selectionColor: Theme.colors.primary

    background: Rectangle {
        implicitWidth: 200
        implicitHeight: 38
        radius: 6
        color: !control.enabled ? "#F1F5F9"
             : (control.activeFocus ? "#FFFFFF" : (control.hovered ? "#F8FAFC" : "#FFFFFF"))
        border.width: control.activeFocus ? 1.5 : 1
        border.color: !control.enabled ? "#E2E8F0"
                    : (control.activeFocus ? Theme.colors.primary
                    : (control.hovered ? "#94A3B8" : "#CBD5E1"))

        Behavior on border.color {
            ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
        }
        Behavior on color {
            ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
        }
    }
}
