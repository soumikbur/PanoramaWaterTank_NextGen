import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// Redesigned Industrial IoT / SCADA Dashboard Page (Reference 1672x941)
// Primary Desktop Composition (Sections 6, 10, 11, 15):
// Row 1 (Top Grid):
//   - LEFT: Tank Level card (~35%)
//   - CENTER: Level Trend card (~40%)
//   - RIGHT: Quick Info card (~25%)
//   (All 3 cards vertically aligned at the same height)
// Row 2: Full-width Alert Level Indicator
// Row 3: 6 Equal Bottom Metric Cards in a single row:
//   1. WATER LEVEL
//   2. TANK VOLUME
//   3. STATUS
//   4. PRESSURE
//   5. LAST UPDATED
//   6. CONNECTION
Item {
    id: dashboardPage

    signal openTrainSelectionRequested()
    signal openAllTanksRequested()

    readonly property bool isWideDesktop: width >= 1350
    readonly property bool isMediumDesktop: width < 1350 && width >= 850

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Flickable {
        id: flickable
        anchors.fill: parent
        anchors.margins: 12
        contentWidth: width
        contentHeight: Math.max(contentLayout.implicitHeight + 20, height)
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ScrollBar.vertical: ScrollBar {
            policy: ScrollBar.AsNeeded
        }

        ColumnLayout {
            id: contentLayout
            width: flickable.width
            height: Math.max(implicitHeight, flickable.height - 24)
            spacing: 12

            // ================================================================
            // BREADCRUMB: Train Selection > Region > Train > Dashboard
            // ================================================================
            RowLayout {
                Layout.fillWidth: true
                visible: ApplicationStateManager.hasTrainContext
                spacing: 8

                RowLayout {
                    spacing: 6

                    Text {
                        text: "Train Selection"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                        color: Theme.colors.primary

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: dashboardPage.openTrainSelectionRequested()
                        }
                    }

                    Text {
                        text: "\u203A"
                        font.pixelSize: 12
                        color: "#94A3B8"
                    }

                    Text {
                        text: ApplicationStateManager.selectedRegionName
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                        color: Theme.colors.textSecondary
                    }

                    Text {
                        text: "\u203A"
                        font.pixelSize: 12
                        color: "#94A3B8"
                    }

                    Text {
                        text: ApplicationStateManager.selectedTrainNumber
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                        color: Theme.colors.textSecondary
                    }

                    Text {
                        text: "\u203A"
                        font.pixelSize: 12
                        color: "#94A3B8"
                    }

                    Text {
                        text: "Dashboard"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.DemiBold
                        color: Theme.colors.textPrimary
                    }
                }

                Item { Layout.fillWidth: true }

                Rectangle {
                    height: 26
                    implicitWidth: trainPillRow.implicitWidth + 16
                    radius: 6
                    color: "#EFF6FF"
                    border.width: 1
                    border.color: "#BFDBFE"

                    RowLayout {
                        id: trainPillRow
                        anchors.centerIn: parent
                        spacing: 6

                        Rectangle {
                            width: 6; height: 6; radius: 3
                            color: Theme.colors.primary
                        }

                        Text {
                            text: ApplicationStateManager.selectedTrainNumber + " \u00B7 " + ApplicationStateManager.selectedTrainName
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Medium
                            color: Theme.colors.primary
                        }
                    }
                }
            }

            // ================================================================
            // ROW 1: TOP DASHBOARD GRID (Tank Level, Level Trend, Quick Info)
            // ================================================================
            // When wide desktop (>= 1350px): All 3 cards in one horizontal row
            RowLayout {
                visible: dashboardPage.isWideDesktop
                Layout.fillWidth: true
                Layout.fillHeight: true
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

            // Medium Desktop layout (850px - 1349px): Tank + Trend, with Quick Info below
            ColumnLayout {
                visible: dashboardPage.isMediumDesktop
                Layout.fillWidth: true
                spacing: 12

                RowLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
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
                    Layout.fillHeight: true
                    Layout.preferredHeight: Math.max(340, flickable.height * 0.35)
                }
            }

            // Small / Single-column layout (< 850px)
            ColumnLayout {
                visible: !dashboardPage.isWideDesktop && !dashboardPage.isMediumDesktop
                Layout.fillWidth: true
                spacing: 12

                TankLevelCard {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.preferredHeight: Math.max(410, flickable.height * 0.48)
                }

                LevelTrendCard {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.preferredHeight: Math.max(390, flickable.height * 0.45)
                }

                QuickInfoCard {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.preferredHeight: Math.max(340, flickable.height * 0.35)
                }
            }

            // ================================================================
            // ROW 2: FULL-WIDTH ALERT LEVEL INDICATOR (Section 10)
            // ================================================================
            AlertLevelIndicator {
                Layout.fillWidth: true
                Layout.preferredHeight: Math.max(75, flickable.height * 0.10)
            }

            // ================================================================
            // ROW 3: 6 BOTTOM METRIC CARDS (Section 11)
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.preferredHeight: Math.max(125, flickable.height * 0.18)
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
