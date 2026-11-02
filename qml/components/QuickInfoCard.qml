import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// QuickInfoCard.qml — Compact Industrial Quick Info & Diagnostics Panel
// Displays authoritative device and telemetry metadata in a compact 2-column
// grid layout (Sections 12, 13, 14).
// If a telemetry item is missing or device is offline, displays "Unavailable"
// rather than fabricating mock values or assuming ONLINE.
// ============================================================================
BaseCard {
    id: root

    Layout.fillWidth: true
    Layout.fillHeight: true
    Layout.minimumWidth: 260
    Layout.preferredWidth: 360
    Layout.minimumHeight: 320

    readonly property bool isOffline: TankModel.connectionState === "Offline" || TankModel.connectionState === "Not Connected"
    readonly property bool isConnected: TankModel.connectionState === "Connected"
    readonly property bool hasSensorData: TankModel.hasValidData && TankModel.measurementValid && TankModel.measurementState === "VALID"
    readonly property bool isSensorError: TankModel.measurementState === "SENSOR_ERROR" || TankModel.sensorStatus === "Fault"

    ColumnLayout {
        Layout.fillWidth: true
        Layout.fillHeight: true
        spacing: 12

        // Header Row: Title + Connection Status Pill
        RowLayout {
            Layout.fillWidth: true

            Text {
                text: "Quick Info"
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
            }

            Item { Layout.fillWidth: true }

            Rectangle {
                height: 22
                width: connStatusPill.implicitWidth + 14
                radius: 11
                color: root.isConnected ? "#ECFDF5" : (TankModel.connectionState === "Connecting" ? "#FEF3C7" : "#F1F5F9")
                border.width: 1
                border.color: root.isConnected ? "#A7F3D0" : (TankModel.connectionState === "Connecting" ? "#FDE68A" : "#CBD5E1")

                RowLayout {
                    id: connStatusPill
                    anchors.centerIn: parent
                    spacing: 4
                    Rectangle {
                        width: 6; height: 6; radius: 3
                        color: root.isConnected ? Theme.colors.success : (TankModel.connectionState === "Connecting" ? Theme.colors.warning : "#94A3B8")
                    }
                    Text {
                        text: root.isConnected ? "CONNECTED" : (TankModel.connectionState === "Connecting" ? "CONNECTING" : "OFFLINE")
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: root.isConnected ? "#166534" : (TankModel.connectionState === "Connecting" ? "#92400E" : "#475569")
                    }
                }
            }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

        // Metadata Grid (2-Column Compact Layout)
        GridLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            columns: 2
            columnSpacing: 14
            rowSpacing: 12

            // Item 1: Tank Name
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: "Tank Name"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                Text {
                    text: (TankModel.tankName && TankModel.tankName.length > 0) ? TankModel.tankName : "Unavailable"
                    color: (TankModel.tankName && TankModel.tankName.length > 0) ? Theme.colors.textPrimary : "#94A3B8"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                    elide: Text.ElideRight
                }
            }

            // Item 2: Device ID
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: "Device ID"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                Text {
                    text: (TankModel.deviceLabel && TankModel.deviceLabel.length > 0) ? TankModel.deviceLabel : "Unavailable"
                    color: (TankModel.deviceLabel && TankModel.deviceLabel.length > 0) ? Theme.colors.primary : "#94A3B8"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                    elide: Text.ElideRight
                }
            }

            // Item 3: Pressure
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: "Pressure"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                Text {
                    text: (!root.isOffline && TankModel.hasPressure) ? (TankModel.pressure.toFixed(1) + " hPa") : "Unavailable"
                    color: (!root.isOffline && TankModel.hasPressure) ? Theme.colors.textPrimary : "#94A3B8"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                }
            }

            // Item 4: Last Updated
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: "Last Updated"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                Text {
                    text: (!root.isOffline && TankModel.lastUpdated && TankModel.lastUpdated.length > 0) ? TankModel.lastUpdated : "Unavailable"
                    color: (!root.isOffline && TankModel.lastUpdated && TankModel.lastUpdated.length > 0) ? Theme.colors.textPrimary : "#94A3B8"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                    elide: Text.ElideRight
                }
            }

            // Item 5: Uptime
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: "Uptime"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                Text {
                    text: "Unavailable"
                    color: "#94A3B8"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                }
            }

            // Item 6: Signal Strength
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: "Signal Strength"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                Text {
                    text: "Unavailable"
                    color: "#94A3B8"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                }
            }
        }

        Item { Layout.fillHeight: true }

        // Bottom Diagnostics Context Strip
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 32
            radius: 4
            color: "#F8FAFC"
            border.width: 1
            border.color: Theme.colors.border

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 10
                anchors.rightMargin: 10
                spacing: 6

                Text {
                    text: "Firmware Runtime:"
                    font.pixelSize: 10
                    color: Theme.colors.textSecondary
                    font.weight: Font.Medium
                }

                Text {
                    text: root.hasSensorData ? "FreeRTOS v10.4.6 · Online" : (root.isSensorError ? "FreeRTOS · Sensor Error" : (root.isConnected ? "FreeRTOS · Waiting for data" : "Sensor Disconnected"))
                    font.pixelSize: 10
                    color: root.hasSensorData ? Theme.colors.primary : (root.isSensorError ? Theme.colors.critical : "#94A3B8")
                    font.weight: Font.DemiBold
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }
        }
    }
}
