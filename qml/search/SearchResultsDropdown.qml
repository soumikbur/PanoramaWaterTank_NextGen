import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// SearchResultsDropdown.qml — Categorized intelligent search results dropdown
// Shows TRAINS, COACHES, TANKS, and LOCATIONS sections with direct navigation.
// ============================================================================
Rectangle {
    id: root

    width: 480
    height: Math.min(420, contentCol.implicitHeight + 24)
    radius: 8
    color: "#FFFFFF"
    border.width: 1
    border.color: Theme.colors.border

    // Drop shadow
    Rectangle {
        z: -1
        anchors.fill: parent
        anchors.margins: -2
        radius: 10
        color: "#18000000"
    }

    signal itemSelected(string type, var data)

    Flickable {
        anchors.fill: parent
        anchors.margins: 12
        contentWidth: width
        contentHeight: contentCol.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ScrollBar.vertical: ScrollBar {
            policy: ScrollBar.AsNeeded
        }

        ColumnLayout {
            id: contentCol
            width: parent.width - 8
            spacing: 12

            // Header info
            RowLayout {
                Layout.fillWidth: true
                Text {
                    text: "Search Results for \"" + SearchManager.query + "\""
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Bold
                    color: "#64748B"
                    Layout.fillWidth: true
                }
                Text {
                    text: SearchManager.totalMatches + " found"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    color: Theme.colors.primary
                    font.weight: Font.DemiBold
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

            // ================================================================
            // CATEGORY: LOCATIONS
            // ================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6
                visible: SearchManager.locationResults.length > 0

                RowLayout {
                    spacing: 6
                    Rectangle { width: 4; height: 12; radius: 2; color: "#0284C7" }
                    Text {
                        text: "LOCATIONS (" + SearchManager.locationResults.length + ")"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: "#0284C7"
                        font.letterSpacing: 0.8
                    }
                }

                Repeater {
                    model: SearchManager.locationResults
                    delegate: Rectangle {
                        required property var modelData
                        Layout.fillWidth: true
                        Layout.preferredHeight: 48
                        radius: 6
                        color: locMouse.containsMouse ? "#F0F9FF" : "#F8FAFC"
                        border.width: 1
                        border.color: locMouse.containsMouse ? "#BAE6FD" : "#E2E8F0"

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 8
                            spacing: 10

                            Text {
                                text: "📍"
                                font.pixelSize: 16
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 1
                                Text {
                                    text: modelData.title
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.Bold
                                    color: Theme.colors.textPrimary
                                }
                                Text {
                                    text: modelData.subtitle + " · " + modelData.context
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 10
                                    color: "#64748B"
                                }
                            }

                            Rectangle {
                                width: 70; height: 26; radius: 4
                                color: Theme.colors.primary
                                Text { anchors.centerIn: parent; text: "Open Map"; color: "#FFFFFF"; font.pixelSize: 10; font.weight: Font.DemiBold }
                            }
                        }

                        MouseArea {
                            id: locMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                SearchManager.selectResult("location", modelData)
                                root.itemSelected("location", modelData)
                            }
                        }
                    }
                }
            }

            // ================================================================
            // CATEGORY: TRAINS
            // ================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6
                visible: SearchManager.trainResults.length > 0

                RowLayout {
                    spacing: 6
                    Rectangle { width: 4; height: 12; radius: 2; color: Theme.colors.primary }
                    Text {
                        text: "TRAINS (" + SearchManager.trainResults.length + ")"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: Theme.colors.primary
                        font.letterSpacing: 0.8
                    }
                }

                Repeater {
                    model: SearchManager.trainResults
                    delegate: Rectangle {
                        required property var modelData
                        Layout.fillWidth: true
                        Layout.preferredHeight: 48
                        radius: 6
                        color: trMouse.containsMouse ? "#EFF6FF" : "#F8FAFC"
                        border.width: 1
                        border.color: trMouse.containsMouse ? "#BFDBFE" : "#E2E8F0"

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 8
                            spacing: 10

                            Text {
                                text: "🚆"
                                font.pixelSize: 16
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 1
                                Text {
                                    text: modelData.title
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.Bold
                                    color: Theme.colors.textPrimary
                                }
                                Text {
                                    text: modelData.subtitle + " · " + modelData.context
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 10
                                    color: "#64748B"
                                }
                            }

                            Rectangle {
                                width: 70; height: 26; radius: 4
                                color: Theme.colors.primary
                                Text { anchors.centerIn: parent; text: "View Train"; color: "#FFFFFF"; font.pixelSize: 10; font.weight: Font.DemiBold }
                            }
                        }

                        MouseArea {
                            id: trMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                SearchManager.selectResult("train", modelData)
                                root.itemSelected("train", modelData)
                            }
                        }
                    }
                }
            }

            // ================================================================
            // CATEGORY: COACHES
            // ================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6
                visible: SearchManager.coachResults.length > 0

                RowLayout {
                    spacing: 6
                    Rectangle { width: 4; height: 12; radius: 2; color: "#059669" }
                    Text {
                        text: "COACHES (" + SearchManager.coachResults.length + ")"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: "#059669"
                        font.letterSpacing: 0.8
                    }
                }

                Repeater {
                    model: SearchManager.coachResults
                    delegate: Rectangle {
                        required property var modelData
                        Layout.fillWidth: true
                        Layout.preferredHeight: 48
                        radius: 6
                        color: cMouse.containsMouse ? "#F0FDF4" : "#F8FAFC"
                        border.width: 1
                        border.color: cMouse.containsMouse ? "#BBF7D0" : "#E2E8F0"

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 8
                            spacing: 10

                            Text {
                                text: "🚃"
                                font.pixelSize: 16
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 1
                                Text {
                                    text: modelData.title
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.Bold
                                    color: Theme.colors.textPrimary
                                }
                                Text {
                                    text: modelData.subtitle + " · " + modelData.context
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 10
                                    color: "#64748B"
                                }
                            }

                            Rectangle {
                                width: 70; height: 26; radius: 4
                                color: Theme.colors.primary
                                Text { anchors.centerIn: parent; text: "Configure"; color: "#FFFFFF"; font.pixelSize: 10; font.weight: Font.DemiBold }
                            }
                        }

                        MouseArea {
                            id: cMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                SearchManager.selectResult("coach", modelData)
                                root.itemSelected("coach", modelData)
                            }
                        }
                    }
                }
            }

            // ================================================================
            // CATEGORY: TANKS
            // ================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6
                visible: SearchManager.tankResults.length > 0

                RowLayout {
                    spacing: 6
                    Rectangle { width: 4; height: 12; radius: 2; color: "#7C3AED" }
                    Text {
                        text: "TANKS (" + SearchManager.tankResults.length + ")"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: "#7C3AED"
                        font.letterSpacing: 0.8
                    }
                }

                Repeater {
                    model: SearchManager.tankResults
                    delegate: Rectangle {
                        required property var modelData
                        Layout.fillWidth: true
                        Layout.preferredHeight: 52
                        radius: 6
                        color: tkMouse.containsMouse ? "#FAF5FF" : "#F8FAFC"
                        border.width: 1
                        border.color: tkMouse.containsMouse ? "#E9D5FF" : "#E2E8F0"

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 8
                            spacing: 10

                            Text {
                                text: "💧"
                                font.pixelSize: 16
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 1
                                Text {
                                    text: modelData.title
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.Bold
                                    color: Theme.colors.textPrimary
                                }
                                Text {
                                    text: modelData.subtitle
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 10
                                    color: "#64748B"
                                }
                                Text {
                                    text: modelData.context
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 10
                                    font.weight: Font.DemiBold
                                    color: modelData.context.indexOf("Online") !== -1 ? "#16A34A" : "#64748B"
                                }
                            }

                            Rectangle {
                                width: 70; height: 26; radius: 4
                                color: Theme.colors.primary
                                Text { anchors.centerIn: parent; text: "Open Tank"; color: "#FFFFFF"; font.pixelSize: 10; font.weight: Font.DemiBold }
                            }
                        }

                        MouseArea {
                            id: tkMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                SearchManager.selectResult("tank", modelData)
                                root.itemSelected("tank", modelData)
                            }
                        }
                    }
                }
            }

            // No matches state
            ColumnLayout {
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignHCenter
                visible: SearchManager.totalMatches === 0
                spacing: 8

                Text {
                    text: "No matching trains, coaches, tanks, or locations found."
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    color: "#94A3B8"
                    Layout.alignment: Qt.AlignHCenter
                }
            }
        }
    }
}
