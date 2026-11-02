import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// SearchBar.qml — Global application search bar with live debounce & dropdown
// ============================================================================
Item {
    id: root

    implicitWidth: 380
    implicitHeight: 38

    signal locationSelected(real lat, real lon, string name)
    signal trainSelected(string trainNumber)
    signal coachSelected(int coachId, string coachNumber, string trainNumber)
    signal tankSelected(int tankId, string tankNumber)

    Rectangle {
        id: searchBg
        anchors.fill: parent
        radius: 6
        color: "#F8FAFC"
        border.width: searchInput.activeFocus ? 1.5 : 1
        border.color: searchInput.activeFocus ? Theme.colors.primary : "#CBD5E1"

        Behavior on border.color {
            ColorAnimation { duration: 120 }
        }

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 10
            anchors.rightMargin: 8
            spacing: 8

            // Magnifying Glass Search Icon
            Shape {
                width: 16
                height: 16
                antialiasing: true

                ShapePath {
                    fillColor: "transparent"
                    strokeColor: searchInput.activeFocus ? Theme.colors.primary : "#64748B"
                    strokeWidth: 1.6
                    capStyle: ShapePath.RoundCap
                    joinStyle: ShapePath.RoundJoin
                    PathSvg {
                        path: "M6.5,2 C4.0,2 2,4.0 2,6.5 C2,9.0 4.0,11 6.5,11 C9.0,11 11,9.0 11,6.5 C11,4.0 9.0,2 6.5,2 Z M10,10 L14.5,14.5"
                    }
                }
            }

            TextInput {
                id: searchInput
                Layout.fillWidth: true
                Layout.fillHeight: true
                verticalAlignment: TextInput.AlignVCenter
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                color: Theme.colors.textPrimary
                selectByMouse: true
                clip: true

                Text {
                    anchors.fill: parent
                    verticalAlignment: Text.AlignVCenter
                    text: "Search trains, coaches, tanks, locations..."
                    color: "#94A3B8"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    visible: !searchInput.text && !searchInput.activeFocus
                }

                onTextChanged: {
                    SearchManager.setQuery(searchInput.text)
                }

                Keys.onEscapePressed: {
                    searchInput.text = ""
                    SearchManager.clear()
                    dropdownPopup.close()
                }
            }

            // Spinner or Clear button
            Item {
                Layout.preferredWidth: 20
                Layout.preferredHeight: 20

                // Clear button
                Rectangle {
                    anchors.centerIn: parent
                    width: 18
                    height: 18
                    radius: 9
                    color: clearMouse.containsMouse ? "#E2E8F0" : "#F1F5F9"
                    visible: searchInput.text.length > 0 && !SearchManager.isSearching

                    Text {
                        anchors.centerIn: parent
                        text: "✕"
                        color: "#64748B"
                        font.pixelSize: 9
                        font.weight: Font.Bold
                    }

                    MouseArea {
                        id: clearMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            searchInput.text = ""
                            SearchManager.clear()
                        }
                    }
                }

                // Searching Indicator
                BusyIndicator {
                    anchors.centerIn: parent
                    width: 16
                    height: 16
                    running: SearchManager.isSearching
                    visible: SearchManager.isSearching
                }
            }
        }
    }

    // Dropdown Results Popup
    Popup {
        id: dropdownPopup
        x: 0
        y: root.height + 6
        width: Math.max(root.width, 460)
        padding: 0
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        visible: ((SearchManager.query ? SearchManager.query.toString().trim().length : 0) > 0) && (SearchManager.hasResults || !SearchManager.isSearching)

        background: Item {}

        SearchResultsDropdown {
            width: dropdownPopup.width
            onItemSelected: (type, data) => {
                dropdownPopup.close()
                if (type === "location") {
                    root.locationSelected(data.latitude, data.longitude, data.name)
                } else if (type === "train") {
                    root.trainSelected(data.trainNumber)
                } else if (type === "coach") {
                    root.coachSelected(data.coachId, data.coachNumber, data.trainNumber)
                } else if (type === "tank") {
                    root.tankSelected(data.tankId, data.tankNumber)
                }
            }
        }
    }
}
