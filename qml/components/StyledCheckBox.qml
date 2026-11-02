import QtQuick
import QtQuick.Controls
import QtQuick.Shapes
import PanoramaWaterTank

// Standard Industrial SCADA Themed CheckBox
// Unchecked: white background, light gray-blue border (#CBD5E1)
// Checked: Panorama blue filled box (#0284C7), crisp white checkmark
// Disabled: muted background (#F1F5F9), muted text (#94A3B8)
// Label: dark navy/charcoal (#0F172A), vertically aligned with the box
CheckBox {
    id: control

    font.family: Theme.typography.fontFamily
    font.pixelSize: 14
    font.weight: Font.Medium

    implicitWidth: Math.max(implicitBackgroundWidth + leftInset + rightInset,
                            (contentItem ? contentItem.implicitWidth : 0) + (indicator ? indicator.width : 18) + spacing + leftPadding + rightPadding)
    implicitHeight: Math.max(implicitBackgroundHeight + topInset + bottomInset,
                             contentItem ? contentItem.implicitHeight : 0,
                             indicator ? indicator.height : 18, 32)

    spacing: 10
    leftPadding: 0
    rightPadding: 0
    topPadding: 0
    bottomPadding: 0

    indicator: Rectangle {
        implicitWidth: 18
        implicitHeight: 18
        x: control.leftPadding
        anchors.verticalCenter: parent.verticalCenter
        radius: 4
        color: !control.enabled ? "#F1F5F9"
             : (control.checked ? Theme.colors.primary : (control.hovered ? "#F8FAFC" : "#FFFFFF"))
        border.width: 1
        border.color: !control.enabled ? "#CBD5E1"
                    : (control.checked ? Theme.colors.primary : (control.hovered ? "#94A3B8" : "#CBD5E1"))

        scale: control.down ? 0.94 : 1.0
        Behavior on scale {
            NumberAnimation { duration: 70; easing.type: Easing.OutQuad }
        }

        Behavior on color {
            ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
        }
        Behavior on border.color {
            ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
        }

        // Crisp vector checkmark with smooth fade & scale transitions
        Shape {
            anchors.centerIn: parent
            width: 12
            height: 12
            antialiasing: true
            opacity: control.checked ? 1.0 : 0.0
            scale: control.checked ? 1.0 : 0.6

            Behavior on opacity {
                NumberAnimation { duration: 140; easing.type: Easing.OutQuad }
            }
            Behavior on scale {
                NumberAnimation { duration: 140; easing.type: Easing.OutQuad }
            }

            ShapePath {
                fillColor: "transparent"
                strokeColor: !control.enabled ? "#94A3B8" : "#FFFFFF"
                strokeWidth: 2.0
                capStyle: ShapePath.RoundCap
                joinStyle: ShapePath.RoundJoin
                PathSvg {
                    path: "M2,6.5 L4.8,9.5 L10,3.5"
                }
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
    }
}
