import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// Application Shell (App.qml) — Dual-Device Adaptive Panorama SCADA Monitor
// Supports Desktop/Tablet (>= 768px) and Mobile (< 768px):
// - Responsive Top Header (Header.qml) with status pill and mobile overflow menu.
// - Responsive Navigation: Docked left sidebar on desktop, sliding modal drawer on mobile.
// - Dynamic Content Stack featuring full parity with the deployed website:
//     0: DashboardPage (Fleet Overview, System Status, Consist Track, Dual Tanks)
//     1: TrainManagementPage (Regions, Trains, Consist, Coach & Tank CRUD)
//     2: AllTanksPage (Fleet Tank Roster, Search, Filters)
//     3: DevicesPage (Device Registry, Status, Mapping, Diagnostics)
//     4: LocationPage (Route Transit Map, Stations, Refill Tracking)
//     5: AlertsPage (Active Alarms, Ack, Severity, History)
//     6: HistoryPage (Telemetry History, Water/GPS/Battery, Trends, Export)
//     7: ReportsPage (5 Report Types, Ranges, CSV Export)
//     8: SettingsPage (System, Broker, Performance Profiles)
//     9: ConfigurationPage (Calibration, Geometry)
//    10: UsersPage (Access Control, Operator Roster, Requests)
//    11: LogsPage (MQTT Serial Monitor, Raw Stream, Log View)
//    12: WaterTankPage (Dual Tank Detail Gauges, Diagnostics)
// ============================================================================
ApplicationWindow {
    id: window

    flags: Qt.Window

    width: Theme.metrics.windowDefaultWidth
    height: Theme.metrics.windowDefaultHeight
    minimumWidth: Theme.metrics.windowMinimumWidth
    minimumHeight: Theme.metrics.windowMinimumHeight

    readonly property real dpWidth: width / Screen.devicePixelRatio
    readonly property bool isMobile: (Qt.platform.os === "android" || Qt.platform.os === "ios") ? (dpWidth < 600 || width < 800) : (width < 768)
    property bool isMobileDrawerOpen: false

    focus: true
    Keys.onBackPressed: (event) => {
        if (window.isMobileDrawerOpen) {
            window.isMobileDrawerOpen = false
            event.accepted = true
        } else if (sidebar.currentIndex !== 0) {
            mainLayout.navigateToDashboard()
            event.accepted = true
        }
    }
    Keys.onReleased: (event) => {
        if (event.key === Qt.Key_Back) {
            if (window.isMobileDrawerOpen) {
                window.isMobileDrawerOpen = false
                event.accepted = true
            } else if (sidebar.currentIndex !== 0) {
                mainLayout.navigateToDashboard()
                event.accepted = true
            }
        }
    }

    visible: true
    title: qsTr("Panorama Water Tank Monitor")
    color: Theme.colors.background

    // ========================================================================
    // 1. AUTHENTICATION & ROLE SELECTION (Visible when unauthenticated)
    // ========================================================================
    StackLayout {
        id: authStack
        anchors.fill: parent
        visible: !AuthManager.isAuthenticated
        currentIndex: 0

        RoleSelectionView {
            onSelectAdminRole: authStack.currentIndex = 1
            onSelectUserRole: authStack.currentIndex = 2
        }

        AdminLoginView {
            onBackRequested: authStack.currentIndex = 0
            onLoginSuccess: {
                sidebar.currentIndex = 0 // Direct to Dashboard upon successful login
                ApplicationStateManager.setCurrentPageIndex(0)
            }
        }

        UserLoginView {
            onBackRequested: authStack.currentIndex = 0
            onLoginSuccess: {
                sidebar.currentIndex = 0 // Direct to Dashboard upon successful login
                ApplicationStateManager.setCurrentPageIndex(0)
            }
        }
    }

    // ========================================================================
    // 2. MAIN APPLICATION SHELL (Visible when authenticated)
    // ========================================================================
    RowLayout {
        id: mainLayout
        anchors.fill: parent
        spacing: 0
        visible: AuthManager.isAuthenticated

        function navigateToTrainManagement() {
            locationView.isMapFullscreen = false
            trainMgmtView.resetToRegions()
            sidebar.currentIndex = 1 // Train Management
            ApplicationStateManager.setCurrentPageIndex(1)
            ApplicationStateManager.clearTrainContext()
        }

        function navigateToDashboard() {
            locationView.isMapFullscreen = false
            sidebar.currentIndex = 0 // Dashboard
            ApplicationStateManager.setCurrentPageIndex(0)
        }

        // Docked Sidebar (Desktop / Tablet only)
        Sidebar {
            id: sidebar
            Layout.fillHeight: true
            visible: !window.isMobile && !(sidebar.currentIndex === 4 && locationView.isMapFullscreen)
            Layout.preferredWidth: window.isMobile ? 0 : sidebar.width
            onItemClicked: (navIndex) => {
                if (navIndex === 1) {
                    mainLayout.navigateToTrainManagement()
                } else if (navIndex === 0) {
                    mainLayout.navigateToDashboard()
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0

            Header {
                id: appHeader
                Layout.fillWidth: true
                pageTitle: {
                    switch (sidebar.currentIndex) {
                        case 0: return "Dashboard";
                        case 1: return "Train Management";
                        case 2: return "All Tanks";
                        case 3: return "Devices";
                        case 4: return "Location";
                        case 5: return "Alerts";
                        case 6: return "History";
                        case 7: return "Reports";
                        case 8: return "Settings";
                        case 9: return "Configuration";
                        case 10: return "Users";
                        case 11: return "Raw Data & Logs";
                        case 12: return TankModel.tankName !== "" ? TankModel.tankName : "Tank Details";
                        default: return "Dashboard";
                    }
                }
                pageSubtitle: {
                    switch (sidebar.currentIndex) {
                        case 0: return "Fleet Overview & Real-Time Operational Telemetry";
                        case 1: return "Railway Fleet Operations & Consist Management";
                        case 2: return "Global tank overview and live levels";
                        case 3: return "Industrial IoT Hardware & Telemetry";
                        case 4: return "Route intelligence & water refill monitoring";
                        case 5: return "Active alarms and event notifications";
                        case 6: return "Historical water level trends";
                        case 7: return "Operational reports and analytics";
                        case 8: return "Device and communication setup";
                        case 9: return "System calibration and parameters";
                        case 10: return "Access control and users";
                        case 11: return "MQTT serial monitor and raw telemetry stream";
                        case 12: return "Live tank telemetry, geometry & diagnostics";
                        default: return "";
                    }
                }
                onHomeClicked: {
                    mainLayout.navigateToDashboard()
                }
                onMenuClicked: {
                    if (window.isMobile) {
                        window.isMobileDrawerOpen = !window.isMobileDrawerOpen
                    } else {
                        sidebar.isCollapsed = !sidebar.isCollapsed
                    }
                }
                onSettingsClicked: {
                    locationView.isMapFullscreen = false
                    sidebar.currentIndex = 8 // SettingsPage
                }
                onAlertsClicked: {
                    locationView.isMapFullscreen = false
                    sidebar.currentIndex = 5 // Alerts
                }

                // Global Search Navigation
                onSearchLocationSelected: (lat, lon, name) => {
                    locationView.isMapFullscreen = false
                    sidebar.currentIndex = 4 // Location
                    locationView.openLocation(lat, lon, name)
                }
                onSearchTrainSelected: (trainNumber) => {
                    sidebar.currentIndex = 1 // Train Management
                    trainMgmtView.navigateToTrain(trainNumber)
                }
                onSearchCoachSelected: (coachId, coachNumber, trainNumber) => {
                    sidebar.currentIndex = 1 // Train Management
                    trainMgmtView.navigateToCoach(coachId, coachNumber, trainNumber)
                }
                onSearchTankSelected: (tankId, tankNumber) => {
                    TrainManager.selectTank(tankId.toString())
                    RailwayManager.selectTank(tankId)
                    sidebar.currentIndex = 12 // Tank Details
                }
                onLogoutClicked: {
                    authStack.currentIndex = 0
                }
            }

            Item {
                id: contentContainer
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true

                StackLayout {
                    id: contentStack
                    anchors.fill: parent
                    currentIndex: sidebar.currentIndex
                    transform: Translate { id: pageTranslate }

                    onCurrentIndexChanged: {
                        if (contentStack.currentIndex !== 4) {
                            locationView.isMapFullscreen = false;
                        }
                        pageTransitionAnim.restart();
                    }

                    // Index 0: Dashboard (Fleet Overview, Consist Track, Dual Tanks)
                    DashboardPage {
                        id: dashboardView
                        onOpenTrainSelectionRequested: {
                            mainLayout.navigateToTrainManagement()
                        }
                        onOpenAllTanksRequested: {
                            sidebar.currentIndex = 2 // All Tanks
                        }
                        onOpenTankDetailsRequested: (tankId) => {
                            TrainManager.selectTank(tankId.toString())
                            RailwayManager.selectTank(tankId)
                            sidebar.currentIndex = 12 // Tank Details
                        }
                    }

                    // Index 1: Train Management
                    TrainManagementPage {
                        id: trainMgmtView
                        onOpenTankDetailsRequested: (tankId, tankNumber) => {
                            TrainManager.selectTank(tankId.toString())
                            RailwayManager.selectTank(tankId)
                            sidebar.currentIndex = 12 // Tank Details
                        }
                    }

                    // Index 2: All Tanks
                    AllTanksPage {
                        id: allTanksView
                        onTankSelected: (tankId) => {
                            TrainManager.selectTank(tankId.toString())
                            RailwayManager.selectTank(parseInt(tankId) || 0)
                            sidebar.currentIndex = 12 // Tank Details
                        }
                        onOpenTrainSelectionRequested: {
                            mainLayout.navigateToTrainManagement()
                        }
                    }

                    // Index 3: Devices
                    DevicesPage {
                        id: devicesView
                    }

                    // Index 4: Location
                    LocationPage {
                        id: locationView
                        onOpenSettingsRequested: {
                            sidebar.currentIndex = 8 // Settings
                        }
                    }

                    // Index 5: Alerts
                    AlertsPage {}

                    // Index 6: History
                    HistoryPage {}

                    // Index 7: Reports
                    ReportsPage {}

                    // Index 8: Settings
                    SettingsPage {}

                    // Index 9: Configuration
                    ConfigurationPage {}

                    // Index 10: Users
                    UsersPage {}

                    // Index 11: Logs & Raw Telemetry
                    LogsPage {}

                    // Index 12: Tank Details
                    WaterTankPage {
                        id: waterTankView
                        onBackRequested: {
                            sidebar.currentIndex = 1 // Return to Train Management
                            if (trainMgmtView.selectedCoachId > 0) {
                                trainMgmtView.viewMode = "coach_details";
                            } else {
                                var curTank = RailwayManager.getTank(RailwayManager.selectedTankId);
                                if (curTank && curTank.coachId) {
                                    trainMgmtView.navigateToCoach(curTank.coachId, curTank.coachNumber, curTank.trainNumber);
                                } else {
                                    trainMgmtView.viewMode = "coach_details";
                                }
                            }
                        }
                        onOpenLocationRequested: {
                            sidebar.currentIndex = 4 // Navigate to Location
                        }
                        onOpenAllTanksRequested: {
                            sidebar.currentIndex = 2 // All Tanks
                        }
                        onNavigateToHierarchy: (mode, reg, tNum, cId, cNum) => {
                            if (mode === "region" || mode === "regions") {
                                mainLayout.navigateToTrainManagement()
                            } else if (mode === "train") {
                                sidebar.currentIndex = 1 // Train Management
                                trainMgmtView.navigateToTrain(tNum)
                            } else if (mode === "coach") {
                                sidebar.currentIndex = 1 // Train Management
                                trainMgmtView.navigateToCoach(cId, cNum, tNum)
                            } else {
                                mainLayout.navigateToTrainManagement()
                            }
                        }
                    }
                }

                ParallelAnimation {
                    id: pageTransitionAnim
                    NumberAnimation {
                        target: contentStack
                        property: "opacity"
                        from: Theme.reducedMotion ? 0.7 : 0.0
                        to: 1.0
                        duration: Theme.reducedMotion ? 60 : Theme.animPageTransition
                        easing.type: Easing.OutCubic
                    }
                    NumberAnimation {
                        target: pageTranslate
                        property: "x"
                        from: Theme.reducedMotion ? 0 : 8
                        to: 0
                        duration: Theme.reducedMotion ? 60 : Theme.animPageTransition
                        easing.type: Easing.OutCubic
                    }
                }
            }
        }
    }

    // Edge Swipe Detector: Swiping right from screen left edge (0-28px) opens drawer
    Item {
        id: edgeSwipeDetector
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 28
        z: 998
        visible: window.isMobile && !window.isMobileDrawerOpen

        DragHandler {
            target: null
            xAxis.minimum: 0
            xAxis.maximum: 200
            onActiveChanged: {
                if (!active && translation.x > 45) {
                    window.isMobileDrawerOpen = true
                }
            }
        }
    }

    // ========================================================================
    // 3. MOBILE SLIDING NAVIGATION DRAWER & BACKDROP (Visible only on mobile)
    // ========================================================================
    Item {
        id: mobileDrawerContainer
        anchors.fill: parent
        z: 999
        visible: window.isMobile && (window.isMobileDrawerOpen || drawerAnim.running)

        // Semi-transparent scrim backdrop
        Rectangle {
            id: drawerScrim
            anchors.fill: parent
            color: "#000000"
            opacity: window.isMobileDrawerOpen ? 0.45 : 0.0

            Behavior on opacity {
                NumberAnimation { duration: 220; easing.type: Easing.OutCubic }
            }

            MouseArea {
                anchors.fill: parent
                onClicked: window.isMobileDrawerOpen = false
            }
        }

        // Sliding Navigation Panel hosting Sidebar
        Rectangle {
            id: mobileDrawerPanel
            width: Math.min(parent.width * 0.82, 320)
            height: parent.height
            color: "#FFFFFF"
            x: window.isMobileDrawerOpen ? 0 : -width

            Behavior on x {
                id: drawerAnim
                NumberAnimation { duration: 250; easing.type: Easing.OutCubic }
            }

            DragHandler {
                target: null
                xAxis.minimum: -200
                xAxis.maximum: 0
                onActiveChanged: {
                    if (!active && translation.x < -40) {
                        window.isMobileDrawerOpen = false
                    }
                }
            }

            ColumnLayout {
                anchors.fill: parent
                spacing: 0

                // Mobile Drawer Header with Close Button
                Rectangle {
                    Layout.fillWidth: true
                    height: 52
                    color: "#FFFFFF"
                    border.width: 1
                    border.color: "#E2E8F0"

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 12
                        anchors.rightMargin: 12
                        spacing: 8

                        Rectangle {
                            width: 36
                            height: 36
                            radius: 6
                            color: "#F1F5F9"
                            border.width: 1
                            border.color: "#CBD5E1"

                            Column {
                                anchors.centerIn: parent
                                spacing: 3
                                Rectangle { width: 14; height: 2; radius: 1; color: "#0F172A" }
                                Rectangle { width: 14; height: 2; radius: 1; color: "#0F172A" }
                                Rectangle { width: 14; height: 2; radius: 1; color: "#0F172A" }
                            }

                            MouseArea {
                                anchors.fill: parent
                                onClicked: window.isMobileDrawerOpen = false
                            }
                        }

                        Text {
                            text: "PANORAMA SCADA"
                            font.bold: true
                            font.pixelSize: 13
                            color: "#0F172A"
                            Layout.fillWidth: true
                        }

                        Rectangle {
                            width: 36
                            height: 36
                            radius: 6
                            color: "#F1F5F9"
                            border.width: 1
                            border.color: "#CBD5E1"

                            Text {
                                anchors.centerIn: parent
                                text: "✕"
                                font.pixelSize: 14
                                font.bold: true
                                color: "#475569"
                            }

                            MouseArea {
                                anchors.fill: parent
                                onClicked: window.isMobileDrawerOpen = false
                            }
                        }
                    }
                }

                ScrollView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

                    Sidebar {
                        id: mobileSidebar
                        width: mobileDrawerPanel.width
                        isCollapsed: false
                        currentIndex: sidebar.currentIndex
                        onItemClicked: (navIndex) => {
                            sidebar.currentIndex = navIndex
                            window.isMobileDrawerOpen = false
                            if (navIndex === 1) {
                                mainLayout.navigateToTrainManagement()
                            } else if (navIndex === 0) {
                                mainLayout.navigateToDashboard()
                            }
                        }
                    }
                }
            }
        }
    }

    Connections {
        target: ApplicationStateManager
        function onSelectedTrainNumberChanged() {
            LocationManager.loadRouteForTrain(ApplicationStateManager.selectedTrainNumber);
        }
    }

    Connections {
        target: TrainManager
        function onTankSelectedForDetail(tankId) {
            sidebar.currentIndex = 12 // Switch to WaterTankPage (12)
        }
    }

    Connections {
        target: ApplicationStateManager
        function onCurrentPageIndexChanged() {
            if (sidebar.currentIndex !== ApplicationStateManager.currentPageIndex) {
                sidebar.currentIndex = ApplicationStateManager.currentPageIndex;
            }
        }
    }

    Connections {
        target: sidebar
        function onCurrentIndexChanged() {
            ApplicationStateManager.setCurrentPageIndex(sidebar.currentIndex);
        }
    }

    Component.onCompleted: {
        if (typeof autoLoginAdminRequested !== "undefined" && autoLoginAdminRequested) {
            AuthManager.loginAdmin("123");
            sidebar.currentIndex = 0;
            ApplicationStateManager.setCurrentPageIndex(0);
        } else if (ApplicationStateManager.hasSavedState()) {
            var saved = ApplicationStateManager.currentPageIndex;
            if (saved >= 0 && saved <= 12) {
                sidebar.currentIndex = saved;
            } else {
                sidebar.currentIndex = 0;
            }
        }
    }

    onClosing: (close) => {
        ApplicationStateManager.saveState();
        Qt.quit();
    }

    // ========================================================================
    // Automated Visual Verification Sequencer
    // Activated only when launched with --capture-views
    // ========================================================================
    Timer {
        id: visualQaTimer
        interval: 1000
        running: true
        repeat: false
        onTriggered: {
            if (typeof captureViewsRequested === "undefined" || !captureViewsRequested) return;

            var baseDir = "C:/Users/User/.gemini/antigravity-ide/brain/af675fed-8d5d-441e-bf51-fbde6dfbdf72/scratch/";

            // Step 1: Capture Role Selection Screen
            window.contentItem.grabToImage(function(res1) {
                res1.saveToFile(baseDir + "01_role_selection.png");
                console.log("[VisualQA] Captured 01_role_selection.png");

                // Step 2: Login as Admin
                AuthManager.loginAdmin("123");
                sidebar.currentIndex = 1; // Train Management

                qaTimer2.start();
            });
        }
    }

    Timer {
        id: qaTimer2
        interval: 1200
        running: false
        repeat: false
        onTriggered: {
            var baseDir = "C:/Users/User/.gemini/antigravity-ide/brain/af675fed-8d5d-441e-bf51-fbde6dfbdf72/scratch/";
            window.contentItem.grabToImage(function(res2) {
                res2.saveToFile(baseDir + "02_train_management_regions.png");
                console.log("[VisualQA] Captured 02_train_management_regions.png");

                // Step 3: Enter region
                trainMgmtView.selectedRegion = "Eastern Railway";
                trainMgmtView.viewMode = "trains";
                qaTimer3.start();
            });
        }
    }

    Timer {
        id: qaTimer3
        interval: 1200
        running: false
        repeat: false
        onTriggered: {
            var baseDir = "C:/Users/User/.gemini/antigravity-ide/brain/af675fed-8d5d-441e-bf51-fbde6dfbdf72/scratch/";
            window.contentItem.grabToImage(function(res3) {
                res3.saveToFile(baseDir + "03_train_management_trains.png");
                console.log("[VisualQA] Captured 03_train_management_trains.png");

                // Step 4: Click Rajdhani Express (Train Details / Consist)
                trainMgmtView.navigateToTrain("12301");
                qaTimer4.start();
            });
        }
    }

    Timer {
        id: qaTimer4
        interval: 1200
        running: false
        repeat: false
        onTriggered: {
            var baseDir = "C:/Users/User/.gemini/antigravity-ide/brain/af675fed-8d5d-441e-bf51-fbde6dfbdf72/scratch/";
            window.contentItem.grabToImage(function(res4) {
                res4.saveToFile(baseDir + "04_train_consist_view.png");
                console.log("[VisualQA] Captured 04_train_consist_view.png");

                // Step 5: Click Coach S1 (Coach Details)
                trainMgmtView.navigateToCoach(1, "S1", "12301");
                qaTimer5.start();
            });
        }
    }

    Timer {
        id: qaTimer5
        interval: 1200
        running: false
        repeat: false
        onTriggered: {
            var baseDir = "C:/Users/User/.gemini/antigravity-ide/brain/af675fed-8d5d-441e-bf51-fbde6dfbdf72/scratch/";
            window.contentItem.grabToImage(function(res5) {
                res5.saveToFile(baseDir + "05_coach_details_view.png");
                console.log("[VisualQA] Captured 05_coach_details_view.png");

                // Step 6: Click Tank T01 (Tank Details / Live Monitoring)
                RailwayManager.selectTank(1);
                sidebar.currentIndex = 12;
                qaTimer6.start();
            });
        }
    }

    Timer {
        id: qaTimer6
        interval: 1200
        running: false
        repeat: false
        onTriggered: {
            var baseDir = "C:/Users/User/.gemini/antigravity-ide/brain/af675fed-8d5d-441e-bf51-fbde6dfbdf72/scratch/";
            window.contentItem.grabToImage(function(res6) {
                res6.saveToFile(baseDir + "06_tank_details_view.png");
                console.log("[VisualQA] Captured 06_tank_details_view.png");

                // Step 7: All Tanks Page
                sidebar.currentIndex = 2;
                qaTimer7.start();
            });
        }
    }

    Timer {
        id: qaTimer7
        interval: 1200
        running: false
        repeat: false
        onTriggered: {
            var baseDir = "C:/Users/User/.gemini/antigravity-ide/brain/af675fed-8d5d-441e-bf51-fbde6dfbdf72/scratch/";
            window.contentItem.grabToImage(function(res7) {
                res7.saveToFile(baseDir + "07_all_tanks_view.png");
                console.log("[VisualQA] Captured 07_all_tanks_view.png");

                // Finish test run
                Qt.quit();
            });
        }
    }
}
