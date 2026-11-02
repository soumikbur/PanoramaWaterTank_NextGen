import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// TankLevelCard.qml — SCADA Industrial Tank Level Visualization
// Layout (Sections 9, 10, 11):
//   LEFT:   Geometry-accurate Vertical Tank Vessel with 0-100% graduation scale
//   CENTER: Prominent Current Level % display (44px)
//   RIGHT:  Compact SCADA Telemetry Rows:
//           - Water Height: 9.38 cm / 50.00 cm
//           - Tank Volume: 11.28 L / 60.00 L
//           - Pressure: 1013.3 hPa
//           - Status: NORMAL · All systems operational
//   BOTTOM: Parameter strip (Height | Dimensions/Shape | Capacity | Device ID)
// ============================================================================
BaseCard {
    id: root

    Layout.fillWidth: true
    Layout.fillHeight: true
    Layout.minimumWidth: 320
    Layout.preferredWidth: 500
    Layout.minimumHeight: 380

    readonly property bool isOffline: TankModel.connectionState === "Offline" || TankModel.connectionState === "Not Connected" || !TankModel.hasValidData
    readonly property bool isConnecting: TankModel.connectionState === "Connecting"
    readonly property real livePercentage: Math.max(0.0, Math.min(100.0, TankModel.fillPercentage))
    readonly property bool isOverflow: !isOffline && (TankModel.alarmLevel === "Overflow" || TankModel.fillPercentage >= 100.0 || (TankModel.tankHeightCm > 0 && TankModel.waterHeightCm >= TankModel.tankHeightCm))
    readonly property color waterColorTop: isOverflow ? "#EF4444" : Theme.colors.waterTop
    readonly property color waterColorBottom: isOverflow ? "#B91C1C" : Theme.colors.waterBottom

    // Status derivation
    readonly property string displayStatus: {
        if (root.isOffline) return "OFFLINE";
        var health = TankModel.telemetryHealthState;
        if (health === "SENSOR_ERROR" || TankModel.measurementState === "SENSOR_ERROR" || TankModel.sensorStatus === "Fault") return "SENSOR ERROR";
        if (health === "WAITING_FOR_DATA" || !TankModel.hasValidData) return "WAITING FOR DATA";
        if (health === "DATA_STALE" || TankModel.measurementState === "STALE" || TankModel.sensorStatus === "Stale") return "DATA STALE";
        var st = (TankModel.authoritativeAlarmState || TankModel.alarmLevel || "NORMAL").toUpperCase();
        if (st === "DISCONNECTED") return "OFFLINE";
        if (st === "SENSOR_ERROR") return "SENSOR ERROR";
        return st;
    }
    readonly property string displayStatusDesc: {
        if (root.isOffline) return "Link dropped / offline";
        if (root.displayStatus === "SENSOR ERROR") return "Sensor error / loop fault";
        if (root.displayStatus === "WAITING FOR DATA") return "Waiting for sensor acquisition";
        if (root.displayStatus === "DATA STALE") return "Telemetry data stale";
        if (root.displayStatus === "CRITICAL") return "Critical low level";
        if (root.displayStatus === "WARNING") return "Low level warning";
        return "All systems operational";
    }

    ColumnLayout {
        Layout.fillWidth: true
        Layout.fillHeight: true
        spacing: 10

        // Card Title
        Text {
            text: "Tank Level"
            color: Theme.colors.textPrimary
            font.family: Theme.typography.fontFamily
            font.pixelSize: 16
            font.weight: Font.Bold
        }

        // ====================================================================
        // Main Content Row: LEFT (Vessel + Scale) | CENTER (%) | RIGHT (Telemetry)
        // ====================================================================
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 16

            // ----------------------------------------------------------------
            // 1. LEFT: Graduation Scale + Vertical Tank Vessel (Section 10)
            // ----------------------------------------------------------------
            RowLayout {
                Layout.preferredWidth: 170
                Layout.fillHeight: true
                spacing: 8

                // Physical Scale Labels (100%, 75%, 50%, 25%, 0%)
                Item {
                    id: rulerArea
                    Layout.preferredWidth: 42
                    Layout.fillHeight: true
                    Layout.topMargin: 12
                    Layout.bottomMargin: 10

                    Repeater {
                        model: [100, 75, 50, 25, 0]
                        delegate: Item {
                            required property int modelData
                            width: rulerArea.width
                            height: 14
                            y: {
                                var usable = rulerArea.height;
                                return Math.round(usable * (1.0 - modelData / 100.0) - height / 2);
                            }

                            RowLayout {
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: 4

                                Text {
                                    text: modelData + "%"
                                    color: Theme.colors.textSecondary
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 10
                                    font.weight: Font.Medium
                                }

                                Rectangle {
                                    width: 6
                                    height: 1.5
                                    color: "#94A3B8"
                                }
                            }
                        }
                    }
                }

                // Vertical Tank Vessel
                Item {
                    id: vesselContainer
                    Layout.preferredWidth: 110
                    Layout.fillHeight: true
                    Layout.topMargin: 4
                    Layout.bottomMargin: 8

                    // Top Pipe / Cap
                    Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter
                        anchors.top: parent.top
                        width: 28
                        height: 6
                        radius: 2
                        color: "#E2E8F0"
                        border.width: 1
                        border.color: Theme.colors.tankOutline
                        z: 5
                    }

                    // Vertical Tank Vessel — 100% Scene-Graph GPU-Accelerated
                    Rectangle {
                        id: vesselBody
                        anchors.fill: parent
                        anchors.topMargin: 6
                        radius: 12
                        color: "#F8FAFC"
                        border.width: 1.5
                        border.color: Theme.colors.tankOutline
                        clip: true

                        // Internal Scale Lines (0.25, 0.50, 0.75)
                        Repeater {
                            model: [0.25, 0.50, 0.75]
                            delegate: Rectangle {
                                required property real modelData
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.leftMargin: 4
                                anchors.rightMargin: 4
                                y: Math.round(vesselBody.height * (1.0 - modelData))
                                height: 1
                                color: "#4094A3B8"
                                z: 4
                            }
                        }

                        // Water Fill Container
                        Item {
                            id: waterFillItem
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.bottom: parent.bottom
                            height: root.isOffline ? 0 : Math.round(vesselBody.height * (animatedFillPercent / 100.0))
                            visible: !root.isOffline && height > 0
                            clip: true

                            property real animatedFillPercent: root.livePercentage
                            Behavior on animatedFillPercent {
                                NumberAnimation { duration: Theme.reducedMotion ? 0 : Theme.animNormal; easing.type: Easing.OutCubic }
                            }

                            // Gradient Body
                            Rectangle {
                                anchors.fill: parent
                                gradient: Gradient {
                                    GradientStop { position: 0.0; color: root.waterColorTop }
                                    GradientStop { position: 1.0; color: root.waterColorBottom }
                                }
                            }

                            // Subtle Wave Crest
                            WaterWave {
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.top: parent.top
                                height: 8
                                waterColor: root.waterColorTop
                                surfaceColor: Qt.lighter(root.waterColorTop, 1.15)
                                waveAmplitude: 2.0
                                wavePeriod: 80
                                waveDuration: 3500
                                visible: waterFillItem.height > 6 && !Theme.reducedMotion
                            }
                        }

                        // Offline Indicator Label
                        Text {
                            anchors.centerIn: parent
                            text: "OFFLINE"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Bold
                            color: "#94A3B8"
                            visible: root.isOffline
                            z: 5
                        }
                    }
                }
            }

            // ----------------------------------------------------------------
            // 2. CENTER: Large Prominent Percentage (Section 9)
            // ----------------------------------------------------------------
            ColumnLayout {
                Layout.preferredWidth: 120
                Layout.fillHeight: true
                Layout.alignment: Qt.AlignVCenter
                spacing: 4

                Item { Layout.fillHeight: true }

                Text {
                    text: "Current Level"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    font.weight: Font.Medium
                }

                Text {
                    text: root.isOffline ? "--" : (waterFillItem.animatedFillPercent.toFixed(1) + "%")
                    color: {
                        if (root.isOffline) return "#94A3B8";
                        if (root.displayStatus === "CRITICAL") return Theme.colors.critical;
                        if (root.displayStatus === "WARNING") return Theme.colors.warning;
                        return Theme.colors.primary;
                    }
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 42
                    font.weight: Font.Bold
                    lineHeight: 1.0
                }

                // Status Badge Pill
                Rectangle {
                    height: 22
                    width: centerStLabel.implicitWidth + 14
                    radius: 11
                    color: {
                        if (root.displayStatus === "CRITICAL" || root.displayStatus === "SENSOR ERROR") return "#FEE2E2";
                        if (root.displayStatus === "WARNING" || root.displayStatus === "DATA STALE") return "#FEF3C7";
                        if (root.displayStatus === "WAITING FOR DATA") return "#EFF6FF";
                        if (root.displayStatus === "GOOD" || root.displayStatus === "NORMAL") return "#ECFDF5";
                        return "#F1F5F9";
                    }
                    border.width: 1
                    border.color: {
                        if (root.displayStatus === "CRITICAL" || root.displayStatus === "SENSOR ERROR") return "#FECACA";
                        if (root.displayStatus === "WARNING" || root.displayStatus === "DATA STALE") return "#FDE68A";
                        if (root.displayStatus === "WAITING FOR DATA") return "#BFDBFE";
                        if (root.displayStatus === "GOOD" || root.displayStatus === "NORMAL") return "#A7F3D0";
                        return "#CBD5E1";
                    }

                    RowLayout {
                        anchors.centerIn: parent
                        spacing: 4
                        Rectangle {
                            width: 6; height: 6; radius: 3
                            color: {
                                if (root.displayStatus === "CRITICAL" || root.displayStatus === "SENSOR ERROR") return Theme.colors.critical;
                                if (root.displayStatus === "WARNING" || root.displayStatus === "DATA STALE") return Theme.colors.warning;
                                if (root.displayStatus === "WAITING FOR DATA") return Theme.colors.primary;
                                if (root.displayStatus === "GOOD" || root.displayStatus === "NORMAL") return Theme.colors.success;
                                return "#94A3B8";
                            }
                        }
                        Text {
                            id: centerStLabel
                            text: root.displayStatus
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 10
                            font.weight: Font.Bold
                            color: {
                                if (root.displayStatus === "CRITICAL" || root.displayStatus === "SENSOR ERROR") return "#991B1B";
                                if (root.displayStatus === "WARNING" || root.displayStatus === "DATA STALE") return "#92400E";
                                if (root.displayStatus === "WAITING FOR DATA") return "#1E40AF";
                                if (root.displayStatus === "GOOD" || root.displayStatus === "NORMAL") return "#166534";
                                return "#475569";
                            }
                        }
                    }
                }

                Item { Layout.fillHeight: true }
            }

            Rectangle {
                Layout.preferredWidth: 1
                Layout.fillHeight: true
                color: Theme.colors.divider
            }

            // ----------------------------------------------------------------
            // 3. RIGHT: Compact SCADA Telemetry Rows (Section 11)
            // ----------------------------------------------------------------
            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 8

                // Row 1: Water Height
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 50
                    radius: 6
                    color: "#F8FAFC"
                    border.width: 1
                    border.color: Theme.colors.border

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 10

                        Rectangle {
                            width: 28; height: 28; radius: 6
                            color: Theme.colors.primarySurface
                            border.width: 1; border.color: "#BFDBFE"
                            Text { anchors.centerIn: parent; text: "↕"; font.pixelSize: 14; color: Theme.colors.primary; font.weight: Font.Bold }
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0
                            Text { text: "Water Height"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                            Text {
                                text: root.isOffline ? "--" : (TankModel.waterHeightCm.toFixed(2) + " cm / " + TankModel.tankHeightCm.toFixed(2) + " cm")
                                font.pixelSize: 13
                                font.weight: Font.Bold
                                color: root.isOffline ? "#94A3B8" : Theme.colors.textPrimary
                            }
                        }
                    }
                }

                // Row 2: Tank Volume
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 50
                    radius: 6
                    color: "#F8FAFC"
                    border.width: 1
                    border.color: Theme.colors.border

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 10

                        Rectangle {
                            width: 28; height: 28; radius: 6
                            color: Theme.colors.primarySurface
                            border.width: 1; border.color: "#BFDBFE"
                            Text { anchors.centerIn: parent; text: "💧"; font.pixelSize: 12 }
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0
                            Text { text: "Tank Volume"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                            Text {
                                text: root.isOffline ? "--" : (TankModel.waterVolumeLiters.toFixed(2) + " L / " + TankModel.capacityLiters.toFixed(2) + " L")
                                font.pixelSize: 13
                                font.weight: Font.Bold
                                color: root.isOffline ? "#94A3B8" : Theme.colors.textPrimary
                            }
                        }
                    }
                }

                // Row 3: Pressure
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 50
                    radius: 6
                    color: "#F8FAFC"
                    border.width: 1
                    border.color: Theme.colors.border

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 10

                        Rectangle {
                            width: 28; height: 28; radius: 6
                            color: "#F0F9FF"
                            border.width: 1; border.color: "#BAE6FD"
                            Text { anchors.centerIn: parent; text: "⏲"; font.pixelSize: 12; color: "#0284C7" }
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0
                            Text { text: "Pressure"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                            Text {
                                text: (root.isOffline || !TankModel.hasPressure) ? "--" : (TankModel.pressure.toFixed(1) + " hPa")
                                font.pixelSize: 13
                                font.weight: Font.Bold
                                color: (root.isOffline || !TankModel.hasPressure) ? "#94A3B8" : Theme.colors.textPrimary
                            }
                        }
                    }
                }

                // Row 4: Status
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 50
                    radius: 6
                    color: "#F8FAFC"
                    border.width: 1
                    border.color: Theme.colors.border

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 10

                        Rectangle {
                            width: 28; height: 28; radius: 6
                            color: root.isOffline ? "#F1F5F9" : (root.displayStatus === "CRITICAL" ? "#FEE2E2" : (root.displayStatus === "WARNING" ? "#FEF3C7" : "#ECFDF5"))
                            border.width: 1
                            border.color: root.isOffline ? "#CBD5E1" : (root.displayStatus === "CRITICAL" ? "#FECACA" : (root.displayStatus === "WARNING" ? "#FDE68A" : "#A7F3D0"))
                            Text {
                                anchors.centerIn: parent
                                text: root.isOffline ? "○" : (root.displayStatus === "CRITICAL" ? "✕" : (root.displayStatus === "WARNING" ? "!" : "✓"))
                                font.pixelSize: 13
                                font.weight: Font.Bold
                                color: root.isOffline ? "#64748B" : (root.displayStatus === "CRITICAL" ? Theme.colors.critical : (root.displayStatus === "WARNING" ? Theme.colors.warning : Theme.colors.success))
                            }
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0
                            Text { text: "Status"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                            Text {
                                text: root.displayStatus + " · " + root.displayStatusDesc
                                font.pixelSize: 13
                                font.weight: Font.Bold
                                color: root.isOffline ? "#94A3B8" : (root.displayStatus === "CRITICAL" ? Theme.colors.critical : (root.displayStatus === "WARNING" ? Theme.colors.warning : Theme.colors.success))
                                elide: Text.ElideRight
                            }
                        }
                    }
                }
            }
        }

        // Horizontal Divider
        Rectangle {
            Layout.fillWidth: true
            height: 1
            color: Theme.colors.border
        }

        // ====================================================================
        // Section 8: Tank Configuration Parameter Strip (Authoritative Data)
        // ====================================================================
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 40
            spacing: 0

            // Column 1: Tank Height
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 1
                Text { text: "Tank Height"; color: Theme.colors.textSecondary; font.family: Theme.typography.fontFamily; font.pixelSize: 10; font.weight: Font.Medium }
                Text { text: TankModel.tankHeightCm.toFixed(1) + " cm"; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.Bold }
            }

            Rectangle { Layout.preferredHeight: 24; Layout.preferredWidth: 1; color: Theme.colors.border; Layout.rightMargin: 12; Layout.leftMargin: 4 }

            // Column 2: Tank Geometry / Shape
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 1
                Text { text: "Geometry"; color: Theme.colors.textSecondary; font.family: Theme.typography.fontFamily; font.pixelSize: 10; font.weight: Font.Medium }
                Text { text: (TankModel.tankShape && TankModel.tankShape.length > 0) ? TankModel.tankShape : "Rectangular"; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.Bold }
            }

            Rectangle { Layout.preferredHeight: 24; Layout.preferredWidth: 1; color: Theme.colors.border; Layout.rightMargin: 12; Layout.leftMargin: 4 }

            // Column 3: Tank Capacity
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 1
                Text { text: "Authoritative Capacity"; color: Theme.colors.textSecondary; font.family: Theme.typography.fontFamily; font.pixelSize: 10; font.weight: Font.Medium }
                Text { text: TankModel.capacityLiters.toFixed(1) + " L"; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.Bold }
            }

            Rectangle { Layout.preferredHeight: 24; Layout.preferredWidth: 1; color: Theme.colors.border; Layout.rightMargin: 12; Layout.leftMargin: 4 }

            // Column 4: Device ID
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 1
                Text { text: "Device ID"; color: Theme.colors.textSecondary; font.family: Theme.typography.fontFamily; font.pixelSize: 10; font.weight: Font.Medium }
                Text {
                    text: (TankModel.deviceLabel && TankModel.deviceLabel.length > 0) ? TankModel.deviceLabel : "Unassigned"
                    color: (TankModel.deviceLabel && TankModel.deviceLabel.length > 0) ? Theme.colors.primary : "#94A3B8"
                    font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.Bold
                    elide: Text.ElideRight
                }
            }
        }
    }
}
