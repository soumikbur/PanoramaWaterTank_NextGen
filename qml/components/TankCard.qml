import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// TankCard.qml — Exact Industrial SCADA Tank Card for "All Tanks" Grid
// Matches physical train WLI device specification and UI layout reference.
// ============================================================================
Rectangle {
    id: root

    // Tank Data Properties
    property string tankId: ""
    property string deviceId: ""
    property string coachId: ""
    property string coachName: "Coach S1"
    property string tankName: "Tank 001"
    property string tankType: "Main Tank"

    property real maxHeightCm: 50.0
    property real capacityLiters: 2500.0

    property real levelCm: 0.0
    property real levelPercent: 0.0
    property real volumeLiters: 0.0

    property string connectionState: "Offline"  // "Online", "Offline", "Connecting"
    property string sensorStatus: "Healthy"    // "Healthy", "Disconnected", "Error"
    property string alarmState: "Normal"       // "Normal", "Warning", "Critical", "Offline"

    signal cardClicked(string id)

    // Derived states
    readonly property bool isOffline: connectionState === "Offline" || sensorStatus === "Disconnected" || sensorStatus === "Error"
    readonly property bool isCritical: !isOffline && (alarmState === "Critical" || levelPercent < 10.0)
    readonly property bool isWarning: !isOffline && !isCritical && (alarmState === "Warning" || levelPercent < 20.0)
    readonly property bool isNormal: !isOffline && !isCritical && !isWarning

    // Dimensions & styling
    Layout.fillWidth: true
    Layout.preferredHeight: 210
    implicitHeight: 210
    height: 210
    radius: 10
    clip: true

    // Background color per state
    color: isOffline ? "#FEF2F2" : (isCritical ? "#FEF2F2" : (isWarning ? "#FFFBEB" : "#FFFFFF"))

    // Border styling per state & hover
    border.width: 1
    border.color: {
        if (mouseArea.containsMouse) {
            return isOffline ? "#F87171" : (isCritical ? "#F87171" : (isWarning ? "#FBBF24" : Theme.colors.primary));
        }
        return isOffline ? "#FECACA" : (isCritical ? "#FECACA" : (isWarning ? "#FDE68A" : "#E2E8F0"));
    }

    scale: mouseArea.pressed ? 0.985 : (mouseArea.containsMouse ? 1.01 : 1.0)

    Behavior on scale {
        NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad }
    }

    Behavior on border.color {
        ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
    }

    Behavior on color {
        ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
    }

    // Main Card Layout
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 6

        // ====================================================================
        // 1. Header: Coach Name + Chevron, Tank ID, Tank Type
        // ====================================================================
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 2

            RowLayout {
                Layout.fillWidth: true

                Text {
                    text: root.coachName
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 14
                    font.weight: Font.DemiBold
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                }

                // Top Right Chevron '>'
                Text {
                    text: "\u203A"
                    color: "#94A3B8"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 18
                    font.weight: Font.Bold
                    Layout.alignment: Qt.AlignRight
                }
            }

            Text {
                text: root.tankName
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                font.weight: Font.Medium
                elide: Text.ElideRight
            }

            Text {
                text: root.tankType
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 11
                font.weight: Font.Normal
                elide: Text.ElideRight
            }
        }

        // ====================================================================
        // 2. Metrics Section: Water Drop Icon + Pct + Height + Volume
        // ====================================================================
        RowLayout {
            Layout.fillWidth: true
            spacing: 12
            Layout.topMargin: 2
            Layout.bottomMargin: 2

            // Water Drop Circular Container
            Rectangle {
                Layout.preferredWidth: 38
                Layout.preferredHeight: 38
                radius: 19
                color: {
                    if (root.isOffline || root.isCritical) return "#FEE2E2";
                    if (root.isWarning) return "#FEF3C7";
                    return "#E0F2FE";
                }
                border.width: 1
                border.color: {
                    if (root.isOffline || root.isCritical) return "#FECACA";
                    if (root.isWarning) return "#FDE68A";
                    return "#BAE6FD";
                }

                Shape {
                    anchors.centerIn: parent
                    width: 16
                    height: 20
                    antialiasing: true

                    ShapePath {
                        fillColor: {
                            if (root.isOffline || root.isCritical) return "#DC2626";
                            if (root.isWarning) return "#D97706";
                            return "#0284C7";
                        }
                        strokeColor: "transparent"
                        PathSvg {
                            path: "M8,1.2 C8,1.2 1.8,9.2 1.8,12.8 C1.8,16.5 4.6,19.0 8,19.0 C11.4,19.0 14.2,16.5 14.2,12.8 C14.2,9.2 8,1.2 8,1.2 Z"
                        }
                    }
                }
            }

            // Stacked Metrics
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 1

                // Percentage
                Text {
                    text: root.isOffline ? "--" : (root.levelPercent.toFixed(1) + "%")
                    color: {
                        if (root.isOffline) return "#94A3B8";
                        if (root.isCritical) return "#DC2626";
                        if (root.isWarning) return "#D97706";
                        return "#0284C7";
                    }
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 20
                    font.weight: Font.Bold
                }

                // Height: current cm / max cm
                Text {
                    text: root.isOffline 
                        ? ("-- / " + root.maxHeightCm.toFixed(1) + " cm")
                        : (root.levelCm.toFixed(1) + " cm / " + root.maxHeightCm.toFixed(1) + " cm")
                    color: root.isOffline ? "#94A3B8" : "#64748B"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Normal
                }

                // Volume: current L / capacity L
                Text {
                    text: root.isOffline
                        ? ("-- / " + Number(Math.round(root.capacityLiters)).toLocaleString(Qt.locale()) + " L")
                        : (Number(Math.round(root.volumeLiters)).toLocaleString(Qt.locale()) + " L / " + Number(Math.round(root.capacityLiters)).toLocaleString(Qt.locale()) + " L")
                    color: root.isOffline ? "#94A3B8" : "#64748B"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Normal
                }
            }
        }

        // ====================================================================
        // 3. Horizontal Progress Bar
        // ====================================================================
        Rectangle {
            id: progressTrack
            Layout.fillWidth: true
            Layout.preferredHeight: 6
            radius: 3
            color: root.isOffline ? "#F1F5F9" : "#E2E8F0"
            clip: true

            Rectangle {
                anchors.left: parent.left
                anchors.top: parent.top
                anchors.bottom: parent.bottom
                radius: 3
                visible: !root.isOffline
                width: parent.width * Math.max(0.0, Math.min(1.0, root.levelPercent / 100.0))
                color: {
                    if (root.isCritical) return "#EF4444";
                    if (root.isWarning) return "#F59E0B";
                    return "#0284C7";
                }

                Behavior on width {
                    NumberAnimation { duration: Theme.animSmallPanel; easing.type: Easing.OutQuad }
                }
            }
        }

        // Flexible spacer pushes footer to the bottom
        Item {
            Layout.fillHeight: true
            Layout.minimumHeight: 2
        }

        // ====================================================================
        // 4. Footer: Status Dot + Text and Action Chevron '>'
        // ====================================================================
        RowLayout {
            Layout.fillWidth: true

            RowLayout {
                spacing: 6
                Layout.alignment: Qt.AlignVCenter

                // Status dot
                Rectangle {
                    width: 7
                    height: 7
                    radius: 3.5
                    color: {
                        if (root.isOffline) return "#DC2626";
                        if (root.isCritical) return "#DC2626";
                        if (root.isWarning) return "#D97706";
                        return "#16A34A";
                    }
                }

                // Status text
                Text {
                    text: {
                        if (root.isOffline) return "Offline";
                        if (root.isCritical) return "Critical";
                        if (root.isWarning) return "Low Level";
                        return "Online";
                    }
                    color: {
                        if (root.isOffline) return "#DC2626";
                        if (root.isCritical) return "#DC2626";
                        if (root.isWarning) return "#D97706";
                        return "#16A34A";
                    }
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    font.weight: Font.DemiBold
                }
            }

            Item { Layout.fillWidth: true }

            // Bottom Right Chevron '>'
            Text {
                text: "\u203A"
                color: "#94A3B8"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 18
                font.weight: Font.Bold
                Layout.alignment: Qt.AlignRight
            }
        }
    }

    // Interactive MouseArea across the entire card
    MouseArea {
        id: mouseArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
            root.cardClicked(root.tankId);
        }
    }
}
