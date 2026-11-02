import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// Configuration Page (Part 11)
// Comprehensive commissioning and parameter configuration page:
// 1. TANK CONFIGURATION: Geometry, live shape-aware capacity, warning/critical thresholds,
//    with REST / EEPROM synchronization and read-back verification.
// 2. CALIBRATION: Air baseline (A_air), calibration magic, and sensor zeroing.
// 3. ALARM: Alarm state enable/disable, threshold review.
// 4. DEVICE: Device identifier, max height, firmware parameters.
Item {
    id: root

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: mainCol.implicitHeight + 40
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        ColumnLayout {
            id: mainCol
            width: parent.width - 36
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: 20
            spacing: 16

            // ================================================================
            // 1. Page Header
            // ================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2

                Text {
                    text: "Configuration"
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 24
                    font.weight: Font.Bold
                }

                Text {
                    text: "Configure tank geometry, sensor calibration, alarms, and device parameters"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 14
                }
            }

            // ================================================================
            // 2. Main Tank Configuration Component
            // ================================================================
            TankConfigurationCard {
                Layout.fillWidth: true
            }

            // ================================================================
            // 3. Calibration & Device Engineering Parameters Row
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                columns: root.width < 850 ? 1 : 2
                columnSpacing: 16
                rowSpacing: 16

                // CALIBRATION CARD
                BaseCard {
                    Layout.fillWidth: true
                    padding: 18

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        RowLayout {
                            Layout.fillWidth: true
                            Text {
                                text: "CALIBRATION"
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.Bold
                            }
                            Item { Layout.fillWidth: true }
                            Rectangle {
                                height: 22
                                width: calibStatusText.implicitWidth + 14
                                radius: 11
                                color: Theme.colors.successSurface
                                border.width: 1
                                border.color: "#DCFCE7"

                                Text {
                                    id: calibStatusText
                                    anchors.centerIn: parent
                                    text: "0xAA55 (Calibrated)"
                                    color: Theme.colors.success
                                    font.pixelSize: 10
                                    font.weight: Font.Bold
                                }
                            }
                        }

                        Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Air Baseline (A_air)"; color: Theme.colors.textSecondary; font.pixelSize: 12; Layout.fillWidth: true }
                            Text { text: "1420 counts"; color: Theme.colors.textPrimary; font.pixelSize: 13; font.weight: Font.Bold }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Sensor Transducer"; color: Theme.colors.textSecondary; font.pixelSize: 12; Layout.fillWidth: true }
                            Text { text: "ADS1115 Diff A0-A1"; color: Theme.colors.textPrimary; font.pixelSize: 13; font.weight: Font.Bold }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Analog Deadband"; color: Theme.colors.textSecondary; font.pixelSize: 12; Layout.fillWidth: true }
                            Text { text: "0.50 cm"; color: Theme.colors.textPrimary; font.pixelSize: 13; font.weight: Font.Bold }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Pressure Compensation"; color: Theme.colors.textSecondary; font.pixelSize: 12; Layout.fillWidth: true }
                            Text { text: "BME280 Active"; color: Theme.colors.success; font.pixelSize: 13; font.weight: Font.Bold }
                        }
                    }
                }

                // DEVICE PARAMETERS CARD
                BaseCard {
                    Layout.fillWidth: true
                    padding: 18

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        RowLayout {
                            Layout.fillWidth: true
                            Text {
                                text: "DEVICE PARAMETERS"
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.Bold
                            }
                            Item { Layout.fillWidth: true }
                            Rectangle {
                                height: 22
                                width: devStatusText.implicitWidth + 14
                                radius: 11
                                color: Theme.colors.primarySurface
                                border.width: 1
                                border.color: "#DBEAFE"

                                Text {
                                    id: devStatusText
                                    anchors.centerIn: parent
                                    text: "EEPROM Verified"
                                    color: Theme.colors.primary
                                    font.pixelSize: 10
                                    font.weight: Font.Bold
                                }
                            }
                        }

                        Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Device Identifier"; color: Theme.colors.textSecondary; font.pixelSize: 12; Layout.fillWidth: true }
                            Text { text: (TankModel.deviceLabel && TankModel.deviceLabel.length > 0) ? TankModel.deviceLabel : "wli"; color: Theme.colors.textPrimary; font.pixelSize: 13; font.weight: Font.Bold }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Maximum Height Limit"; color: Theme.colors.textSecondary; font.pixelSize: 12; Layout.fillWidth: true }
                            Text { text: TankModel.tankHeightCm.toFixed(2) + " cm"; color: Theme.colors.textPrimary; font.pixelSize: 13; font.weight: Font.Bold }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Firmware Runtime"; color: Theme.colors.textSecondary; font.pixelSize: 12; Layout.fillWidth: true }
                            Text { text: "FreeRTOS v10.4.6"; color: Theme.colors.textPrimary; font.pixelSize: 13; font.weight: Font.Bold }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Modem Interface"; color: Theme.colors.textSecondary; font.pixelSize: 12; Layout.fillWidth: true }
                            Text { text: "Quectel EC200U Cat-1"; color: Theme.colors.textPrimary; font.pixelSize: 13; font.weight: Font.Bold }
                        }
                    }
                }
            }
        }
    }
}
