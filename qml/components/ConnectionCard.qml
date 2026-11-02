import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Connection Card (Section 14)
// Displays Connection Status (Excellent, green), IP Address (192.168.1.219), Port (80),
// and a subtle Wi-Fi / radar-style concentric signal arc visualization on the right.
BaseCard {
    id: root

    readonly property bool isConnected: TankModel.connectionState === "Connected"

    Layout.fillWidth: true
    Layout.preferredHeight: 132
    Layout.minimumHeight: 125
    Layout.minimumWidth: 240

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 14
        spacing: 8

        // Header: "Connection" + Status "Excellent"
        RowLayout {
            Layout.fillWidth: true

            Text {
                Layout.fillWidth: true
                text: "Connection"
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 15
                font.weight: Font.Bold
            }

            Rectangle {
                Layout.preferredHeight: 22
                Layout.preferredWidth: statusText.implicitWidth + 14
                radius: 11
                color: root.isConnected ? Theme.colors.successSurface : Theme.colors.warningSurface
                border.width: 1
                border.color: root.isConnected ? "#DCFCE7" : "#FEF3C7"

                Text {
                    id: statusText
                    anchors.centerIn: parent
                    text: root.isConnected ? "Excellent" : "Offline"
                    color: root.isConnected ? Theme.colors.success : Theme.colors.warning
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Bold
                }
            }
        }

        // Body: Left (IP & Port) | Right (Wi-Fi Signal Arcs)
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 12

            // Left: IP & Port
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4

                ColumnLayout {
                    spacing: 1
                    Text {
                        text: "IP Address"
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Medium
                    }
                    Text {
                        text: SettingsManager.esp32Host ? SettingsManager.esp32Host : "192.168.1.219"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Bold
                    }
                }

                ColumnLayout {
                    spacing: 1
                    Text {
                        text: "Port"
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Medium
                    }
                    Text {
                        text: SettingsManager.esp32Port ? SettingsManager.esp32Port.toString() : "80"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Bold
                    }
                }
            }

            // Right: Subtle Wi-Fi / radar signal arcs
            Item {
                Layout.preferredWidth: 64
                Layout.preferredHeight: 64
                Layout.alignment: Qt.AlignVCenter

                Canvas {
                    anchors.fill: parent
                    antialiasing: true

                    onPaint: {
                        var ctx = getContext("2d");
                        ctx.clearRect(0, 0, width, height);

                        var cx = width / 2;
                        var cy = height - 10;
                        var strokeColor = root.isConnected ? "#16A34A" : "#94A3B8";

                        // Center base dot
                        ctx.beginPath();
                        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
                        ctx.fillStyle = strokeColor;
                        ctx.fill();

                        // 3 concentric Wi-Fi arcs
                        var radii = [12, 22, 32];
                        var opacities = [0.9, 0.7, 0.5];

                        for (var i = 0; i < radii.length; i++) {
                            ctx.save();
                            ctx.beginPath();
                            ctx.arc(cx, cy, radii[i], Math.PI * 1.25, Math.PI * 1.75, false);
                            ctx.lineWidth = 2.5;
                            ctx.lineCap = "round";
                            ctx.strokeStyle = Qt.rgba(root.isConnected ? 0.09 : 0.58, root.isConnected ? 0.64 : 0.64, root.isConnected ? 0.29 : 0.72, opacities[i]);
                            ctx.stroke();
                            ctx.restore();
                        }
                    }
                }
            }
        }
    }
}
