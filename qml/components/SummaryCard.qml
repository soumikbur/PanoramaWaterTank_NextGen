import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Reusable summary tile. iconGlyph selects one of four small,
// self-contained icons (drop / status / thermometer / clock) built
// from Qt Quick Shapes and plain Rectangles - never Canvas.
BaseCard {
    id: root

    property string iconGlyph: "drop" // drop | status | thermometer | clock
    property color iconColor: Theme.colors.primary
    property string title: ""
    property string value: ""
    property string subtitle: ""
    property color valueColor: Theme.colors.textPrimary

    backgroundColor: Theme.colors.surface
    borderColor: Theme.colors.divider
    padding: Theme.metrics.cardPadding

    ColumnLayout {
        Layout.fillWidth: true
        Layout.fillHeight: true
        spacing: Theme.metrics.space4



        Rectangle {
            Layout.alignment: Qt.AlignHCenter
            width: Theme.metrics.summaryIconBadgeSize
            height: Theme.metrics.summaryIconBadgeSize
            radius: Theme.metrics.summaryIconBadgeRadius
            color: Qt.rgba(root.iconColor.r, root.iconColor.g, root.iconColor.b, 0.12)

            Behavior on color { ColorAnimation { duration: Theme.metrics.animationFast } }

            Shape {
                anchors.centerIn: parent
                width: Theme.metrics.iconMedium
                height: Theme.metrics.iconMedium
                visible: root.iconGlyph === "drop"
                antialiasing: true

                ShapePath {
                    fillColor: root.iconColor
                    strokeColor: "transparent"
                    PathSvg { path: "M9,1 C9,1 2,9.5 2,13.5 C2,17.09 5.134,20 9,20 C12.866,20 16,17.09 16,13.5 C16,9.5 9,1 9,1 Z" }
                }
            }

            Shape {
                anchors.centerIn: parent
                width: Theme.metrics.iconMedium
                height: Theme.metrics.iconMedium
                visible: root.iconGlyph === "status"
                antialiasing: true

                ShapePath {
                    fillColor: "transparent"
                    strokeColor: root.iconColor
                    strokeWidth: 2
                    joinStyle: ShapePath.RoundJoin
                    capStyle: ShapePath.RoundCap
                    PathSvg { path: "M1,9 L6,9 L8,3 L11,15 L13,9 L17,9" }
                }
            }

            Shape {
                anchors.centerIn: parent
                width: Theme.metrics.iconMedium
                height: Theme.metrics.iconMedium
                visible: root.iconGlyph === "pressure" || root.iconGlyph === "gauge"
                antialiasing: true

                ShapePath {
                    fillColor: "transparent"
                    strokeColor: root.iconColor
                    strokeWidth: 2
                    joinStyle: ShapePath.RoundJoin
                    capStyle: ShapePath.RoundCap
                    PathSvg { path: "M9,2 C5.134,2 2,5.134 2,9 C2,12.866 5.134,16 9,16 C12.866,16 16,12.866 16,9 C16,5.134 12.866,2 9,2 Z M9,9 L13,5" }
                }
            }

            Item {
                anchors.centerIn: parent
                width: 14
                height: 20
                visible: root.iconGlyph === "thermometer"

                Rectangle {
                    x: 4
                    y: 0
                    width: 6
                    height: 14
                    radius: 3
                    color: "transparent"
                    border.width: 2
                    border.color: root.iconColor
                }
                Rectangle {
                    x: 0
                    y: 10
                    width: 14
                    height: 14
                    radius: 7
                    color: "transparent"
                    border.width: 2
                    border.color: root.iconColor
                }
                Rectangle {
                    x: 6
                    y: 4
                    width: 2
                    height: 10
                    color: root.iconColor
                }
                Rectangle {
                    x: 3
                    y: 13
                    width: 8
                    height: 8
                    radius: 4
                    color: root.iconColor
                }
            }

            Item {
                anchors.centerIn: parent
                width: Theme.metrics.iconMedium
                height: Theme.metrics.iconMedium
                visible: root.iconGlyph === "clock"

                Rectangle {
                    anchors.fill: parent;
                    radius: width / 2;
                    color: "transparent";
                    border.width: 2;
                    border.color: root.iconColor
                }
                Rectangle {
                    x: parent.width / 2 - 1;
                    y: parent.height / 2 - 6;
                    width: 2;
                    height: 6;
                    color: root.iconColor
                }
                Rectangle {
                    x: parent.width / 2 - 1;
                    y: parent.height / 2;
                    width: 5;
                    height: 2;
                    color: root.iconColor
                }
            }

            Shape {
                anchors.centerIn: parent
                width: Theme.metrics.iconMedium
                height: Theme.metrics.iconMedium
                visible: root.iconGlyph === "volume" || root.iconGlyph === "vessel" || root.iconGlyph === "tank"
                antialiasing: true

                ShapePath {
                    fillColor: "transparent"
                    strokeColor: root.iconColor
                    strokeWidth: 2
                    joinStyle: ShapePath.RoundJoin
                    capStyle: ShapePath.RoundCap
                    PathSvg { path: "M3,2 L15,2 L13,16 L5,16 Z M3,6 L15,6" }
                }
            }
        }

        Text {
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignHCenter
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
            text: root.value
            color: root.valueColor
            font.family: Theme.typography.fontFamily
            font.pixelSize: Theme.typography.dashValue.size
            font.weight: Theme.typography.dashValue.weight
            fontSizeMode: Text.Fit
            minimumPixelSize: 14

            Behavior on color { ColorAnimation { duration: Theme.metrics.animationFast } }
        }

        Text {
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignHCenter
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
            text: root.title
            color: Theme.colors.textSecondary
            font.family: Theme.typography.fontFamily
            font.pixelSize: Theme.typography.dashLabel.size
        }

        Text {
            visible: root.subtitle.length > 0
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignHCenter
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
            text: root.subtitle
            color: Theme.colors.textSecondary
            font.family: Theme.typography.fontFamily
            font.pixelSize: Theme.typography.caption.size
            font.weight: Theme.typography.caption.weight
        }

        Item { Layout.fillHeight: true }
    }
}