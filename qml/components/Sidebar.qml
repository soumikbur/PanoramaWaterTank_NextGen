import QtQuick
import QtQuick.Controls
import QtQuick.Window
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Modern Industrial IoT / SCADA Left Sidebar Navigation Panel.
// Fixed 224px width, white surface (#FFFFFF), subtle right border (#E7ECF2),
// brand header with water drop icon, MAIN and SYSTEM navigation sections,
// SYSTEM STATUS operational card, and copyright footer.
Rectangle {
    id: root

    property int currentIndex: 0
    signal itemClicked(int navIndex)

    readonly property int activeAlertCount: TankModel.activeAlertCount

    readonly property var primaryNavItems: [
        { label: "Train Management", icon: "train", navIndex: 0, badge: 0 },
        { label: "All Tanks", icon: "all-tanks", navIndex: 1, badge: 0 },
        { label: "Devices", icon: "devices", navIndex: 2, badge: 0 },
        { label: "Location", icon: "location", navIndex: 3, badge: 0 },
        { label: "Alerts", icon: "alerts", navIndex: 4, badge: TrainManager.filteredAlertCount },
        { label: "History", icon: "history", navIndex: 5, badge: 0 },
        { label: "Reports", icon: "reports", navIndex: 6, badge: 0 }
    ]

    readonly property var systemNavItems: [
        { label: "Settings", icon: "settings", navIndex: 7, badge: 0, adminOnly: true },
        { label: "Configuration", icon: "config", navIndex: 8, badge: 0 },
        { label: "Users", icon: "users", navIndex: 9, badge: 0, adminOnly: true },
        { label: "Logs", icon: "logs", navIndex: 10, badge: 0 }
    ]

    property bool isCollapsed: Settings.sidebarCollapsed
    readonly property int expandedWidth: Theme.metrics.sidebarDefaultWidth
    readonly property int collapsedWidth: 68
    readonly property real expandRatio: Math.max(0.0, Math.min(1.0, (width - collapsedWidth) / Math.max(1, expandedWidth - collapsedWidth)))
    readonly property bool isNarrow: width < 140

    width: isCollapsed ? collapsedWidth : expandedWidth
    Layout.preferredWidth: width
    Layout.minimumWidth: collapsedWidth
    Layout.maximumWidth: expandedWidth
    Layout.fillHeight: true
    clip: true
    color: "#FFFFFF"

    Behavior on width {
        NumberAnimation {
            duration: Theme.reducedMotion ? 0 : Theme.animSidebar
            easing.type: Easing.OutCubic
        }
    }

    // Right border vertical divider
    Rectangle {
        anchors.right: parent.right
        width: 1
        height: parent.height
        color: Theme.colors.border
        z: 2
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.leftMargin: root.isNarrow ? 8 : 14
        anchors.rightMargin: root.isNarrow ? 8 : 14
        anchors.topMargin: 16
        anchors.bottomMargin: 14
        spacing: 0

        // ====================================================================
        // 1. Branding Header Area
        // ====================================================================
        Item {
            id: brandingArea
            Layout.fillWidth: true
            Layout.preferredHeight: 56

            RowLayout {
                anchors.fill: parent
                spacing: 10

                // Clean Blue Water-Drop Icon Container
                Rectangle {
                    Layout.preferredWidth: 38
                    Layout.preferredHeight: 38
                    Layout.alignment: root.isCollapsed ? Qt.AlignCenter : Qt.AlignVCenter
                    radius: 10
                    color: Theme.colors.primarySurface
                    border.width: 1
                    border.color: "#DBEAFE"

                    Shape {
                        anchors.centerIn: parent
                        width: 18
                        height: 22
                        antialiasing: true

                        ShapePath {
                            fillColor: Theme.colors.primary
                            strokeColor: "transparent"
                            PathSvg {
                                path: "M9,1.5 C9,1.5 2,10.5 2,14.5 C2,18.6 5.1,21.5 9,21.5 C12.9,21.5 16,18.6 16,14.5 C16,10.5 9,1.5 9,1.5 Z"
                            }
                        }
                    }
                }

                // Brand text
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignVCenter
                    spacing: 1
                    opacity: Math.max(0.0, (root.expandRatio - 0.4) / 0.6)
                    visible: opacity > 0

                    Text {
                        text: "PANORAMA"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 15
                        font.weight: Font.Bold
                        font.letterSpacing: 0.8
                    }

                    Text {
                        text: "Water Tank Monitor"
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Medium
                    }
                }
            }
        }

        // Divider below branding
        Rectangle {
            Layout.fillWidth: true
            Layout.topMargin: 10
            Layout.bottomMargin: 10
            height: 1
            color: Theme.colors.divider
        }

        // ====================================================================
        // Train Summary Panel (Clean 2x2 SCADA Metric Layout + Alerts Row)
        // ====================================================================
        Rectangle {
            id: trainSummaryCard
            Layout.fillWidth: true
            Layout.preferredHeight: summaryCol.implicitHeight + 18
            Layout.bottomMargin: 10
            radius: 8
            color: "#F8FAFC"
            border.width: 1
            border.color: "#E2E8F0"
            opacity: Math.max(0.0, (root.expandRatio - 0.5) / 0.5)
            visible: opacity > 0

            ColumnLayout {
                id: summaryCol
                anchors.fill: parent
                anchors.leftMargin: 10
                anchors.rightMargin: 10
                anchors.topMargin: 8
                anchors.bottomMargin: 8
                spacing: 6

                // Header: TRAIN SUMMARY
                Text {
                    text: "TRAIN SUMMARY"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 10
                    font.weight: Font.Bold
                    font.letterSpacing: 0.8
                    color: "#94A3B8"
                }

                // Active train context indicator (Section 19)
                Rectangle {
                    Layout.fillWidth: true
                    height: 22
                    radius: 4
                    color: (ApplicationStateManager.hasTrainContext || RailwayManager.activeTrainNumber !== "") ? "#EFF6FF" : "#F1F5F9"
                    border.width: 1
                    border.color: (ApplicationStateManager.hasTrainContext || RailwayManager.activeTrainNumber !== "") ? "#BFDBFE" : "#E2E8F0"

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 8
                        anchors.rightMargin: 8
                        spacing: 6

                        Rectangle {
                            width: 6; height: 6; radius: 3
                            color: (ApplicationStateManager.hasTrainContext || RailwayManager.activeTrainNumber !== "") ? Theme.colors.primary : "#94A3B8"
                        }

                        Text {
                            Layout.fillWidth: true
                            text: {
                                var hasTr = ApplicationStateManager.hasTrainContext || (RailwayManager.activeTrainNumber !== "");
                                if (!hasTr) return "No Train Selected";
                                var tNum = ApplicationStateManager.hasTrainContext ? ApplicationStateManager.selectedTrainNumber : RailwayManager.activeTrainNumber;
                                var tRec = RailwayManager.getTrain(tNum);
                                var tName = ApplicationStateManager.hasTrainContext && ApplicationStateManager.selectedTrainName !== ""
                                            ? ApplicationStateManager.selectedTrainName
                                            : ((tRec && tRec.trainName) ? tRec.trainName : (RailwayManager.activeTrain.trainName || "Rajdhani Express"));
                                return tNum + " · " + tName;
                            }
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: (ApplicationStateManager.hasTrainContext || RailwayManager.activeTrainNumber !== "") ? Font.Bold : Font.Medium
                            color: (ApplicationStateManager.hasTrainContext || RailwayManager.activeTrainNumber !== "") ? Theme.colors.primary : "#94A3B8"
                            elide: Text.ElideRight
                        }
                    }
                }

                // Route/Region under train name
                Text {
                    visible: ApplicationStateManager.hasTrainContext || (RailwayManager.activeTrainNumber !== "")
                    Layout.fillWidth: true
                    text: {
                        var tNum = ApplicationStateManager.hasTrainContext ? ApplicationStateManager.selectedTrainNumber : RailwayManager.activeTrainNumber;
                        var tRec = RailwayManager.getTrain(tNum);
                        if (tRec && tRec.region) return tRec.region;
                        var info = TrainConfigProvider.trainInfo(tNum);
                        if (info && info.source && info.destination) {
                            return info.source + " → " + info.destination;
                        }
                        return RailwayManager.activeTrain.region || "Eastern Railway";
                    }
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 10
                    font.weight: Font.Medium
                    color: "#64748B"
                    elide: Text.ElideRight
                    Layout.leftMargin: 2
                }

                // 2x2 Metric Grid: Coaches, Tanks / Online, Offline
                GridLayout {
                    Layout.fillWidth: true
                    columns: 2
                    columnSpacing: 10
                    rowSpacing: 4

                    readonly property bool hasTr: ApplicationStateManager.hasTrainContext || (RailwayManager.activeTrainNumber !== "")
                    readonly property var trRec: hasTr ? RailwayManager.getTrain(ApplicationStateManager.hasTrainContext ? ApplicationStateManager.selectedTrainNumber : RailwayManager.activeTrainNumber) : null

                    // Cell 1: Coaches
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0
                        Text {
                            text: {
                                if (!parent.parent.hasTr) return "0";
                                var rec = parent.parent.trRec;
                                if (rec && rec.coachCount !== undefined && rec.coachCount > 0) return rec.coachCount.toString();
                                if (RailwayManager.coaches && RailwayManager.coaches.length > 0) return RailwayManager.coaches.length.toString();
                                return "1";
                            }
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 15
                            font.weight: Font.Bold
                            color: Theme.colors.textPrimary
                        }
                        Text {
                            text: "Coaches"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 10
                            font.weight: Font.Medium
                            color: "#64748B"
                        }
                    }

                    // Cell 2: Tanks
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0
                        Text {
                            text: {
                                if (!parent.parent.hasTr) return "0";
                                var rec = parent.parent.trRec;
                                if (rec && rec.tankCount !== undefined && rec.tankCount > 0) return rec.tankCount.toString();
                                if (TrainManager.filteredTotalTanks > 0) return TrainManager.filteredTotalTanks.toString();
                                return "1";
                            }
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 15
                            font.weight: Font.Bold
                            color: Theme.colors.textPrimary
                        }
                        Text {
                            text: "Tanks"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 10
                            font.weight: Font.Medium
                            color: "#64748B"
                        }
                    }

                    // Cell 3: Online
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0
                        Text {
                            text: {
                                if (!parent.parent.hasTr) return "0";
                                var rec = parent.parent.trRec;
                                if (rec && rec.onlineTanks !== undefined) return rec.onlineTanks.toString();
                                if (TrainManager.filteredOnlineTanks > 0) return TrainManager.filteredOnlineTanks.toString();
                                return (TankModel.connectionState === "Connected" && TankModel.hasValidData) ? "1" : "0";
                            }
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 15
                            font.weight: Font.Bold
                            color: "#16A34A"
                        }
                        Text {
                            text: "Online"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 10
                            font.weight: Font.Medium
                            color: "#64748B"
                        }
                    }

                    // Cell 4: Offline
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0
                        Text {
                            text: {
                                if (!parent.parent.hasTr) return "0";
                                var rec = parent.parent.trRec;
                                if (rec && rec.offlineTanks !== undefined) return rec.offlineTanks.toString();
                                return TrainManager.filteredOfflineTanks.toString();
                            }
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 15
                            font.weight: Font.Bold
                            color: (parent.parent.hasTr && TrainManager.filteredOfflineTanks > 0) ? "#DC2626" : "#64748B"
                        }
                        Text {
                            text: "Offline"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 10
                            font.weight: Font.Medium
                            color: "#64748B"
                        }
                    }
                }

                // Compact separate divider and Alerts row
                Rectangle {
                    Layout.fillWidth: true
                    height: 1
                    color: "#E2E8F0"
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6
                    Text {
                        text: "Alerts"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Medium
                        color: "#64748B"
                        Layout.fillWidth: true
                    }
                    Text {
                        text: {
                            var hasTr = ApplicationStateManager.hasTrainContext || (RailwayManager.activeTrainNumber !== "");
                            if (!hasTr) return "0";
                            var tRec = RailwayManager.getTrain(ApplicationStateManager.hasTrainContext ? ApplicationStateManager.selectedTrainNumber : RailwayManager.activeTrainNumber);
                            var cnt = (tRec && tRec.criticalTanks !== undefined) ? (tRec.criticalTanks + (tRec.warningTanks || 0)) : TrainManager.filteredAlertCount;
                            return cnt.toString();
                        }
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Bold
                        color: "#64748B"
                    }
                }
            }
        }

        // Collapsed: Compact Train Indicator Button with Tooltip
        Rectangle {
            id: compactTrainCard
            Layout.preferredWidth: 38
            Layout.preferredHeight: 38
            Layout.alignment: Qt.AlignCenter
            Layout.bottomMargin: 10
            radius: 8
            color: ApplicationStateManager.hasTrainContext ? "#EFF6FF" : "#F8FAFC"
            border.width: 1
            border.color: ApplicationStateManager.hasTrainContext ? "#BFDBFE" : "#E2E8F0"
            opacity: Math.max(0.0, (0.4 - root.expandRatio) / 0.4)
            visible: opacity > 0

            // Train icon
            Item {
                anchors.centerIn: parent
                width: 18
                height: 18

                Rectangle {
                    x: 2; y: 1
                    width: 14; height: 13
                    radius: 3
                    color: "transparent"
                    border.width: 1.5
                    border.color: ApplicationStateManager.hasTrainContext ? Theme.colors.primary : "#94A3B8"
                }
                Rectangle {
                    x: 4.5; y: 3
                    width: 9; height: 3.5
                    radius: 1
                    color: "transparent"
                    border.width: 1.0
                    border.color: ApplicationStateManager.hasTrainContext ? Theme.colors.primary : "#94A3B8"
                }
                Rectangle {
                    x: 4.5; y: 9.5
                    width: 2.5; height: 2.5
                    radius: 1.25
                    color: ApplicationStateManager.hasTrainContext ? Theme.colors.primary : "#94A3B8"
                }
                Rectangle {
                    x: 11; y: 9.5
                    width: 2.5; height: 2.5
                    radius: 1.25
                    color: ApplicationStateManager.hasTrainContext ? Theme.colors.primary : "#94A3B8"
                }
            }

            // Small status dot at top-right
            Rectangle {
                anchors.top: parent.top
                anchors.right: parent.right
                anchors.topMargin: 3
                anchors.rightMargin: 3
                width: 6; height: 6; radius: 3
                color: ApplicationStateManager.hasTrainContext ? Theme.colors.primary : "#94A3B8"
            }

            ToolTip.visible: compactTrainHover.hovered
            ToolTip.text: ApplicationStateManager.hasTrainContext
                ? (ApplicationStateManager.selectedTrainNumber + " · " + ApplicationStateManager.selectedTrainName + "\n" +
                   TrainManager.filteredTotalTanks + " Tanks (" + TrainManager.filteredOnlineTanks + " Online)")
                : "No Train Selected"
            ToolTip.delay: 200

            HoverHandler {
                id: compactTrainHover
            }
        }

        // ====================================================================
        // 2. PRIMARY Navigation Section
        // ====================================================================
        Text {
            text: "PRIMARY"
            color: "#94A3B8"
            font.family: Theme.typography.fontFamily
            font.pixelSize: 10
            font.weight: Font.Bold
            font.letterSpacing: 1.0
            Layout.leftMargin: 8
            Layout.topMargin: 2
            Layout.bottomMargin: 4
            opacity: Math.max(0.0, (root.expandRatio - 0.3) / 0.7)
            visible: opacity > 0
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 2

            Repeater {
                model: root.primaryNavItems

                delegate: NavItem {
                    required property var modelData

                    Layout.fillWidth: true
                    label: modelData.label
                    iconGlyph: modelData.icon
                    badgeCount: modelData.badge
                    active: root.currentIndex === modelData.navIndex || (root.currentIndex === 11 && modelData.navIndex === 0)
                    collapsed: root.isNarrow
                    onClicked: {
                        root.currentIndex = modelData.navIndex;
                        root.itemClicked(modelData.navIndex);
                    }
                }
            }
        }

        // ====================================================================
        // 3. SYSTEM Navigation Section
        // ====================================================================
        Text {
            text: "SYSTEM"
            color: "#94A3B8"
            font.family: Theme.typography.fontFamily
            font.pixelSize: 10
            font.weight: Font.Bold
            font.letterSpacing: 1.0
            Layout.topMargin: 12
            Layout.bottomMargin: 4
            Layout.leftMargin: 8
            opacity: Math.max(0.0, (root.expandRatio - 0.3) / 0.7)
            visible: opacity > 0
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 2

            Repeater {
                model: root.systemNavItems

                delegate: NavItem {
                    required property var modelData

                    visible: !modelData.adminOnly || PermissionManager.isAdmin
                    Layout.fillWidth: true
                    label: modelData.label
                    iconGlyph: modelData.icon
                    badgeCount: modelData.badge
                    active: root.currentIndex === modelData.navIndex
                    collapsed: root.isNarrow
                    onClicked: {
                        root.currentIndex = modelData.navIndex;
                        root.itemClicked(modelData.navIndex);
                    }
                }
            }
        }

        // Vertical Spacer
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: 8
        }

        // ====================================================================
        // 4. Bottom-Left System Status Card
        // ====================================================================
        Rectangle {
            id: statusCard
            Layout.fillWidth: true
            Layout.preferredHeight: 76
            radius: 10
            color: "#F8FAFC"
            border.color: Theme.colors.border
            border.width: 1
            opacity: Math.max(0.0, (root.expandRatio - 0.5) / 0.5)
            visible: opacity > 0

            readonly property bool isConnected: TankModel.connectionState === "Connected"
            readonly property bool isOperational: isConnected && TankModel.telemetryHealthState === "VALID"
            readonly property bool hasSensorError: isConnected && TankModel.telemetryHealthState === "SENSOR_ERROR"
            readonly property bool isWaitingData: isConnected && TankModel.telemetryHealthState === "WAITING_FOR_DATA"
            readonly property bool isStale: isConnected && TankModel.telemetryHealthState === "DATA_STALE"

            readonly property color statusColor: isOperational ? Theme.colors.success : (hasSensorError ? Theme.colors.critical : ((isWaitingData || isStale || TankModel.connectionState === "Connecting") ? Theme.colors.warning : Theme.colors.critical))
            readonly property color statusSurfaceColor: isOperational ? Theme.colors.successSurface : (hasSensorError ? Theme.colors.criticalSurface : ((isWaitingData || isStale || TankModel.connectionState === "Connecting") ? Theme.colors.warningSurface : Theme.colors.criticalSurface))
            readonly property color statusBorderColor: isOperational ? "#DCFCE7" : (hasSensorError ? "#FEE2E2" : ((isWaitingData || isStale || TankModel.connectionState === "Connecting") ? "#FEF3C7" : "#FEE2E2"))
            readonly property string statusTitle: isOperational ? "All Systems Operational" : (hasSensorError ? "Sensor Fault" : (isWaitingData ? "Waiting for Telemetry" : (isStale ? "Data Stale" : (TankModel.connectionState === "Connecting" ? "Connecting..." : "System Offline"))))
            readonly property string statusSubtext: isOperational ? "Monitoring active" : (hasSensorError ? "Check ADS1115 / Sensor" : (isWaitingData ? "Device connected" : (isStale ? "Telemetry delayed" : (TankModel.connectionState === "Connecting" ? "Negotiating link" : "Check network link"))))

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                anchors.topMargin: 10
                anchors.bottomMargin: 10
                spacing: 12

                // Shield / check icon container
                Rectangle {
                    Layout.preferredWidth: 32
                    Layout.preferredHeight: 32
                    Layout.alignment: Qt.AlignVCenter
                    radius: 8
                    color: statusCard.statusSurfaceColor
                    border.width: 1
                    border.color: statusCard.statusBorderColor

                    // Shield check mark icon
                    Shape {
                        anchors.centerIn: parent
                        width: 16
                        height: 16
                        antialiasing: true

                        ShapePath {
                            fillColor: "transparent"
                            strokeColor: statusCard.statusColor
                            strokeWidth: 1.8
                            capStyle: ShapePath.RoundCap
                            joinStyle: ShapePath.RoundJoin
                            PathSvg {
                                path: "M3,4 L8,2 L13,4 C13,9 8,13 8,13 C8,13 3,9 3,4 Z M5.5,7.5 L7.2,9.2 L10.5,5.8"
                            }
                        }
                    }
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignVCenter
                    spacing: 2
                    visible: root.width > 120

                    Text {
                        text: "SYSTEM STATUS"
                        color: "#94A3B8"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Medium
                        font.letterSpacing: 0.8
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 4

                        Rectangle {
                            width: 6
                            height: 6
                            radius: 3
                            color: statusCard.statusColor
                            Layout.alignment: Qt.AlignVCenter
                        }

                        Text {
                            text: statusCard.statusTitle
                            color: statusCard.statusColor
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            font.weight: Font.Bold
                            Layout.fillWidth: true
                            wrapMode: Text.Wrap
                            lineHeight: 1.1
                        }
                    }

                    Text {
                        text: statusCard.statusSubtext
                        color: "#64748B"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Normal
                    }
                }
            }
        }

        // Collapsed Compact Status Indicator
        Rectangle {
            id: compactStatusCard
            Layout.preferredWidth: 38
            Layout.preferredHeight: 38
            Layout.alignment: Qt.AlignCenter
            radius: 8
            color: statusCard.statusSurfaceColor
            border.width: 1
            border.color: statusCard.statusBorderColor
            opacity: Math.max(0.0, (0.4 - root.expandRatio) / 0.4)
            visible: opacity > 0

            Shape {
                anchors.centerIn: parent
                width: 16
                height: 16
                antialiasing: true

                ShapePath {
                    fillColor: "transparent"
                    strokeColor: statusCard.statusColor
                    strokeWidth: 1.8
                    capStyle: ShapePath.RoundCap
                    joinStyle: ShapePath.RoundJoin
                    PathSvg {
                        path: "M3,4 L8,2 L13,4 C13,9 8,13 8,13 C8,13 3,9 3,4 Z M5.5,7.5 L7.2,9.2 L10.5,5.8"
                    }
                }
            }

            ToolTip.visible: compactStatusHover.hovered
            ToolTip.text: "System Status: " + statusCard.statusTitle
            ToolTip.delay: 200

            HoverHandler {
                id: compactStatusHover
            }
        }

        // ====================================================================
        // 5. Dedicated Sidebar Collapse / Expand Control
        // Placed directly UNDER System Status and ABOVE footer
        // ====================================================================
        Rectangle {
            id: collapseBtn
            Layout.fillWidth: true
            Layout.preferredHeight: 34
            Layout.topMargin: 8
            radius: 6
            color: collapseMouse.pressed ? "#DBEAFE" : (collapseMouse.containsMouse ? "#EFF6FF" : "#F8FAFC")
            border.width: 1
            border.color: collapseMouse.containsMouse ? Theme.colors.primary : "#E2E8F0"

            Behavior on color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }
            Behavior on border.color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: root.isCollapsed ? 0 : 10
                anchors.rightMargin: root.isCollapsed ? 0 : 10
                spacing: 8

                Item {
                    Layout.preferredWidth: 16
                    Layout.preferredHeight: 16
                    Layout.alignment: root.isCollapsed ? Qt.AlignCenter : Qt.AlignVCenter

                    Shape {
                        anchors.centerIn: parent
                        width: 12
                        height: 12
                        antialiasing: true

                        ShapePath {
                            fillColor: "transparent"
                            strokeColor: collapseMouse.containsMouse ? Theme.colors.primary : "#64748B"
                            strokeWidth: 1.8
                            capStyle: ShapePath.RoundCap
                            joinStyle: ShapePath.RoundJoin
                            PathSvg {
                                path: root.isCollapsed
                                    ? "M4,2 L8,6 L4,10"
                                    : "M8,2 L4,6 L8,10"
                            }
                        }
                    }
                }

                Text {
                    Layout.fillWidth: true
                    text: "Collapse Navigation"
                    color: collapseMouse.containsMouse ? Theme.colors.primary : "#64748B"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Medium
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                    opacity: Math.max(0.0, (root.expandRatio - 0.5) / 0.5)
                    visible: opacity > 0
                }
            }

            ToolTip.visible: collapseMouse.containsMouse
            ToolTip.text: root.isCollapsed ? "Expand navigation" : "Collapse navigation"
            ToolTip.delay: 300

            MouseArea {
                id: collapseMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    Settings.sidebarCollapsed = !Settings.sidebarCollapsed
                }
            }
        }

        // ====================================================================
        // 6. Copyright Footer
        // ====================================================================
        ColumnLayout {
            Layout.fillWidth: true
            Layout.topMargin: 12
            spacing: 2
            opacity: Math.max(0.0, (root.expandRatio - 0.6) / 0.4)
            visible: opacity > 0

            Text {
                text: "\u00A9 2026 Panorama Systems"
                color: "#94A3B8"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 10
            }

            Text {
                text: "All rights reserved."
                color: "#94A3B8"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 10
            }
        }
    }
}
