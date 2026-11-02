import QtQuick
import QtQuick.Controls
import PanoramaWaterTank

// Standard Light SCADA Themed Button
// Height 38px, 6px radius, support for primary, secondary, and danger variants.
Button {
    id: control

    property string variant: highlighted ? "primary" : "secondary" // "primary" | "secondary" | "danger"

    implicitHeight: 38
    implicitWidth: Math.max(90, contentItem.implicitWidth + 28)

    font.family: Theme.typography.fontFamily
    font.pixelSize: 13
    font.weight: Font.Medium

    scale: !control.enabled ? 1.0 : (control.down ? 0.98 : (control.hovered ? 1.01 : 1.0))
    Behavior on scale {
        NumberAnimation { duration: Theme.reducedMotion ? 0 : (control.down ? 80 : 120); easing.type: Easing.OutQuad }
    }

    contentItem: Text {
        text: control.text
        font: control.font
        color: !control.enabled ? "#94A3B8"
             : (control.variant === "primary" ? "#FFFFFF"
             : (control.variant === "danger" ? "#DC2626"
             : (control.hovered ? Theme.colors.primary : Theme.colors.textPrimary)))
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }

    background: Rectangle {
        implicitHeight: 38
        radius: 6
        border.width: 1

        color: {
            if (!control.enabled) return "#F1F5F9";
            if (control.variant === "primary") {
                return control.down ? Theme.colors.primaryPressed : (control.hovered ? "#0284C7" : Theme.colors.primary);
            } else if (control.variant === "danger") {
                return control.down ? "#FEE2E2" : (control.hovered ? "#FEF2F2" : "#FFFFFF");
            } else {
                return control.down ? "#F1F5F9" : (control.hovered ? "#F8FAFC" : "#FFFFFF");
            }
        }

        border.color: {
            if (!control.enabled) return "#E2E8F0";
            if (control.variant === "primary") {
                return control.down ? Theme.colors.primaryPressed : Theme.colors.primary;
            } else if (control.variant === "danger") {
                return control.down ? "#DC2626" : (control.hovered ? "#EF4444" : "#FCA5A5");
            } else {
                return control.down ? Theme.colors.primary : (control.hovered ? Theme.colors.primary : "#CBD5E1");
            }
        }

        Behavior on color {
            ColorAnimation { duration: Theme.reducedMotion ? 0 : Theme.animHover; easing.type: Easing.OutQuad }
        }
        Behavior on border.color {
            ColorAnimation { duration: Theme.reducedMotion ? 0 : Theme.animHover; easing.type: Easing.OutQuad }
        }
    }
}
