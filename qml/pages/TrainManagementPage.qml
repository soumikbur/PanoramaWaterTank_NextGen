import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// TrainManagementPage.qml — Unified Real-World Railway Hierarchy Management
//
// Hierarchical Navigation Architecture:
//   REGION SELECTION  (Step 1)
//        ↓
//   TRAIN SELECTION   (Step 2)
//        ↓
//   TRAIN DETAILS & CONSIST (Step 3)
//        ↓
//   COACH DETAILS & TANKS   (Step 4)
//        ↓
//   TANK DETAILS (Step 5 - Handled via openTankDetailsRequested)
//
// Features:
// - Dynamic region derivation from configured train database (no hardcoding).
// - Interactive Breadcrumb navigation linking all hierarchy tiers.
// - Full CRUD for Trains, Coaches, and Tanks with validation and confirmations.
// - Tank geometry configuration (Rectangular, Cylindrical, Custom) with live volume math.
// - Clean industrial blue SCADA theme and informative empty states.
// ============================================================================
Item {
    id: root

    signal openTankDetailsRequested(int tankId, string tankNumber)

    // Navigation hierarchy state
    // viewMode: "regions" | "trains" | "train_details" | "coach_details"
    property string viewMode: "regions"
    onViewModeChanged: {
        if (typeof viewTransitionAnim !== "undefined") {
            viewTransitionAnim.restart();
        }
    }
    property string selectedRegion: ""
    property string selectedTrainNumber: RailwayManager.activeTrainNumber
    property int selectedCoachId: -1
    property string selectedCoachNumber: ""
    property var currentCoachTanks: []

    function refreshCoachTanks() {
        if (root.selectedCoachId > 0) {
            root.currentCoachTanks = RailwayManager.getTanksForCoach(root.selectedCoachId);
        } else {
            root.currentCoachTanks = [];
        }
    }

    onSelectedCoachIdChanged: refreshCoachTanks()

    Connections {
        target: RailwayManager
        function onTanksChanged() {
            root.refreshCoachTanks()
        }
        function onCoachesChanged() {
            root.refreshCoachTanks()
        }
        function onFeedbackMessage(success, message) {
            feedbackToast.toastSuccess = success;
            feedbackToast.toastMessage = message;
            toastTimer.restart();
        }
    }

    // Floating Feedback Toast Banner
    Rectangle {
        id: feedbackToast
        z: 999
        anchors.top: parent.top
        anchors.topMargin: 54
        anchors.horizontalCenter: parent.horizontalCenter
        height: 38
        width: toastRow.implicitWidth + 28
        radius: 8
        color: toastSuccess ? "#ECFDF5" : "#FEF2F2"
        border.width: 1
        border.color: toastSuccess ? "#86EFAC" : "#FCA5A5"
        visible: toastTimer.running
        opacity: toastTimer.running ? 1.0 : 0.0

        property bool toastSuccess: true
        property string toastMessage: ""

        Behavior on opacity {
            NumberAnimation { duration: 200 }
        }

        RowLayout {
            id: toastRow
            anchors.centerIn: parent
            spacing: 8
            Text {
                text: feedbackToast.toastSuccess ? "✓" : "⚠"
                color: feedbackToast.toastSuccess ? "#16A34A" : "#DC2626"
                font.pixelSize: 14
                font.weight: Font.Bold
            }
            Text {
                text: feedbackToast.toastMessage
                color: feedbackToast.toastSuccess ? "#16A34A" : "#DC2626"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                font.weight: Font.Bold
            }
        }

        Timer {
            id: toastTimer
            interval: 3500
            repeat: false
        }
    }

    // Authoritative dynamic summary calculation
    readonly property var currentTrainDetails: (root.selectedTrainNumber && root.selectedTrainNumber !== "")
        ? RailwayManager.getTrain(root.selectedTrainNumber)
        : RailwayManager.activeTrain

    readonly property var trainSummary: {
        var coachesList = RailwayManager.coaches;
        var activeTr = root.currentTrainDetails;
        var cCount = 0;
        var tCount = 0;
        var onCount = 0;
        var offCount = 0;
        var critCount = (activeTr && activeTr.criticalTanks) ? activeTr.criticalTanks : 0;
        var warnCount = (activeTr && activeTr.warningTanks) ? activeTr.warningTanks : 0;

        if (coachesList && coachesList.length > 0) {
            for (var i = 0; i < coachesList.length; ++i) {
                var c = coachesList[i];
                if (c && c.assigned) {
                    cCount++;
                    tCount += (c.tankCount || 0);
                    onCount += (c.onlineCount || 0);
                    offCount += (c.offlineCount || 0);
                }
            }
        } else if (activeTr) {
            cCount = activeTr.coachCount || 0;
            tCount = activeTr.tankCount || 0;
            onCount = activeTr.onlineTanks || 0;
            offCount = activeTr.offlineTanks || 0;
        }

        return {
            coaches: cCount,
            tanks: tCount,
            online: onCount,
            offline: offCount,
            critical: critCount,
            warning: warnCount
        };
    }

    readonly property var coachSummary: {
        var tanks = root.currentCoachTanks;
        var total = tanks.length;
        var onCount = 0;
        var offCount = 0;
        var warnCount = 0;
        var critCount = 0;
        for (var i = 0; i < total; ++i) {
            var t = tanks[i];
            var st = (t.status || t.deviceStatus || "Offline").toString().toUpperCase();
            var alm = (t.alarmLevel || "").toString().toUpperCase();
            if (alm === "CRITICAL" || st === "CRITICAL") {
                critCount++;
                onCount++;
            } else if (alm === "WARNING" || st === "WARNING") {
                warnCount++;
                onCount++;
            } else if (st === "ONLINE" || st === "CONNECTED" || t.isOnline) {
                onCount++;
            } else {
                offCount++;
            }
        }
        return {
            tanks: total,
            online: onCount,
            offline: offCount,
            warnings: warnCount,
            critical: critCount
        };
    }

    // Navigation Debounce & Level Protection (Bug 2)
    property bool navBusy: false
    Timer {
        id: navGuardTimer
        interval: 250
        repeat: false
        onTriggered: root.navBusy = false
    }

    function goBack() {
        if (root.navBusy) return;
        root.navBusy = true;
        navGuardTimer.restart();

        if (root.viewMode === "coach_details") {
            root.viewMode = "train_details";
        } else if (root.viewMode === "train_details") {
            root.viewMode = "trains";
        } else if (root.viewMode === "trains") {
            root.viewMode = "regions";
        }
    }

    // Deep navigation helper
    function resetToRegions() {
        selectedRegion = "";
        selectedTrainNumber = "";
        selectedCoachId = -1;
        selectedCoachNumber = "";
        currentCoachTanks = [];
        viewMode = "regions";
    }

    function navigateToRegion(reg) {
        selectedRegion = reg;
        viewMode = "trains";
    }

    function navigateToTrain(tNum) {
        selectedTrainNumber = tNum;
        RailwayManager.setActiveTrainNumber(tNum);
        var tInfo = RailwayManager.getTrain(tNum);
        var tName = (tInfo && tInfo.trainName) ? tInfo.trainName : "Rajdhani Express";
        if (tInfo && tInfo.region) {
            selectedRegion = tInfo.region;
        }
        ApplicationStateManager.selectTrain(tNum, tName);
        TrainManager.setActiveTrainNumber(tNum);
        viewMode = "train_details";
    }

    function navigateToCoach(cId, cNum, tNum) {
        if (tNum && tNum !== "") {
            selectedTrainNumber = tNum;
            RailwayManager.setActiveTrainNumber(tNum);
            var tInfo = RailwayManager.getTrain(tNum);
            var tName = (tInfo && tInfo.trainName) ? tInfo.trainName : "Rajdhani Express";
            if (tInfo && tInfo.region) selectedRegion = tInfo.region;
            ApplicationStateManager.selectTrain(tNum, tName);
            TrainManager.setActiveTrainNumber(tNum);
        }
        selectedCoachId = cId;
        selectedCoachNumber = cNum;
        refreshCoachTanks();
        viewMode = "coach_details";
    }

    // Background
    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 18
        spacing: 12

        // ====================================================================
        // ====================================================================
        // TOP BREADCRUMB & ACTION BAR (Sections 3.C, 5)
        // ====================================================================
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 46
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 16
                anchors.rightMargin: 16
                spacing: 10

                // Level 1: Train Management (Root)
                Item {
                    implicitWidth: lvl1Row.implicitWidth
                    implicitHeight: 28
                    Layout.alignment: Qt.AlignVCenter

                    RowLayout {
                        id: lvl1Row
                        anchors.fill: parent
                        spacing: 6

                        Rectangle {
                            width: 26; height: 26; radius: 4
                            color: root.viewMode === "regions" ? Theme.colors.primarySurface : "#F1F5F9"
                            border.width: 1
                            border.color: root.viewMode === "regions" ? "#BFDBFE" : "#E2E8F0"
                            Shape {
                                anchors.centerIn: parent
                                width: 14; height: 14
                                antialiasing: true
                                ShapePath {
                                    fillColor: "transparent"
                                    strokeColor: root.viewMode === "regions" ? Theme.colors.primary : "#64748B"
                                    strokeWidth: 1.4
                                    capStyle: ShapePath.RoundCap
                                    joinStyle: ShapePath.RoundJoin
                                    PathSvg {
                                        path: "M7,1 C3.5,1 2,1.5 2,4.5 L2,10 C2,12 3.5,13 5,13 L4,14 L4,14.5 L10,14.5 L10,14 L9,13 C10.5,13 12,12 12,10 L12,4.5 C12,1.5 10.5,1 7,1 Z M3.5,8 C3.5,7.5 3.9,7 4.5,7 C5.1,7 5.5,7.5 5.5,8 C5.5,8.5 5.1,9 4.5,9 C3.9,9 3.5,8.5 3.5,8 Z M8.5,8 C8.5,7.5 8.9,7 9.5,7 C10.1,7 10.5,7.5 10.5,8 C10.5,8.5 10.1,9 9.5,9 C8.9,9 8.5,8.5 8.5,8 Z M3.5,4.5 L10.5,4.5 L10.5,3 L3.5,3 Z"
                                    }
                                }
                            }
                        }

                        Text {
                            text: "Train Management"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: root.viewMode === "regions" ? Font.Bold : Font.Medium
                            color: root.viewMode === "regions" ? Theme.colors.textPrimary : Theme.colors.primary
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.resetToRegions()
                    }
                }

                // Level 2: Region
                Text {
                    visible: root.viewMode !== "regions" && root.selectedRegion !== ""
                    text: "/"
                    font.pixelSize: 13
                    color: "#94A3B8"
                }

                Text {
                    visible: root.viewMode !== "regions" && root.selectedRegion !== ""
                    text: root.selectedRegion
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: root.viewMode === "trains" ? Font.Bold : Font.Medium
                    color: root.viewMode === "trains" ? Theme.colors.textPrimary : Theme.colors.primary

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.viewMode = "trains";
                        }
                    }
                }

                // Level 3: Train
                Text {
                    visible: (root.viewMode === "train_details" || root.viewMode === "coach_details") && root.selectedTrainNumber !== ""
                    text: "/"
                    font.pixelSize: 13
                    color: "#94A3B8"
                }

                Text {
                    visible: (root.viewMode === "train_details" || root.viewMode === "coach_details") && root.selectedTrainNumber !== ""
                    text: (RailwayManager.activeTrain.trainName || "Train") + " (" + root.selectedTrainNumber + ")"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: root.viewMode === "train_details" ? Font.Bold : Font.Medium
                    color: root.viewMode === "train_details" ? Theme.colors.textPrimary : Theme.colors.primary

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.viewMode = "train_details";
                        }
                    }
                }

                // Level 4: Coach
                Text {
                    visible: root.viewMode === "coach_details" && root.selectedCoachNumber !== ""
                    text: "/"
                    font.pixelSize: 13
                    color: "#94A3B8"
                }

                Text {
                    visible: root.viewMode === "coach_details" && root.selectedCoachNumber !== ""
                    text: "Coach " + root.selectedCoachNumber
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.Bold
                    color: Theme.colors.textPrimary
                }

                Item { Layout.fillWidth: true }

                // Action Button: REGIONS
                Rectangle {
                    id: regionsBtn
                    height: 32
                    width: regionsBtnRow.implicitWidth + 20
                    radius: 6
                    color: (root.viewMode === "regions")
                           ? (regBtnMouse.pressed ? "#DBEAFE" : (regBtnMouse.containsMouse ? "#EFF6FF" : "#F0FDF4"))
                           : (regBtnMouse.pressed ? "#E2E8F0" : (regBtnMouse.containsMouse ? "#F8FAFC" : "#FFFFFF"))
                    border.width: 1
                    border.color: (root.viewMode === "regions") ? "#86EFAC" : (regBtnMouse.containsMouse ? Theme.colors.primary : "#CBD5E1")

                    RowLayout {
                        id: regionsBtnRow
                        anchors.centerIn: parent
                        spacing: 6

                        Shape {
                            width: 12; height: 12
                            antialiasing: true
                            ShapePath {
                                fillColor: "transparent"
                                strokeColor: (root.viewMode === "regions") ? "#16A34A" : "#475569"
                                strokeWidth: 1.5
                                capStyle: ShapePath.RoundCap
                                joinStyle: ShapePath.RoundJoin
                                PathSvg {
                                    path: "M1,1 L5,1 L5,5 L1,5 Z M7,1 L11,1 L11,5 L7,5 Z M1,7 L5,7 L5,11 L1,11 Z M7,7 L11,7 L11,11 L7,11 Z"
                                }
                            }
                        }

                        Text {
                            text: "REGIONS"
                            color: (root.viewMode === "regions") ? "#16A34A" : "#334155"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Bold
                            font.letterSpacing: 0.6
                        }
                    }

                    ToolTip.visible: regBtnMouse.containsMouse
                    ToolTip.text: "Navigate to Railway Regions overview"
                    ToolTip.delay: 300

                    MouseArea {
                        id: regBtnMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.resetToRegions()
                    }
                }

                // Action Button: + Add Train
                Rectangle {
                    id: addTrainTopBtn
                    height: 32
                    width: addTrTopRow.implicitWidth + 22
                    radius: 6
                    color: addTrTopMouse.pressed ? Theme.colors.primaryPressed : (addTrTopMouse.containsMouse ? Theme.colors.primaryHover : Theme.colors.primary)

                    RowLayout {
                        id: addTrTopRow
                        anchors.centerIn: parent
                        spacing: 6

                        Text {
                            text: "+"
                            color: "#FFFFFF"
                            font.pixelSize: 14
                            font.weight: Font.Bold
                        }

                        Text {
                            text: "Add Train"
                            color: "#FFFFFF"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Bold
                        }
                    }

                    ToolTip.visible: addTrTopMouse.containsMouse
                    ToolTip.text: "Add a new train consist"
                    ToolTip.delay: 300

                    MouseArea {
                        id: addTrTopMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            trainDialog.isEditMode = false;
                            trainDialog.trainNumber = "";
                            trainDialog.trainName = "";
                            trainDialog.region = root.selectedRegion !== "" ? root.selectedRegion : "Northern Region";
                            trainDialog.description = "";
                            trainDialog.location = "";
                            trainDialog.status = "Online";
                            trainDialog.open();
                        }
                    }
                }
            }
        }

        // ====================================================================
        // MAIN BODY CONTENT AREA
        // ====================================================================
        Item {
            id: mainBodyArea
            Layout.fillWidth: true
            Layout.fillHeight: true

            ParallelAnimation {
                id: viewTransitionAnim
                NumberAnimation {
                    target: mainBodyArea
                    property: "opacity"
                    from: 0.2
                    to: 1.0
                    duration: Theme.animNormal
                    easing.type: Easing.OutCubic
                }
                NumberAnimation {
                    target: mainBodyArea
                    property: "x"
                    from: 8
                    to: 0
                    duration: Theme.animNormal
                    easing.type: Easing.OutCubic
                }
            }

            // ----------------------------------------------------------------
            // STEP 1: REGION SELECTION VIEW (Sections 6, 7)
            // ----------------------------------------------------------------
            Flickable {
                id: regionsFlickable
                anchors.fill: parent
                visible: root.viewMode === "regions"
                contentWidth: width
                contentHeight: regionsCol.implicitHeight + 20
                boundsBehavior: Flickable.StopAtBounds
                clip: true

                ColumnLayout {
                    id: regionsCol
                    width: regionsFlickable.width
                    spacing: 16

                    // Action bar
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        ColumnLayout {
                            spacing: 2
                            Text {
                                text: "RAILWAY REGIONS"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 18
                                font.weight: Font.Bold
                                color: Theme.colors.textPrimary
                            }
                            Text {
                                text: "Select a railway region to inspect and configure its assigned train consists"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: Theme.colors.textSecondary
                            }
                        }

                        Item { Layout.fillWidth: true }

                        // Add Train Button
                        Rectangle {
                            height: 36
                            width: addTrainText.implicitWidth + 24
                            radius: 6
                            color: addTrainMouse.pressed ? Theme.colors.primaryPressed : (addTrainMouse.containsMouse ? Theme.colors.primaryHover : Theme.colors.primary)

                            RowLayout {
                                id: addTrainText
                                anchors.centerIn: parent
                                spacing: 6
                                Text { text: "+"; color: "#FFFFFF"; font.pixelSize: 14; font.weight: Font.Bold }
                                Text { text: "Add Train"; color: "#FFFFFF"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.DemiBold }
                            }

                            MouseArea {
                                id: addTrainMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    trainDialog.isEditMode = false;
                                    trainDialog.trainNumber = "";
                                    trainDialog.trainName = "";
                                    trainDialog.region = root.selectedRegion !== "" ? root.selectedRegion : "Eastern Railway";
                                    trainDialog.description = "";
                                    trainDialog.location = "";
                                    trainDialog.status = "Online";
                                    trainDialog.open();
                                }
                            }
                        }
                    }

                    // Empty state when no regions exist
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 180
                        radius: 8
                        color: "#FFFFFF"
                        border.width: 1
                        border.color: Theme.colors.border
                        visible: RailwayManager.regions.length === 0

                        ColumnLayout {
                            anchors.centerIn: parent
                            spacing: 8
                            Text { text: "🚉"; font.pixelSize: 32; Layout.alignment: Qt.AlignHCenter }
                            Text {
                                text: "No railway regions configured."
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.DemiBold
                                color: Theme.colors.textPrimary
                                Layout.alignment: Qt.AlignHCenter
                            }
                            Text {
                                text: "Click '+ Add Train' above to create your first railway region and train consist."
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: Theme.colors.textSecondary
                                Layout.alignment: Qt.AlignHCenter
                            }
                        }
                    }

                    // Regions Grid (Derived from DB)
                    GridLayout {
                        Layout.fillWidth: true
                        columns: (root.width >= 960 ? 3 : (root.width >= 620 ? 2 : 1))
                        columnSpacing: 16
                        rowSpacing: 16
                        visible: RailwayManager.regions.length > 0

                        Repeater {
                            model: RailwayManager.regions
                            delegate: Rectangle {
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.preferredHeight: 194
                                radius: 10
                                color: "#FFFFFF"
                                border.width: rCardHover.hovered ? 1.5 : 1
                                border.color: rCardHover.hovered ? Theme.colors.primary : Theme.colors.border

                                HoverHandler {
                                    id: rCardHover
                                    cursorShape: Qt.PointingHandCursor
                                }

                                TapHandler {
                                    onTapped: root.navigateToRegion(modelData.region)
                                }

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 18
                                    spacing: 10

                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 10

                                        Rectangle {
                                            width: 36; height: 36; radius: 8
                                            color: Theme.colors.primarySurface
                                            border.width: 1
                                            border.color: "#BFDBFE"

                                            Shape {
                                                anchors.centerIn: parent
                                                width: 18; height: 18
                                                antialiasing: true

                                                ShapePath {
                                                    fillColor: "transparent"
                                                    strokeColor: Theme.colors.primary
                                                    strokeWidth: 1.6
                                                    capStyle: ShapePath.RoundCap
                                                    joinStyle: ShapePath.RoundJoin
                                                    PathSvg {
                                                        path: "M9,1 C5.13,1 2,4.13 2,8 C2,13.25 9,21 9,21 C9,21 16,13.25 16,8 C16,4.13 12.87,1 9,1 Z M9,10.5 C7.62,10.5 6.5,9.38 6.5,8 C6.5,6.62 7.62,5.5 9,5.5 C10.38,5.5 11.5,6.62 11.5,8 C11.5,9.38 10.38,10.5 9,10.5 Z"
                                                    }
                                                }
                                            }
                                        }

                                        ColumnLayout {
                                            Layout.fillWidth: true
                                            spacing: 1

                                            Text {
                                                text: modelData.region.toUpperCase()
                                                color: Theme.colors.textPrimary
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 15
                                                font.weight: Font.Bold
                                                elide: Text.ElideRight
                                            }

                                            Text {
                                                text: (modelData.trainCount || 0) + " Configured Trains"
                                                color: Theme.colors.textSecondary
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 11
                                                font.weight: Font.Medium
                                            }
                                        }
                                    }

                                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

                                    // Metrics Grid
                                    GridLayout {
                                        Layout.fillWidth: true
                                        columns: 3
                                        columnSpacing: 12
                                        rowSpacing: 4

                                        ColumnLayout {
                                            spacing: 1
                                            Text { text: (modelData.coachCount || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.textPrimary }
                                            Text { text: "Coaches"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                        }

                                        ColumnLayout {
                                            spacing: 1
                                            Text { text: (modelData.tankCount || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.textPrimary }
                                            Text { text: "Tanks"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                        }

                                        ColumnLayout {
                                            spacing: 1
                                            Text { text: (modelData.onlineTrains || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.success }
                                            Text { text: "Online Trains"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                        }
                                    }

                                    Item { Layout.fillHeight: true }

                                    // Action Strip
                                    RowLayout {
                                        Layout.fillWidth: true

                                        Text {
                                            text: "View Trains in Region"
                                            color: rCardHover.hovered ? Theme.colors.primaryHover : Theme.colors.primary
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 12
                                            font.weight: Font.Bold
                                        }
                                        Text {
                                            text: "→"
                                            color: rCardHover.hovered ? Theme.colors.primaryHover : Theme.colors.primary
                                            font.pixelSize: 14
                                            font.weight: Font.Bold
                                        }

                                        Item { Layout.fillWidth: true }

                                        Rectangle {
                                            height: 20
                                            width: statPill.implicitWidth + 14
                                            radius: 10
                                            color: (modelData.criticalTanks > 0) ? "#FEE2E2" : ((modelData.warningTanks > 0) ? "#FEF3C7" : "#ECFDF5")
                                            border.width: 1
                                            border.color: (modelData.criticalTanks > 0) ? "#FCA5A5" : ((modelData.warningTanks > 0) ? "#FDE68A" : "#DCFCE7")

                                            Text {
                                                id: statPill
                                                anchors.centerIn: parent
                                                text: (modelData.criticalTanks > 0) ? (modelData.criticalTanks + " Critical") :
                                                      ((modelData.warningTanks > 0) ? (modelData.warningTanks + " Warning") : "All Normal")
                                                color: (modelData.criticalTanks > 0) ? "#DC2626" : ((modelData.warningTanks > 0) ? "#D97706" : "#16A34A")
                                                font.pixelSize: 10
                                                font.weight: Font.Bold
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ----------------------------------------------------------------
            // STEP 2: TRAINS IN SELECTED REGION VIEW (Section 8)
            // ----------------------------------------------------------------
            Flickable {
                id: trainsFlickable
                anchors.fill: parent
                visible: root.viewMode === "trains"
                contentWidth: width
                contentHeight: trainsCol.implicitHeight + 20
                boundsBehavior: Flickable.StopAtBounds
                clip: true

                ColumnLayout {
                    id: trainsCol
                    width: trainsFlickable.width
                    spacing: 16

                    // Action bar with Back to Regions
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        Rectangle {
                            width: 32; height: 32; radius: 6
                            color: bRegHover.containsMouse ? "#F1F5F9" : "#FFFFFF"
                            border.width: 1
                            border.color: Theme.colors.border
                            Text { anchors.centerIn: parent; text: "←"; font.pixelSize: 16; color: Theme.colors.textPrimary; font.weight: Font.Bold }
                            MouseArea {
                                id: bRegHover
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.goBack()
                            }
                        }

                        ColumnLayout {
                            spacing: 1
                            Text {
                                text: root.selectedRegion.toUpperCase()
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 18
                                font.weight: Font.Bold
                                color: Theme.colors.textPrimary
                            }
                            Text {
                                text: "Trains configured for this region"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: Theme.colors.textSecondary
                            }
                        }

                        Item { Layout.fillWidth: true }

                        Rectangle {
                            height: 36
                            width: addTrText.implicitWidth + 24
                            radius: 6
                            color: addTrMouse.pressed ? Theme.colors.primaryPressed : (addTrMouse.containsMouse ? Theme.colors.primaryHover : Theme.colors.primary)

                            RowLayout {
                                id: addTrText
                                anchors.centerIn: parent
                                spacing: 6
                                Text { text: "+"; color: "#FFFFFF"; font.pixelSize: 14; font.weight: Font.Bold }
                                Text { text: "Add Train"; color: "#FFFFFF"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.DemiBold }
                            }

                            MouseArea {
                                id: addTrMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    trainDialog.isEditMode = false;
                                    trainDialog.trainNumber = "";
                                    trainDialog.trainName = "";
                                    trainDialog.region = root.selectedRegion;
                                    trainDialog.description = "";
                                    trainDialog.location = "";
                                    trainDialog.status = "Online";
                                    trainDialog.open();
                                }
                            }
                        }
                    }

                    // Empty state when region has no trains
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 180
                        radius: 8
                        color: "#FFFFFF"
                        border.width: 1
                        border.color: Theme.colors.border
                        visible: RailwayManager.getTrainsByRegion(root.selectedRegion).length === 0

                        ColumnLayout {
                            anchors.centerIn: parent
                            spacing: 8
                            Text { text: "🚆"; font.pixelSize: 32; Layout.alignment: Qt.AlignHCenter }
                            Text {
                                text: "No trains configured for this region."
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.DemiBold
                                color: Theme.colors.textPrimary
                                Layout.alignment: Qt.AlignHCenter
                            }
                            Text {
                                text: "Click '+ Add Train' above to assign a train to " + root.selectedRegion + "."
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: Theme.colors.textSecondary
                                Layout.alignment: Qt.AlignHCenter
                            }
                        }
                    }

                    // Train Cards List (Section 8 specifications)
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 12
                        visible: RailwayManager.getTrainsByRegion(root.selectedRegion).length > 0

                        Repeater {
                            model: RailwayManager.getTrainsByRegion(root.selectedRegion)
                            delegate: Rectangle {
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.preferredHeight: 110
                                radius: 8
                                color: "#FFFFFF"
                                border.width: trCardHover.hovered ? 1.5 : 1
                                border.color: trCardHover.hovered ? Theme.colors.primary : Theme.colors.border

                                HoverHandler {
                                    id: trCardHover
                                    cursorShape: Qt.PointingHandCursor
                                }

                                TapHandler {
                                    onTapped: root.navigateToTrain(modelData.trainNumber)
                                }

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.margins: 18
                                    spacing: 16

                                    // Train Icon & Status Accent Bar
                                    Rectangle {
                                        Layout.preferredWidth: 44
                                        Layout.preferredHeight: 44
                                        radius: 8
                                        color: modelData.status === "Online" ? "#ECFDF5" : "#F1F5F9"
                                        border.width: 1
                                        border.color: modelData.status === "Online" ? "#A7F3D0" : "#CBD5E1"
                                        Text { anchors.centerIn: parent; text: "🚆"; font.pixelSize: 20 }
                                    }

                                    // Train Identity
                                    ColumnLayout {
                                        Layout.preferredWidth: 220
                                        spacing: 2

                                        Text {
                                            text: modelData.trainName
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 16
                                            font.weight: Font.Bold
                                            color: Theme.colors.textPrimary
                                            elide: Text.ElideRight
                                        }

                                        Text {
                                            text: "Train No. " + modelData.trainNumber + (modelData.location ? (" · " + modelData.location) : "")
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 12
                                            color: Theme.colors.textSecondary
                                            elide: Text.ElideRight
                                        }
                                    }

                                    Rectangle { width: 1; height: 40; color: Theme.colors.divider }

                                    // Consist Counts: Coaches & Tanks
                                    RowLayout {
                                        spacing: 20

                                        ColumnLayout {
                                            spacing: 1
                                            Text { text: (modelData.coachCount || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.textPrimary }
                                            Text { text: "Coaches"; font.pixelSize: 11; color: Theme.colors.textSecondary }
                                        }

                                        ColumnLayout {
                                            spacing: 1
                                            Text { text: (modelData.tankCount || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.textPrimary }
                                            Text { text: "Tanks"; font.pixelSize: 11; color: Theme.colors.textSecondary }
                                        }

                                        ColumnLayout {
                                            spacing: 1
                                            Text { text: (modelData.onlineTanks || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.success }
                                            Text { text: "Online"; font.pixelSize: 11; color: Theme.colors.textSecondary }
                                        }

                                        ColumnLayout {
                                            spacing: 1
                                            Text { text: (modelData.offlineTanks || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: (modelData.offlineTanks > 0) ? Theme.colors.offline : Theme.colors.textSecondary }
                                            Text { text: "Offline"; font.pixelSize: 11; color: Theme.colors.textSecondary }
                                        }
                                    }

                                    Item { Layout.fillWidth: true }

                                    // Status Badge (ONLINE / OFFLINE)
                                    Rectangle {
                                        Layout.preferredHeight: 28
                                        Layout.preferredWidth: stLabel.implicitWidth + 18
                                        radius: 14
                                        color: modelData.status === "Online" ? "#ECFDF5" : "#F1F5F9"
                                        border.width: 1
                                        border.color: modelData.status === "Online" ? "#A7F3D0" : "#CBD5E1"

                                        RowLayout {
                                            anchors.centerIn: parent
                                            spacing: 6
                                            Rectangle { width: 6; height: 6; radius: 3; color: modelData.status === "Online" ? Theme.colors.success : Theme.colors.offline }
                                            Text {
                                                id: stLabel
                                                text: modelData.status === "Online" ? "ONLINE" : "OFFLINE"
                                                font.pixelSize: 11
                                                font.weight: Font.Bold
                                                color: modelData.status === "Online" ? "#166534" : "#475569"
                                            }
                                        }
                                    }

                                    // Action Buttons: Edit / Delete
                                    RowLayout {
                                        spacing: 6

                                        Rectangle {
                                            width: 32; height: 32; radius: 6
                                            color: edMouse.containsMouse ? "#EFF6FF" : "#FFFFFF"
                                            border.width: 1
                                            border.color: edMouse.containsMouse ? Theme.colors.primary : Theme.colors.border
                                            Text { anchors.centerIn: parent; text: "✎"; font.pixelSize: 12; color: edMouse.containsMouse ? Theme.colors.primary : "#64748B" }
                                            MouseArea {
                                                id: edMouse
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onClicked: {
                                                    trainDialog.isEditMode = true;
                                                    trainDialog.trainNumber = modelData.trainNumber;
                                                    trainDialog.trainName = modelData.trainName;
                                                    trainDialog.region = modelData.region;
                                                    trainDialog.description = modelData.description || "";
                                                    trainDialog.location = modelData.location || "";
                                                    trainDialog.status = modelData.status || "Online";
                                                    trainDialog.open();
                                                }
                                            }
                                        }

                                        Rectangle {
                                            width: 32; height: 32; radius: 6
                                            color: delTrMouse.containsMouse ? "#FEE2E2" : "#FFFFFF"
                                            border.width: 1
                                            border.color: delTrMouse.containsMouse ? Theme.colors.critical : Theme.colors.border
                                            Text { anchors.centerIn: parent; text: "🗑"; font.pixelSize: 12; color: delTrMouse.containsMouse ? Theme.colors.critical : "#64748B" }
                                            MouseArea {
                                                id: delTrMouse
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onClicked: {
                                                    deleteTrainDialog.targetTrainNumber = modelData.trainNumber;
                                                    deleteTrainDialog.coachCount = modelData.coachCount || 0;
                                                    deleteTrainDialog.tankCount = modelData.tankCount || 0;
                                                    deleteTrainDialog.open();
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ----------------------------------------------------------------
            // STEP 3: TRAIN DETAILS & INTEGRATED CONSIST (Sections 9, 28, 29)
            // ----------------------------------------------------------------
            Flickable {
                id: trainDetailsFlickable
                anchors.fill: parent
                visible: root.viewMode === "train_details"
                contentWidth: width
                contentHeight: tdCol.implicitHeight + 20
                boundsBehavior: Flickable.StopAtBounds
                clip: true

                ColumnLayout {
                    id: tdCol
                    width: trainDetailsFlickable.width
                    spacing: 16

                    // Train Summary Header (Section 28)
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 90
                        radius: 8
                        color: "#FFFFFF"
                        border.width: 1
                        border.color: Theme.colors.border

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 16
                            spacing: 18

                            // Back Button
                            Rectangle {
                                width: 34; height: 34; radius: 6
                                color: bTdHover.containsMouse ? "#F1F5F9" : "#FFFFFF"
                                border.width: 1
                                border.color: Theme.colors.border
                                Text { anchors.centerIn: parent; text: "←"; font.pixelSize: 16; color: Theme.colors.textPrimary; font.weight: Font.Bold }
                                MouseArea {
                                    id: bTdHover
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.goBack()
                                }
                            }

                            // Train Meta
                            ColumnLayout {
                                Layout.preferredWidth: 260
                                spacing: 2

                                Text {
                                    text: (RailwayManager.activeTrain.trainName || "Express") + " · " + root.selectedTrainNumber
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 17
                                    font.weight: Font.Bold
                                    color: Theme.colors.textPrimary
                                }

                                Text {
                                    text: (RailwayManager.activeTrain.region || root.selectedRegion) +
                                          (RailwayManager.activeTrain.location ? (" · " + RailwayManager.activeTrain.location) : "")
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    color: Theme.colors.textSecondary
                                }
                            }

                            Rectangle { width: 1; height: 44; color: Theme.colors.divider }

                            // Clean summary counters row: Coaches, Tanks, Online, Offline, Critical, Warning
                            RowLayout {
                                spacing: 18

                                ColumnLayout {
                                    spacing: 1
                                    Text { text: (root.trainSummary.coaches || 0) + " / 24 assigned"; font.pixelSize: 15; font.weight: Font.Bold; color: Theme.colors.textPrimary }
                                    Text { text: "Coaches"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                }

                                ColumnLayout {
                                    spacing: 1
                                    Text { text: (root.trainSummary.tanks || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.textPrimary }
                                    Text { text: "Tanks"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                }

                                ColumnLayout {
                                    spacing: 1
                                    Text { text: (root.trainSummary.online || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.success }
                                    Text { text: "Online"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                }

                                ColumnLayout {
                                    spacing: 1
                                    Text { text: (root.trainSummary.offline || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.offline }
                                    Text { text: "Offline"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                }

                                ColumnLayout {
                                    spacing: 1
                                    Text { text: (root.trainSummary.critical || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.critical }
                                    Text { text: "Critical"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                }

                                ColumnLayout {
                                    spacing: 1
                                    Text { text: (root.trainSummary.warning || 0).toString(); font.pixelSize: 16; font.weight: Font.Bold; color: Theme.colors.warning }
                                    Text { text: "Warning"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                }
                            }

                            Item { Layout.fillWidth: true }

                            // [ + Add Coach ] Button (Section 11)
                            Rectangle {
                                height: 36
                                width: addCoachText.implicitWidth + 24
                                radius: 6
                                color: addCoachMouse.pressed ? Theme.colors.primaryPressed : (addCoachMouse.containsMouse ? Theme.colors.primaryHover : Theme.colors.primary)

                                RowLayout {
                                    id: addCoachText
                                    anchors.centerIn: parent
                                    spacing: 6
                                    Text { text: "+"; color: "#FFFFFF"; font.pixelSize: 14; font.weight: Font.Bold }
                                    Text { text: "Add Coach"; color: "#FFFFFF"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.DemiBold }
                                }

                                MouseArea {
                                    id: addCoachMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        coachDialog.isEditMode = false;
                                        coachDialog.coachNumber = "";
                                        coachDialog.coachType = "Sleeper Class";
                                        coachDialog.position = RailwayManager.coaches.length + 1;
                                        coachDialog.description = "";
                                        coachDialog.open();
                                    }
                                }
                            }
                        }
                    }

                    // Section Title: TRAIN CONSIST — 24-COACH CONSIST GRID (Sections 19, 20, 26, 27, 28)
                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            text: "TRAIN CONSIST"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                            font.weight: Font.Bold
                            color: Theme.colors.textPrimary
                            font.letterSpacing: 0.8
                        }
                        Text {
                            text: "— Complete 24-coach consist structure. Click any coach to inspect tanks and live telemetry."
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            color: Theme.colors.textSecondary
                        }
                    }

                    // Sequential 24-Coach Consist Grid (6x4 Desktop, 4x6 Medium, 3x8 Small)
                    GridLayout {
                        Layout.fillWidth: true
                        columns: root.width > 1280 ? 6 : (root.width > 860 ? 4 : 3)
                        columnSpacing: 12
                        rowSpacing: 12

                        Repeater {
                            model: RailwayManager.coaches
                            delegate: Rectangle {
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.preferredHeight: 125
                                radius: 8
                                color: modelData.assigned ? "#FFFFFF" : "#F8FAFC"
                                border.width: cCardHover.hovered ? 1.5 : 1
                                border.color: cCardHover.hovered ? Theme.colors.primary : (modelData.assigned ? Theme.colors.border : "#E2E8F0")

                                HoverHandler {
                                    id: cCardHover
                                    cursorShape: Qt.PointingHandCursor
                                }

                                TapHandler {
                                    onTapped: {
                                        if (modelData.assigned && modelData.id > 0) {
                                            root.navigateToCoach(modelData.id, modelData.twoDigitNumber || modelData.coachNumber, root.selectedTrainNumber);
                                        } else {
                                            var newCid = RailwayManager.ensureCoach(root.selectedTrainNumber, modelData.position);
                                            if (newCid > 0) {
                                                root.navigateToCoach(newCid, modelData.twoDigitNumber || modelData.coachNumber, root.selectedTrainNumber);
                                            }
                                        }
                                    }
                                }

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 12
                                    spacing: 5

                                    // Coach Head: Number and Status Badge (Sections 20, 26, 27)
                                    RowLayout {
                                        Layout.fillWidth: true

                                        Text {
                                            text: "COACH " + (modelData.twoDigitNumber || ("0" + modelData.position).slice(-2))
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 13
                                            font.weight: Font.Bold
                                            color: modelData.assigned ? Theme.colors.textPrimary : "#64748B"
                                        }

                                        Item { Layout.fillWidth: true }

                                        // Status Pill (Sections 21, 26, 27)
                                        Rectangle {
                                            height: 20
                                            width: stText.implicitWidth + 14
                                            radius: 10
                                            color: {
                                                if (!modelData.assigned) return "#F1F5F9";
                                                if (modelData.status === "Online") return "#ECFDF5";
                                                if (modelData.status === "Partially Configured") return "#FEF3C7";
                                                if (modelData.status === "No Tank Assigned") return "#EFF6FF";
                                                return "#F1F5F9";
                                            }
                                            border.width: 1
                                            border.color: {
                                                if (!modelData.assigned) return "#CBD5E1";
                                                if (modelData.status === "Online") return "#A7F3D0";
                                                if (modelData.status === "Partially Configured") return "#FDE68A";
                                                if (modelData.status === "No Tank Assigned") return "#BFDBFE";
                                                return "#CBD5E1";
                                            }

                                            RowLayout {
                                                anchors.centerIn: parent
                                                spacing: 4
                                                Rectangle {
                                                    width: 5; height: 5; radius: 2.5
                                                    color: {
                                                        if (!modelData.assigned) return "#94A3B8";
                                                        if (modelData.status === "Online") return Theme.colors.success;
                                                        if (modelData.status === "Partially Configured") return Theme.colors.warning;
                                                        if (modelData.status === "No Tank Assigned") return Theme.colors.primary;
                                                        return Theme.colors.offline;
                                                    }
                                                }
                                                Text {
                                                    id: stText
                                                    text: {
                                                        if (!modelData.assigned) return "AVAILABLE";
                                                        if (modelData.status === "Online") return "ONLINE";
                                                        if (modelData.status === "Partially Configured") return "PARTIAL";
                                                        if (modelData.status === "No Tank Assigned") return "READY";
                                                        return "OFFLINE";
                                                    }
                                                    font.pixelSize: 9
                                                    font.weight: Font.Bold
                                                    color: {
                                                        if (!modelData.assigned) return "#64748B";
                                                        if (modelData.status === "Online") return "#166534";
                                                        if (modelData.status === "Partially Configured") return "#B45309";
                                                        if (modelData.status === "No Tank Assigned") return "#1D4ED8";
                                                        return "#475569";
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    Rectangle { Layout.fillWidth: true; height: 1; color: modelData.assigned ? Theme.colors.divider : "#F1F5F9" }

                                    // Coach Card Body: Distinct Assigned vs Empty States
                                    // 1. ASSIGNED / ACTIVE STATE (Section 27)
                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        Layout.fillHeight: true
                                        spacing: 3
                                        visible: modelData.assigned

                                        // Tanks and Online counters
                                        RowLayout {
                                            Layout.fillWidth: true
                                            Text {
                                                text: "Tanks: " + (modelData.tankCount || 0)
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 11
                                                font.weight: Font.DemiBold
                                                color: Theme.colors.textPrimary
                                            }
                                            Item { Layout.fillWidth: true }
                                            Text {
                                                text: "Online: " + (modelData.onlineCount || 0)
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 11
                                                font.weight: Font.Bold
                                                color: (modelData.onlineCount > 0) ? Theme.colors.success : Theme.colors.textSecondary
                                            }
                                            Text {
                                                visible: (modelData.offlineCount || 0) > 0
                                                text: " · Off: " + modelData.offlineCount
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 11
                                                font.weight: Font.Bold
                                                color: Theme.colors.offline
                                            }
                                        }

                                        // Primary Tank & Telemetry details
                                        Text {
                                            Layout.fillWidth: true
                                            elide: Text.ElideRight
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 10
                                            font.weight: Font.Medium
                                            color: Theme.colors.textSecondary
                                            text: {
                                                if (modelData.tanks && modelData.tanks.length > 0) {
                                                    var tk0 = modelData.tanks[0];
                                                    var devStr = tk0.deviceId ? (" · " + tk0.deviceId) : "";
                                                    return tk0.tankNumber + " (" + (tk0.deviceStatus || "Online") + ")" + devStr;
                                                }
                                                return "No tanks configured";
                                            }
                                        }

                                        Item { Layout.fillHeight: true }

                                        Text {
                                            text: "Inspect Coach →"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 10
                                            font.weight: Font.DemiBold
                                            color: Theme.colors.primary
                                        }
                                    }

                                    // 2. EMPTY / NOT ASSIGNED STATE (Section 26: subtle, muted, available)
                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        Layout.fillHeight: true
                                        spacing: 3
                                        visible: !modelData.assigned

                                        Text {
                                            text: "No tanks assigned"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            color: "#64748B"
                                        }

                                        Text {
                                            text: "Available slot"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 10
                                            color: "#94A3B8"
                                        }

                                        Item { Layout.fillHeight: true }

                                        Text {
                                            text: "+ Configure →"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 10
                                            font.weight: Font.DemiBold
                                            color: cCardHover.hovered ? Theme.colors.primary : "#94A3B8"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ----------------------------------------------------------------
            // STEP 4: COACH DETAILS & TANKS (Sections 12, 14, 31)
            // ----------------------------------------------------------------
            Flickable {
                id: coachDetailsFlickable
                anchors.fill: parent
                visible: root.viewMode === "coach_details"
                contentWidth: width
                contentHeight: cdCol.implicitHeight + 20
                boundsBehavior: Flickable.StopAtBounds
                clip: true

                ColumnLayout {
                    id: cdCol
                    width: coachDetailsFlickable.width
                    spacing: 16

                    // Coach Header Banner (Section 2 & 7: Compact SCADA Header)
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 64
                        radius: 8
                        color: "#FFFFFF"
                        border.width: 1
                        border.color: Theme.colors.border

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: 16
                            anchors.rightMargin: 16
                            spacing: 12

                            Rectangle {
                                width: 34; height: 34; radius: 6
                                color: bCdHover.containsMouse ? "#F1F5F9" : "#FFFFFF"
                                border.width: 1
                                border.color: Theme.colors.border
                                Text { anchors.centerIn: parent; text: "←"; font.pixelSize: 16; color: Theme.colors.textPrimary; font.weight: Font.Bold }
                                MouseArea {
                                    id: bCdHover
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.goBack()
                                }
                            }

                            ColumnLayout {
                                spacing: 1

                                Text {
                                    text: "Coach " + root.selectedCoachNumber + " — Tanks & Configuration"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 17
                                    font.weight: Font.Bold
                                    color: Theme.colors.textPrimary
                                }

                                Text {
                                    text: (RailwayManager.activeTrain.trainName || "Rajdhani Express") + " (" + root.selectedTrainNumber + ") · " + (RailwayManager.activeTrain.region || root.selectedRegion || "Eastern Railway")
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    color: Theme.colors.textSecondary
                                }
                            }

                            Item { Layout.fillWidth: true }

                            // [ + Add Tank ] Button
                            Rectangle {
                                height: 36
                                width: addTankText.implicitWidth + 24
                                radius: 6
                                color: addTankMouse.pressed ? Theme.colors.primaryPressed : (addTankMouse.containsMouse ? Theme.colors.primaryHover : Theme.colors.primary)

                                RowLayout {
                                    id: addTankText
                                    anchors.centerIn: parent
                                    spacing: 6
                                    Text { text: "+"; color: "#FFFFFF"; font.pixelSize: 14; font.weight: Font.Bold }
                                    Text { text: "Add Tank"; color: "#FFFFFF"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.DemiBold }
                                }

                                MouseArea {
                                    id: addTankMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        tankDialog.isEditMode = false;
                                        tankDialog.tankId = -1;
                                        tankDialog.tankNumber = "";
                                        tankDialog.tankName = "";
                                        tankDialog.geometryType = "Rectangular";
                                        tankDialog.lengthCm = 40.0;
                                        tankDialog.widthCm = 30.0;
                                        tankDialog.heightCm = 50.0;
                                        tankDialog.diameterCm = 30.0;
                                        tankDialog.capacityLiters = 60.0;
                                        tankDialog.maxHeightCm = 50.0;
                                        tankDialog.deviceId = "";
                                        tankDialog.open();
                                    }
                                }
                            }

                            // Delete Coach Button
                            Rectangle {
                                height: 36
                                width: 36
                                radius: 6
                                color: delCdMouse.containsMouse ? "#FEE2E2" : "#FFFFFF"
                                border.width: 1
                                border.color: delCdMouse.containsMouse ? Theme.colors.critical : Theme.colors.border
                                Text { anchors.centerIn: parent; text: "🗑"; font.pixelSize: 14; color: delCdMouse.containsMouse ? Theme.colors.critical : "#64748B" }
                                MouseArea {
                                    id: delCdMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        deleteCoachDialog.targetCoachId = root.selectedCoachId;
                                        deleteCoachDialog.coachNumber = root.selectedCoachNumber;
                                        deleteCoachDialog.open();
                                    }
                                }
                            }
                        }
                    }

                    // ========================================================
                    // COACH SUMMARY STRIP (Section 5)
                    // ========================================================
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 44
                        radius: 6
                        color: "#FFFFFF"
                        border.width: 1
                        border.color: Theme.colors.border

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: 16
                            anchors.rightMargin: 16
                            spacing: 16

                            // Coach Identifier Pill
                            Rectangle {
                                height: 26
                                width: cPillText.implicitWidth + 16
                                radius: 4
                                color: Theme.colors.primarySurface
                                border.width: 1
                                border.color: "#BFDBFE"
                                Text {
                                    id: cPillText
                                    anchors.centerIn: parent
                                    text: "COACH " + root.selectedCoachNumber
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 11
                                    font.weight: Font.Bold
                                    color: Theme.colors.primary
                                    font.letterSpacing: 0.5
                                }
                            }

                            Rectangle { width: 1; height: 20; color: Theme.colors.divider }

                            // KPI 1: Tanks
                            RowLayout {
                                spacing: 6
                                Text { text: "Tanks:"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                Text { text: root.coachSummary.tanks.toString(); font.family: Theme.typography.fontFamily; font.pixelSize: 13; font.weight: Font.Bold; color: Theme.colors.textPrimary }
                            }

                            Rectangle { width: 1; height: 20; color: Theme.colors.divider }

                            // KPI 2: Online
                            RowLayout {
                                spacing: 6
                                Rectangle { width: 7; height: 7; radius: 3.5; color: Theme.colors.success }
                                Text { text: "Online:"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                Text { text: root.coachSummary.online.toString(); font.family: Theme.typography.fontFamily; font.pixelSize: 13; font.weight: Font.Bold; color: Theme.colors.success }
                            }

                            Rectangle { width: 1; height: 20; color: Theme.colors.divider }

                            // KPI 3: Offline
                            RowLayout {
                                spacing: 6
                                Rectangle { width: 7; height: 7; radius: 3.5; color: root.coachSummary.offline > 0 ? Theme.colors.offline : "#94A3B8" }
                                Text { text: "Offline:"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                Text { text: root.coachSummary.offline.toString(); font.family: Theme.typography.fontFamily; font.pixelSize: 13; font.weight: Font.Bold; color: root.coachSummary.offline > 0 ? Theme.colors.offline : Theme.colors.textSecondary }
                            }

                            Rectangle { width: 1; height: 20; color: Theme.colors.divider }

                            // KPI 4: Warnings
                            RowLayout {
                                spacing: 6
                                Rectangle { width: 7; height: 7; radius: 3.5; color: root.coachSummary.warnings > 0 ? Theme.colors.warning : "#94A3B8" }
                                Text { text: "Warnings:"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                Text { text: root.coachSummary.warnings.toString(); font.family: Theme.typography.fontFamily; font.pixelSize: 13; font.weight: Font.Bold; color: root.coachSummary.warnings > 0 ? Theme.colors.warning : Theme.colors.textSecondary }
                            }

                            Rectangle { width: 1; height: 20; color: Theme.colors.divider }

                            // KPI 5: Critical
                            RowLayout {
                                spacing: 6
                                Rectangle { width: 7; height: 7; radius: 3.5; color: root.coachSummary.critical > 0 ? Theme.colors.critical : "#94A3B8" }
                                Text { text: "Critical:"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                Text { text: root.coachSummary.critical.toString(); font.family: Theme.typography.fontFamily; font.pixelSize: 13; font.weight: Font.Bold; color: root.coachSummary.critical > 0 ? Theme.colors.critical : Theme.colors.textSecondary }
                            }

                            Item { Layout.fillWidth: true }
                        }
                    }

                    // Empty state when coach has no tanks
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 200
                        radius: 8
                        color: "#FFFFFF"
                        border.width: 1
                        border.color: Theme.colors.border
                        visible: root.currentCoachTanks.length === 0

                        ColumnLayout {
                            anchors.centerIn: parent
                            spacing: 8
                            Text { text: "🚰"; font.pixelSize: 32; Layout.alignment: Qt.AlignHCenter }
                            Text {
                                text: "No tanks configured for this coach."
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.DemiBold
                                color: Theme.colors.textPrimary
                                Layout.alignment: Qt.AlignHCenter
                            }
                            Text {
                                text: "Click '+ Add Tank' above to configure tank dimensions, geometry, and device telemetry."
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: Theme.colors.textSecondary
                                Layout.alignment: Qt.AlignHCenter
                            }
                        }
                    }

                    // Tanks Grid (Sections 2, 3, 4: Professional SCADA Asset Cards)
                    GridLayout {
                        Layout.fillWidth: true
                        columns: Math.max(1, Math.min(3, Math.floor((root.width - 64) / 380)))
                        columnSpacing: 16
                        rowSpacing: 16
                        visible: root.currentCoachTanks.length > 0

                        Repeater {
                            model: root.currentCoachTanks
                            delegate: Rectangle {
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.preferredHeight: 280
                                Layout.minimumHeight: 280
                                radius: 8
                                color: "#FFFFFF"
                                border.width: tCardHover.hovered ? 1.5 : 1
                                border.color: tCardHover.hovered ? Theme.colors.primary : Theme.colors.border
                                scale: tCardHover.hovered ? 1.008 : 1.0

                                Behavior on scale {
                                    NumberAnimation { duration: Theme.animFast; easing.type: Easing.OutCubic }
                                }
                                Behavior on border.color {
                                    ColorAnimation { duration: Theme.animFast }
                                }

                                HoverHandler {
                                    id: tCardHover
                                    cursorShape: Qt.PointingHandCursor
                                }

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 16
                                    spacing: 10

                                    // TOP: Tank identifier + tank name + Badges (Section 3)
                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 8

                                        ColumnLayout {
                                            Layout.fillWidth: true
                                            spacing: 1

                                            Text {
                                                text: {
                                                    var numStr = (modelData.tankNumber || "").toString().trim();
                                                    var prefix = numStr.toLowerCase().startsWith("tank") ? numStr : ("Tank " + numStr);
                                                    return prefix;
                                                }
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 16
                                                font.weight: Font.Bold
                                                color: Theme.colors.textPrimary
                                                elide: Text.ElideRight
                                            }

                                            Text {
                                                text: modelData.tankName ? modelData.tankName : "Toilet Tank"
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 12
                                                color: Theme.colors.textSecondary
                                                elide: Text.ElideRight
                                            }
                                        }

                                        // Status Pill (ONLINE / WARNING / CRITICAL / OFFLINE)
                                        Rectangle {
                                            height: 22
                                            width: stPillRow.implicitWidth + 14
                                            radius: 11
                                            readonly property string st: (modelData.status || modelData.deviceStatus || "OFFLINE").toString().toUpperCase()
                                            readonly property bool isGood: st === "ONLINE" || st === "CONNECTED" || modelData.isOnline
                                            readonly property bool isWarn: st === "WARNING"
                                            readonly property bool isCrit: st === "CRITICAL"
                                            color: isCrit ? "#FEE2E2" : (isWarn ? "#FEF3C7" : (isGood ? "#ECFDF5" : "#F1F5F9"))
                                            border.width: 1
                                            border.color: isCrit ? "#FECACA" : (isWarn ? "#FDE68A" : (isGood ? "#A7F3D0" : "#CBD5E1"))

                                            RowLayout {
                                                id: stPillRow
                                                anchors.centerIn: parent
                                                spacing: 5
                                                Rectangle {
                                                    width: 6; height: 6; radius: 3
                                                    color: parent.parent.isCrit ? Theme.colors.critical : (parent.parent.isWarn ? Theme.colors.warning : (parent.parent.isGood ? Theme.colors.success : "#94A3B8"))
                                                }
                                                Text {
                                                    text: parent.parent.isCrit ? "CRITICAL" : (parent.parent.isWarn ? "WARNING" : (parent.parent.isGood ? "ONLINE" : (modelData.deviceId ? "OFFLINE" : "NO DEVICE")))
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 10
                                                    font.weight: Font.Bold
                                                    color: parent.parent.isCrit ? "#991B1B" : (parent.parent.isWarn ? "#92400E" : (parent.parent.isGood ? "#166534" : "#475569"))
                                                }
                                            }
                                        }

                                        // Shape Badge
                                        Rectangle {
                                            height: 22
                                            width: geomLabel.implicitWidth + 12
                                            radius: 4
                                            color: "#F8FAFC"
                                            border.width: 1
                                            border.color: "#E2E8F0"
                                            Text {
                                                id: geomLabel
                                                anchors.centerIn: parent
                                                text: modelData.geometryType || "Rectangular"
                                                font.pixelSize: 10
                                                font.weight: Font.Medium
                                                color: "#64748B"
                                            }
                                        }
                                    }

                                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

                                    // MIDDLE ROW 1: Geometry Specs (Capacity, Height, Device ID)
                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 12

                                        ColumnLayout {
                                            Layout.fillWidth: true
                                            spacing: 1
                                            Text { text: "Capacity"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                            Text { text: (modelData.capacityLiters || 60.0).toFixed(1) + " L"; font.pixelSize: 14; font.weight: Font.Bold; color: Theme.colors.textPrimary }
                                        }

                                        ColumnLayout {
                                            Layout.fillWidth: true
                                            spacing: 1
                                            Text { text: "Height"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                            Text { text: (modelData.heightCm || 50.0).toFixed(1) + " cm"; font.pixelSize: 14; font.weight: Font.Bold; color: Theme.colors.textPrimary }
                                        }

                                        ColumnLayout {
                                            Layout.fillWidth: true
                                            spacing: 1
                                            Text { text: "Device ID"; font.pixelSize: 10; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                            Text {
                                                text: (modelData.deviceId && modelData.deviceId !== "") ? modelData.deviceId : "Unassigned"
                                                font.pixelSize: 13
                                                font.weight: Font.DemiBold
                                                color: (modelData.deviceId && modelData.deviceId !== "") ? Theme.colors.primary : "#94A3B8"
                                                elide: Text.ElideRight
                                            }
                                        }
                                    }

                                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

                                    // MIDDLE ROW 2: Live Telemetry Summary
                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 14

                                        // Left: Current Level % with mini gauge bar
                                        ColumnLayout {
                                            Layout.preferredWidth: 110
                                            spacing: 2

                                            Text {
                                                text: "Current Level"
                                                font.pixelSize: 10
                                                color: Theme.colors.textSecondary
                                                font.weight: Font.Medium
                                            }

                                            Text {
                                                text: (modelData.isOnline && modelData.waterLevel !== undefined && modelData.waterLevel >= 0)
                                                      ? (modelData.waterLevel.toFixed(1) + "%")
                                                      : "--"
                                                font.family: Theme.typography.fontFamily
                                                font.pixelSize: 22
                                                font.weight: Font.Bold
                                                color: (modelData.isOnline && modelData.waterLevel !== undefined && modelData.waterLevel >= 0)
                                                       ? Theme.colors.primary : "#94A3B8"
                                            }

                                            // Mini Level Bar
                                            Rectangle {
                                                Layout.fillWidth: true
                                                height: 5
                                                radius: 2.5
                                                color: "#E2E8F0"
                                                Rectangle {
                                                    height: parent.height
                                                    radius: 2.5
                                                    width: (modelData.isOnline && modelData.waterLevel !== undefined && modelData.waterLevel >= 0)
                                                           ? Math.max(0, Math.min(parent.width, parent.width * (modelData.waterLevel / 100.0)))
                                                           : 0
                                                    color: Theme.colors.primary
                                                }
                                            }
                                        }

                                        // Right: Water Height & Pressure & Status
                                        GridLayout {
                                            Layout.fillWidth: true
                                            columns: 2
                                            columnSpacing: 10
                                            rowSpacing: 4

                                            ColumnLayout {
                                                spacing: 0
                                                Text { text: "Water Height"; font.pixelSize: 9; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                                Text {
                                                    text: (modelData.isOnline && modelData.waterHeightCm !== undefined && modelData.waterHeightCm >= 0)
                                                          ? (modelData.waterHeightCm.toFixed(2) + " cm")
                                                          : "--"
                                                    font.pixelSize: 12
                                                    font.weight: Font.Bold
                                                    color: Theme.colors.textPrimary
                                                }
                                            }

                                            ColumnLayout {
                                                spacing: 0
                                                Text { text: "Pressure"; font.pixelSize: 9; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                                Text {
                                                    text: (modelData.isOnline && modelData.pressure !== undefined && modelData.pressure >= 0)
                                                          ? (modelData.pressure.toFixed(1) + " hPa")
                                                          : "--"
                                                    font.pixelSize: 12
                                                    font.weight: Font.Bold
                                                    color: Theme.colors.textPrimary
                                                }
                                            }

                                            ColumnLayout {
                                                Layout.columnSpan: 2
                                                spacing: 0
                                                Text { text: "Status"; font.pixelSize: 9; color: Theme.colors.textSecondary; font.weight: Font.Medium }
                                                Text {
                                                    text: (modelData.isOnline ? (modelData.status || "NORMAL") : "OFFLINE")
                                                    font.pixelSize: 11
                                                    font.weight: Font.DemiBold
                                                    color: modelData.isOnline ? Theme.colors.success : Theme.colors.textSecondary
                                                }
                                            }
                                        }
                                    }

                                    Item { Layout.fillHeight: true }

                                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

                                    // BOTTOM: Actions (Open Tank Details with natural width, Edit, Delete)
                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 8

                                        // Open / Monitor Details Button (Natural padding, not full width)
                                        Rectangle {
                                            Layout.preferredHeight: 32
                                            Layout.preferredWidth: 170
                                            radius: 6
                                            color: openTkMouse.containsMouse ? Theme.colors.primaryPressed : Theme.colors.primary

                                            RowLayout {
                                                anchors.centerIn: parent
                                                spacing: 6
                                                Text {
                                                    text: "Open Tank Details"
                                                    color: "#FFFFFF"
                                                    font.family: Theme.typography.fontFamily
                                                    font.pixelSize: 11
                                                    font.weight: Font.DemiBold
                                                }
                                                Text { text: "→"; color: "#FFFFFF"; font.pixelSize: 12; font.weight: Font.Bold }
                                            }

                                            MouseArea {
                                                id: openTkMouse
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onClicked: {
                                                    RailwayManager.selectTank(modelData.id);
                                                    ApplicationStateManager.selectTank(modelData.id.toString(), root.selectedCoachNumber);
                                                    root.openTankDetailsRequested(modelData.id, modelData.tankNumber);
                                                }
                                            }
                                        }

                                        Item { Layout.fillWidth: true }

                                        // Edit Tank Button
                                        Rectangle {
                                            width: 32; height: 32; radius: 6
                                            color: edTkMouse.containsMouse ? "#EFF6FF" : "#FFFFFF"
                                            border.width: 1
                                            border.color: edTkMouse.containsMouse ? Theme.colors.primary : Theme.colors.border
                                            Text { anchors.centerIn: parent; text: "✎"; font.pixelSize: 12; color: edTkMouse.containsMouse ? Theme.colors.primary : "#64748B" }
                                            MouseArea {
                                                id: edTkMouse
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onClicked: {
                                                    tankDialog.isEditMode = true;
                                                    tankDialog.tankId = modelData.id;
                                                    tankDialog.tankNumber = modelData.tankNumber;
                                                    tankDialog.tankName = modelData.tankName || "";
                                                    tankDialog.geometryType = modelData.geometryType || "Rectangular";
                                                    tankDialog.lengthCm = modelData.lengthCm || 40.0;
                                                    tankDialog.widthCm = modelData.widthCm || 30.0;
                                                    tankDialog.heightCm = modelData.heightCm || 50.0;
                                                    tankDialog.diameterCm = modelData.diameterCm || 30.0;
                                                    tankDialog.capacityLiters = modelData.capacityLiters || 60.0;
                                                    tankDialog.maxHeightCm = modelData.maxHeightCm || 50.0;
                                                    tankDialog.deviceId = modelData.deviceId || "";
                                                    tankDialog.open();
                                                }
                                            }
                                        }

                                        // Delete Tank Button
                                        Rectangle {
                                            width: 32; height: 32; radius: 6
                                            color: delTkMouse.containsMouse ? "#FEE2E2" : "#FFFFFF"
                                            border.width: 1
                                            border.color: delTkMouse.containsMouse ? Theme.colors.critical : Theme.colors.border
                                            Text { anchors.centerIn: parent; text: "🗑"; font.pixelSize: 12; color: delTkMouse.containsMouse ? Theme.colors.critical : "#64748B" }
                                            MouseArea {
                                                id: delTkMouse
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onClicked: {
                                                    deleteTankDialog.targetTankId = modelData.id;
                                                    deleteTankDialog.tankNumber = modelData.tankNumber;
                                                    deleteTankDialog.open();
                                                }
                                            }
                                        }
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
    // DIALOG 1: ADD / EDIT TRAIN DIALOG
    // ========================================================================
    Dialog {
        id: trainDialog
        anchors.centerIn: parent
        width: 440
        modal: true
        padding: 24

        enter: Transition {
            NumberAnimation { property: "opacity"; from: 0.0; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
            NumberAnimation { property: "scale"; from: 0.97; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
        }
        exit: Transition {
            NumberAnimation { property: "opacity"; from: 1.0; to: 0.0; duration: Theme.animFast; easing.type: Easing.InCubic }
            NumberAnimation { property: "scale"; from: 1.0; to: 0.98; duration: Theme.animFast; easing.type: Easing.InCubic }
        }

        property bool isEditMode: false
        property string trainNumber: ""
        property string trainName: ""
        property string region: ""
        property string description: ""
        property string location: ""
        property string status: "Online"

        background: Rectangle {
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            Text {
                text: trainDialog.isEditMode ? ("Edit Train " + trainDialog.trainNumber) : "Add New Train"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
                color: Theme.colors.textPrimary
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

            // Train Number
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Train Number *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: tNumField
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: trainDialog.trainNumber
                        enabled: !trainDialog.isEditMode
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                    }
                }
            }

            // Train Name
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Train Name *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: tNameField
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: trainDialog.trainName
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                    }
                }
            }

            // Region
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Railway Region *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: tRegField
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: trainDialog.region
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                    }
                }

                // Region Quick-Pills
                RowLayout {
                    spacing: 6
                    Layout.topMargin: 2
                    Repeater {
                        model: ["Northern Region", "Southern Region", "Eastern Railway", "Western Region"]
                        Rectangle {
                            height: 22
                            width: regPillTxt.implicitWidth + 12
                            radius: 11
                            color: tRegField.text === modelData ? "#EFF6FF" : "#F8FAFC"
                            border.width: 1
                            border.color: tRegField.text === modelData ? Theme.colors.primary : "#E2E8F0"

                            Text {
                                id: regPillTxt
                                anchors.centerIn: parent
                                text: modelData
                                font.pixelSize: 10
                                font.weight: tRegField.text === modelData ? Font.Bold : Font.Normal
                                color: tRegField.text === modelData ? Theme.colors.primary : "#475569"
                            }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: tRegField.text = modelData
                            }
                        }
                    }
                }
            }

            // Location / Route
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Location / Route (e.g. Mumbai - Delhi)"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: tLocField
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: trainDialog.location
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                    }
                }
            }

            // Status Selector
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Operational Status"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                RowLayout {
                    spacing: 12
                    RadioButton {
                        id: stOnline
                        text: "Online"
                        checked: trainDialog.status === "Online"
                    }
                    RadioButton {
                        id: stOffline
                        text: "Offline"
                        checked: trainDialog.status !== "Online"
                    }
                }
            }

            // Error banner inside dialog
            Text {
                id: trainDlgErr
                text: ""
                color: Theme.colors.critical
                font.pixelSize: 11
                font.weight: Font.DemiBold
                visible: text.length > 0
            }

            // Dialog Buttons
            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 8
                spacing: 10

                Item { Layout.fillWidth: true }

                StyledButton {
                    text: "Cancel"
                    variant: "secondary"
                    onClicked: trainDialog.close()
                }

                StyledButton {
                    text: trainDialog.isEditMode ? "Save Changes" : "Create Train"
                    variant: "primary"
                    onClicked: {
                        var num = tNumField.text.trim();
                        var name = tNameField.text.trim();
                        var reg = tRegField.text.trim();
                        var loc = tLocField.text.trim();
                        var st = stOnline.checked ? "Online" : "Offline";

                        if (num === "" || name === "" || reg === "") {
                            trainDlgErr.text = "Please complete all required fields (*).";
                            return;
                        }

                        var ok = false;
                        if (trainDialog.isEditMode) {
                            ok = RailwayManager.updateTrain(num, name, reg, "", loc, st);
                        } else {
                            ok = RailwayManager.addTrain(num, name, reg, "", loc, st);
                        }

                        if (ok) {
                            trainDlgErr.text = "";
                            trainDialog.close();
                            if (root.selectedRegion === "") root.selectedRegion = reg;
                        } else {
                            trainDlgErr.text = "Failed to save train. Ensure train number is unique.";
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // DIALOG 2: DELETE TRAIN CONFIRMATION
    // ========================================================================
    Dialog {
        id: deleteTrainDialog
        anchors.centerIn: parent
        width: 400
        modal: true
        padding: 24

        enter: Transition {
            NumberAnimation { property: "opacity"; from: 0.0; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
            NumberAnimation { property: "scale"; from: 0.97; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
        }
        exit: Transition {
            NumberAnimation { property: "opacity"; from: 1.0; to: 0.0; duration: Theme.animFast; easing.type: Easing.InCubic }
            NumberAnimation { property: "scale"; from: 1.0; to: 0.98; duration: Theme.animFast; easing.type: Easing.InCubic }
        }

        property string targetTrainNumber: ""
        property int coachCount: 0
        property int tankCount: 0

        background: Rectangle {
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            Text {
                text: "Delete Train " + deleteTrainDialog.targetTrainNumber + "?"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
                color: Theme.colors.critical
            }

            Text {
                text: "Warning: Deleting this train will permanently cascade-delete all associated " +
                      deleteTrainDialog.coachCount + " coaches and " + deleteTrainDialog.tankCount + " tanks."
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                color: Theme.colors.textSecondary
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 12
                spacing: 10

                Item { Layout.fillWidth: true }

                StyledButton {
                    text: "Cancel"
                    variant: "secondary"
                    onClicked: deleteTrainDialog.close()
                }

                StyledButton {
                    text: "Confirm Delete"
                    variant: "danger"
                    onClicked: {
                        RailwayManager.deleteTrain(deleteTrainDialog.targetTrainNumber);
                        deleteTrainDialog.close();
                        if (root.viewMode === "train_details") {
                            root.viewMode = "trains";
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // DIALOG 3: ADD / EDIT COACH DIALOG (Section 11)
    // ========================================================================
    Dialog {
        id: coachDialog
        anchors.centerIn: parent
        width: 420
        modal: true
        padding: 24

        enter: Transition {
            NumberAnimation { property: "opacity"; from: 0.0; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
            NumberAnimation { property: "scale"; from: 0.97; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
        }
        exit: Transition {
            NumberAnimation { property: "opacity"; from: 1.0; to: 0.0; duration: Theme.animFast; easing.type: Easing.InCubic }
            NumberAnimation { property: "scale"; from: 1.0; to: 0.98; duration: Theme.animFast; easing.type: Easing.InCubic }
        }

        property bool isEditMode: false
        property int coachId: -1
        property string coachNumber: ""
        property string coachType: "Sleeper Class"
        property int position: 1
        property string description: ""

        background: Rectangle {
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            Text {
                text: coachDialog.isEditMode ? ("Edit Coach " + coachDialog.coachNumber) : ("Add Coach to Train " + root.selectedTrainNumber)
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
                color: Theme.colors.textPrimary
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

            // Coach Number
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Coach Number * (e.g. S1, A1, B2)"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: cNumIn
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: coachDialog.coachNumber
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                    }
                }
            }

            // Coach Type
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Coach Type *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: cTypeIn
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: coachDialog.coachType
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                    }
                }
            }

            // Coach Position in Consist (Enforce 01-24)
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Position in Consist (01–24) *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: cPosIn
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: (coachDialog.position < 10 ? "0" : "") + coachDialog.position.toString()
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                    }
                }
            }

            // Description
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Description (Optional)"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: cDescIn
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: coachDialog.description
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                    }
                }
            }

            Text {
                id: coachDlgErr
                text: ""
                color: Theme.colors.critical
                font.pixelSize: 11
                font.weight: Font.DemiBold
                visible: text.length > 0
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 8
                spacing: 10

                Item { Layout.fillWidth: true }

                StyledButton {
                    text: "Cancel"
                    variant: "secondary"
                    onClicked: coachDialog.close()
                }

                StyledButton {
                    text: coachDialog.isEditMode ? "Save Changes" : "Add Coach"
                    variant: "primary"
                    onClicked: {
                        var cnum = cNumIn.text.trim();
                        var ctype = cTypeIn.text.trim();
                        var cpos = parseInt(cPosIn.text.trim()) || 1;
                        var cdesc = cDescIn.text.trim();

                        if (cnum === "") {
                            coachDlgErr.text = "Coach number is required.";
                            return;
                        }

                        // Strictly enforce maximum 24 coaches (Requirement 33)
                        if (cpos < 1 || cpos > 24) {
                            coachDlgErr.text = "Coach position must be between 01 and 24. Maximum 24 positions supported.";
                            return;
                        }
                        var numMatch = cnum.match(/(\d+)/);
                        if (numMatch && parseInt(numMatch[1]) > 24) {
                            coachDlgErr.text = "Coach number cannot exceed 24.";
                            return;
                        }

                        var ok = false;
                        if (coachDialog.isEditMode) {
                            ok = RailwayManager.updateCoach(coachDialog.coachId, cnum, ctype, cpos, cdesc);
                        } else {
                            ok = RailwayManager.addCoach(root.selectedTrainNumber, cnum, ctype, cpos, cdesc);
                        }

                        if (ok) {
                            coachDlgErr.text = "";
                            coachDialog.close();
                        } else {
                            coachDlgErr.text = "Failed to save coach. Coach positions and numbers are limited to 01–24 and must be unique.";
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // DIALOG 4: DELETE COACH CONFIRMATION
    // ========================================================================
    Dialog {
        id: deleteCoachDialog
        anchors.centerIn: parent
        width: 380
        modal: true
        padding: 24

        enter: Transition {
            NumberAnimation { property: "opacity"; from: 0.0; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
            NumberAnimation { property: "scale"; from: 0.97; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
        }
        exit: Transition {
            NumberAnimation { property: "opacity"; from: 1.0; to: 0.0; duration: Theme.animFast; easing.type: Easing.InCubic }
            NumberAnimation { property: "scale"; from: 1.0; to: 0.98; duration: Theme.animFast; easing.type: Easing.InCubic }
        }

        property int targetCoachId: -1
        property string coachNumber: ""

        background: Rectangle {
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            Text {
                text: "Delete Coach " + deleteCoachDialog.coachNumber + "?"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
                color: Theme.colors.critical
            }

            Text {
                text: "Warning: All tanks configured inside this coach will be permanently deleted."
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                color: Theme.colors.textSecondary
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 12
                spacing: 10

                Item { Layout.fillWidth: true }

                StyledButton {
                    text: "Cancel"
                    variant: "secondary"
                    onClicked: deleteCoachDialog.close()
                }

                StyledButton {
                    text: "Delete Coach"
                    variant: "danger"
                    onClicked: {
                        RailwayManager.deleteCoach(deleteCoachDialog.targetCoachId);
                        deleteCoachDialog.close();
                        root.viewMode = "train_details";
                    }
                }
            }
        }
    }

    // ========================================================================
    // DIALOG 5: ADD / EDIT TANK & GEOMETRY DIALOG (Sections 12, 15)
    // ========================================================================
    Dialog {
        id: tankDialog
        anchors.centerIn: parent
        width: 480
        modal: true
        padding: 24

        enter: Transition {
            NumberAnimation { property: "opacity"; from: 0.0; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
            NumberAnimation { property: "scale"; from: 0.97; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
        }
        exit: Transition {
            NumberAnimation { property: "opacity"; from: 1.0; to: 0.0; duration: Theme.animFast; easing.type: Easing.InCubic }
            NumberAnimation { property: "scale"; from: 1.0; to: 0.98; duration: Theme.animFast; easing.type: Easing.InCubic }
        }

        property bool isEditMode: false
        property int tankId: -1
        property string tankNumber: ""
        property string tankName: ""
        property string geometryType: "Rectangular"
        property real lengthCm: 40.0
        property real widthCm: 30.0
        property real heightCm: 50.0
        property real diameterCm: 30.0
        property real capacityLiters: 60.0
        property real maxHeightCm: 50.0
        property string deviceId: ""

        function recalculate() {
            var l = parseFloat(tLenIn.text) || 0;
            var w = parseFloat(tWidIn.text) || 0;
            var h = parseFloat(tHgtIn.text) || 0;
            var d = parseFloat(tDiaIn.text) || 0;
            if (geometryType === "Cylindrical") {
                capacityLiters = RailwayManager.calculateCapacity("Cylindrical", 0, 0, h, d);
            } else if (geometryType === "Rectangular") {
                capacityLiters = RailwayManager.calculateCapacity("Rectangular", l, w, h, 0);
            }
        }

        background: Rectangle {
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            Text {
                text: tankDialog.isEditMode ? ("Edit Tank " + tankDialog.tankNumber + " Geometry") : ("Add Tank to Coach " + root.selectedCoachNumber)
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
                color: Theme.colors.textPrimary
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                // Tank Number
                ColumnLayout {
                    Layout.preferredWidth: 120
                    spacing: 4
                    Text { text: "Tank Number *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: tkNumIn
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.tankNumber
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12
                        }
                    }
                }

                // Tank Name
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Tank Name / Tag"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: tkNameIn
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.tankName
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12
                        }
                    }
                }
            }

            // Geometry Selector (Rectangular vs Cylindrical vs Custom)
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Geometry Shape *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                RowLayout {
                    spacing: 16
                    RadioButton {
                        id: rRect
                        text: "Rectangular"
                        checked: tankDialog.geometryType === "Rectangular"
                        onClicked: { tankDialog.geometryType = "Rectangular"; tankDialog.recalculate(); }
                    }
                    RadioButton {
                        id: rCyl
                        text: "Cylindrical"
                        checked: tankDialog.geometryType === "Cylindrical"
                        onClicked: { tankDialog.geometryType = "Cylindrical"; tankDialog.recalculate(); }
                    }
                    RadioButton {
                        id: rCust
                        text: "Custom"
                        checked: tankDialog.geometryType === "Custom"
                        onClicked: { tankDialog.geometryType = "Custom"; }
                    }
                }
            }

            // Dimensions Row
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                // Height
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Height (cm) *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: tHgtIn
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.heightCm.toString()
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12
                            onTextChanged: tankDialog.recalculate()
                        }
                    }
                }

                // Diameter (for Cylindrical)
                ColumnLayout {
                    visible: tankDialog.geometryType === "Cylindrical"
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Diameter (cm) *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: tDiaIn
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.diameterCm.toString()
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12
                            onTextChanged: tankDialog.recalculate()
                        }
                    }
                }

                // Length (for Rectangular)
                ColumnLayout {
                    visible: tankDialog.geometryType === "Rectangular"
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Length (cm) *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: tLenIn
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.lengthCm.toString()
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12
                            onTextChanged: tankDialog.recalculate()
                        }
                    }
                }

                // Width (for Rectangular)
                ColumnLayout {
                    visible: tankDialog.geometryType === "Rectangular"
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Width (cm) *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: tWidIn
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.widthCm.toString()
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12
                            onTextChanged: tankDialog.recalculate()
                        }
                    }
                }
            }

            // Capacity (Calculated / Editable)
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Total Capacity (Liters)"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#F8FAFC"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: tCapIn
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: tankDialog.capacityLiters.toFixed(1)
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                        font.weight: Font.Bold
                        color: Theme.colors.primary
                    }
                }
            }

            // Device Assignment
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Telemetry Device Assignment (e.g. ESP32-S3-001 or wli)"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput {
                        id: tDevIn
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                        verticalAlignment: TextInput.AlignVCenter
                        text: tankDialog.deviceId
                        font.family: Theme.typography.fontFamily; font.pixelSize: 12
                    }
                }
            }

            Text {
                id: tankDlgErr
                text: ""
                color: Theme.colors.critical
                font.pixelSize: 11
                font.weight: Font.DemiBold
                visible: text.length > 0
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 8
                spacing: 10

                Item { Layout.fillWidth: true }

                StyledButton {
                    text: "Cancel"
                    variant: "secondary"
                    onClicked: tankDialog.close()
                }

                StyledButton {
                    text: tankDialog.isEditMode ? "Save Tank" : "Add Tank"
                    variant: "primary"
                    onClicked: {
                        var tnum = tkNumIn.text.trim();
                        var tname = tkNameIn.text.trim();
                        var geom = tankDialog.geometryType;
                        var h = parseFloat(tHgtIn.text) || 0;
                        var d = parseFloat(tDiaIn.text) || 0;
                        var l = parseFloat(tLenIn.text) || 0;
                        var w = parseFloat(tWidIn.text) || 0;
                        var cap = parseFloat(tCapIn.text) || 0;
                        var dev = tDevIn.text.trim();

                        if (tnum === "") {
                            tankDlgErr.text = "Tank number is required.";
                            return;
                        }
                        if (h <= 0) {
                            tankDlgErr.text = "Tank height must be greater than 0.";
                            return;
                        }

                        // Duplicate tank validation in same coach (normalized comparison)
                        var coachTanks = root.currentCoachTanks.length > 0 ? root.currentCoachTanks : RailwayManager.getTanksForCoach(root.selectedCoachId);
                        for (var i = 0; i < coachTanks.length; ++i) {
                            var exNum = (coachTanks[i].tankNumber || "").toString().trim().toLowerCase();
                            var newNum = tnum.trim().toLowerCase();
                            var cleanEx = exNum.replace(/^tank\s*/i, "");
                            var cleanNew = newNum.replace(/^tank\s*/i, "");
                            if ((exNum === newNum || cleanEx === cleanNew) && (!tankDialog.isEditMode || coachTanks[i].id !== tankDialog.tankId)) {
                                tankDlgErr.text = "A tank with number '" + tnum + "' already exists in this coach.";
                                return;
                            }
                        }

                        var ok = false;
                        if (tankDialog.isEditMode) {
                            ok = RailwayManager.updateTank(tankDialog.tankId, tnum, tname, geom, l, w, h, d, cap, h, dev);
                        } else {
                            ok = RailwayManager.addTank(root.selectedCoachId, tnum, tname, geom, l, w, h, d, cap, h, dev);
                        }

                        if (ok) {
                            root.refreshCoachTanks();
                            tankDlgErr.text = "";
                            tankDialog.close();
                        } else {
                            tankDlgErr.text = "Failed to save tank.";
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // DIALOG 6: DELETE TANK CONFIRMATION
    // ========================================================================
    Dialog {
        id: deleteTankDialog
        anchors.centerIn: parent
        width: 360
        modal: true
        padding: 24

        enter: Transition {
            NumberAnimation { property: "opacity"; from: 0.0; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
            NumberAnimation { property: "scale"; from: 0.97; to: 1.0; duration: Theme.animNormal; easing.type: Easing.OutCubic }
        }
        exit: Transition {
            NumberAnimation { property: "opacity"; from: 1.0; to: 0.0; duration: Theme.animFast; easing.type: Easing.InCubic }
            NumberAnimation { property: "scale"; from: 1.0; to: 0.98; duration: Theme.animFast; easing.type: Easing.InCubic }
        }

        property int targetTankId: -1
        property string tankNumber: ""

        background: Rectangle {
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            Text {
                text: "Delete Tank " + deleteTankDialog.tankNumber + "?"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
                color: Theme.colors.critical
            }

            Text {
                text: "Are you sure you want to delete this tank? This will delete its physical geometry configuration."
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                color: Theme.colors.textSecondary
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 12
                spacing: 10

                Item { Layout.fillWidth: true }

                StyledButton {
                    text: "Cancel"
                    variant: "secondary"
                    onClicked: deleteTankDialog.close()
                }

                StyledButton {
                    text: "Delete Tank"
                    variant: "danger"
                    onClicked: {
                        RailwayManager.deleteTank(deleteTankDialog.targetTankId);
                        root.refreshCoachTanks();
                        deleteTankDialog.close();
                    }
                }
            }
        }
    }
}
