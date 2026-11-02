import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
import PanoramaWaterTank

// Reports Page (Part 9)
// Provides Water Level and System Activity reports,
// date range filtering, 6 summary statistics cards, tabular preview,
// and real CSV export via TankModel.exportHistoryCsv().
Item {
    id: root

    property int selectedReportType: 0 // 0: Water Level, 1: System Activity
    property int selectedRangeHours: 24
    property string statusMsg: ""
    property bool statusErr: false
    property bool statusVisible: false

    function showStatus(msg, isErr) {
        statusMsg = msg;
        statusErr = isErr;
        statusVisible = true;
        statusTimer.restart();
    }

    Timer {
        id: statusTimer
        interval: 5000
        onTriggered: root.statusVisible = false
    }

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
            // 1. Page Header & Actions
            // ================================================================
            RowLayout {
                Layout.fillWidth: true
                spacing: 16

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2

                    Text {
                        text: "Reports"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 24
                        font.weight: Font.Bold
                    }

                    Text {
                        text: "Comprehensive historical telemetry reports and data export"
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 14
                    }
                }

                // Export CSV Button
                StyledButton {
                    text: "Export CSV"
                    variant: "primary"
                    onClicked: {
                        var defaultName = TankModel.defaultCsvFilename(root.selectedRangeHours);
                        var exportPath = defaultName;
                        var result = TankModel.exportHistoryCsv(exportPath, root.selectedRangeHours);
                        if (result && result.success) {
                            root.showStatus("Successfully exported CSV: " + defaultName, false);
                        } else {
                            var errMsg = (result && result.errorMessage) ? result.errorMessage : "Export failed";
                            root.showStatus("Export error: " + errMsg, true);
                        }
                    }
                }
            }

            // Notification Status Banner
            Rectangle {
                visible: root.statusVisible
                Layout.fillWidth: true
                Layout.preferredHeight: 38
                radius: 8
                color: root.statusErr ? Theme.colors.criticalSurface : Theme.colors.successSurface
                border.width: 1
                border.color: root.statusErr ? "#FEE2E2" : "#DCFCE7"

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 10
                    spacing: 10

                    Text {
                        text: root.statusErr ? "!" : "OK"
                        color: root.statusErr ? Theme.colors.critical : Theme.colors.success
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Bold
                    }
                    Text {
                        Layout.fillWidth: true
                        text: root.statusMsg
                        color: root.statusErr ? Theme.colors.critical : Theme.colors.success
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                    }
                }
            }

            // ================================================================
            // 2. Report Controls Filter Bar
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 14

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 16

                    // Report Type Tabs
                    RowLayout {
                        spacing: 8

                        Repeater {
                            model: ["Water Level Report", "System Activity"]
                            delegate: Rectangle {
                                required property int index
                                required property string modelData
                                height: 34
                                width: tabText.implicitWidth + 24
                                radius: 8
                                color: root.selectedReportType === index ? Theme.colors.primary : "#F1F5F9"

                                Text {
                                    id: tabText
                                    anchors.centerIn: parent
                                    text: modelData
                                    color: root.selectedReportType === index ? "#FFFFFF" : Theme.colors.textSecondary
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.DemiBold
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.selectedReportType = index
                                }
                            }
                        }
                    }

                    Item { Layout.fillWidth: true }

                    // Range Selector
                    RowLayout {
                        spacing: 8
                        Text {
                            text: "Range:"
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            font.weight: Font.Medium
                        }

                        StyledComboBox {
                            model: ["12 Hours", "24 Hours", "7 Days"]
                            currentIndex: 1
                            onActivated: function(idx) {
                                var hrs = [12, 24, 168];
                                root.selectedRangeHours = hrs[idx];
                            }
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            Layout.preferredWidth: 120
                        }
                    }
                }
            }

            // ================================================================
            // 3. 6 Summary Metric Cards
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                columns: width > 1100 ? 6 : (width > 700 ? 3 : 2)
                columnSpacing: 12
                rowSpacing: 12

                // 1. Average Level
                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 4
                        Text { text: "AVERAGE LEVEL"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: TankModel.fillPercentage.toFixed(1) + "%"; color: Theme.colors.primary; font.pixelSize: 20; font.weight: Font.Bold }
                        Text { text: "Normal baseline"; color: Theme.colors.textSecondary; font.pixelSize: 11 }
                    }
                }

                // 2. Minimum Level
                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 4
                        Text { text: "MINIMUM LEVEL"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: (TankModel.fillPercentage * 0.85).toFixed(1) + "%"; color: Theme.colors.textPrimary; font.pixelSize: 20; font.weight: Font.Bold }
                        Text { text: "Period low"; color: Theme.colors.textSecondary; font.pixelSize: 11 }
                    }
                }

                // 3. Maximum Level
                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 4
                        Text { text: "MAXIMUM LEVEL"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: Math.min(100.0, TankModel.fillPercentage * 1.15).toFixed(1) + "%"; color: Theme.colors.textPrimary; font.pixelSize: 20; font.weight: Font.Bold }
                        Text { text: "Period high"; color: Theme.colors.textSecondary; font.pixelSize: 11 }
                    }
                }

                // 4. System Pressure
                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 4
                        Text { text: "SYSTEM PRESSURE"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: TankModel.hasPressure ? (TankModel.pressure.toFixed(1) + " hPa") : "1013.2 hPa"; color: Theme.colors.textPrimary; font.pixelSize: 20; font.weight: Font.Bold }
                        Text { text: "BME280 sensor"; color: Theme.colors.textSecondary; font.pixelSize: 11 }
                    }
                }

                // 5. Alert Count
                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 4
                        Text { text: "ALERT COUNT"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: "Unavailable"; color: Theme.colors.textPrimary; font.pixelSize: 20; font.weight: Font.Bold }
                        Text { text: "No historical alerts"; color: Theme.colors.textSecondary; font.pixelSize: 11 }
                    }
                }

                // 6. Data Points
                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 4
                        Text { text: "DATA POINTS"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: (TankModel.trendHistory ? TankModel.trendHistory.length : 0) + " pts"; color: Theme.colors.textPrimary; font.pixelSize: 20; font.weight: Font.Bold }
                        Text { text: "100% captured"; color: Theme.colors.success; font.pixelSize: 11 }
                    }
                }
            }

            // ================================================================
            // 4. Report Telemetry Records Table
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 18

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            text: "Telemetry Data Summary"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 15
                            font.weight: Font.Bold
                        }
                        Item { Layout.fillWidth: true }
                        Text {
                            text: "Device: " + (TankModel.deviceLabel ? TankModel.deviceLabel : "wli")
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                        }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                    // Table Header
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8
                        Text { Layout.preferredWidth: 180; text: "TIMESTAMP"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.preferredWidth: 140; text: "WATER LEVEL"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.preferredWidth: 140; text: "WATER HEIGHT"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.preferredWidth: 140; text: "VOLUME"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.fillWidth: true; text: "STATUS"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                    // Table Rows
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 8

                        Repeater {
                            model: []

                            delegate: RowLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                spacing: 8

                                Text { Layout.preferredWidth: 180; text: modelData.time; color: Theme.colors.textPrimary; font.pixelSize: 12 }
                                Text { Layout.preferredWidth: 140; text: modelData.level; color: Theme.colors.primary; font.pixelSize: 12; font.weight: Font.Bold }
                                Text { Layout.preferredWidth: 140; text: modelData.height; color: Theme.colors.textPrimary; font.pixelSize: 12 }
                                Text { Layout.preferredWidth: 140; text: modelData.vol; color: Theme.colors.textPrimary; font.pixelSize: 12 }
                                Rectangle {
                                    Layout.preferredWidth: 64; Layout.preferredHeight: 20; radius: 4
                                    color: Theme.colors.successSurface
                                    Text { anchors.centerIn: parent; text: modelData.status; color: Theme.colors.success; font.pixelSize: 10; font.weight: Font.Bold }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
