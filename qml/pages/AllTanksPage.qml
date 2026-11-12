import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// AllTanksPage.qml — Exact "All Tanks" SCADA Overview & Grid Screen
// Matches physical train consist, live telemetry pipeline, and reference UI.
// ============================================================================
Item {
    id: root

    signal tankSelected(string tankId)
    signal openTrainSelectionRequested()

    // Current filter state
    property string activeFilter: "All" // "All", "Online", "Offline", "Low Level"
    property string searchQuery: ""
    property string viewMode: "grid" // "grid" | "list"

    // Dynamic filtered tanks list
    property var filteredTanks: {
        if (ApplicationStateManager.hasTrainContext && ApplicationStateManager.selectedTrainNumber !== "") {
            return TrainManager.getFilteredTanksForTrain(ApplicationStateManager.selectedTrainNumber, searchQuery, activeFilter);
        }
        return TrainManager.getTanksFiltered(searchQuery, activeFilter);
    }

    Connections {
        target: ApplicationStateManager
        function onSelectedTrainNumberChanged() {
            root.refreshList()
        }
        function onHasTrainContextChanged() {
            root.refreshList()
        }
    }

    Connections {
        target: TrainManager
        function onTanksUpdated() {
            root.refreshList()
        }
        function onCountsChanged() {
            root.refreshList()
        }
    }

    function refreshList() {
        if (ApplicationStateManager.hasTrainContext && ApplicationStateManager.selectedTrainNumber !== "") {
            root.filteredTanks = TrainManager.getFilteredTanksForTrain(ApplicationStateManager.selectedTrainNumber, root.searchQuery, root.activeFilter);
        } else {
            root.filteredTanks = TrainManager.getTanksFiltered(root.searchQuery, root.activeFilter);
        }
    }

    function openTankDetail(tankId) {
        TrainManager.selectTank(tankId);
        root.tankSelected(tankId);
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background // #F8FAFC
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 16

        // ====================================================================
        // 0. BREADCRUMB & TRAIN CONTEXT HEADER
        // ====================================================================
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            // Breadcrumb: Train Selection > Region > Train > All Tanks
            RowLayout {
                spacing: 6

                Text {
                    text: "Train Management"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    font.weight: Font.Medium
                    color: Theme.colors.primary

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.openTrainSelectionRequested()
                    }
                }

                Text {
                    visible: ApplicationStateManager.hasTrainContext
                    text: "\u203A"
                    font.pixelSize: 12
                    color: "#94A3B8"
                }

                Text {
                    visible: ApplicationStateManager.hasTrainContext
                    text: ApplicationStateManager.selectedRegionName
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    font.weight: Font.Medium
                    color: Theme.colors.textSecondary
                }

                Text {
                    visible: ApplicationStateManager.hasTrainContext
                    text: "\u203A"
                    font.pixelSize: 12
                    color: "#94A3B8"
                }

                Text {
                    visible: ApplicationStateManager.hasTrainContext
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
                    text: "All Tanks"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    font.weight: Font.DemiBold
                    color: Theme.colors.textPrimary
                }
            }

            Item { Layout.fillWidth: true }

            // Switch/Select train shortcut button
            Rectangle {
                height: 28
                implicitWidth: changeTrainRow.implicitWidth + 16
                radius: 6
                color: changeTrainMa.containsMouse ? "#EFF6FF" : "#F8FAFC"
                border.width: 1
                border.color: changeTrainMa.containsMouse ? Theme.colors.primary : "#E2E8F0"

                RowLayout {
                    id: changeTrainRow
                    anchors.centerIn: parent
                    spacing: 6

                    Text {
                        text: ApplicationStateManager.hasTrainContext ? "\u2190 Change Train" : "Select Train \u2192"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Medium
                        color: Theme.colors.primary
                    }
                }

                MouseArea {
                    id: changeTrainMa
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: trainSelectDialog.open()
                }
            }
        }

        // Active Train Context Banner
        RowLayout {
            Layout.fillWidth: true
            visible: ApplicationStateManager.hasTrainContext
            spacing: 12

            Rectangle {
                width: 4
                height: 36
                radius: 2
                color: Theme.colors.primary
            }

            ColumnLayout {
                spacing: 2
                Text {
                    text: "ALL TANKS"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Bold
                    font.letterSpacing: 0.8
                    color: "#64748B"
                }
                Text {
                    text: ApplicationStateManager.selectedTrainNumber + " \u00B7 " + ApplicationStateManager.selectedTrainName
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 18
                    font.weight: Font.Bold
                    color: Theme.colors.textPrimary
                }
                Text {
                    text: ApplicationStateManager.selectedRegionName
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    font.weight: Font.Medium
                    color: Theme.colors.textSecondary
                }
            }
        }

        // ====================================================================
        // 1. FILTER & SEARCH TOOLBAR
        // ====================================================================
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            // Filter Pills: All Tanks (N), Online (N), Offline (N), Low Level (N)
            RowLayout {
                spacing: 8
                Layout.alignment: Qt.AlignVCenter

                // All Tanks Pill
                Rectangle {
                    height: 36
                    radius: 8
                    Layout.preferredWidth: allText.implicitWidth + 24
                    color: root.activeFilter === "All" ? Theme.colors.primary : "#FFFFFF"
                    border.width: 1
                    border.color: root.activeFilter === "All" ? Theme.colors.primary : "#E2E8F0"

                    Behavior on color {
                        ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                    }
                    Behavior on border.color {
                        ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                    }

                    RowLayout {
                        id: allText
                        anchors.centerIn: parent
                        spacing: 6
                        Text {
                            text: "All Coaches"
                            color: root.activeFilter === "All" ? "#FFFFFF" : Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: root.activeFilter === "All" ? Font.Bold : Font.Medium
                        }
                        Rectangle {
                            height: 18
                            radius: 9
                            width: countAllText.implicitWidth + 10
                            color: root.activeFilter === "All" ? "#0369A1" : "#F1F5F9"
                            Text {
                                id: countAllText
                                anchors.centerIn: parent
                                text: (ApplicationStateManager.hasTrainContext && ApplicationStateManager.selectedTrainNumber !== "") ? TrainManager.filteredTotalTanks.toString() : TrainManager.totalTanks.toString()
                                color: root.activeFilter === "All" ? "#FFFFFF" : "#64748B"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.Bold
                            }
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.activeFilter = "All"
                            root.refreshList()
                        }
                    }
                }

                // Online Pill
                Rectangle {
                    height: 36
                    radius: 8
                    Layout.preferredWidth: onlineText.implicitWidth + 24
                    color: root.activeFilter === "Online" ? Theme.colors.primary : "#FFFFFF"
                    border.width: 1
                    border.color: root.activeFilter === "Online" ? Theme.colors.primary : "#E2E8F0"

                    Behavior on color {
                        ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                    }
                    Behavior on border.color {
                        ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                    }

                    RowLayout {
                        id: onlineText
                        anchors.centerIn: parent
                        spacing: 6
                        Text {
                            text: "Online"
                            color: root.activeFilter === "Online" ? "#FFFFFF" : Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: root.activeFilter === "Online" ? Font.Bold : Font.Medium
                        }
                        Rectangle {
                            height: 18
                            radius: 9
                            width: countOnlineText.implicitWidth + 10
                            color: root.activeFilter === "Online" ? "#0369A1" : "#DCFCE7"
                            Text {
                                id: countOnlineText
                                anchors.centerIn: parent
                                text: (ApplicationStateManager.hasTrainContext && ApplicationStateManager.selectedTrainNumber !== "") ? TrainManager.filteredOnlineTanks.toString() : TrainManager.onlineTanks.toString()
                                color: root.activeFilter === "Online" ? "#FFFFFF" : "#16A34A"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.Bold
                            }
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.activeFilter = "Online"
                            root.refreshList()
                        }
                    }
                }

                // Offline Pill
                Rectangle {
                    height: 36
                    radius: 8
                    Layout.preferredWidth: offlineText.implicitWidth + 24
                    color: root.activeFilter === "Offline" ? Theme.colors.primary : "#FFFFFF"
                    border.width: 1
                    border.color: root.activeFilter === "Offline" ? Theme.colors.primary : "#E2E8F0"

                    Behavior on color {
                        ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                    }
                    Behavior on border.color {
                        ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                    }

                    RowLayout {
                        id: offlineText
                        anchors.centerIn: parent
                        spacing: 6
                        Text {
                            text: "Offline"
                            color: root.activeFilter === "Offline" ? "#FFFFFF" : Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: root.activeFilter === "Offline" ? Font.Bold : Font.Medium
                        }
                        Rectangle {
                            height: 18
                            radius: 9
                            width: countOfflineText.implicitWidth + 10
                            color: root.activeFilter === "Offline" ? "#0369A1" : "#FEE2E2"
                            Text {
                                id: countOfflineText
                                anchors.centerIn: parent
                                text: (ApplicationStateManager.hasTrainContext && ApplicationStateManager.selectedTrainNumber !== "") ? TrainManager.filteredOfflineTanks.toString() : TrainManager.offlineTanks.toString()
                                color: root.activeFilter === "Offline" ? "#FFFFFF" : "#DC2626"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.Bold
                            }
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.activeFilter = "Offline"
                            root.refreshList()
                        }
                    }
                }

                // Low Level Pill
                Rectangle {
                    height: 36
                    radius: 8
                    Layout.preferredWidth: lowText.implicitWidth + 24
                    color: root.activeFilter === "Low Level" ? Theme.colors.primary : "#FFFFFF"
                    border.width: 1
                    border.color: root.activeFilter === "Low Level" ? Theme.colors.primary : "#E2E8F0"

                    Behavior on color {
                        ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                    }
                    Behavior on border.color {
                        ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                    }

                    RowLayout {
                        id: lowText
                        anchors.centerIn: parent
                        spacing: 6
                        Text {
                            text: "Low Level"
                            color: root.activeFilter === "Low Level" ? "#FFFFFF" : Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: root.activeFilter === "Low Level" ? Font.Bold : Font.Medium
                        }
                        Rectangle {
                            height: 18
                            radius: 9
                            width: countLowText.implicitWidth + 10
                            color: root.activeFilter === "Low Level" ? "#0369A1" : "#FEF3C7"
                            Text {
                                id: countLowText
                                anchors.centerIn: parent
                                text: (ApplicationStateManager.hasTrainContext && ApplicationStateManager.selectedTrainNumber !== "") ? TrainManager.filteredLowLevelCount.toString() : TrainManager.lowLevelCount.toString()
                                color: root.activeFilter === "Low Level" ? "#FFFFFF" : "#D97706"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.Bold
                            }
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.activeFilter = "Low Level"
                            root.refreshList()
                        }
                    }
                }
            }

            // Flexible Space
            Item { Layout.fillWidth: true }

            // Search Box
            Rectangle {
                Layout.preferredWidth: 260
                Layout.preferredHeight: 36
                radius: 8
                color: "#FFFFFF"
                border.width: 1
                border.color: searchInput.activeFocus ? Theme.colors.primary : "#E2E8F0"

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 10
                    anchors.rightMargin: 10
                    spacing: 8

                    // Magnifying glass icon
                    Shape {
                        Layout.preferredWidth: 14
                        Layout.preferredHeight: 14
                        antialiasing: true

                        ShapePath {
                            fillColor: "transparent"
                            strokeColor: "#94A3B8"
                            strokeWidth: 1.5
                            PathSvg {
                                path: "M5.5,1 C3,1 1,3 1,5.5 C1,8 3,10 5.5,10 C8,10 10,8 10,5.5 C10,3 8,1 5.5,1 Z M9,9 L13,13"
                            }
                        }
                    }

                    TextInput {
                        id: searchInput
                        Layout.fillWidth: true
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        selectByMouse: true
                        clip: true

                        Text {
                            anchors.fill: parent
                            text: "Search tank or coach..."
                            color: "#94A3B8"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            visible: !searchInput.text && !searchInput.activeFocus
                            verticalAlignment: Text.AlignVCenter
                        }

                        onTextChanged: {
                            root.searchQuery = text
                            root.refreshList()
                        }
                    }

                    // Clear button
                    Text {
                        text: "✕"
                        color: "#94A3B8"
                        font.pixelSize: 11
                        font.weight: Font.Bold
                        visible: searchInput.text.length > 0
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                searchInput.text = ""
                                root.searchQuery = ""
                                root.refreshList()
                            }
                        }
                    }
                }
            }

            // View Mode Toggle [▦ Grid View] [☷ List View]
            Rectangle {
                Layout.preferredHeight: 36
                Layout.preferredWidth: 200
                radius: 8
                color: "#F1F5F9"
                border.width: 1
                border.color: "#E2E8F0"

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 2
                    spacing: 2

                    // Grid View Toggle
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: 6
                        color: root.viewMode === "grid" ? "#FFFFFF" : "transparent"
                        border.width: root.viewMode === "grid" ? 1 : 0
                        border.color: "#CBD5E1"

                        Behavior on color {
                            ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                        }
                        Behavior on border.color {
                            ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                        }

                        RowLayout {
                            anchors.centerIn: parent
                            spacing: 5
                            Text {
                                text: "▦"
                                color: root.viewMode === "grid" ? Theme.colors.primary : "#64748B"
                                font.pixelSize: 12
                            }
                            Text {
                                text: "Grid View"
                                color: root.viewMode === "grid" ? Theme.colors.primary : "#64748B"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: root.viewMode === "grid" ? Font.Bold : Font.Medium
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.viewMode = "grid"
                        }
                    }

                    // List View Toggle
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: 6
                        color: root.viewMode === "list" ? "#FFFFFF" : "transparent"
                        border.width: root.viewMode === "list" ? 1 : 0
                        border.color: "#CBD5E1"

                        Behavior on color {
                            ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                        }
                        Behavior on border.color {
                            ColorAnimation { duration: Theme.animButtonState; easing.type: Easing.OutQuad }
                        }

                        RowLayout {
                            anchors.centerIn: parent
                            spacing: 5
                            Text {
                                text: "☷"
                                color: root.viewMode === "list" ? Theme.colors.primary : "#64748B"
                                font.pixelSize: 12
                            }
                            Text {
                                text: "List View"
                                color: root.viewMode === "list" ? Theme.colors.primary : "#64748B"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: root.viewMode === "list" ? Font.Bold : Font.Medium
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.viewMode = "list"
                        }
                    }
                }
            }
        }

        // ====================================================================
        // 2. MAIN CONTENT AREA (Scrollable Grid or List)
        // ====================================================================
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            // Empty State (No Online Coaches / Matching Coaches Found)
            Item {
                anchors.centerIn: parent
                visible: root.filteredTanks.length === 0
                width: 340
                height: 160

                readonly property int currentOnlineCount: (ApplicationStateManager.hasTrainContext && ApplicationStateManager.selectedTrainNumber !== "")
                    ? TrainManager.filteredOnlineTanks
                    : TrainManager.onlineTanks

                ColumnLayout {
                    anchors.centerIn: parent
                    spacing: 8

                    Text {
                        text: {
                            if ((root.activeFilter === "All" || root.activeFilter === "Online") && parent.parent.currentOnlineCount === 0) {
                                return "No coaches are currently online."
                            }
                            if (root.activeFilter === "Offline" && root.searchQuery.trim() === "") {
                                return "No offline coaches found"
                            }
                            return "No matching coaches found"
                        }
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 16
                        font.weight: Font.Bold
                        Layout.alignment: Qt.AlignHCenter
                    }

                    Text {
                        text: {
                            if ((root.activeFilter === "All" || root.activeFilter === "Online") && parent.parent.currentOnlineCount === 0) {
                                return "Connected coaches will appear automatically once live telemetry is received."
                            }
                            return "Try adjusting the active filter or search terms."
                        }
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        horizontalAlignment: Text.AlignHCenter
                        wrapMode: Text.WordWrap
                        Layout.maximumWidth: 320
                        Layout.alignment: Qt.AlignHCenter
                    }
                }
            }

            // GRID VIEW
            Flickable {
                id: gridFlickable
                anchors.fill: parent
                visible: opacity > 0.0 && root.filteredTanks.length > 0
                opacity: root.viewMode === "grid" ? 1.0 : 0.0
                contentWidth: width
                contentHeight: gridContainer.implicitHeight + 20
                clip: true
                boundsBehavior: Flickable.StopAtBounds

                Behavior on opacity {
                    NumberAnimation { duration: Theme.animSmallPanel; easing.type: Easing.OutQuad }
                }

                ScrollBar.vertical: ScrollBar {
                    policy: ScrollBar.AsNeeded
                    active: true
                }

                Item {
                    id: gridContainer
                    width: parent.width
                    implicitHeight: gridFlow.implicitHeight

                    // Responsive 6-column desktop layout calculation
                    readonly property int availableWidth: width
                    readonly property int colCount: {
                        if (availableWidth >= 1240) return 6;
                        if (availableWidth >= 1020) return 5;
                        if (availableWidth >= 800)  return 4;
                        if (availableWidth >= 600)  return 3;
                        if (availableWidth >= 400)  return 2;
                        return 1;
                    }
                    readonly property real gridSpacing: 14
                    readonly property real cardWidth: (availableWidth - (colCount - 1) * gridSpacing) / colCount

                    Flow {
                        id: gridFlow
                        width: parent.width
                        spacing: gridContainer.gridSpacing

                        Repeater {
                            model: root.filteredTanks

                            delegate: TankCard {
                                width: gridContainer.cardWidth
                                height: 210
                                tankId: modelData.id
                                deviceId: modelData.deviceId
                                coachId: modelData.coachId
                                coachName: modelData.coachName
                                tankName: modelData.tankName
                                tankType: modelData.tankType
                                maxHeightCm: modelData.maxHeightCm
                                capacityLiters: modelData.capacityLiters
                                levelCm: modelData.levelCm
                                levelPercent: modelData.levelPercent
                                volumeLiters: modelData.volumeLiters
                                connectionState: modelData.connectionState
                                sensorStatus: modelData.sensorStatus
                                alarmState: modelData.alarmState

                                onCardClicked: (id) => {
                                    root.openTankDetail(id);
                                }
                            }
                        }
                    }
                }
            }

            // LIST VIEW (Professional Industrial SCADA Table)
            Item {
                id: listTableWrapper
                anchors.fill: parent
                visible: opacity > 0.0 && root.filteredTanks.length > 0
                opacity: root.viewMode === "list" ? 1.0 : 0.0
                clip: true

                Behavior on opacity {
                    NumberAnimation { duration: Theme.animSmallPanel; easing.type: Easing.OutQuad }
                }

                readonly property int minTableWidth: 1180

                Flickable {
                    id: listHScroll
                    anchors.fill: parent
                    contentWidth: Math.max(listTableWrapper.width, listTableWrapper.minTableWidth)
                    contentHeight: listTableWrapper.height
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds

                    ScrollBar.horizontal: ScrollBar {
                        policy: ScrollBar.AsNeeded
                        active: true
                    }

                    Item {
                        id: tableContainer
                        width: listHScroll.contentWidth
                        height: listTableWrapper.height

                        // Table Header Row: TANK | COACH | TYPE | LEVEL | HEIGHT | VOLUME | CAPACITY | STATUS | ALERT | LAST UPDATE | ACTION
                        Rectangle {
                            id: tableHeader
                            anchors.top: parent.top
                            anchors.left: parent.left
                            anchors.right: parent.right
                            height: 38
                            color: "#F8FAFC"
                            border.width: 1
                            border.color: "#E2E8F0"
                            radius: 6

                            Row {
                                anchors.fill: parent
                                anchors.leftMargin: 16
                                anchors.rightMargin: 16
                                spacing: 8

                                Text { text: "TANK"; width: 85; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "COACH"; width: 90; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "TYPE"; width: 85; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "LEVEL"; width: 140; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "HEIGHT"; width: 120; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "VOLUME"; width: 110; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "CAPACITY"; width: 95; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "STATUS"; width: 90; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "ALERT"; width: 90; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "LAST UPDATE"; width: 110; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                                Text { text: "ACTION"; width: 35; height: parent.height; verticalAlignment: Text.AlignVCenter; horizontalAlignment: Text.AlignHCenter; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                            }
                        }

                        // Table ListView
                        ListView {
                            id: tableListView
                            anchors.top: tableHeader.bottom
                            anchors.topMargin: 4
                            anchors.bottom: parent.bottom
                            anchors.bottomMargin: 8
                            anchors.left: parent.left
                            anchors.right: parent.right
                            clip: true
                            boundsBehavior: Flickable.StopAtBounds
                            model: root.filteredTanks
                            spacing: 2

                            ScrollBar.vertical: ScrollBar {
                                policy: ScrollBar.AsNeeded
                                active: true
                            }

                            delegate: Rectangle {
                                id: rowItem
                                width: tableListView.width
                                height: 44
                                radius: 4
                                clip: true
                                color: rowMouse.containsMouse ? "#EFF6FF" : (index % 2 === 0 ? "#FFFFFF" : "#F8FAFC")
                                border.width: 1
                                border.color: rowMouse.containsMouse ? "#BFDBFE" : "#E2E8F0"

                                Behavior on color {
                                    ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
                                }
                                Behavior on border.color {
                                    ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
                                }

                                readonly property bool isOffline: modelData.connectionState === "Offline" || modelData.sensorStatus === "Disconnected" || modelData.sensorStatus === "Error"
                                readonly property bool isCritical: !isOffline && (modelData.alarmState === "Critical" || modelData.levelPercent < 10.0)
                                readonly property bool isWarning: !isOffline && !isCritical && (modelData.alarmState === "Warning" || modelData.levelPercent < 20.0)

                                Row {
                                    anchors.fill: parent
                                    anchors.leftMargin: 16
                                    anchors.rightMargin: 16
                                    spacing: 8

                                    // 1. TANK
                                    Item {
                                        width: 85
                                        height: parent.height
                                        clip: true
                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: parent.width
                                            text: modelData.tankName
                                            font.pixelSize: 13
                                            font.weight: Font.Bold
                                            color: Theme.colors.textPrimary
                                            font.family: Theme.typography.fontFamily
                                            elide: Text.ElideRight
                                        }
                                    }

                                    // 2. COACH
                                    Item {
                                        width: 90
                                        height: parent.height
                                        clip: true
                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: parent.width
                                            text: modelData.coachName
                                            font.pixelSize: 13
                                            font.weight: Font.DemiBold
                                            color: Theme.colors.textPrimary
                                            font.family: Theme.typography.fontFamily
                                            elide: Text.ElideRight
                                        }
                                    }

                                    // 3. TYPE
                                    Item {
                                        width: 85
                                        height: parent.height
                                        clip: true
                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: parent.width
                                            text: modelData.tankType
                                            font.pixelSize: 12
                                            color: "#64748B"
                                            font.family: Theme.typography.fontFamily
                                            elide: Text.ElideRight
                                        }
                                    }

                                    // 4. LEVEL with Mini Progress Bar
                                    Item {
                                        width: 140
                                        height: parent.height
                                        clip: true

                                        Row {
                                            anchors.verticalCenter: parent.verticalCenter
                                            spacing: 8

                                            Rectangle {
                                                anchors.verticalCenter: parent.verticalCenter
                                                width: 60
                                                height: 6
                                                radius: 3
                                                color: rowItem.isOffline ? "#E2E8F0" : "#E0F2FE"
                                                clip: true

                                                Rectangle {
                                                    anchors.left: parent.left
                                                    anchors.top: parent.top
                                                    anchors.bottom: parent.bottom
                                                    radius: 3
                                                    visible: !rowItem.isOffline
                                                    width: parent.width * Math.max(0.0, Math.min(1.0, modelData.levelPercent / 100.0))
                                                    color: rowItem.isCritical ? "#EF4444" : (rowItem.isWarning ? "#F59E0B" : "#0284C7")
                                                }
                                            }

                                            Text {
                                                anchors.verticalCenter: parent.verticalCenter
                                                text: rowItem.isOffline ? "--" : (modelData.levelPercent.toFixed(1) + "%")
                                                font.pixelSize: 12
                                                font.weight: Font.Bold
                                                color: rowItem.isOffline ? "#94A3B8" : (rowItem.isCritical ? "#DC2626" : (rowItem.isWarning ? "#D97706" : "#0284C7"))
                                                font.family: Theme.typography.fontFamily
                                            }
                                        }
                                    }

                                    // 5. HEIGHT
                                    Item {
                                        width: 120
                                        height: parent.height
                                        clip: true
                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: parent.width
                                            text: rowItem.isOffline ? ("-- / " + modelData.maxHeightCm.toFixed(0) + " cm") : (modelData.levelCm.toFixed(1) + " / " + modelData.maxHeightCm.toFixed(0) + " cm")
                                            font.pixelSize: 12
                                            color: rowItem.isOffline ? "#94A3B8" : "#475569"
                                            font.family: Theme.typography.fontFamily
                                            elide: Text.ElideRight
                                        }
                                    }

                                    // 6. VOLUME
                                    Item {
                                        width: 110
                                        height: parent.height
                                        clip: true
                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: parent.width
                                            text: rowItem.isOffline ? "--" : (Number(Math.round(modelData.volumeLiters)).toLocaleString(Qt.locale()) + " L")
                                            font.pixelSize: 12
                                            font.weight: Font.Medium
                                            color: rowItem.isOffline ? "#94A3B8" : "#334155"
                                            font.family: Theme.typography.fontFamily
                                            elide: Text.ElideRight
                                        }
                                    }

                                    // 7. CAPACITY
                                    Item {
                                        width: 95
                                        height: parent.height
                                        clip: true
                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: parent.width
                                            text: Number(Math.round(modelData.capacityLiters)).toLocaleString(Qt.locale()) + " L"
                                            font.pixelSize: 12
                                            color: "#64748B"
                                            font.family: Theme.typography.fontFamily
                                            elide: Text.ElideRight
                                        }
                                    }

                                    // 8. STATUS
                                    Item {
                                        width: 90
                                        height: parent.height
                                        clip: true

                                        Row {
                                            anchors.verticalCenter: parent.verticalCenter
                                            spacing: 6

                                            Rectangle {
                                                anchors.verticalCenter: parent.verticalCenter
                                                width: 8
                                                height: 8
                                                radius: 4
                                                color: rowItem.isOffline ? "#DC2626" : (rowItem.isCritical ? "#DC2626" : (rowItem.isWarning ? "#D97706" : "#16A34A"))
                                            }

                                            Text {
                                                anchors.verticalCenter: parent.verticalCenter
                                                text: rowItem.isOffline ? "Offline" : (rowItem.isCritical ? "Critical" : (rowItem.isWarning ? "Warning" : "Online"))
                                                font.pixelSize: 12
                                                font.weight: Font.DemiBold
                                                color: rowItem.isOffline ? "#DC2626" : (rowItem.isCritical ? "#DC2626" : (rowItem.isWarning ? "#D97706" : "#16A34A"))
                                                font.family: Theme.typography.fontFamily
                                            }
                                        }
                                    }

                                    // 9. ALERT
                                    Item {
                                        width: 90
                                        height: parent.height
                                        clip: true
                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: parent.width
                                            text: modelData.alarmState
                                            font.pixelSize: 12
                                            font.weight: Font.DemiBold
                                            color: {
                                                if (modelData.alarmState === "Critical" || modelData.alarmState === "Offline") return "#DC2626";
                                                if (modelData.alarmState === "Warning") return "#D97706";
                                                return "#16A34A";
                                            }
                                            font.family: Theme.typography.fontFamily
                                            elide: Text.ElideRight
                                        }
                                    }

                                    // 10. LAST UPDATE
                                    Item {
                                        width: 110
                                        height: parent.height
                                        clip: true
                                        Text {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: parent.width
                                            text: modelData.lastUpdate.length > 0 ? modelData.lastUpdate : "Just now"
                                            font.pixelSize: 12
                                            color: "#64748B"
                                            font.family: Theme.typography.fontFamily
                                            elide: Text.ElideRight
                                        }
                                    }

                                    // 11. ACTION
                                    Item {
                                        width: 35
                                        height: parent.height
                                        clip: true
                                        Text {
                                            anchors.centerIn: parent
                                            text: "\u203A"
                                            font.pixelSize: 18
                                            font.weight: Font.Bold
                                            color: rowMouse.containsMouse ? Theme.colors.primary : "#94A3B8"
                                            font.family: Theme.typography.fontFamily
                                        }
                                    }
                                }

                                MouseArea {
                                    id: rowMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        root.openTankDetail(modelData.id);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // TRAIN SELECTION MODAL DIALOG (Requirement Bug 2)
    // ========================================================================
    Dialog {
        id: trainSelectDialog
        anchors.centerIn: parent
        width: Math.min(parent.width - 40, 560)
        modal: true
        padding: 20

        background: Rectangle {
            radius: 12
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
        }

        contentItem: ColumnLayout {
            spacing: 14

            // Header
            RowLayout {
                Layout.fillWidth: true
                ColumnLayout {
                    spacing: 2
                    Text {
                        text: "Select Train Context"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 18
                        font.weight: Font.Bold
                        color: Theme.colors.textPrimary
                    }
                    Text {
                        text: "Filter All Tanks by a specific train consist or view the global fleet"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        color: Theme.colors.textSecondary
                    }
                }
                Item { Layout.fillWidth: true }
                Rectangle {
                    width: 28; height: 28; radius: 6
                    color: closeSelMouse.containsMouse ? "#F1F5F9" : "transparent"
                    Text { anchors.centerIn: parent; text: "✕"; font.pixelSize: 13; color: "#64748B" }
                    MouseArea {
                        id: closeSelMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: trainSelectDialog.close()
                    }
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

            // Global Fleet Option
            Rectangle {
                Layout.fillWidth: true
                height: 44
                radius: 8
                color: allFleetHover.containsMouse ? "#EFF6FF" : (!ApplicationStateManager.hasTrainContext ? "#F0FDF4" : "#F8FAFC")
                border.width: 1
                border.color: !ApplicationStateManager.hasTrainContext ? Theme.colors.success : Theme.colors.border

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 10
                    Text { text: "🚆"; font.pixelSize: 16 }
                    ColumnLayout {
                        spacing: 1
                        Text {
                            text: "All Trains (Global Consist Overview)"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: Font.Bold
                            color: Theme.colors.textPrimary
                        }
                        Text {
                            text: "Show tanks across all regions and consists"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 10
                            color: Theme.colors.textSecondary
                        }
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                        visible: !ApplicationStateManager.hasTrainContext
                        text: "ACTIVE"
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: Theme.colors.success
                    }
                }

                MouseArea {
                    id: allFleetHover
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        ApplicationStateManager.clearTrainContext();
                        RailwayManager.setActiveTrainNumber("");
                        TrainManager.setActiveTrainNumber("");
                        root.refreshList();
                        trainSelectDialog.close();
                    }
                }
            }

            Text {
                text: "REGIONAL TRAINS"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 11
                font.weight: Font.Bold
                font.letterSpacing: 0.8
                color: "#64748B"
            }

            // Regions & Trains List (North, South, East, West)
            Flickable {
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(260, regCol.implicitHeight)
                contentWidth: width
                contentHeight: regCol.implicitHeight
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                ColumnLayout {
                    id: regCol
                    width: parent.width
                    spacing: 10

                    Repeater {
                        model: RailwayManager.regions
                        delegate: ColumnLayout {
                            required property var modelData
                            Layout.fillWidth: true
                            spacing: 4

                            // Region Header
                            Rectangle {
                                Layout.fillWidth: true
                                height: 26
                                radius: 4
                                color: "#F1F5F9"

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.leftMargin: 8
                                    anchors.rightMargin: 8
                                    Text {
                                        text: (modelData.region || "").toUpperCase() + " REGION (" + (modelData.regionName || "") + ")"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 10
                                        font.weight: Font.Bold
                                        color: "#475569"
                                    }
                                    Item { Layout.fillWidth: true }
                                    Text {
                                        text: (modelData.trainCount || 0) + " train(s)"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 10
                                        color: "#64748B"
                                    }
                                }
                            }

                            // Empty state if no trains in region
                            Text {
                                visible: RailwayManager.getTrainsByRegion(modelData.region).length === 0
                                text: "  No trains assigned"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                color: "#94A3B8"
                                Layout.leftMargin: 8
                                Layout.topMargin: 2
                                Layout.bottomMargin: 2
                            }

                            // Trains under this region
                            Repeater {
                                model: RailwayManager.getTrainsByRegion(modelData.region)
                                delegate: Rectangle {
                                    required property var modelData
                                    Layout.fillWidth: true
                                    height: 40
                                    radius: 6
                                    color: trnMouse.containsMouse ? "#EFF6FF" : (ApplicationStateManager.selectedTrainNumber === modelData.trainNumber ? "#E0F2FE" : "#FFFFFF")
                                    border.width: 1
                                    border.color: ApplicationStateManager.selectedTrainNumber === modelData.trainNumber ? Theme.colors.primary : "#E2E8F0"

                                    RowLayout {
                                        anchors.fill: parent
                                        anchors.margins: 10
                                        spacing: 10

                                        Text {
                                            text: modelData.trainNumber + " — " + modelData.trainName
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 12
                                            font.weight: Font.DemiBold
                                            color: Theme.colors.textPrimary
                                        }

                                        Text {
                                            text: "· " + (modelData.coachCount || 0) + " coaches, " + (modelData.tankCount || 0) + " tanks"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            color: Theme.colors.textSecondary
                                        }

                                        Item { Layout.fillWidth: true }

                                        Text {
                                            visible: ApplicationStateManager.selectedTrainNumber === modelData.trainNumber
                                            text: "SELECTED"
                                            font.pixelSize: 10
                                            font.weight: Font.Bold
                                            color: Theme.colors.primary
                                        }
                                    }

                                    MouseArea {
                                        id: trnMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            ApplicationStateManager.selectTrain(modelData.trainNumber, modelData.trainName, modelData.region);
                                            RailwayManager.setActiveTrainNumber(modelData.trainNumber);
                                            TrainManager.setActiveTrainNumber(modelData.trainNumber);
                                            root.refreshList();
                                            trainSelectDialog.close();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

            // Footer action: Jump to Train Management Consists
            RowLayout {
                Layout.fillWidth: true
                Item { Layout.fillWidth: true }
                StyledButton {
                    text: "Open in Train Management →"
                    variant: "secondary"
                    onClicked: {
                        trainSelectDialog.close();
                        root.openTrainSelectionRequested();
                    }
                }
            }
        }
    }
}
