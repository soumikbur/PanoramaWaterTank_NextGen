import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// Alerts Page — Fully Functional SCADA Alert Management & Monitoring Screen
// ============================================================================
// Features:
// 1. Live system alert calculation matching firmware thresholds (<10% Crit, <20% Warn, >=100% Overflow).
// 2. 4 Dynamic Summary Cards (Critical, Warning, Active, Resolved).
// 3. Current System Status Strip (Live Water Level, Alert State, Sensor, Alarm System, Timestamp).
// 4. Active Alerts List with per-alert Acknowledge action and clear severity styling.
// 5. Zero-state indicator when all parameters are in NORMAL state.
// 6. Alert Transition History Table with Acknowledge / Resolved states.
// ============================================================================
Item {
    id: root

    readonly property bool compact: width < Theme.metrics.compactBreakpoint

    // Authoritative properties derived directly from TankModel
    readonly property double fillPct: TankModel.fillPercentage
    readonly property double waterHeight: TankModel.waterHeightCm
    readonly property double maxHeight: TankModel.tankHeightCm > 0 ? TankModel.tankHeightCm : 50.0
    readonly property string alarmLevel: TankModel.alarmLevel !== "" ? TankModel.alarmLevel : "Normal"
    readonly property string sensorHealth: TankModel.sensorStatus !== "" ? TankModel.sensorStatus : "Healthy"
    readonly property bool isOffline: TankModel.connectionState === "Offline" || !TankModel.hasValidData

    // Direct bindings to authoritative TankModel alerts and counts
    readonly property int criticalCount: TankModel.criticalAlertCount
    readonly property int warningCount: TankModel.warningAlertCount
    readonly property int activeCount: TankModel.activeAlertCount
    readonly property int resolvedCount: TankModel.resolvedAlertCount

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
            anchors.topMargin: 18
            spacing: Theme.metrics.space16

            // ================================================================
            // 1. Page Header with Title, Status & Actions
            // ================================================================
            RowLayout {
                Layout.fillWidth: true
                spacing: 16

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2

                    Text {
                        text: "Alerts"
                        color: "#0F172A"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 24
                        font.weight: Font.Bold
                    }

                    Text {
                        text: "Monitor system alarms and abnormal tank conditions"
                        color: "#64748B"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 14
                    }
                }

                // Header Action Buttons & Status Badge
                RowLayout {
                    spacing: 10
                    Layout.alignment: Qt.AlignVCenter

                    // Alarm System State Badge
                    Rectangle {
                        height: 38
                        width: alarmStateText.implicitWidth + 20
                        radius: 6
                        color: "#EFF6FF"
                        border.color: "#BFDBFE"
                        border.width: 1

                        RowLayout {
                            id: alarmStateText
                            anchors.centerIn: parent
                            spacing: 6
                            Rectangle { width: 6; height: 6; radius: 3; color: "#2563EB" }
                            Text {
                                text: "Alarm System: ENABLED"
                                color: "#1E40AF"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: Font.Bold
                            }
                        }
                    }

                    // Acknowledge All Button
                    StyledButton {
                        text: "Acknowledge All"
                        variant: "secondary"
                        enabled: TankModel.activeAlertCount > 0
                        onClicked: {
                            TankModel.acknowledgeAllAlerts()
                        }
                    }

                    // Clear Resolved Button
                    StyledButton {
                        text: "Clear Resolved"
                        variant: "secondary"
                        enabled: TankModel.resolvedAlertCount > 0
                        onClicked: {
                            TankModel.clearResolvedAlerts()
                        }
                    }
                }
            }

            // ================================================================
            // 2. Alert Summary Statistics Cards (4 Tiles)
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                columns: root.compact ? 2 : 4
                columnSpacing: Theme.metrics.space12
                rowSpacing: Theme.metrics.space12

                // Critical Card
                BaseCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 96
                    padding: 14

                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 2

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "CRITICAL"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                            Rectangle { width: 8; height: 8; radius: 4; color: "#EF4444" }
                        }

                        Text {
                            text: "" + root.criticalCount
                            color: root.criticalCount > 0 ? "#DC2626" : "#0F172A"
                            font.pixelSize: 24
                            font.weight: Font.Bold
                            font.family: Theme.typography.fontFamily
                        }
                        Text { text: "Level < 10% / Overflow"; color: "#94A3B8"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                    }
                }

                // Warning Card
                BaseCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 96
                    padding: 14

                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 2

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "WARNING"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                            Rectangle { width: 8; height: 8; radius: 4; color: "#F59E0B" }
                        }

                        Text {
                            text: "" + root.warningCount
                            color: root.warningCount > 0 ? "#D97706" : "#0F172A"
                            font.pixelSize: 24
                            font.weight: Font.Bold
                            font.family: Theme.typography.fontFamily
                        }
                        Text { text: "Level 10% – 20% Threshold"; color: "#94A3B8"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                    }
                }

                // Active Card
                BaseCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 96
                    padding: 14

                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 2

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "ACTIVE ALARMS"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                            Rectangle { width: 8; height: 8; radius: 4; color: "#3B82F6" }
                        }

                        Text {
                            text: "" + root.activeCount
                            color: root.activeCount > 0 ? Theme.colors.primary : "#0F172A"
                            font.pixelSize: 24
                            font.weight: Font.Bold
                            font.family: Theme.typography.fontFamily
                        }
                        Text { text: "Unresolved Alarm Conditions"; color: "#94A3B8"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                    }
                }

                // Resolved Card
                BaseCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 96
                    padding: 14

                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 2

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "RESOLVED"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                            Rectangle { width: 8; height: 8; radius: 4; color: "#10B981" }
                        }

                        Text {
                            text: "" + root.resolvedCount
                            color: "#059669"
                            font.pixelSize: 24
                            font.weight: Font.Bold
                            font.family: Theme.typography.fontFamily
                        }
                        Text { text: "Historical Recovered Events"; color: "#94A3B8"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                    }
                }
            }

            // ================================================================
            // 3. Current Live System Status Strip
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 14

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 16

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Text { text: "CURRENT WATER LEVEL"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }
                        Text { text: root.fillPct.toFixed(2) + "% (" + root.waterHeight.toFixed(1) + " cm of " + root.maxHeight.toFixed(0) + " cm)"; color: root.alarmLevel === "Critical" || root.alarmLevel === "Overflow" ? "#EF4444" : Theme.colors.primary; font.pixelSize: 15; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }
                    }

                    Rectangle { width: 1; height: 32; color: "#E2E8F0" }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Text { text: "ALERT STATE"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }
                        Text {
                            text: root.alarmLevel.toUpperCase()
                            color: root.alarmLevel === "Critical" || root.alarmLevel === "Overflow" ? "#DC2626" : (root.alarmLevel === "Warning" ? "#D97706" : "#059669")
                            font.pixelSize: 15
                            font.weight: Font.Bold
                            font.family: Theme.typography.fontFamily
                        }
                    }

                    Rectangle { width: 1; height: 32; color: "#E2E8F0" }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Text { text: "SENSOR HEALTH"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }
                        Text { text: root.sensorHealth + " (ADS1115 Active)"; color: "#059669"; font.pixelSize: 15; font.weight: Font.DemiBold; font.family: Theme.typography.fontFamily }
                    }

                    Rectangle { width: 1; height: 32; color: "#E2E8F0" }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Text { text: "LAST TELEMETRY UPDATE"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }
                        Text { text: TankModel.lastUpdated !== "" ? TankModel.lastUpdated : "Live Polling"; color: "#334155"; font.pixelSize: 15; font.weight: Font.Medium; font.family: Theme.typography.fontFamily }
                    }
                }
            }

            // ================================================================
            // 4. Active Alerts Section
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 16

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 14

                    // Active Alerts Section
                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            text: "Active Alerts (" + TankModel.activeAlertCount + ")"
                            color: "#0F172A"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 16
                            font.weight: Font.Bold
                            Layout.fillWidth: true
                        }
                        Text {
                            text: "Firmware logic: <10% Critical, <20% Warning, \u226520% Normal"
                            color: "#94A3B8"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                        }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

                    // Active Alert Cards
                    Repeater {
                        model: TankModel.activeAlerts

                        delegate: Rectangle {
                            required property var modelData

                            Layout.fillWidth: true
                            height: root.compact ? 170 : 110
                            radius: 8
                            color: modelData.bgColor || "#FFFFFF"
                            border.color: modelData.borderColor || "#E2E8F0"
                            border.width: 1

                            RowLayout {
                                anchors.fill: parent
                                anchors.margins: 14
                                spacing: 14

                                // Left Severity Indicator & Badge
                                ColumnLayout {
                                    Layout.preferredWidth: 100
                                    spacing: 4

                                    Rectangle {
                                        height: 24
                                        width: sevText.implicitWidth + 16
                                        radius: 12
                                        color: modelData.severity === "CRITICAL" ? "#FEE2E2" : (modelData.severity === "WARNING" ? "#FEF3C7" : "#EFF6FF")
                                        border.color: modelData.severity === "CRITICAL" ? "#FCA5A5" : (modelData.severity === "WARNING" ? "#FDE68A" : "#BFDBFE")
                                        border.width: 1

                                        Text {
                                            id: sevText
                                            anchors.centerIn: parent
                                            text: modelData.severity || "INFO"
                                            color: modelData.textColor || "#1E3A8A"
                                            font.pixelSize: 11
                                            font.weight: Font.Bold
                                            font.family: Theme.typography.fontFamily
                                        }
                                    }

                                    Text {
                                        text: modelData.timestamp || "--"
                                        color: "#64748B"
                                        font.pixelSize: 11
                                        font.family: Theme.typography.fontFamily
                                    }
                                }

                                // Center Alert Details
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 4

                                    Text {
                                        text: modelData.title || ""
                                        color: modelData.textColor || "#0F172A"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 15
                                        font.weight: Font.Bold
                                    }

                                    Text {
                                        text: modelData.description || ""
                                        color: "#475569"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 13
                                        wrapMode: Text.WordWrap
                                        Layout.fillWidth: true
                                    }

                                    RowLayout {
                                        spacing: 16
                                        Text { text: "Current Level: " + (modelData.currentValue || "--"); color: "#334155"; font.pixelSize: 12; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }
                                        Text { text: "Threshold: " + (modelData.threshold || "--"); color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                    }
                                }

                                // Right Status & Acknowledge Action
                                ColumnLayout {
                                    Layout.preferredWidth: 120
                                    spacing: 6
                                    Layout.alignment: Qt.AlignVCenter

                                    Rectangle {
                                        Layout.alignment: Qt.AlignHCenter
                                        height: 22
                                        width: ackStatusText.implicitWidth + 12
                                        radius: 11
                                        color: modelData.acknowledged ? "#E0E7FF" : "#FEE2E2"

                                        Text {
                                            id: ackStatusText
                                            anchors.centerIn: parent
                                            text: modelData.statusText || "ACTIVE"
                                            color: modelData.acknowledged ? "#3730A3" : "#991B1B"
                                            font.pixelSize: 10
                                            font.weight: Font.Bold
                                        }
                                    }

                                    StyledButton {
                                        Layout.fillWidth: true
                                        text: modelData.acknowledged ? "Acknowledged \u2713" : "Acknowledge"
                                        variant: modelData.acknowledged ? "secondary" : "primary"
                                        enabled: !modelData.acknowledged
                                        onClicked: {
                                            TankModel.acknowledgeAlert(modelData.id);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Zero State (No Active Alerts)
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: 20
                        Layout.bottomMargin: 20
                        visible: TankModel.activeAlertCount === 0
                        spacing: 8

                        Rectangle {
                            Layout.alignment: Qt.AlignHCenter
                            width: 48
                            height: 48
                            radius: 24
                            color: "#ECFDF5"
                            Text {
                                anchors.centerIn: parent
                                text: "\u2713"
                                color: "#059669"
                                font.pixelSize: 24
                                font.weight: Font.Bold
                            }
                        }

                        Text {
                            Layout.alignment: Qt.AlignHCenter
                            text: "No Active Alerts"
                            color: "#059669"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 16
                            font.weight: Font.Bold
                        }

                        Text {
                            Layout.alignment: Qt.AlignHCenter
                            text: "All monitored conditions are currently within normal operating limits (> 20%)."
                            color: "#64748B"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }
                }
            }

            // ================================================================
            // 5. Alert History Log Table
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 16

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            text: "Alert History (" + TankModel.alarmHistory.length + ")"
                            color: "#0F172A"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 16
                            font.weight: Font.Bold
                            Layout.fillWidth: true
                        }
                        Text {
                            text: "Generated on actual state transitions"
                            color: "#94A3B8"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                        }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

                    // Table Column Headers
                    RowLayout {
                        Layout.fillWidth: true
                        Layout.leftMargin: 12
                        Layout.rightMargin: 12
                        spacing: 12

                        Text { text: "TIMESTAMP"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 85 }
                        Text { text: "TANK"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 100 }
                        Text { text: "ALARM"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 180 }
                        Text { text: "SEVERITY"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 90 }
                        Text { text: "MEASURED VALUE"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 120 }
                        Text { text: "THRESHOLD"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 110 }
                        Text { text: "STATUS"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: "#F1F5F9" }

                    // History Rows
                    Repeater {
                        model: TankModel.alarmHistory

                        delegate: Rectangle {
                            required property var modelData
                            required property int index

                            Layout.fillWidth: true
                            height: 48
                            radius: 6
                            color: index % 2 === 1 ? "#FAFAFA" : "#FFFFFF"
                            border.width: 1
                            border.color: "#F1F5F9"

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 12
                                anchors.rightMargin: 12
                                spacing: 12

                                Text { text: modelData.timestamp || "--"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 85 }
                                Text { text: modelData.tank || TankModel.tankName || "--"; color: "#334155"; font.weight: Font.Medium; font.pixelSize: 12; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 100; elide: Text.ElideRight }
                                Text { text: modelData.alarm || modelData.title || "--"; color: "#0F172A"; font.weight: Font.Medium; font.pixelSize: 13; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 180; elide: Text.ElideRight }

                                Rectangle {
                                    Layout.preferredWidth: 90
                                    Layout.alignment: Qt.AlignVCenter
                                    height: 22
                                    width: hSevText.implicitWidth + 14
                                    radius: 11
                                    color: modelData.severity === "CRITICAL" ? "#FEE2E2" : (modelData.severity === "WARNING" ? "#FEF3C7" : "#ECFDF5")

                                    Text {
                                        id: hSevText
                                        anchors.centerIn: parent
                                        text: modelData.severity || "NORMAL"
                                        color: modelData.severity === "CRITICAL" ? "#991B1B" : (modelData.severity === "WARNING" ? "#92400E" : "#065F46")
                                        font.pixelSize: 10
                                        font.weight: Font.Bold
                                    }
                                }

                                Text { text: modelData.value || "--"; color: "#334155"; font.pixelSize: 12; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 120 }
                                Text { text: modelData.threshold || "--"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 110 }

                                Text {
                                    Layout.fillWidth: true
                                    Layout.alignment: Qt.AlignVCenter
                                    text: modelData.status || "--"
                                    color: modelData.status === "Active" ? "#DC2626" : (modelData.status === "Acknowledged" ? "#3B82F6" : "#059669")
                                    font.pixelSize: 12
                                    font.weight: Font.Bold
                                    font.family: Theme.typography.fontFamily
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
