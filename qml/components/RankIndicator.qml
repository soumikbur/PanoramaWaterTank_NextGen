import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Full-width segmented water level rank bar with dynamic triangular pointer
// and percentage readout. Segments: LOW (0-25%), MODERATE (25-50%), GOOD (50-75%), HIGH (75-100%).
BaseCard {
    id: root

    backgroundColor: Theme.colors.surface
    borderColor: Theme.colors.divider
    padding: 14

    Layout.preferredHeight: Theme.metrics.rankIndicatorHeight

    readonly property var segments: [
        { label: "LOW", color: "#EF4444" },
        { label: "MODERATE", color: "#F97316" },
        { label: "GOOD", color: "#EAB308" },
        { label: "HIGH", color: "#22C55E" }
    ]

    ColumnLayout {
        Layout.fillWidth: true
        Layout.fillHeight: true
        spacing: 4

        // Section Title
        Text {
            text: "Water Level Indicator (Rank)"
            color: Theme.colors.textPrimary
            font.family: Theme.typography.fontFamily
            font.pixelSize: 14
            font.weight: Font.Bold
        }

        // Percentage Scale Labels Row (0%, 25%, 50%, 75%, 100%)
        RowLayout {
            Layout.fillWidth: true

            Repeater {
                model: ["0%", "25%", "50%", "75%", "100%"]

                delegate: Text {
                    required property int index
                    required property string modelData
                    Layout.fillWidth: true
                    horizontalAlignment: index === 0 ? Text.AlignLeft
                        : (index === 4 ? Text.AlignRight : Text.AlignHCenter)
                    text: modelData
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Medium
                }
            }
        }

        // Segmented Color Bar — seamless Canvas implementation.
        // 4 equal segments; only the first/last get rounded outer corners.
        // Inner joins are perfectly square so there are no visible gaps.
        Item {
            id: barArea
            Layout.fillWidth: true
            Layout.preferredHeight: 26

            Canvas {
                id: barCanvas
                anchors.fill: parent
                antialiasing: true

                onWidthChanged:  requestPaint()
                onHeightChanged: requestPaint()

                onPaint: {
                    var ctx = getContext("2d");
                    ctx.clearRect(0, 0, width, height);

                    var segs = root.segments;
                    var n    = segs.length;          // 4
                    var r    = Theme.metrics.rankBarRadius;  // 6
                    var w    = width;
                    var h    = height;
                    var segW = w / n;

                    for (var i = 0; i < n; i++) {
                        var x0 = i * segW;
                        var x1 = x0 + segW;

                        ctx.beginPath();

                        var tlR = (i === 0) ? r : 0;   // top-left
                        var trR = (i === n-1) ? r : 0;  // top-right
                        var brR = (i === n-1) ? r : 0;  // bottom-right
                        var blR = (i === 0) ? r : 0;   // bottom-left

                        // Top edge
                        ctx.moveTo(x0 + tlR, 0);
                        ctx.lineTo(x1 - trR, 0);
                        ctx.quadraticCurveTo(x1, 0, x1, trR);
                        // Right edge
                        ctx.lineTo(x1, h - brR);
                        ctx.quadraticCurveTo(x1, h, x1 - brR, h);
                        // Bottom edge
                        ctx.lineTo(x0 + blR, h);
                        ctx.quadraticCurveTo(x0, h, x0, h - blR);
                        // Left edge
                        ctx.lineTo(x0, tlR);
                        ctx.quadraticCurveTo(x0, 0, x0 + tlR, 0);
                        ctx.closePath();

                        ctx.fillStyle = segs[i].color;
                        ctx.fill();
                    }
                }
            }

            // Segment labels overlaid on top of the Canvas
            Row {
                anchors.fill: parent
                Repeater {
                    model: root.segments
                    delegate: Item {
                        required property var modelData
                        width:  barArea.width / root.segments.length
                        height: barArea.height
                        Text {
                            anchors.centerIn: parent
                            text: modelData.label
                            color: "#FFFFFF"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: root.width < 520 ? 9 : 11
                            font.weight: Font.Bold
                        }
                    }
                }
            }
        }

        // Pointer Indicator (Triangle pointing UP toward the bar + Percentage Text)
        Item {
            id: pointerContainer
            Layout.fillWidth: true
            Layout.preferredHeight: 28

            readonly property real clampedPercentage: Math.max(0, Math.min(100, TankModel.fillPercentage))

            Item {
                id: movingPointer
                width: 64
                height: 28
                x: Math.max(0, Math.min(pointerContainer.width - width,
                   (pointerContainer.width * (pointerContainer.clampedPercentage / 100.0)) - (width / 2.0)))

                Behavior on x {
                    NumberAnimation {
                        duration: 300
                        easing.type: Easing.InOutQuad
                    }
                }

                ColumnLayout {
                    anchors.centerIn: parent
                    spacing: 1

                    Shape {
                        Layout.alignment: Qt.AlignHCenter
                        width: 14
                        height: 8
                        antialiasing: true

                        ShapePath {
                            fillColor: Theme.colors.primary
                            strokeColor: "transparent"
                            PathSvg { path: "M7,0 L14,8 L0,8 Z" }
                        }
                    }

                    Text {
                        Layout.alignment: Qt.AlignHCenter
                        text: TankModel.fillPercentage.toFixed(2) + "%"
                        color: Theme.colors.primary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Bold
                    }
                }
            }
        }
    }
}