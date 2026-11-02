import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Reusable Metric Card (Section 11)
// Contains: Tinted vector icon container (NO EMOJIS), uppercase label,
// large primary value, secondary info, and mini sparkline chart at the bottom.
BaseCard {
    id: root

    property string label: ""
    property string value: ""
    property string subtitle: ""
    property string iconType: "water" // "water" | "volume" | "status" | "pressure" | "clock" | "network"
    property color iconColor: Theme.colors.primary
    property color iconBgColor: Theme.colors.primarySurface
    property color valueColor: Theme.colors.textPrimary
    property color sparklineColor: Theme.colors.primary
    property var sparklinePoints: []

    Layout.fillWidth: true
    Layout.preferredHeight: 132
    Layout.minimumHeight: 125
    Layout.minimumWidth: 120

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
                color: root.iconBgColor

                Shape {
                    anchors.centerIn: parent
                    width: 14
                    height: 14
                    antialiasing: true

                    ShapePath {
                        fillColor: "transparent"
                        strokeColor: root.iconColor
                        strokeWidth: 1.5
                        capStyle: ShapePath.RoundCap
                        joinStyle: ShapePath.RoundJoin

                        PathSvg {
                            path: {
                                if (root.iconType === "water") {
                                    return "M7,1.5 C7,1.5 2.5,6.5 2.5,9.5 C2.5,12 4.5,13.5 7,13.5 C9.5,13.5 11.5,12 11.5,9.5 C11.5,6.5 7,1.5 7,1.5 Z";
                                } else if (root.iconType === "volume") {
                                    return "M3,3.5 C3,2.2 4.8,1.8 7,1.8 C9.2,1.8 11,2.2 11,3.5 M3,3.5 L3,11.5 C3,12.8 4.8,13.2 7,13.2 C9.2,13.2 11,12.8 11,11.5 L11,3.5 M3,3.5 C3,4.8 4.8,5.2 7,5.2 C9.2,5.2 11,4.8 11,3.5";
                                } else if (root.iconType === "status") {
                                    return "M3,7.5 L5.5,10 L11,4.5";
                                } else if (root.iconType === "pressure") {
                                    return "M2,7 C2,4.2 4.2,2 7,2 C9.8,2 12,4.2 12,7 C12,9.8 9.8,12 7,12 C4.2,12 2,9.8 2,7 Z M7,7 L9.5,4.5";
                                } else if (root.iconType === "clock") {
                                    return "M7,1.5 C4,1.5 1.5,4 1.5,7 C1.5,10 4,12.5 7,12.5 C10,12.5 12.5,10 12.5,7 C12.5,4 10,1.5 7,1.5 Z M7,4 L7,7 L9.2,9.2";
                                } else {
                                    // network
                                    return "M7,11.5 L7,12.5 M4.5,9 C5.8,7.7 8.2,7.7 9.5,9 M2.5,6.5 C5,4 9,4 11.5,6.5";
                                }
                            }
                        }
                    }
                }
            }

            Text {
                Layout.fillWidth: true
                text: root.label
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 11
                font.weight: Font.Bold
                font.letterSpacing: 0.5
                elide: Text.ElideRight
            }
        }

        // Large Value
        Text {
            Layout.fillWidth: true
            text: root.value
            color: root.valueColor
            font.family: Theme.typography.fontFamily
            font.pixelSize: 22
            font.weight: Font.Bold
            elide: Text.ElideRight
        }

        // Secondary Info
        Text {
            Layout.fillWidth: true
            text: root.subtitle
            color: Theme.colors.textSecondary
            font.family: Theme.typography.fontFamily
            font.pixelSize: 11
            font.weight: Font.Medium
            elide: Text.ElideRight
        }

        // Small Sparkline Chart at bottom
        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 22

            Canvas {
                id: sparklineCanvas
                anchors.fill: parent
                antialiasing: true

                onWidthChanged: requestPaint()
                onHeightChanged: requestPaint()

                onPaint: {
                    var ctx = getContext("2d");
                    ctx.clearRect(0, 0, width, height);

                    var pts = root.sparklinePoints;
                    if (!pts || pts.length < 2) return;

                    var w = width;
                    var h = height;
                    var minVal = pts[0];
                    var maxVal = pts[0];
                    for (var i = 1; i < pts.length; i++) {
                        if (pts[i] < minVal) minVal = pts[i];
                        if (pts[i] > maxVal) maxVal = pts[i];
                    }
                    var range = maxVal - minVal;
                    if (range <= 0) range = 1;

                    ctx.beginPath();
                    var step = w / (pts.length - 1);
                    for (var j = 0; j < pts.length; j++) {
                        var px = j * step;
                        var py = h - 2 - ((pts[j] - minVal) / range) * (h - 6);
                        if (j === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }

                    ctx.lineWidth = 1.8;
                    ctx.strokeStyle = root.sparklineColor;
                    ctx.stroke();

                    // Soft gradient fill beneath sparkline
                    ctx.lineTo(w, h);
                    ctx.lineTo(0, h);
                    ctx.closePath();

                    var grad = ctx.createLinearGradient(0, 0, 0, h);
                    var baseCol = root.sparklineColor;
                    grad.addColorStop(0, Qt.rgba(baseCol.r, baseCol.g, baseCol.b, 0.18));
                    grad.addColorStop(1, Qt.rgba(baseCol.r, baseCol.g, baseCol.b, 0.0));
                    ctx.fillStyle = grad;
                    ctx.fill();
                }
            }
        }
    }
}
