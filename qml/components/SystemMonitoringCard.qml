import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// System Monitoring Section
// Occupies remaining vertical viewport at the bottom of the dashboard.
Item {
    id: root

    property bool isExpanded: true

    ColumnLayout {
        anchors.fill: parent
        spacing: 10

        // Header
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            Text {
                text: "SYSTEM MONITORING"
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                font.weight: Font.Bold
                Layout.fillWidth: true
            }

            Rectangle {
                width: 24
                height: 24
                radius: 4
                color: "transparent"
                
                Text {
                    anchors.centerIn: parent
                    text: root.isExpanded ? "⌄" : "⌃"
                    color: Theme.colors.textSecondary
                    font.pixelSize: 16
                    font.weight: Font.Bold
                }

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.isExpanded = !root.isExpanded
                }
            }
        }

        // Monitoring Panels Grid
        GridLayout {
            visible: root.isExpanded
            Layout.fillWidth: true
            Layout.fillHeight: true
            // Match the breakpoint logic of the dashboard
            columns: width >= 850 ? 3 : 1
            columnSpacing: 10
            rowSpacing: 10

            // 1. Environment Panel
            BaseCard {
                Layout.fillWidth: true
                Layout.fillHeight: true

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: Theme.metrics.cardPadding
                    spacing: 4

                    Text {
                        text: "ENVIRONMENT"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 14
                        font.weight: Font.DemiBold
                        Layout.fillWidth: true
                        Layout.bottomMargin: 8
                    }

                    InfoRow {
                        label: "Pressure"
                        value: TankModel.hasPressure ? TankModel.pressure.toFixed(1) + " hPa" : "BME280 Offline"
                        valueColor: TankModel.hasPressure ? Theme.colors.textPrimary : Theme.colors.textSecondary
                    }
                    InfoRow {
                        label: "Humidity"
                        value: TankModel.hasPressure ? "-- % RH" : "BME280 Offline"
                        valueColor: TankModel.hasPressure ? Theme.colors.textPrimary : Theme.colors.textSecondary
                    }

                    Item { Layout.fillHeight: true }
                }
            }

            // 2. Device Health Panel
            BaseCard {
                Layout.fillWidth: true
                Layout.fillHeight: true

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: Theme.metrics.cardPadding
                    spacing: 4

                    Text {
                        text: "DEVICE HEALTH"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 14
                        font.weight: Font.DemiBold
                        Layout.fillWidth: true
                        Layout.bottomMargin: 8
                    }

                    InfoRow {
                        label: "Sensor Status"
                        value: TankModel.sensorStatus !== "" ? TankModel.sensorStatus : "Normal"
                        valueColor: (TankModel.sensorStatus === "Error" || TankModel.sensorStatus === "Fault") ? Theme.colors.critical : ((TankModel.sensorStatus === "Stale") ? Theme.colors.warning : Theme.colors.textPrimary)
                    }
                    InfoRow {
                        label: "Calibration"
                        value: "Calibrated"
                    }
                    InfoRow {
                        label: "Alarm State"
                        value: TankModel.alarmLevel !== "" ? TankModel.alarmLevel : "Enabled"
                        valueColor: (TankModel.alarmLevel === "Warning") ? Theme.colors.warning : (TankModel.alarmLevel === "Critical" ? Theme.colors.critical : Theme.colors.textPrimary)
                    }
                    InfoRow {
                        label: "System"
                        value: (TankModel.connectionState !== "Connected") ? "Offline" : (TankModel.telemetryHealthState === "VALID" ? "Operational" : (TankModel.telemetryHealthState === "SENSOR_ERROR" ? "Sensor Error" : (TankModel.telemetryHealthState === "WAITING_FOR_DATA" ? "Waiting for Data" : "Monitoring active")))
                        valueColor: (TankModel.connectionState !== "Connected") ? Theme.colors.critical : (TankModel.telemetryHealthState === "VALID" ? Theme.colors.success : (TankModel.telemetryHealthState === "SENSOR_ERROR" ? Theme.colors.critical : Theme.colors.warning))
                    }

                    Item { Layout.fillHeight: true }
                }
            }

            // 3. Communication Panel
            BaseCard {
                Layout.fillWidth: true
                Layout.fillHeight: true

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: Theme.metrics.cardPadding
                    spacing: 4

                    Text {
                        text: "COMMUNICATION"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 14
                        font.weight: Font.DemiBold
                        Layout.fillWidth: true
                        Layout.bottomMargin: 8
                    }

                    InfoRow {
                        label: "Connection"
                        value: TankModel.connectionState
                        valueColor: TankModel.connectionState === "Connected" ? Theme.colors.success : Theme.colors.textPrimary
                    }
                    InfoRow {
                        label: "IP Address"
                        value: SettingsManager.esp32Host ? SettingsManager.esp32Host : "192.168.1.219"
                    }
                    InfoRow {
                        label: "Signal Strength"
                        value: "-48 dBm"
                    }
                    InfoRow {
                        label: "Port"
                        value: SettingsManager.esp32Port ? SettingsManager.esp32Port.toString() : "80"
                    }

                    Item { Layout.fillHeight: true }
                }
            }
        }
        
        Item {
            // Spacer to consume space if collapsed
            Layout.fillHeight: true
            visible: !root.isExpanded
        }
    }
}
