import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// AlertLevelIndicator.qml — SCADA Threshold Level Indicator
// Displays horizontal threshold bar with 4 distinct operational zones:
// CRITICAL (0-10%), WARNING (10-20%), NORMAL (20-90%), GOOD (90-100%).
// Current value marker (▼ 18.8%) is placed directly on/above the bar,
// pointing down at the current percentage position.
// ============================================================================
BaseCard {
    id: root

    Layout.fillWidth: true
    Layout.preferredHeight: 126
    Layout.minimumHeight: 120

    readonly property bool isOffline: TankModel.connectionState === "Offline" || TankModel.connectionState === "Not Connected" || !TankModel.hasValidData
    readonly property real currentPercentage: Math.max(0.0, Math.min(100.0, TankModel.fillPercentage))
    readonly property string alarmState: {
        if (isOffline) return "OFFLINE";
        var alm = (TankModel.authoritativeAlarmState || TankModel.alarmLevel || "NORMAL").toUpperCase();
        if (alm === "DISCONNECTED") return "OFFLINE";
        return alm;
    }

    ColumnLayout {
        Layout.fillWidth: true
        Layout.fillHeight: true
        spacing: 4

        // 1. Header: Title + Active Alarm State Pill
        RowLayout {
            Layout.fillWidth: true

            Text {
                text: "Alert Level Indicator"
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 15
                font.weight: Font.Bold
            }

            Item { Layout.fillWidth: true }

            Rectangle {
                height: 22
                width: stText.implicitWidth + 16
                radius: 11
                color: {
                    if (root.alarmState === "CRITICAL") return "#FEE2E2";
                    if (root.alarmState === "WARNING") return "#FEF3C7";
                    if (root.alarmState === "GOOD" || root.alarmState === "NORMAL") return "#ECFDF5";
                    return "#F1F5F9";
                }
                border.width: 1
                border.color: {
                    if (root.alarmState === "CRITICAL") return "#FECACA";
                    if (root.alarmState === "WARNING") return "#FDE68A";
                    if (root.alarmState === "GOOD" || root.alarmState === "NORMAL") return "#A7F3D0";
                    return "#CBD5E1";
                }

                RowLayout {
                    anchors.centerIn: parent
                    spacing: 5
                    Rectangle {
                        width: 6; height: 6; radius: 3
                        color: {
                            if (root.alarmState === "CRITICAL") return Theme.colors.critical;
                            if (root.alarmState === "WARNING") return Theme.colors.warning;
                            if (root.alarmState === "GOOD" || root.alarmState === "NORMAL") return Theme.colors.success;
                            return "#94A3B8";
                        }
                    }
                    Text {
                        id: stText
                        text: root.alarmState
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: {
                            if (root.alarmState === "CRITICAL") return "#991B1B";
                            if (root.alarmState === "WARNING") return "#92400E";
                            if (root.alarmState === "GOOD" || root.alarmState === "NORMAL") return "#166534";
                            return "#475569";
                        }
                    }
                }
            }
        }

        // 2. Current Value Marker Strip (Directly Above/On the Bar, pointing DOWN)
        Item {
            id: markerTrack
            Layout.fillWidth: true
            Layout.preferredHeight: 24

            readonly property real targetX: root.isOffline ? (markerTrack.width / 2) : ((root.currentPercentage / 100.0) * markerTrack.width)

            Item {
                id: markerGroup
                x: Math.max(0, Math.min(markerTrack.width - width, markerTrack.targetX - width / 2))
                width: 52
                height: parent.height

                Behavior on x {
                    NumberAnimation { duration: Theme.reducedMotion ? 0 : Theme.animSlow; easing.type: Easing.OutCubic }
                }

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0

                    // Percentage Readout Badge
                    Text {
                        Layout.alignment: Qt.AlignHCenter
                        text: root.isOffline ? "--" : (root.currentPercentage.toFixed(1) + "%")
                        color: {
                            if (root.isOffline) return "#94A3B8";
                            if (root.currentPercentage < 10.0) return Theme.colors.critical;
                            if (root.currentPercentage < 20.0) return Theme.colors.warning;
                            return Theme.colors.primary;
                        }
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Bold
                    }

                    // Downward Triangle Pointer (▼) directly on the bar top
                    Shape {
                        Layout.alignment: Qt.AlignHCenter
                        width: 10
                        height: 6
                        antialiasing: true

                        ShapePath {
                            fillColor: {
                                if (root.isOffline) return "#94A3B8";
                                if (root.currentPercentage < 10.0) return Theme.colors.critical;
                                if (root.currentPercentage < 20.0) return Theme.colors.warning;
                                return Theme.colors.primary;
                            }
                            strokeColor: "transparent"
                            startX: 0; startY: 0
                            PathLine { x: 10; y: 0 }
                            PathLine { x: 5; y: 6 }
                            PathLine { x: 0; y: 0 }
                        }
                    }
                }
            }
        }

        // 3. Horizontal Status Bar with 4 Color Zones (GPU Accelerated)
        Rectangle {
            id: barContainer
            Layout.fillWidth: true
            Layout.preferredHeight: 24
            radius: 4
            clip: true

            RowLayout {
                anchors.fill: parent
                spacing: 0

                // 1. Critical (0-10% RED #EF4444)
                Rectangle {
                    Layout.fillHeight: true
                    Layout.preferredWidth: Math.round(barContainer.width * 0.10)
                    color: "#EF4444"
                    Text {
                        anchors.centerIn: parent
                        text: "CRITICAL"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 9
                        font.weight: Font.Bold
                        color: "#FFFFFF"
                        visible: parent.width > 44
                    }
                }
                Rectangle { width: 1; Layout.fillHeight: true; color: "#66FFFFFF" }

                // 2. Warning (10-20% ORANGE #F59E0B)
                Rectangle {
                    Layout.fillHeight: true
                    Layout.preferredWidth: Math.round(barContainer.width * 0.10)
                    color: "#F59E0B"
                    Text {
                        anchors.centerIn: parent
                        text: "WARNING"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 9
                        font.weight: Font.Bold
                        color: "#FFFFFF"
                        visible: parent.width > 44
                    }
                }
                Rectangle { width: 1; Layout.fillHeight: true; color: "#66FFFFFF" }

                // 3. Normal (20-90% YELLOW/GOLD #EAB308)
                Rectangle {
                    Layout.fillHeight: true
                    Layout.preferredWidth: Math.round(barContainer.width * 0.70)
                    color: "#EAB308"
                    Text {
                        anchors.centerIn: parent
                        text: "NORMAL"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 9
                        font.weight: Font.Bold
                        color: "#FFFFFF"
                    }
                }
                Rectangle { width: 1; Layout.fillHeight: true; color: "#66FFFFFF" }

                // 4. Good (90-100% GREEN #16A34A)
                Rectangle {
                    Layout.fillHeight: true
                    Layout.fillWidth: true
                    color: "#16A34A"
                    Text {
                        anchors.centerIn: parent
                        text: "GOOD"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 9
                        font.weight: Font.Bold
                        color: "#FFFFFF"
                        visible: parent.width > 35
                    }
                }
            }
        }

        // 4. Percentage Scale Row directly below the bar (0%, 10%, 20%, 90%, 100%)
        Item {
            id: scaleLabelsArea
            Layout.fillWidth: true
            Layout.preferredHeight: 14

            Text {
                text: "0%"
                anchors.left: parent.left
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 10
                font.weight: Font.Medium
            }

            Text {
                text: "10%"
                x: Math.max(0, scaleLabelsArea.width * 0.10 - implicitWidth / 2)
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 10
                font.weight: Font.Medium
            }

            Text {
                text: "20%"
                x: Math.max(0, scaleLabelsArea.width * 0.20 - implicitWidth / 2)
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 10
                font.weight: Font.Medium
            }

            Text {
                text: "90%"
                x: Math.min(scaleLabelsArea.width - implicitWidth, scaleLabelsArea.width * 0.90 - implicitWidth / 2)
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 10
                font.weight: Font.Medium
            }

            Text {
                text: "100%"
                anchors.right: parent.right
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 10
                font.weight: Font.Medium
            }
        }
    }
}
