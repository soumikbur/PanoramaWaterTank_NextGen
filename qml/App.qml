import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// Application shell. Custom TitleBar (Header), Sidebar, and Footer surround
// StackLayout. Frameless window with custom title bar and 8-direction edge resizer.
ApplicationWindow {
    id: window

    flags: Qt.Window

    width: Theme.metrics.windowDefaultWidth
    height: Theme.metrics.windowDefaultHeight
    minimumWidth: Theme.metrics.windowMinimumWidth
    minimumHeight: Theme.metrics.windowMinimumHeight

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
                sidebar.currentIndex = 0 // Direct to Train Management upon successful login
                ApplicationStateManager.setCurrentPageIndex(0)
            }
        }

        UserLoginView {
            onBackRequested: authStack.currentIndex = 0
            onLoginSuccess: {
                sidebar.currentIndex = 0 // Direct to Train Management upon successful login
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
            sidebar.currentIndex = 0 // Train Management
            ApplicationStateManager.setCurrentPageIndex(0)
            ApplicationStateManager.clearTrainContext()
        }

        Sidebar {
            id: sidebar
            Layout.fillHeight: true
            visible: !(sidebar.currentIndex === 3 && locationView.isMapFullscreen)
            onItemClicked: (navIndex) => {
                if (navIndex === 0) {
                    mainLayout.navigateToTrainManagement()
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
                        case 0: return "Train Management";
                        case 1: return "All Tanks";
                        case 2: return "Devices";
                        case 3: return "Location";
                        case 4: return "Alerts";
                        case 5: return "History";
                        case 6: return "Reports";
                        case 7: return "Settings";
                        case 8: return "Configuration";
                        case 9: return "Users";
                        case 10: return "Logs";
                        case 11: return TankModel.tankName !== "" ? TankModel.tankName : "Tank Details";
                        default: return "Train Management";
                    }
                }
                pageSubtitle: {
                    switch (sidebar.currentIndex) {
                        case 0: return "Railway Fleet Operations & Consist Management";
                        case 1: return "Global tank overview and live levels";
                        case 2: return "Industrial IoT Hardware & Telemetry";
                        case 3: return "Route intelligence & water refill monitoring";
                        case 4: return "Active alarms and event notifications";
                        case 5: return "Historical water level trends";
                        case 6: return "Operational reports and analytics";
                        case 7: return "Device and communication setup";
                        case 8: return "System calibration and parameters";
                        case 9: return "Access control and users";
                        case 10: return "System and audit logs";
                        case 11: return "Live tank telemetry, geometry & diagnostics";
                        default: return "";
                    }
                }
                onHomeClicked: {
                    mainLayout.navigateToTrainManagement()
                }
                onMenuClicked: {
                    mainLayout.navigateToTrainManagement()
                }
                onSettingsClicked: {
                    locationView.isMapFullscreen = false
                    sidebar.currentIndex = 7 // SettingsPage
                }

                // Global Search Navigation (Sections 33, 34)
                onSearchLocationSelected: (lat, lon, name) => {
                    locationView.isMapFullscreen = false
                    sidebar.currentIndex = 3 // Location
                    locationView.openLocation(lat, lon, name)
                }
                onSearchTrainSelected: (trainNumber) => {
                    sidebar.currentIndex = 0 // Train Management
                    trainMgmtView.navigateToTrain(trainNumber)
                }
                onSearchCoachSelected: (coachId, coachNumber, trainNumber) => {
                    sidebar.currentIndex = 0 // Train Management
                    trainMgmtView.navigateToCoach(coachId, coachNumber, trainNumber)
                }
                onSearchTankSelected: (tankId, tankNumber) => {
                    TrainManager.selectTank(tankId.toString())
                    RailwayManager.selectTank(tankId)
                    sidebar.currentIndex = 11 // Tank Details
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
                        if (contentStack.currentIndex !== 3) {
                            locationView.isMapFullscreen = false;
                        }
                        pageTransitionAnim.restart();
                    }

                    TrainManagementPage {
                        id: trainMgmtView
                        onOpenTankDetailsRequested: (tankId, tankNumber) => {
                            TrainManager.selectTank(tankId.toString())
                            RailwayManager.selectTank(tankId)
                            sidebar.currentIndex = 11 // Tank Details
                        }
                    }                    // Index 0: Train Management
                    AllTanksPage {
                        id: allTanksView
                        onTankSelected: (tankId) => {
                            TrainManager.selectTank(tankId.toString())
                            RailwayManager.selectTank(parseInt(tankId) || 0)
                            sidebar.currentIndex = 11 // Tank Details
                        }
                        onOpenTrainSelectionRequested: {
                            mainLayout.navigateToTrainManagement()
                        }
                    }                    // Index 1: All Tanks
                    DevicesPage {
                        id: devicesView
                    }                    // Index 2: Devices
                    LocationPage {
                        id: locationView
                        onOpenSettingsRequested: {
                            sidebar.currentIndex = 7 // Settings
                        }
                    }                    // Index 3: Location
                    AlertsPage {}        // Index 4: Alerts
                    HistoryPage {}       // Index 5: History
                    ReportsPage {}       // Index 6: Reports
                    SettingsPage {}      // Index 7: Settings
                    ConfigurationPage {} // Index 8: Configuration
                    UsersPage {}         // Index 9: Users
                    LogsPage {}          // Index 10: Logs
                    WaterTankPage {
                        id: waterTankView
                        onBackRequested: {
                            sidebar.currentIndex = 0 // Return to Train Management
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
                            sidebar.currentIndex = 3 // Navigate to Location
                        }
                        onOpenAllTanksRequested: {
                            sidebar.currentIndex = 1 // All Tanks
                        }
                        onNavigateToHierarchy: (mode, reg, tNum, cId, cNum) => {
                            if (mode === "region" || mode === "regions") {
                                mainLayout.navigateToTrainManagement()
                            } else if (mode === "train") {
                                sidebar.currentIndex = 0 // Train Management
                                trainMgmtView.navigateToTrain(tNum)
                            } else if (mode === "coach") {
                                sidebar.currentIndex = 0 // Train Management
                                trainMgmtView.navigateToCoach(cId, cNum, tNum)
                            } else {
                                mainLayout.navigateToTrainManagement()
                            }
                        }
                    }                    // Index 11: Tank Details
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

    Connections {
        target: ApplicationStateManager
        function onSelectedTrainNumberChanged() {
            LocationManager.loadRouteForTrain(ApplicationStateManager.selectedTrainNumber);
        }
    }

    Connections {
        target: TrainManager
        function onTankSelectedForDetail(tankId) {
            sidebar.currentIndex = 11 // Switch to WaterTankPage (now 11)
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
            if (saved >= 0 && saved <= 11) {
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
                sidebar.currentIndex = 0; // Train Management

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
                sidebar.currentIndex = 11;
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
                sidebar.currentIndex = 1;
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
