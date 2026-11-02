import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// Logs Page (Part 13)
// System runtime log viewer displaying timestamp, level, component, and message,
// with search, level filtering, log directory info, and empty-state handling.
Item {
    id: root

    property string selectedLevel: "ALL"
    property string searchQuery: ""

    // Dynamic log entries tied to application runtime states
    readonly property var rawLogEntries: []

    function matchesFilter(item) {
        if (root.selectedLevel !== "ALL" && item.level !== root.selectedLevel) return false;
        if (root.searchQuery.trim().length > 0) {
            var q = root.searchQuery.toLowerCase();
            return item.message.toLowerCase().indexOf(q) !== -1 || item.component.toLowerCase().indexOf(q) !== -1;
        }
        return true;
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
                        text: "Logs"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 24
                        font.weight: Font.Bold
                    }

                    Text {
                        text: "System runtime logs and telemetry diagnostics"
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 14
                    }
                }

                // Log Directory Information Badge
                Rectangle {
                    Layout.preferredHeight: 32
                    Layout.preferredWidth: dirText.implicitWidth + 20
                    radius: 6
                    color: "#F1F5F9"
                    border.width: 1
                    border.color: Theme.colors.border

                    Text {
                        id: dirText
                        anchors.centerIn: parent
                        text: "Log Retention: " + SettingsManager.retentionDays + " Days"
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Medium
                    }
                }
            }

            // ================================================================
            // 2. Filter & Search Bar
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 14

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    // Level Filter Pills
                    RowLayout {
                        spacing: 6

                        Repeater {
                            model: ["ALL", "INFO", "WARNING", "ERROR", "DEBUG"]
                            delegate: Rectangle {
                                required property string modelData
                                height: 32
                                width: filterText.implicitWidth + 18
                                radius: 6
                                color: root.selectedLevel === modelData ? Theme.colors.primary : "#F1F5F9"

                                Text {
                                    id: filterText
                                    anchors.centerIn: parent
                                    text: modelData
                                    color: root.selectedLevel === modelData ? "#FFFFFF" : Theme.colors.textSecondary
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 11
                                    font.weight: Font.Bold
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.selectedLevel = modelData
                                }
                            }
                        }
                    }

                    Item { Layout.fillWidth: true }

                    // Search Field
                    StyledTextField {
                        Layout.preferredWidth: 260
                        Layout.preferredHeight: 34
                        placeholderText: "Search log message or component..."
                        text: root.searchQuery
                        onTextChanged: root.searchQuery = text
                    }
                }
            }

            // ================================================================
            // 3. Log Table Card
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 18

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 10

                    // Column Headers
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12
                        Text { Layout.preferredWidth: 100; text: "TIME"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.preferredWidth: 80; text: "LEVEL"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.preferredWidth: 180; text: "COMPONENT"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.fillWidth: true; text: "MESSAGE"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                    // Log Rows
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 8

                        Repeater {
                            model: root.rawLogEntries

                            delegate: Item {
                                required property var modelData
                                visible: root.matchesFilter(modelData)
                                Layout.fillWidth: true
                                Layout.preferredHeight: visible ? 28 : 0

                                RowLayout {
                                    anchors.fill: parent
                                    spacing: 12

                                    Text {
                                        Layout.preferredWidth: 100
                                        text: modelData.time
                                        color: Theme.colors.textSecondary
                                        font.pixelSize: 11
                                    }

                                    // Level Badge
                                    Rectangle {
                                        Layout.preferredWidth: 60
                                        Layout.preferredHeight: 20
                                        radius: 4
                                        color: modelData.level === "ERROR" ? Theme.colors.criticalSurface : (modelData.level === "WARNING" ? Theme.colors.warningSurface : (modelData.level === "INFO" ? Theme.colors.primarySurface : "#F1F5F9"))

                                        Text {
                                            anchors.centerIn: parent
                                            text: modelData.level
                                            color: modelData.level === "ERROR" ? Theme.colors.critical : (modelData.level === "WARNING" ? Theme.colors.warning : (modelData.level === "INFO" ? Theme.colors.primary : Theme.colors.textSecondary))
                                            font.pixelSize: 10
                                            font.weight: Font.Bold
                                        }
                                    }

                                    Text {
                                        Layout.preferredWidth: 180
                                        text: modelData.component
                                        color: Theme.colors.textSecondary
                                        font.pixelSize: 11
                                        font.weight: Font.Medium
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        text: modelData.message
                                        color: Theme.colors.textPrimary
                                        font.pixelSize: 12
                                        elide: Text.ElideRight
                                    }
                                }
                            }
                        }

                        // Zero-State Display
                        ColumnLayout {
                            Layout.fillWidth: true
                            Layout.topMargin: 24
                            Layout.bottomMargin: 24
                            visible: root.rawLogEntries.length === 0
                            spacing: 8

                            Text {
                                Layout.alignment: Qt.AlignHCenter
                                text: "No Active Log Entries"
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.Bold
                            }

                            Text {
                                Layout.alignment: Qt.AlignHCenter
                                text: "System events, MQTT diagnostics, and sensor alerts will stream here in real time."
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                        }
                    }
                }
            }
        }
    }
}
