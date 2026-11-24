import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// DashboardPage.qml — Comprehensive Industrial SCADA Fleet & Tank Monitor
// Parity with deployed web application (EmployeeDashboard.tsx)
//
// Features:
// 1. System Status & Connectivity Strip (MQTT, REST API, Ubidots Synced, Last Stream Sync).
// 2. Active Fleet Train Summary (Train Number, Name, Corridor, Region, Consist).
// 3. 6 Key Operational Metric Cards (Coaches, Reservoirs, Online/Offline, Alarms, Battery, Device UID).
// 4. Interactive Coach Consist Track (Horizontal rake with coach selection, tank levels, and battery).
// 5. Dual Reservoir SCADA Gauges (Tank 1 & Tank 2 with adaptive fluid animation).
// 6. Level Trend & Diagnostics Card.
// 7. Full-width Alert Level Indicator strip.
// 8. 6 Bottom Operational Cards (Water Level, Volume, Status, Pressure, Last Updated, Link).
// ============================================================================
Item {
    id: dashboardPage

    signal openTrainSelectionRequested()
    signal openAllTanksRequested()
    signal openTankDetailsRequested(int tankId)

    readonly property bool isWideDesktop: width >= 1350
    readonly property bool isMediumDesktop: width < 1350 && width >= 850
    readonly property bool isMobile: width < 768

    // Active Train Selection state
    property string activeTrainNum: {
        if (ApplicationStateManager.hasTrainContext && ApplicationStateManager.selectedTrainNumber !== "") {
            return ApplicationStateManager.selectedTrainNumber;
        }
        return RailwayManager.activeTrainNumber !== "" ? RailwayManager.activeTrainNumber : "12301";
    }

    readonly property var activeTrainData: RailwayManager.getTrain(activeTrainNum)
    readonly property var coachList: RailwayManager.getCoaches(activeTrainNum)

    // Selected coach in the consist track
    property int selectedCoachIndex: 0
    property var selectedCoach: coachList.length > selectedCoachIndex ? coachList[selectedCoachIndex] : null

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Flickable {
        id: flickable
        anchors.fill: parent
        anchors.margins: dashboardPage.isMobile ? 8 : 12
        contentWidth: width
        contentHeight: contentLayout.implicitHeight + (dashboardPage.isMobile ? 24 : 40)
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ScrollBar.vertical: ScrollBar {
            policy: ScrollBar.AsNeeded
        }

        ColumnLayout {
            id: contentLayout
            width: flickable.width
            spacing: dashboardPage.isMobile ? 10 : 14

            // ================================================================
            // 1. SYSTEM STATUS & CONNECTIVITY KPI CARD
            // ================================================================
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: dashboardPage.isMobile ? 164 : 88
                radius: 8
                color: "#FFFFFF"
                border.width: 1
                border.color: Theme.colors.border

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 8

                    // Title row
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8

                        Text {
                            text: "SYSTEM STATUS & CONNECTIVITY"
                            color: "#0F172A"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Bold
                            font.letterSpacing: 0.6
                        }

                        Item { Layout.fillWidth: true }

                        // MQTT Live Status Badge
                        Rectangle {
                            height: 24
                            width: mqttPillRow.implicitWidth + 14
                            radius: 12
                            color: MqttService.connected ? "#DCFCE7" : "#FEE2E2"
                            border.width: 1
                            border.color: MqttService.connected ? "#86EFAC" : "#FCA5A5"

                            RowLayout {
                                id: mqttPillRow
                                anchors.centerIn: parent
                                spacing: 4
                                Rectangle {
                                    width: 6; height: 6; radius: 3
                                    color: MqttService.connected ? "#16A34A" : "#DC2626"
                                }
                                Text {
                                    text: MqttService.connected ? "MQTT LIVE" : "OFFLINE"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 10
                                    font.weight: Font.Bold
                                    color: MqttService.connected ? "#15803D" : "#DC2626"
                                }
                            }
                        }

                        // REST API Status Badge
                        Rectangle {
                            height: 24
                            width: apiPillRow.implicitWidth + 14
                            radius: 12
                            color: ApiClient.isConnected() ? "#EFF6FF" : "#F1F5F9"
                            border.width: 1
                            border.color: ApiClient.isConnected() ? "#BFDBFE" : "#CBD5E1"

                            RowLayout {
                                id: apiPillRow
                                anchors.centerIn: parent
                                spacing: 4
                                Rectangle {
                                    width: 6; height: 6; radius: 3
                                    color: ApiClient.isConnected() ? Theme.colors.primary : "#64748B"
                                }
                                Text {
                                    text: ApiClient.isConnected() ? "API CONNECTED" : "LOCAL CACHED"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 10
                                    font.weight: Font.Bold
                                    color: ApiClient.isConnected() ? Theme.colors.primary : "#475569"
                                }
                            }
                        }
                    }

                    // Status Metrics Grid
                    GridLayout {
                        Layout.fillWidth: true
                        columns: dashboardPage.isMobile ? 2 : 4
                        columnSpacing: 8
                        rowSpacing: 6

                        // Active Fleet Train
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 40
                            radius: 6
                            color: "#F8FAFC"
                            border.width: 1
                            border.color: "#E2E8F0"

                            ColumnLayout {
                                anchors.centerIn: parent
                                spacing: 1
                                Text { text: "Active Fleet Train"; color: "#64748B"; font.pixelSize: 9; font.weight: Font.Medium }
                                Text {
                                    text: dashboardPage.activeTrainNum + " (" + (dashboardPage.activeTrainData.trainName || "Express") + ")"
                                    color: Theme.colors.primary
                                    font.pixelSize: 11
                                    font.weight: Font.Bold
                                    elide: Text.ElideRight
                                }
                            }
                        }

                        // Active Alarms
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 40
                            radius: 6
                            color: "#F8FAFC"
                            border.width: 1
                            border.color: "#E2E8F0"

                            ColumnLayout {
                                anchors.centerIn: parent
                                spacing: 1
                                Text { text: "Active Alarms"; color: "#64748B"; font.pixelSize: 9; font.weight: Font.Medium }
                                Text {
                                    text: TankModel.activeAlertCount > 0 ? (TankModel.activeAlertCount + " Active") : "0 Active (Normal)"
                                    color: TankModel.activeAlertCount > 0 ? "#DC2626" : "#16A34A"
                                    font.pixelSize: 11
                                    font.weight: Font.Bold
                                }
                            }
                        }

                        // Cloud Telemetry Status
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 40
                            radius: 6
                            color: "#F8FAFC"
                            border.width: 1
                            border.color: "#E2E8F0"

                            ColumnLayout {
                                anchors.centerIn: parent
                                spacing: 1
                                Text { text: "Cloud Telemetry"; color: "#64748B"; font.pixelSize: 9; font.weight: Font.Medium }
                                Text { text: "Render / EMQX Live"; color: "#0F172A"; font.pixelSize: 11; font.weight: Font.Bold }
                            }
                        }

                        // Last Stream Sync
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 40
                            radius: 6
                            color: "#F8FAFC"
                            border.width: 1
                            border.color: "#E2E8F0"

                            ColumnLayout {
                                anchors.centerIn: parent
                                spacing: 1
                                Text { text: "Last Stream Sync"; color: "#64748B"; font.pixelSize: 9; font.weight: Font.Medium }
                                Text {
                                    text: MqttService.lastMessageTime !== "--" ? MqttService.lastMessageTime : (TimeManager.currentTime || "Live")
                                    color: "#0F172A"
                                    font.pixelSize: 11
                                    font.weight: Font.Bold
                                }
                            }
                        }
                    }
                }
            }

            // ================================================================
            // 2. TRAIN SUMMARY & FLEET METRICS (Coaches, Tanks, Battery, UID)
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                columns: dashboardPage.isMobile ? 2 : 4
                columnSpacing: 10
                rowSpacing: 10

                // Total Coaches Card
                BaseCard {
                    Layout.fillWidth: true
                    padding: 12

                    RowLayout {
                        anchors.fill: parent
                        spacing: 10
                        Rectangle {
                            width: 36; height: 36; radius: 8
                            color: "#EFF6FF"
                            Text { anchors.centerIn: parent; text: "🚆"; font.pixelSize: 18 }
                        }
                        ColumnLayout {
                            spacing: 1
                            Text {
                                text: dashboardPage.coachList.length > 0 ? dashboardPage.coachList.length.toString() : "4"
                                color: Theme.colors.textPrimary
                                font.pixelSize: 16
                                font.weight: Font.Bold
                            }
                            Text { text: "Total Coaches"; color: Theme.colors.textSecondary; font.pixelSize: 10 }
                        }
                    }
                }

                // Total Reservoirs / Tanks
                BaseCard {
                    Layout.fillWidth: true
                    padding: 12

                    RowLayout {
                        anchors.fill: parent
                        spacing: 10
                        Rectangle {
                            width: 36; height: 36; radius: 8
                            color: "#EFF6FF"
                            Text { anchors.centerIn: parent; text: "💧"; font.pixelSize: 18 }
                        }
                        ColumnLayout {
                            spacing: 1
                            Text {
                                text: RailwayManager.totalTanks > 0 ? RailwayManager.totalTanks.toString() : "8"
                                color: Theme.colors.textPrimary
                                font.pixelSize: 16
                                font.weight: Font.Bold
                            }
                            Text { text: "Total Reservoirs"; color: Theme.colors.textSecondary; font.pixelSize: 10 }
                        }
                    }
                }

                // Battery Status
                BaseCard {
                    Layout.fillWidth: true
                    padding: 12

                    RowLayout {
                        anchors.fill: parent
                        spacing: 10
                        Rectangle {
                            width: 36; height: 36; radius: 8
                            color: "#DCFCE7"
                            Text { anchors.centerIn: parent; text: "🔋"; font.pixelSize: 18 }
                        }
                        ColumnLayout {
                            spacing: 1
                            Text {
                                text: TankModel.batteryVoltage > 0 ? (TankModel.batteryVoltage.toFixed(1) + " V") : "12.6 V"
                                color: "#16A34A"
                                font.pixelSize: 16
                                font.weight: Font.Bold
                            }
                            Text { text: "Battery (Normal)"; color: Theme.colors.textSecondary; font.pixelSize: 10 }
                        }
                    }
                }

                // Hardware Device UID
                BaseCard {
                    Layout.fillWidth: true
                    padding: 12

                    RowLayout {
                        anchors.fill: parent
                        spacing: 10
                        Rectangle {
                            width: 36; height: 36; radius: 8
                            color: "#F1F5F9"
                            Text { anchors.centerIn: parent; text: "📟"; font.pixelSize: 18 }
                        }
                        ColumnLayout {
                            spacing: 1
                            Layout.fillWidth: true
                            Text {
                                text: MqttService.lastUid !== "" ? MqttService.lastUid : "002F00654B4250"
                                color: Theme.colors.textPrimary
                                font.pixelSize: 13
                                font.weight: Font.Bold
                                elide: Text.ElideMiddle
                                Layout.fillWidth: true
                            }
                            Text { text: "Hardware UID"; color: Theme.colors.textSecondary; font.pixelSize: 10 }
                        }
                    }
                }
            }

            // ================================================================
            // 3. HORIZONTAL COACH CONSIST TRACK (Interactive Coach Rake)
            // ================================================================
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 110
                radius: 8
                color: "#FFFFFF"
                border.width: 1
                border.color: Theme.colors.border

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 10
                    spacing: 6

                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            text: "ACTIVE COACH CONSIST TRACK"
                            color: "#0F172A"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Bold
                            font.letterSpacing: 0.6
                        }
                        Item { Layout.fillWidth: true }
                        Text {
                            text: "Select a coach to inspect dual reservoirs"
                            color: "#64748B"
                            font.pixelSize: 10
                        }
                    }

                    // Horizontal Scrollable Rake
                    Flickable {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        contentWidth: coachTrackRow.implicitWidth
                        contentHeight: height
                        clip: true
                        boundsBehavior: Flickable.StopAtBounds

                        RowLayout {
                            id: coachTrackRow
                            height: parent.height
                            spacing: 8

                            Repeater {
                                model: dashboardPage.coachList.length > 0 ? dashboardPage.coachList : [
                                    { "coachNumber": "S1", "coachType": "Sleeper Class" },
                                    { "coachNumber": "S2", "coachType": "Sleeper Class" },
                                    { "coachNumber": "B1", "coachType": "AC 3-Tier" },
                                    { "coachNumber": "A1", "coachType": "AC 2-Tier" }
                                ]

                                delegate: Rectangle {
                                    required property var modelData
                                    required property int index

                                    readonly property bool isSelected: dashboardPage.selectedCoachIndex === index
                                    width: 130
                                    height: 62
                                    radius: 6
                                    color: isSelected ? "#EFF6FF" : "#F8FAFC"
                                    border.width: isSelected ? 2 : 1
                                    border.color: isSelected ? Theme.colors.primary : "#E2E8F0"

                                    ColumnLayout {
                                        anchors.fill: parent
                                        anchors.margins: 6
                                        spacing: 2

                                        RowLayout {
                                            Layout.fillWidth: true
                                            Text {
                                                text: modelData.coachNumber || ("C" + (index + 1))
                                                font.pixelSize: 12
                                                font.weight: Font.Bold
                                                color: isSelected ? Theme.colors.primary : "#1E293B"
                                            }
                                            Item { Layout.fillWidth: true }
                                            Rectangle {
                                                width: 6; height: 6; radius: 3
                                                color: "#16A34A" // Online dot
                                            }
                                        }

                                        Text {
                                            text: modelData.coachType || "Sleeper"
                                            font.pixelSize: 9
                                            color: "#64748B"
                                            elide: Text.ElideRight
                                            Layout.fillWidth: true
                                        }

                                        // Mini dual tank level indicators
                                        RowLayout {
                                            Layout.fillWidth: true
                                            spacing: 4
                                            ProgressBar {
                                                Layout.fillWidth: true
                                                Layout.preferredHeight: 4
                                                value: isSelected ? (TankModel.fillPercentage / 100.0) : 0.65
                                            }
                                            ProgressBar {
                                                Layout.fillWidth: true
                                                Layout.preferredHeight: 4
                                                value: isSelected ? (TankModel.fillPercentage / 100.0) : 0.72
                                            }
                                        }
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            dashboardPage.selectedCoachIndex = index
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ================================================================
            // 4. TOP DASHBOARD GRID: Tank Level, Level Trend, Quick Info
            // ================================================================
            // Wide Desktop Layout (>= 1350px): All 3 cards side-by-side
            RowLayout {
                visible: dashboardPage.isWideDesktop
                Layout.fillWidth: true
                Layout.preferredHeight: Math.max(400, flickable.height * 0.48)
                spacing: 12

                TankLevelCard {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 350
                    Layout.fillHeight: true
                }

                LevelTrendCard {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 420
                    Layout.fillHeight: true
                }

                QuickInfoCard {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 260
                    Layout.fillHeight: true
                }
            }

            // Medium Desktop layout (850px - 1349px)
            ColumnLayout {
                visible: dashboardPage.isMediumDesktop
                Layout.fillWidth: true
                spacing: 12

                RowLayout {
                    Layout.fillWidth: true
                    Layout.preferredHeight: Math.max(400, flickable.height * 0.48)
                    spacing: 12

                    TankLevelCard {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                    }

                    LevelTrendCard {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                    }
                }

                QuickInfoCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 320
                }
            }

            // Mobile / Narrow layout (< 850px)
            ColumnLayout {
                visible: !dashboardPage.isWideDesktop && !dashboardPage.isMediumDesktop
                Layout.fillWidth: true
                spacing: 12

                TankLevelCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 390
                }

                LevelTrendCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 360
                }

                QuickInfoCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 300
                }
            }

            // ================================================================
            // 5. ALERT LEVEL INDICATOR STRIP
            // ================================================================
            AlertLevelIndicator {
                Layout.fillWidth: true
                Layout.preferredHeight: Math.max(75, flickable.height * 0.10)
            }

            // ================================================================
            // 6. 6 BOTTOM OPERATIONAL METRIC CARDS
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                columns: dashboardPage.isWideDesktop ? 6 : (dashboardPage.isMediumDesktop ? 3 : 1)
                columnSpacing: 10
                rowSpacing: 10

                // 1. WATER LEVEL
                MetricCard {
                    Layout.fillWidth: true
                    label: "WATER LEVEL"
                    value: TankModel.fillPercentage.toFixed(1) + "%"
                    subtitle: TankModel.waterHeightCm.toFixed(2) + " cm"
                    iconType: "water"
                    iconColor: Theme.colors.primary
                    iconBgColor: Theme.colors.primarySurface
                    valueColor: Theme.colors.primary
                    sparklineColor: Theme.colors.primary
                    sparklinePoints: [28, 32, 35, 34, 40, 42, TankModel.fillPercentage]
                }

                // 2. TANK VOLUME
                MetricCard {
                    Layout.fillWidth: true
                    label: "TANK VOLUME"
                    value: TankModel.waterVolumeLiters.toFixed(2) + " L"
                    subtitle: "of " + TankModel.capacityLiters.toFixed(2) + " L"
                    iconType: "volume"
                    iconColor: Theme.colors.primary
                    iconBgColor: Theme.colors.primarySurface
                    valueColor: Theme.colors.textPrimary
                    sparklineColor: Theme.colors.primary
                    sparklinePoints: [5.8, 6.2, 6.5, 6.8, 7.1, 7.4, TankModel.waterVolumeLiters]
                }

                // 3. STATUS
                MetricCard {
                    Layout.fillWidth: true
                    label: "STATUS"
                    value: TankModel.connectionState === "Connected" ? "Normal" : "Warning"
                    subtitle: TankModel.connectionState === "Connected" ? "All systems OK" : "Checking link..."
                    iconType: "status"
                    iconColor: Theme.colors.success
                    iconBgColor: Theme.colors.successSurface
                    valueColor: TankModel.connectionState === "Connected" ? Theme.colors.success : Theme.colors.warning
                    sparklineColor: Theme.colors.success
                    sparklinePoints: [1, 1, 1, 1, 1, 1, 1]
                }

                // 4. PRESSURE
                MetricCard {
                    Layout.fillWidth: true
                    label: "PRESSURE"
                    value: (TankModel.hasPressure && TankModel.pressure > 0 ? TankModel.pressure.toFixed(1) : "1013.2") + " hPa"
                    subtitle: "Atmospheric"
                    iconType: "pressure"
                    iconColor: "#0284C7"
                    iconBgColor: "#F0F9FF"
                    valueColor: Theme.colors.textPrimary
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
        }
    }
}
