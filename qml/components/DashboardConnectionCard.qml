import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Connection Metric Card (Section 11, Card 6)
// Displays: CONNECTION, status quality (e.g. Excellent),
// IP Address and Port, and Wi-Fi / network signal strength graphic.
BaseCard {
    id: root

    Layout.fillWidth: true
    Layout.preferredHeight: 132
    Layout.minimumHeight: 125
    Layout.minimumWidth: 120

    readonly property bool isConnected: TankModel.connectionState === "Connected"
    readonly property string qualityText: isConnected ? "Excellent" : (TankModel.connectionState === "Connecting" ? "Connecting" : "Offline")
    readonly property color qualityColor: isConnected ? Theme.colors.success : (TankModel.connectionState === "Connecting" ? Theme.colors.warning : Theme.colors.critical)

    ColumnLayout {
        Layout.fillWidth: true
        Layout.fillHeight: true
        spacing: 4

        // Top Row: Tinted Vector Icon + Uppercase Label
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            Rectangle {
                Layout.preferredWidth: 26
                Layout.preferredHeight: 26
                radius: 6
                color: root.isConnected ? Theme.colors.successSurface : (TankModel.connectionState === "Connecting" ? Theme.colors.warningSurface : Theme.colors.criticalSurface)

                Shape {
                    anchors.centerIn: parent
                    width: 14
                    height: 14
                    antialiasing: true

                    ShapePath {
                        fillColor: "transparent"
                        strokeColor: root.qualityColor
                        strokeWidth: 1.5
                        capStyle: ShapePath.RoundCap
                        joinStyle: ShapePath.RoundJoin
                        PathSvg {
                            path: "M7,11.5 L7,12.5 M4.5,9 C5.8,7.7 8.2,7.7 9.5,9 M2.5,6.5 C5,4 9,4 11.5,6.5"
                        }
                    }
                }
            }

            Text {
                Layout.fillWidth: true
                text: "CONNECTION"
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 11
                font.weight: Font.Bold
                font.letterSpacing: 0.5
                elide: Text.ElideRight
            }
        }

        // Quality Value (Large)
        Text {
            Layout.fillWidth: true
            text: root.qualityText
            color: root.qualityColor
            font.family: Theme.typography.fontFamily
            font.pixelSize: 22
            font.weight: Font.Bold
            elide: Text.ElideRight
        }

        // Secondary Info (IP & Port)
        Text {
            Layout.fillWidth: true
            text: (SettingsManager.esp32Host ? SettingsManager.esp32Host : "192.168.1.219") + ":" + (SettingsManager.esp32Port ? SettingsManager.esp32Port : "80")
            color: Theme.colors.textSecondary
            font.family: Theme.typography.fontFamily
            font.pixelSize: 11
            font.weight: Font.Medium
            elide: Text.ElideRight
        }

        // Signal Strength Bars graphic at bottom
        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 22

            RowLayout {
                anchors.left: parent.left
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 2
                spacing: 3

                Repeater {
                    model: 5
                    delegate: Rectangle {
                        required property int index
                        width: 4
                        height: 6 + index * 3
                        radius: 1.5
                        color: (root.isConnected && index < 4) ? root.qualityColor : (root.isConnected ? Qt.rgba(root.qualityColor.r, root.qualityColor.g, root.qualityColor.b, 0.3) : "#E2E8F0")
                    }
                }

                Item { Layout.preferredWidth: 6 }

                Text {
                    text: root.isConnected ? "-48 dBm" : "No signal"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 10
                    font.weight: Font.Medium
                }
            }
        }
    }
}
