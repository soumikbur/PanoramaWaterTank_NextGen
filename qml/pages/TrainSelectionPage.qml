import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// TrainSelectionPage.qml — Professional Railway Operations / Industrial SCADA
//
// Integrated Selection Flow:
//   1. Header / Hero: Compact route guidance ("Select Region → Choose Train → Monitor Tanks")
//   2. Region Overview: 4 responsive cards with live Train, Tank & Junction metrics
//   3. Selected Region Section: Live search filter and horizontal train cards
//   4. Train Cards: Prominent Train ID, route (Source → Destination), metrics & View Details
//   5. Selection Footer: Operational info panel with regional summary
// ============================================================================
Item {
    id: root

    signal trainSelected(string trainNumber, string trainName, string regionId, string regionName)

    // Selection state: defaults to active region or "er" on initial launch
    property string selectedRegionId: {
        if (ApplicationStateManager.selectedRegionId !== "") {
            return ApplicationStateManager.selectedRegionId;
        }
        return "er";
    }
    property string selectedRegionName: {
        if (ApplicationStateManager.selectedRegionName !== "") {
            return ApplicationStateManager.selectedRegionName;
        }
        return "Eastern Railway";
    }
    property string searchQuery: ""

    // Regional accent resolver
    function regionAccent(regId) {
        if (regId === "er") return "#2563EB";   // Eastern Railway (Blue)
        if (regId === "ser") return "#059669";  // South Eastern (Green)
        if (regId === "ner" || regId === "nfr") return "#7C3AED"; // North Eastern (Purple)
        if (regId === "wr") return "#D97706";   // Western (Orange)
        return Theme.colors.primary;
    }

    // Filter logic
    function matchesSearch(train) {
        if (!root.searchQuery || root.searchQuery.trim() === "") return true;
        var q = root.searchQuery.trim().toLowerCase();
        var num = (train.trainNumber || "").toLowerCase();
        var name = (train.trainName || "").toLowerCase();
        var src = (train.source || "").toLowerCase();
        var dst = (train.destination || "").toLowerCase();
        var sc = (train.sourceCode || "").toLowerCase();
        var dc = (train.destinationCode || "").toLowerCase();
        return num.indexOf(q) !== -1 || name.indexOf(q) !== -1 ||
               src.indexOf(q) !== -1 || dst.indexOf(q) !== -1 ||
               sc.indexOf(q) !== -1 || dc.indexOf(q) !== -1;
    }

    // Page Background
    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    // Scrollable Main Content
    Flickable {
        id: mainFlickable
        anchors.fill: parent
        contentWidth: width
        contentHeight: mainCol.implicitHeight + 40
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ColumnLayout {
            id: mainCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 20
            spacing: 16

            // ================================================================
            // 1. TOP BREADCRUMB + ACTIVE TRAIN STATUS BAR
            // ================================================================
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                // Breadcrumb path
                RowLayout {
                    spacing: 6

                    Text {
                        text: "Train Selection"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Medium
                        color: Theme.colors.textSecondary
                    }

                    Text {
                        text: "\u203A"
                        font.pixelSize: 13
                        color: "#94A3B8"
                    }

                    Text {
                        text: root.selectedRegionName
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.DemiBold
                        color: Theme.colors.textPrimary
                    }

                    Text {
                        visible: ApplicationStateManager.hasTrainContext
                        text: "\u203A"
                        font.pixelSize: 13
                        color: "#94A3B8"
                    }

                    Text {
                        visible: ApplicationStateManager.hasTrainContext
                        text: ApplicationStateManager.selectedTrainNumber + " \u00B7 " + ApplicationStateManager.selectedTrainName
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.DemiBold
                        color: Theme.colors.primary
                    }
                }

                Item { Layout.fillWidth: true }

                // Active train indicator chip
                Rectangle {
                    visible: ApplicationStateManager.hasTrainContext
                    height: 28
                    implicitWidth: activeTrainRow.implicitWidth + 18
                    radius: 6
                    color: "#EFF6FF"
                    border.width: 1
                    border.color: "#BFDBFE"

                    RowLayout {
                        id: activeTrainRow
                        anchors.centerIn: parent
                        spacing: 6

                        Rectangle {
                            width: 6; height: 6; radius: 3
                            color: Theme.colors.primary
                        }

                        Text {
                            text: "Active: " + ApplicationStateManager.selectedTrainNumber + " (" + ApplicationStateManager.selectedTrainName + ")"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.DemiBold
                            color: Theme.colors.primary
                        }
                    }
                }
            }

            // ================================================================
            // 2. HERO / PAGE HEADER (120–140px)
            // ================================================================
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 125
                radius: 10
                color: "#FFFFFF"
                border.width: 1
                border.color: "#E2E8F0"

                // Subtle top gradient accent
                Rectangle {
                    anchors.top: parent.top
                    anchors.left: parent.left
                    anchors.right: parent.right
                    height: 3
                    radius: 1
                    color: Theme.colors.primary
                }

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 20
                    spacing: 24

                    // Left: Locomotive Icon + Main Titles
                    RowLayout {
                        spacing: 16
                        Layout.alignment: Qt.AlignVCenter

                        Rectangle {
                            width: 44
                            height: 44
                            radius: 10
                            color: "#EFF6FF"
                            border.width: 1
                            border.color: "#BFDBFE"

                            // Industrial Locomotive vector icon
                            Item {
                                anchors.centerIn: parent
                                width: 22
                                height: 22

                                Rectangle {
                                    x: 2; y: 1
                                    width: 18; height: 16
                                    radius: 3
                                    color: "transparent"
                                    border.width: 1.8
                                    border.color: Theme.colors.primary
                                }
                                Rectangle {
                                    x: 5.5; y: 3.5
                                    width: 11; height: 4.5
                                    radius: 1
                                    color: "transparent"
                                    border.width: 1.2
                                    border.color: Theme.colors.primary
                                }
                                Rectangle {
                                    x: 5.5; y: 11.5
                                    width: 3; height: 3
                                    radius: 1.5
                                    color: Theme.colors.primary
                                }
                                Rectangle {
                                    x: 13.5; y: 11.5
                                    width: 3; height: 3
                                    radius: 1.5
                                    color: Theme.colors.primary
                                }
                                Rectangle {
                                    x: 1; y: 19.5
                                    width: 20; height: 1.8
                                    radius: 0.9
                                    color: Theme.colors.primary
                                }
                            }
                        }

                        ColumnLayout {
                            spacing: 3

                            Text {
                                text: "Train Selection"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 22
                                font.weight: Font.Bold
                                color: Theme.colors.textPrimary
                            }

                            Text {
                                text: "Choose a railway region to view trains and their water tank systems."
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 13
                                font.weight: Font.Normal
                                color: Theme.colors.textSecondary
                            }
                        }
                    }

                    Item { Layout.fillWidth: true }

                    // Center/Right: Route Workflow Stepper
                    ColumnLayout {
                        visible: root.width > 780
                        spacing: 6
                        Layout.alignment: Qt.AlignVCenter

                        // Route Stepper Visualization
                        RowLayout {
                            spacing: 8
                            Layout.alignment: Qt.AlignHCenter

                            Rectangle {
                                width: 8; height: 8; radius: 4
                                color: Theme.colors.primary
                            }
                            Text {
                                text: "Select Region"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.DemiBold
                                color: Theme.colors.primary
                            }

                            Rectangle {
                                width: 28; height: 2
                                color: "#BFDBFE"
                            }

                            Rectangle {
                                width: 8; height: 8; radius: 4
                                color: Theme.colors.primary
                            }
                            Text {
                                text: "Choose Train"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.DemiBold
                                color: Theme.colors.primary
                            }

                            Rectangle {
                                width: 28; height: 2
                                color: "#BFDBFE"
                            }

                            Rectangle {
                                width: 8; height: 8; radius: 4
                                color: "#16A34A"
                            }
                            Text {
                                text: "Monitor Tanks"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.DemiBold
                                color: "#16A34A"
                            }
                        }

                        Text {
                            text: "Track water tanks, locations and real-time status across Indian Railways"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Normal
                            color: "#64748B"
                            Layout.alignment: Qt.AlignHCenter
                        }
                    }
                }
            }

            // ================================================================
            // 3. REGION OVERVIEW CARDS (4 REGIONS)
            // ================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 10

                RowLayout {
                    Layout.fillWidth: true

                    Text {
                        text: "OPERATIONAL REGIONS"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Bold
                        font.letterSpacing: 1.0
                        color: "#94A3B8"
                    }

                    Item { Layout.fillWidth: true }

                    Text {
                        text: "Click a region to inspect its trains"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        color: "#94A3B8"
                    }
                }

                // 4-Column Responsive Region Grid
                GridLayout {
                    Layout.fillWidth: true
                    columns: root.width > 1080 ? 4 : (root.width > 620 ? 2 : 1)
                    columnSpacing: 14
                    rowSpacing: 14

                    Repeater {
                        model: TrainConfigProvider.regions()

                        delegate: Rectangle {
                            required property var modelData
                            property bool isSelected: root.selectedRegionId === modelData.regionId ||
                                                      ((modelData.regionId === "ner" || modelData.regionId === "nfr") &&
                                                       (root.selectedRegionId === "ner" || root.selectedRegionId === "nfr"))
                            property bool isHovered: regCardMa.containsMouse
                            property color accent: modelData.accentColor || root.regionAccent(modelData.regionId)

                            Layout.fillWidth: true
                            Layout.minimumWidth: 200
                            Layout.preferredHeight: 124
                            radius: 10
                            color: isSelected ? "#FFFFFF" : (isHovered ? "#FAFAFA" : "#FFFFFF")
                            border.width: isSelected ? 2 : 1
                            border.color: isSelected ? accent : (isHovered ? "#94A3B8" : "#E2E8F0")

                            Behavior on border.color { ColorAnimation { duration: 150 } }
                            Behavior on color { ColorAnimation { duration: 150 } }

                            // Regional Accent Strip (Top)
                            Rectangle {
                                width: parent.width - (isSelected ? 4 : 2)
                                height: 3
                                x: isSelected ? 2 : 1
                                y: isSelected ? 2 : 1
                                radius: 1
                                color: accent
                            }

                            ColumnLayout {
                                anchors.fill: parent
                                anchors.margins: 14
                                anchors.topMargin: 16
                                spacing: 8

                                // Region Title & Action Indicator
                                RowLayout {
                                    Layout.fillWidth: true
                                    spacing: 8

                                    // Regional bullet dot
                                    Rectangle {
                                        width: 8; height: 8; radius: 4
                                        color: accent
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        text: modelData.regionName.toUpperCase()
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 13
                                        font.weight: Font.Bold
                                        font.letterSpacing: 0.5
                                        color: Theme.colors.textPrimary
                                        elide: Text.ElideRight
                                    }

                                    // Active Indicator badge or Arrow
                                    Rectangle {
                                        visible: isSelected
                                        height: 18
                                        width: 48
                                        radius: 4
                                        color: "#EFF6FF"
                                        border.width: 1
                                        border.color: "#BFDBFE"

                                        Text {
                                            anchors.centerIn: parent
                                            text: "ACTIVE"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                            color: accent
                                        }
                                    }

                                    Text {
                                        visible: !isSelected
                                        text: "\u2192"
                                        font.pixelSize: 14
                                        font.weight: Font.Bold
                                        color: isHovered ? accent : "#94A3B8"
                                    }
                                }

                                // Area Descriptor (e.g. Howrah • Asansol • Dhanbad • Ranchi)
                                Text {
                                    Layout.fillWidth: true
                                    text: modelData.areaDescriptor || ""
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 11
                                    font.weight: Font.Normal
                                    color: "#64748B"
                                    elide: Text.ElideRight
                                }

                                Item { Layout.fillHeight: true }

                                // Metrics: Trains, Tanks, Junctions
                                RowLayout {
                                    Layout.fillWidth: true
                                    spacing: 12

                                    // Trains
                                    RowLayout {
                                        spacing: 4
                                        Text {
                                            text: (modelData.trainCount || 0).toString()
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 15
                                            font.weight: Font.Bold
                                            color: isSelected ? accent : Theme.colors.textPrimary
                                        }
                                        Text {
                                            text: "Trains"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            color: "#64748B"
                                        }
                                    }

                                    Text { text: "\u00B7"; color: "#CBD5E1" }

                                    // Tanks
                                    RowLayout {
                                        spacing: 4
                                        Text {
                                            text: (modelData.tankCount || 0).toString()
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 15
                                            font.weight: Font.Bold
                                            color: isSelected ? accent : Theme.colors.textPrimary
                                        }
                                        Text {
                                            text: "Tanks"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            color: "#64748B"
                                        }
                                    }

                                    Text { text: "\u00B7"; color: "#CBD5E1" }

                                    // Junctions
                                    RowLayout {
                                        spacing: 4
                                        Text {
                                            text: (modelData.junctionCount || 0).toString()
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 15
                                            font.weight: Font.Bold
                                            color: isSelected ? accent : Theme.colors.textPrimary
                                        }
                                        Text {
                                            text: "Junctions"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            color: "#64748B"
                                        }
                                    }
                                }
                            }

                            MouseArea {
                                id: regCardMa
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    root.selectedRegionId = modelData.regionId
                                    root.selectedRegionName = modelData.regionName
                                    ApplicationStateManager.selectRegion(modelData.regionId, modelData.regionName)
                                }
                            }
                        }
                    }
                }
            }

            // ================================================================
            // 4. SELECTED REGION SECTION CONTAINER (TRAIN LIST + SEARCH)
            // ================================================================
            Rectangle {
                Layout.fillWidth: true
                radius: 10
                color: "#FFFFFF"
                border.width: 1
                border.color: "#E2E8F0"
                implicitHeight: selectedRegionCol.implicitHeight + 36

                ColumnLayout {
                    id: selectedRegionCol
                    anchors.fill: parent
                    anchors.margins: 18
                    spacing: 16

                    // Header Row: Region Info + Live Search
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 16

                        // Left: Region title and count
                        RowLayout {
                            spacing: 12
                            Layout.alignment: Qt.AlignVCenter

                            Rectangle {
                                width: 36
                                height: 36
                                radius: 8
                                color: "#EFF6FF"
                                border.width: 1
                                border.color: "#BFDBFE"

                                Text {
                                    anchors.centerIn: parent
                                    text: "\u25B6"
                                    font.pixelSize: 12
                                    color: root.regionAccent(root.selectedRegionId)
                                }
                            }

                            ColumnLayout {
                                spacing: 2

                                Text {
                                    text: root.selectedRegionName
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 17
                                    font.weight: Font.Bold
                                    color: Theme.colors.textPrimary
                                }

                                Text {
                                    text: TrainConfigProvider.trainCountForRegion(root.selectedRegionId) + " trains available \u00B7 Select a train to view tank details and monitoring information"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.Normal
                                    color: Theme.colors.textSecondary
                                }
                            }
                        }

                        Item { Layout.fillWidth: true }

                        // Right: Search Input Field
                        Rectangle {
                            Layout.preferredWidth: Math.min(300, root.width * 0.35)
                            Layout.preferredHeight: 36
                            radius: 6
                            color: "#F8FAFC"
                            border.width: searchInput.activeFocus ? 1.5 : 1
                            border.color: searchInput.activeFocus ? Theme.colors.primary : "#CBD5E1"

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 10
                                anchors.rightMargin: 10
                                spacing: 8

                                // Search Magnifier Icon
                                Text {
                                    text: "\u2315"
                                    font.pixelSize: 16
                                    color: "#94A3B8"
                                }

                                TextInput {
                                    id: searchInput
                                    Layout.fillWidth: true
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    color: Theme.colors.textPrimary
                                    clip: true
                                    text: root.searchQuery
                                    onTextChanged: root.searchQuery = text

                                    Text {
                                        text: "Search train by number or name..."
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 12
                                        color: "#94A3B8"
                                        visible: !searchInput.text && !searchInput.activeFocus
                                    }
                                }

                                // Clear search button
                                Text {
                                    visible: searchInput.text.length > 0
                                    text: "\u2715"
                                    font.pixelSize: 12
                                    color: clearSearchMa.containsMouse ? Theme.colors.critical : "#94A3B8"

                                    MouseArea {
                                        id: clearSearchMa
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            searchInput.text = ""
                                            root.searchQuery = ""
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Divider
                    Rectangle {
                        Layout.fillWidth: true
                        height: 1
                        color: "#E2E8F0"
                    }

                    // Train Cards List
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 10

                        Repeater {
                            id: trainRepeater
                            model: TrainConfigProvider.trainsForRegion(root.selectedRegionId)

                            delegate: Rectangle {
                                required property var modelData
                                property bool isMatch: root.matchesSearch(modelData)
                                property bool isHovered: trainCardMa.containsMouse
                                property bool isActive: ApplicationStateManager.selectedTrainNumber === modelData.trainNumber

                                visible: isMatch
                                Layout.fillWidth: true
                                Layout.preferredHeight: visible ? 96 : 0
                                radius: 8
                                color: isActive ? "#F0F7FF" : (isHovered ? "#F8FAFC" : "#FFFFFF")
                                border.width: isActive ? 2 : 1
                                border.color: isActive ? Theme.colors.primary : (isHovered ? "#94A3B8" : "#E2E8F0")

                                Behavior on border.color { ColorAnimation { duration: 120 } }
                                Behavior on color { ColorAnimation { duration: 120 } }

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.leftMargin: 16
                                    anchors.rightMargin: 16
                                    spacing: 16

                                    // Left Accent Line
                                    Rectangle {
                                        width: 4
                                        height: 52
                                        radius: 2
                                        color: isActive ? Theme.colors.primary : (isHovered ? "#94A3B8" : "#CBD5E1")
                                        Behavior on color { ColorAnimation { duration: 120 } }
                                    }

                                    // Train ID Column
                                    ColumnLayout {
                                        Layout.preferredWidth: 80
                                        spacing: 1
                                        Layout.alignment: Qt.AlignVCenter

                                        Text {
                                            text: modelData.trainNumber
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 20
                                            font.weight: Font.Bold
                                            color: isActive ? Theme.colors.primary : Theme.colors.textPrimary
                                        }

                                        Text {
                                            text: "Train No."
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 10
                                            font.weight: Font.Medium
                                            color: "#64748B"
                                        }
                                    }

                                    // Vertical Separator
                                    Rectangle {
                                        width: 1
                                        height: 48
                                        color: "#E2E8F0"
                                    }

                                    // Train Info Column (Name, Route, Codes)
                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        spacing: 3
                                        Layout.alignment: Qt.AlignVCenter

                                        RowLayout {
                                            spacing: 8

                                            Text {
                                                text: modelData.trainName
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 15
                                                font.weight: Font.Bold
                                                color: Theme.colors.textPrimary
                                                elide: Text.ElideRight
                                            }

                                            // Active Badge
                                            Rectangle {
                                                visible: isActive
                                                height: 18
                                                width: activeBadgeText.implicitWidth + 12
                                                radius: 4
                                                color: "#DBEAFE"
                                                border.width: 1
                                                border.color: "#93C5FD"

                                                Text {
                                                    id: activeBadgeText
                                                    anchors.centerIn: parent
                                                    text: "ACTIVE"
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 9
                                                    font.weight: Font.Bold
                                                    color: Theme.colors.primary
                                                }
                                            }
                                        }

                                        // Full Route (Source → Destination)
                                        RowLayout {
                                            spacing: 6

                                            Text {
                                                text: modelData.source
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 13
                                                font.weight: Font.DemiBold
                                                color: "#334155"
                                            }

                                            Text {
                                                text: "\u2192"
                                                font.pixelSize: 13
                                                font.weight: Font.Bold
                                                color: Theme.colors.primary
                                            }

                                            Text {
                                                text: modelData.destination
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 13
                                                font.weight: Font.DemiBold
                                                color: "#334155"
                                            }
                                        }

                                        // Station Codes & Region
                                        RowLayout {
                                            spacing: 6

                                            Text {
                                                text: (modelData.sourceCode && modelData.destinationCode)
                                                      ? (modelData.sourceCode + " \u2192 " + modelData.destinationCode)
                                                      : ""
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 11
                                                font.weight: Font.Medium
                                                color: "#64748B"
                                            }

                                            Text {
                                                visible: modelData.sourceCode && modelData.destinationCode
                                                text: "\u00B7"
                                                color: "#CBD5E1"
                                            }

                                            Text {
                                                text: "Region: " + (modelData.regionName || root.selectedRegionName)
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 11
                                                color: "#64748B"
                                            }
                                        }
                                    }

                                    // Metric Boxes & View Details Button
                                    RowLayout {
                                        spacing: 16
                                        Layout.alignment: Qt.AlignVCenter

                                        // 4 Compact Metric Columns
                                        RowLayout {
                                            visible: root.width > 680
                                            spacing: 16

                                            // Coaches
                                            ColumnLayout {
                                                spacing: 1
                                                Text {
                                                    text: (modelData.coachCount || 0).toString()
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 14
                                                    font.weight: Font.Bold
                                                    color: Theme.colors.textPrimary
                                                    horizontalAlignment: Text.AlignHCenter
                                                    Layout.alignment: Qt.AlignHCenter
                                                }
                                                Text {
                                                    text: "Coaches"
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 10
                                                    color: "#64748B"
                                                    horizontalAlignment: Text.AlignHCenter
                                                    Layout.alignment: Qt.AlignHCenter
                                                }
                                            }

                                            // Tanks
                                            ColumnLayout {
                                                spacing: 1
                                                Text {
                                                    text: (modelData.tankCount || 0).toString()
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 14
                                                    font.weight: Font.Bold
                                                    color: Theme.colors.textPrimary
                                                    horizontalAlignment: Text.AlignHCenter
                                                    Layout.alignment: Qt.AlignHCenter
                                                }
                                                Text {
                                                    text: "Tanks"
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 10
                                                    color: "#64748B"
                                                    horizontalAlignment: Text.AlignHCenter
                                                    Layout.alignment: Qt.AlignHCenter
                                                }
                                            }

                                            // Junctions
                                            ColumnLayout {
                                                spacing: 1
                                                Text {
                                                    text: (modelData.junctionCount || 0).toString()
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 14
                                                    font.weight: Font.Bold
                                                    color: Theme.colors.textPrimary
                                                    horizontalAlignment: Text.AlignHCenter
                                                    Layout.alignment: Qt.AlignHCenter
                                                }
                                                Text {
                                                    text: "Junctions"
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 10
                                                    color: "#64748B"
                                                    horizontalAlignment: Text.AlignHCenter
                                                    Layout.alignment: Qt.AlignHCenter
                                                }
                                            }

                                            // Water Stops
                                            ColumnLayout {
                                                spacing: 1
                                                Text {
                                                    text: (modelData.waterStopCount || modelData.waterJunctionCount || 0).toString()
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 14
                                                    font.weight: Font.Bold
                                                    color: "#16A34A"
                                                    horizontalAlignment: Text.AlignHCenter
                                                    Layout.alignment: Qt.AlignHCenter
                                                }
                                                Text {
                                                    text: "Water Stops"
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 10
                                                    color: "#64748B"
                                                    horizontalAlignment: Text.AlignHCenter
                                                    Layout.alignment: Qt.AlignHCenter
                                                }
                                            }
                                        }

                                        // View Details Action Button
                                        Rectangle {
                                            height: 32
                                            implicitWidth: viewDetailsRow.implicitWidth + 20
                                            radius: 6
                                            color: isActive ? Theme.colors.primary : (viewDetailsMa.containsMouse ? "#1D4ED8" : "#EFF6FF")
                                            border.width: isActive ? 0 : 1
                                            border.color: isActive ? "transparent" : "#BFDBFE"

                                            Behavior on color { ColorAnimation { duration: 120 } }

                                            RowLayout {
                                                id: viewDetailsRow
                                                anchors.centerIn: parent
                                                spacing: 6

                                                Text {
                                                    text: "View Details \u2192"
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 11
                                                    font.weight: Font.DemiBold
                                                    color: (isActive || viewDetailsMa.containsMouse) ? "#FFFFFF" : Theme.colors.primary
                                                }
                                            }

                                            MouseArea {
                                                id: viewDetailsMa
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onClicked: {
                                                    ApplicationStateManager.selectTrain(modelData.trainNumber, modelData.trainName)
                                                    root.trainSelected(
                                                        modelData.trainNumber,
                                                        modelData.trainName,
                                                        root.selectedRegionId,
                                                        root.selectedRegionName
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }

                                // Card Click Handler
                                MouseArea {
                                    id: trainCardMa
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    z: -1
                                    onClicked: {
                                        ApplicationStateManager.selectTrain(modelData.trainNumber, modelData.trainName)
                                        root.trainSelected(
                                            modelData.trainNumber,
                                            modelData.trainName,
                                            root.selectedRegionId,
                                            root.selectedRegionName
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Empty Search Results State
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 120
                        radius: 8
                        color: "#F8FAFC"
                        border.width: 1
                        border.color: "#E2E8F0"
                        visible: {
                            if (!root.searchQuery || root.searchQuery.trim() === "") return false;
                            var trains = TrainConfigProvider.trainsForRegion(root.selectedRegionId);
                            for (var i = 0; i < trains.length; ++i) {
                                if (root.matchesSearch(trains[i])) return false;
                            }
                            return true;
                        }

                        ColumnLayout {
                            anchors.centerIn: parent
                            spacing: 6

                            Text {
                                text: "No matching trains"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.Bold
                                color: Theme.colors.textPrimary
                                Layout.alignment: Qt.AlignHCenter
                            }

                            Text {
                                text: "No trains matching \"" + root.searchQuery + "\" found in " + root.selectedRegionName + "."
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: "#64748B"
                                Layout.alignment: Qt.AlignHCenter
                            }

                            Rectangle {
                                height: 26
                                implicitWidth: clearBtnText.implicitWidth + 16
                                radius: 4
                                color: "#EFF6FF"
                                border.width: 1
                                border.color: "#BFDBFE"
                                Layout.alignment: Qt.AlignHCenter

                                Text {
                                    id: clearBtnText
                                    anchors.centerIn: parent
                                    text: "Clear Search Filter"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 11
                                    font.weight: Font.Medium
                                    color: Theme.colors.primary
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        searchInput.text = ""
                                        root.searchQuery = ""
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ================================================================
            // 5. BOTTOM SELECTION INFORMATION PANEL
            // ================================================================
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 64
                radius: 8
                color: "#F8FAFC"
                border.width: 1
                border.color: "#E2E8F0"

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 18
                    anchors.rightMargin: 18
                    spacing: 14

                    // Information Circle Icon
                    Rectangle {
                        width: 28
                        height: 28
                        radius: 14
                        color: "#EFF6FF"
                        border.width: 1
                        border.color: "#BFDBFE"

                        Text {
                            anchors.centerIn: parent
                            text: "\u2139"
                            font.pixelSize: 14
                            font.weight: Font.Bold
                            color: Theme.colors.primary
                        }
                    }

                    ColumnLayout {
                        spacing: 1
                        Layout.alignment: Qt.AlignVCenter

                        Text {
                            text: "Select a train to continue"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            font.weight: Font.Bold
                            color: Theme.colors.textPrimary
                        }

                        Text {
                            text: "Choose a train from the list above to view tank configuration, live status, route map and junction details."
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            color: "#64748B"
                        }
                    }

                    Item { Layout.fillWidth: true }

                    // Right Regional Totals Summary
                    ColumnLayout {
                        spacing: 1
                        Layout.alignment: Qt.AlignVCenter

                        Text {
                            text: "Total in " + root.selectedRegionName
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Medium
                            color: "#64748B"
                            horizontalAlignment: Text.AlignRight
                            Layout.alignment: Qt.AlignRight
                        }

                        Text {
                            text: TrainConfigProvider.trainCountForRegion(root.selectedRegionId) + " Trains  |  " +
                                  TrainConfigProvider.tankCountForRegion(root.selectedRegionId) + " Tanks  |  " +
                                  TrainConfigProvider.junctionCountForRegion(root.selectedRegionId) + " Junctions"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            font.weight: Font.Bold
                            color: Theme.colors.textPrimary
                            horizontalAlignment: Text.AlignRight
                            Layout.alignment: Qt.AlignRight
                        }
                    }
                }
            }
        }
    }
}
