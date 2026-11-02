import QtQuick
import QtQuick.Controls
import PanoramaWaterTank

// ============================================================================
// StyledSwitch.qml — Industrial SCADA Standard Toggle Switch
// Height 24px, 42px track width, smooth 180ms physical thumb slide (Easing.OutCubic),
// smooth track color transition, keyboard (Space/Return) and mouse support.
// ============================================================================
Switch {
    id: control

    implicitWidth: Math.max(implicitBackgroundWidth + leftInset + rightInset,
                            (contentItem ? contentItem.implicitWidth : 0) + (indicator ? indicator.width : 42) + spacing + leftPadding + rightPadding)
    implicitHeight: Math.max(implicitBackgroundHeight + topInset + bottomInset,
                             contentItem ? contentItem.implicitHeight : 0,
                             indicator ? indicator.height : 24, 32)

    font.family: Theme.typography.fontFamily
    font.pixelSize: 13
    font.weight: Font.Medium

    spacing: 10
    leftPadding: 0
    rightPadding: 0
    topPadding: 0
    bottomPadding: 0

    scale: control.down ? 0.98 : 1.0
    Behavior on scale {
        NumberAnimation { duration: Theme.reducedMotion ? 0 : 80; easing.type: Easing.OutQuad }
    }

    indicator: Rectangle {
        implicitWidth: 42
        implicitHeight: 24
        x: control.leftPadding
        anchors.verticalCenter: parent.verticalCenter
        radius: 12

        color: {
            if (!control.enabled) return "#E2E8F0";
            if (control.checked) return control.hovered ? "#0284C7" : Theme.colors.primary;
            return control.hovered ? "#CBD5E1" : "#E2E8F0";
        }

        border.width: 1
        border.color: {
            if (!control.enabled) return "#CBD5E1";
            if (control.checked) return control.hovered ? "#0284C7" : Theme.colors.primary;
            return control.hovered ? "#94A3B8" : "#CBD5E1";
        }

        Behavior on color {
            ColorAnimation { duration: Theme.reducedMotion ? 0 : Theme.animSwitch; easing.type: Easing.OutCubic }
        }
        Behavior on border.color {
            ColorAnimation { duration: Theme.reducedMotion ? 0 : Theme.animSwitch; easing.type: Easing.OutCubic }
        }

        // Sliding Thumb
        Rectangle {
            id: thumb
            width: 18
            height: 18
            radius: 9
            anchors.verticalCenter: parent.verticalCenter
            x: control.checked ? (parent.width - width - 3) : 3

            color: "#FFFFFF"
            border.width: 1
            border.color: control.checked ? "#14000000" : "#CBD5E1"

            Behavior on x {
                NumberAnimation { duration: Theme.reducedMotion ? 0 : Theme.animSwitch; easing.type: Easing.OutCubic }
            }

            // Subtle drop shadow frame
            Rectangle {
                anchors.fill: parent
                anchors.margins: -1
                radius: 10
                z: -1
                color: "transparent"
                border.width: 1
                border.color: Qt.rgba(15 / 255.0, 23 / 255.0, 42 / 255.0, 0.06)
            }
        }
    }

    contentItem: Text {
        leftPadding: control.indicator.width + control.spacing
        text: control.text
        font: control.font
        color: !control.enabled ? "#94A3B8" : Theme.colors.textPrimary
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
        visible: control.text !== ""
    }
}
