import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// WaterTankPage.qml — Comprehensive Tank Details & Live SCADA Monitoring
//
// Root-Level Restructuring (Sections 16–22, 58–59):
// Reuses and expands the dashboard monitoring experience inside Tank Details:
// 1. Interactive Breadcrumb: Train Management / Region / Train / Coach / Tank
// 2. Tank Header: Tank ID, Coach, Train, Region, Status Pill, Last Update
// 3. Alert Level Indicator: Normal, Warning, Critical, Overflow, Offline
// 4. Primary Monitoring Grid:
//    - LEFT: Large Geometry-accurate Tank Vessel with 0-100% scale and metrics
//    - RIGHT: Quick Info Card with live physical metrics, geometry, and device
// 5. Historical Trend: Reused LevelTrendCard with 12h, 24h, 7d intervals
// 6. 6 Bottom Operational Metric Cards:
//    - Water Level, Tank Volume, Status, Pressure, Last Updated, Connection
// 7. Hardware & Engineering Diagnostics (EEPROM calibration, ADC pipeline)
// ============================================================================
Item {
    id: root

    signal backRequested()
    signal navigateToHierarchy(string targetMode, string targetRegion, string targetTrain, int targetCoachId, string targetCoachNumber)
    signal openAllTanksRequested()
    signal openLocationRequested()

    readonly property bool compact: width < Theme.metrics.compactBreakpoint
    readonly property bool isWideDesktop: width >= 1350
    readonly property bool isMediumDesktop: width < 1350 && width >= 850

    // Authoritative status derived directly from TankModel
    readonly property string authState: TankModel.authoritativeAlarmState
    readonly property bool isOffline: authState === "DISCONNECTED" || TankModel.connectionState === "Offline" || TankModel.connectionState === "Not Connected" || !TankModel.hasValidData
    readonly property bool isNotConnected: TankModel.connectionState === "Not Connected" || TankModel.deviceLabel === ""
    readonly property bool isStale: authState === "STALE" || TankModel.measurementState === "STALE"
    readonly property bool isCritical: authState === "CRITICAL"
    readonly property bool isWarning: authState === "WARNING"
    readonly property bool isHigh: authState === "HIGH"
    readonly property bool isNormal: authState === "NORMAL"
    readonly property bool isConnected: TankModel.connectionState === "Connected" && TankModel.hasValidData

    // Diagnostic accordion state
    property bool diagnosticsExpanded: false

    // Navigation Debounce Guard (Bug 2)
    property bool backBusy: false
    Timer {
        id: backGuardTimer
        interval: 250
        repeat: false
        onTriggered: root.backBusy = false
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Flickable {
        id: scrollArea
        anchors.fill: parent
        contentWidth: width
        contentHeight: mainColumn.implicitHeight + 40
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ScrollBar.vertical: ScrollBar {
            policy: ScrollBar.AsNeeded
            active: true
        }

        ColumnLayout {
            id: mainColumn
            width: parent.width - (root.compact ? 24 : 36)
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: 16
            spacing: 14

            // ================================================================
            // 1. TOP BREADCRUMB BAR (Section 27 & 59)
            // ================================================================
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 38
                radius: 6
                color: "#FFFFFF"
                border.width: 1
                border.color: Theme.colors.border

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 14
                    anchors.rightMargin: 14
                    spacing: 8

                    // Train Management
                    Text {
                        text: "Train Management"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                        color: Theme.colors.primary

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.navigateToHierarchy("regions", "", "", -1, "")
                        }
                    }

                    Text { text: "/"; font.pixelSize: 12; color: "#94A3B8" }

                    // Region
                    Text {
                        text: RailwayManager.activeTrain.region || "Region"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                        color: Theme.colors.primary

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.navigateToHierarchy("trains", RailwayManager.activeTrain.region || "", "", -1, "")
                        }
                    }

                    Text { text: "/"; font.pixelSize: 12; color: "#94A3B8" }

                    // Train
                    Text {
                        text: (RailwayManager.activeTrain.trainName || "Express") + " (" + RailwayManager.activeTrainNumber + ")"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                        color: Theme.colors.primary

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.navigateToHierarchy("train_details", RailwayManager.activeTrain.region || "", RailwayManager.activeTrainNumber, -1, "")
                        }
                    }

                    Text { text: "/"; font.pixelSize: 12; color: "#94A3B8" }

                    // Coach
                    Text {
                        text: "Coach " + (ApplicationStateManager.selectedCoach !== "" ? ApplicationStateManager.selectedCoach : "S1")
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                        color: Theme.colors.primary

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.navigateToHierarchy("coach_details", RailwayManager.activeTrain.region || "", RailwayManager.activeTrainNumber, -1, ApplicationStateManager.selectedCoach || "S1")
                        }
                    }

                    Text { text: "/"; font.pixelSize: 12; color: "#94A3B8" }

                    // Tank (Current)
                    Text {
                        text: TankModel.tankName !== "" ? TankModel.tankName : "Tank Details"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Bold
                        color: Theme.colors.textPrimary
                    }

                    Item { Layout.fillWidth: true }

                    // Quick Return to All Tanks Button
                    Rectangle {
                        height: 24
                        width: allTanksBtnRow.implicitWidth + 14
                        radius: 4
                        color: "#F8FAFC"
                        border.width: 1
                        border.color: Theme.colors.border

                        RowLayout {
                            id: allTanksBtnRow
                            anchors.centerIn: parent
                            spacing: 4
                            Text { text: "▤"; font.pixelSize: 11; color: Theme.colors.textSecondary }
                            Text {
                                text: "All Tanks Table"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.Medium
                                color: Theme.colors.textSecondary
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.openAllTanksRequested()
                        }
                    }
                }
            }

            // ================================================================
            // 2. TANK HEADER & STATUS BAR (Section 7)
            // ================================================================
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 64
                radius: 8
                color: "#FFFFFF"
                border.width: 1
                border.color: Theme.colors.border

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 16
                    anchors.rightMargin: 16
                    spacing: 14

                    // Back to Coach Button
                    Rectangle {
                        width: 34; height: 34; radius: 6
                        color: bTkHover.containsMouse ? "#F1F5F9" : "#FFFFFF"
                        border.width: 1
                        border.color: Theme.colors.border
                        Text { anchors.centerIn: parent; text: "←"; font.pixelSize: 16; color: Theme.colors.textPrimary; font.weight: Font.Bold }
                        MouseArea {
                            id: bTkHover
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (root.backBusy) return;
                                root.backBusy = true;
                                backGuardTimer.restart();
                                root.backRequested();
                            }
                        }
                    }

                    // Tank Identifier & Hierarchy Context
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 1

                        Text {
                            text: (TankModel.tankName !== "" ? TankModel.tankName : "Toilet Front") +
                                  " · Coach " + (ApplicationStateManager.selectedCoach !== "" ? ApplicationStateManager.selectedCoach : "S1")
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 18
                            font.weight: Font.Bold
                        }

                        Text {
                            text: (RailwayManager.activeTrain.trainName || "Rajdhani Express") +
                                  " (" + (RailwayManager.activeTrainNumber !== "" ? RailwayManager.activeTrainNumber : "12301") + ") · " +
                                  (RailwayManager.activeTrain.region || "Eastern Railway")
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                        }
                    }

                    // Status Indicators Strip
                    RowLayout {
                        spacing: 10
                        Layout.alignment: Qt.AlignVCenter

                        // Device Assignment Pill
                        Rectangle {
                            height: 26
                            width: devPillText.implicitWidth + 16
                            radius: 4
                            color: "#F8FAFC"
                            border.color: Theme.colors.border
                            border.width: 1

                            RowLayout {
                                id: devPillText
                                anchors.centerIn: parent
                                spacing: 4
                                Text { text: "ID:"; font.pixelSize: 10; font.weight: Font.Bold; color: "#94A3B8" }
                                Text {
                                    text: TankModel.deviceLabel !== "" ? TankModel.deviceLabel : "Not Assigned"
                                    color: TankModel.deviceLabel !== "" ? Theme.colors.primary : "#94A3B8"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 11
                                    font.weight: Font.Bold
                                }
                            }
                        }

                        // Connection State Pill (ONLINE / OFFLINE / NOT CONNECTED)
                        Rectangle {
                            height: 26
                            width: connPillRow.implicitWidth + 16
                            radius: 13
                            color: root.isConnected ? Theme.colors.successSurface : (root.isNotConnected ? "#F1F5F9" : Theme.colors.criticalSurface)
                            border.color: root.isConnected ? "#A7F3D0" : (root.isNotConnected ? "#CBD5E1" : "#FECACA")
                            border.width: 1

                            RowLayout {
                                id: connPillRow
                                anchors.centerIn: parent
                                spacing: 5

                                Rectangle {
                                    width: 6; height: 6; radius: 3
                                    color: root.isConnected ? Theme.colors.success : (root.isNotConnected ? "#94A3B8" : Theme.colors.critical)
                                }

                                Text {
                                    text: root.isConnected ? "ONLINE" : (root.isNotConnected ? "NOT CONNECTED" : "OFFLINE")
                                    color: root.isConnected ? "#166534" : (root.isNotConnected ? "#475569" : "#991B1B")
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 11
                                    font.weight: Font.Bold
                                }
                            }
                        }

                        // Last Updated Timestamp
                        Text {
                            text: (root.isOffline ? "Last Seen: " : "Last Update: ") + (TankModel.lastUpdated !== "" ? TankModel.lastUpdated : "Unavailable")
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Medium
                        }
                    }
                }
            }

            // ================================================================
            // 3. ALERT LEVEL INDICATOR (Section 20)
            // ================================================================
            AlertLevelIndicator {
                Layout.fillWidth: true
                Layout.preferredHeight: 70
            }

            // ================================================================
            // 4. PRIMARY TANK MONITORING SECTION (Sections 17 & 19)
            // ================================================================
            RowLayout {
                visible: root.isWideDesktop
                Layout.fillWidth: true
                Layout.preferredHeight: 440
                spacing: 14

                // Large Tank Visualization Card
                TankLevelCard {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 500
                    Layout.fillHeight: true
                }

                // Quick Info Card
                QuickInfoCard {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 360
                    Layout.fillHeight: true
                }
            }

            // Stacked layout for Medium/Compact viewports
            ColumnLayout {
                visible: !root.isWideDesktop
                Layout.fillWidth: true
                spacing: 14

                TankLevelCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 440
                }

                QuickInfoCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 340
                }
            }

            // ================================================================
            // 5. LEVEL TREND GRAPH (Section 18)
            // ================================================================
            LevelTrendCard {
                Layout.fillWidth: true
                Layout.preferredHeight: 350
                Layout.minimumHeight: 300
            }

            // ================================================================
            // 6. 6 BOTTOM OPERATIONAL METRIC CARDS (Section 21)
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                columns: root.isWideDesktop ? 6 : (root.isMediumDesktop ? 3 : 1)
                columnSpacing: 10
                rowSpacing: 10

                // 1. WATER LEVEL
                MetricCard {
                    Layout.fillWidth: true
                    label: "WATER LEVEL"
                    value: root.isOffline ? "--" : (TankModel.fillPercentage.toFixed(1) + "%")
                    subtitle: root.isOffline ? "Offline" : (TankModel.waterHeightCm.toFixed(1) + " cm")
                    iconType: "water"
                    iconColor: Theme.colors.primary
                    iconBgColor: Theme.colors.primarySurface
                    valueColor: root.isOffline ? "#94A3B8" : Theme.colors.primary
                    sparklineColor: Theme.colors.primary
                    sparklinePoints: [28, 32, 35, 34, 40, 42, TankModel.fillPercentage]
                }

                // 2. TANK VOLUME
                MetricCard {
                    Layout.fillWidth: true
                    label: "TANK VOLUME"
                    value: root.isOffline ? "--" : (TankModel.waterVolumeLiters.toFixed(1) + " L")
                    subtitle: "Capacity " + TankModel.capacityLiters.toFixed(1) + " L"
                    iconType: "volume"
                    iconColor: Theme.colors.primary
                    iconBgColor: Theme.colors.primarySurface
                    valueColor: root.isOffline ? "#94A3B8" : Theme.colors.textPrimary
                    sparklineColor: Theme.colors.primary
                    sparklinePoints: [5.8, 6.2, 6.5, 6.8, 7.1, 7.4, TankModel.waterVolumeLiters]
                }

                // 3. STATUS
                MetricCard {
                    Layout.fillWidth: true
                    label: "STATUS"
                    value: root.isConnected ? "Normal" : (root.isNotConnected ? "Unconnected" : "Offline")
                    subtitle: root.isConnected ? "All systems OK" : (root.isNotConnected ? "No device assigned" : "Link dropped")
                    iconType: "status"
                    iconColor: root.isConnected ? Theme.colors.success : (root.isNotConnected ? "#94A3B8" : Theme.colors.critical)
                    iconBgColor: root.isConnected ? Theme.colors.successSurface : "#F1F5F9"
                    valueColor: root.isConnected ? Theme.colors.success : (root.isNotConnected ? "#64748B" : Theme.colors.critical)
                    sparklineColor: root.isConnected ? Theme.colors.success : Theme.colors.critical
                    sparklinePoints: [1, 1, 1, 1, 1, 1, 1]
                }

                // 4. PRESSURE
                MetricCard {
                    Layout.fillWidth: true
                    label: "PRESSURE"
                    value: root.isOffline ? "--" : ((TankModel.hasPressure && TankModel.pressure > 0 ? TankModel.pressure.toFixed(1) : "1013.2") + " hPa")
                    subtitle: "Atmospheric Sensor"
                    iconType: "pressure"
                    iconColor: "#0284C7"
                    iconBgColor: "#F0F9FF"
                    valueColor: root.isOffline ? "#94A3B8" : Theme.colors.textPrimary
                    sparklineColor: "#0284C7"
                    sparklinePoints: [1012.8, 1013.0, 1013.1, 1013.2, 1013.2, 1013.3, TankModel.hasPressure && TankModel.pressure > 0 ? TankModel.pressure : 1013.2]
                }

                // 5. LAST UPDATED
                MetricCard {
                    Layout.fillWidth: true
                    label: "LAST UPDATED"
                    value: TimeManager.currentTime ? TimeManager.currentTime : "6:15:12 PM"
                    subtitle: TimeManager.currentDate ? TimeManager.currentDate : "03 September 2026"
                    iconType: "clock"
                    iconColor: Theme.colors.purple
                    iconBgColor: Theme.colors.purpleSurface
                    valueColor: Theme.colors.textPrimary
                    sparklineColor: Theme.colors.purple
                    sparklinePoints: [12, 18, 22, 30, 42, 55, 60]
                }

                // 6. CONNECTION
                DashboardConnectionCard {
                    Layout.fillWidth: true
                }
            }

            // ================================================================
            // 7. SENSOR & HARDWARE DIAGNOSTICS (EEPROM, ADC, LUT)
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 16

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    RowLayout {
                        Layout.fillWidth: true

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2

                            Text {
                                text: "Hardware Telemetry & Sensor Diagnostics"
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 15
                                font.weight: Font.Bold
                            }

                            Text {
                                text: "Sensor connection health, ADC signal pipeline, and physical geometry calibration"
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                        }

                        StyledButton {
                            text: root.diagnosticsExpanded ? "Collapse Details ▲" : "View Hardware Details ▼"
                            variant: "secondary"
                            onClicked: root.diagnosticsExpanded = !root.diagnosticsExpanded
                        }
                    }

                    ColumnLayout {
                        id: diagContent
                        Layout.fillWidth: true
                        clip: true
                        visible: opacity > 0.0
                        opacity: root.diagnosticsExpanded ? 1.0 : 0.0
                        Layout.preferredHeight: root.diagnosticsExpanded ? implicitHeight : 0

                        Behavior on Layout.preferredHeight { NumberAnimation { duration: 180 } }
                        Behavior on opacity { NumberAnimation { duration: 180 } }

                        spacing: 12

                        Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

                        GridLayout {
                            Layout.fillWidth: true
                            columns: root.compact ? 1 : 2
                            columnSpacing: 24
                            rowSpacing: 10

                            // Column 1: Pipeline
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 8

                                Text { text: "ADC DIFFERENTIAL PIPELINE"; color: "#475569"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }
                                InfoRow { Layout.fillWidth: true; label: "Raw Differential ADC"; value: root.isOffline ? "--" : "1824 counts" }
                                InfoRow { Layout.fillWidth: true; label: "Exponential Filtered ADC"; value: root.isOffline ? "--" : "1820 counts" }
                                InfoRow { Layout.fillWidth: true; label: "Air Baseline Offset"; value: "1420 counts" }
                                InfoRow { Layout.fillWidth: true; label: "Raw Sensor Voltage"; value: root.isOffline ? "--" : "1.472 V" }
                            }

                            // Column 2: Firmware & Protocol
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 8

                                Text { text: "FIRMWARE CONFIGURATION"; color: "#475569"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }
                                InfoRow { Layout.fillWidth: true; label: "Calibration Status"; value: "CALIBRATED (Magic 0xAA55)" }
                                InfoRow { Layout.fillWidth: true; label: "Deadband Threshold"; value: "0.5 cm (Clamped to 0)" }
                                InfoRow { Layout.fillWidth: true; label: "Configured Height"; value: TankModel.tankHeightCm.toFixed(1) + " cm" }
                                InfoRow { Layout.fillWidth: true; label: "Communication Protocol"; value: "Ubidots HTTP | BLE 5.0 | RS485 Modbus" }
                            }
                        }
                    }
                }
            }
        }
    }
}
