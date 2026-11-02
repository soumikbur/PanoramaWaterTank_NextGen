import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Status pill: a droplet glyph (Qt Quick Shapes, not Canvas) plus a
// label, on a tinted background. The severity vocabulary mirrors
// TankModel.alarmLevel exactly (docs/04-engineering-model-workflow.md,
// Section 10) plus "Offline"/"Waiting" for the pre-data states, so this
// component never invents its own color taxonomy.
Rectangle {
    id: root

    property string severity: "Normal" // Normal | Low | Critical | Overflow | SensorError | Offline | Waiting
    property string label: severity

    readonly property color accentColor: {
        switch (severity) {
        case "Critical":
        case "Overflow":
        case "SensorError":
            return "#EF2020";
        case "Low":
            return "#F97316";
        case "Offline":
            return "#6B7280";
        case "Waiting":
            return "#111827";
        default:
            return "#16A34A";
        }
    }

    radius: 10
    color: "#F3F4F6"
    implicitHeight: content.implicitHeight + 20

    Behavior on color { ColorAnimation { duration: Theme.reducedMotion ? 0 : Theme.animSmallPanel } }

    RowLayout {
        id: content
        anchors.verticalCenter: parent.verticalCenter
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.margins: 14
        spacing: 12

        Shape {
            Layout.preferredWidth: 18
            Layout.preferredHeight: 18
            antialiasing: true

            ShapePath {
                fillColor: root.accentColor
                strokeColor: "transparent"

                Behavior on fillColor { ColorAnimation { duration: Theme.reducedMotion ? 0 : Theme.animSmallPanel } }

                PathSvg {
                    path: "M9,1 C9,1 2,9.5 2,13.5 C2,17.09 5.134,20 9,20 C12.866,20 16,17.09 16,13.5 C16,9.5 9,1 9,1 Z"
                }
            }
        }

        ColumnLayout {
            spacing: 2

            Text {
                text: "Status"
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 11
            }
            Text {
                text: root.label
                color: root.accentColor
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                font.weight: Font.Bold

                Behavior on color { ColorAnimation { duration: Theme.reducedMotion ? 0 : Theme.animSmallPanel } }
            }
        }
    }
}

