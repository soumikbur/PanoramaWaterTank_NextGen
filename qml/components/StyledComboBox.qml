import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Standard Light SCADA Themed ComboBox
// Height 38px, white background, subtle border (#CBD5E1),
// dark navy text, clean downward chevron, white popup with primary highlight.
ComboBox {
    id: control

    Layout.fillWidth: true
    Layout.minimumWidth: 50

    implicitHeight: 38
    implicitWidth: 200
    font.family: Theme.typography.fontFamily
    font.pixelSize: 13

    leftPadding: 12
    rightPadding: 32

    contentItem: Text {
        leftPadding: control.leftPadding
        rightPadding: control.rightPadding
        text: control.displayText
        font: control.font
        color: control.enabled ? Theme.colors.textPrimary : "#94A3B8"
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }

    indicator: Item {
        x: control.width - width - 10
        y: (control.height - height) / 2
        width: 14
        height: 14
        rotation: control.popup.visible ? 180 : 0
        Behavior on rotation {
            NumberAnimation { duration: 160; easing.type: Easing.OutQuad }
        }

        Shape {
            anchors.centerIn: parent
            width: 10
            height: 6
            antialiasing: true

            ShapePath {
                fillColor: "transparent"
                strokeColor: control.enabled ? (control.hovered || control.popup.visible ? Theme.colors.primary : "#64748B") : "#94A3B8"
                strokeWidth: 1.8
                capStyle: ShapePath.RoundCap
                joinStyle: ShapePath.RoundJoin
                PathSvg {
                    path: "M1,1 L5,5 L9,1"
                }
            }
        }
    }

    background: Rectangle {
        implicitHeight: 38
        radius: 6
        color: !control.enabled ? "#F1F5F9"
             : (control.activeFocus || control.popup.visible ? "#FFFFFF" : (control.hovered ? "#F8FAFC" : "#FFFFFF"))
        border.width: (control.activeFocus || control.popup.visible) ? 1.5 : 1
        border.color: !control.enabled ? "#E2E8F0"
                    : ((control.activeFocus || control.popup.visible) ? Theme.colors.primary
                    : (control.hovered ? "#94A3B8" : "#CBD5E1"))

        Behavior on border.color {
            ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
        }
        Behavior on color {
            ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
        }
    }

    popup: Popup {
        y: control.height + 4
        width: control.width
        implicitHeight: contentItem.implicitHeight + 12
        padding: 6

        enter: Transition {
            NumberAnimation { property: "opacity"; from: 0.0; to: 1.0; duration: 160; easing.type: Easing.OutQuad }
            NumberAnimation { property: "scale"; from: 0.96; to: 1.0; duration: 160; easing.type: Easing.OutQuad }
        }
        exit: Transition {
            NumberAnimation { property: "opacity"; from: 1.0; to: 0.0; duration: 120; easing.type: Easing.InQuad }
        }

        contentItem: ListView {
            clip: true
            implicitHeight: Math.min(220, contentHeight)
            model: control.popup.visible ? control.delegateModel : null
            currentIndex: control.highlightedIndex

            ScrollIndicator.vertical: ScrollIndicator {}
        }

        background: Rectangle {
            color: "#FFFFFF"
            radius: 8
            border.color: "#CBD5E1"
            border.width: 1

            // Subtle drop shadow / outer frame
            Rectangle {
                anchors.fill: parent
                anchors.margins: -1
                z: -1
                color: "transparent"
                border.color: "#E2E8F0"
                radius: 9
            }
        }
    }

    delegate: ItemDelegate {
        id: delegateItem
        width: control.width - 12
        implicitHeight: 34
        highlighted: control.highlightedIndex === index

        contentItem: Text {
            text: {
                if (control.textRole) {
                    return Array.isArray(control.model) ? modelData[control.textRole] : model[control.textRole];
                }
                if (typeof modelData === "string") return modelData;
                if (model && model.display !== undefined) return model.display;
                return modelData ? modelData.toString() : "";
            }
            color: delegateItem.highlighted ? Theme.colors.primary : Theme.colors.textPrimary
            font.family: Theme.typography.fontFamily
            font.pixelSize: 13
            font.weight: delegateItem.highlighted ? Font.DemiBold : Font.Normal
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }

        background: Rectangle {
            radius: 4
            color: delegateItem.highlighted ? Theme.colors.primarySurface : (delegateItem.hovered ? "#F8FAFC" : "transparent")
        }
    }
}
