import QtQuick
import QtQuick.Controls
import QtQuick.Window
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// Modern Responsive Industrial SCADA Top Header
// Adapts between Desktop (>= 768px) and Mobile (< 768px):
// - Desktop: [Logo] [Menu] [Title & Subtitle] [Global Search Bar] [Role] [Status] [Settings] [Logout] [Time/Date]
// - Mobile:  [Hamburger ≡] [Logo] [Page Title] [Status Pill] [Search 🔍] [Overflow ⋮]
// With mobile search drawer and overflow popup for role, settings, and logout.
// ============================================================================
Rectangle {
    id: header

    readonly property bool isMobile: header.width <= 430
    readonly property bool isTablet: header.width > 430 && header.width <= 800
    readonly property bool isDesktop: header.width > 800
    height: !header.isDesktop ? 58 : Theme.metrics.headerHeight
    color: "#FFFFFF"
    z: 100

    signal homeClicked()
    signal menuClicked()
    signal settingsClicked()
    signal alertsClicked()
    signal searchLocationSelected(real lat, real lon, string name)
    signal searchTrainSelected(string trainNumber)
    signal searchCoachSelected(int coachId, string coachNumber, string trainNumber)
    signal searchTankSelected(int tankId, string tankNumber)
    signal logoutClicked()

    property string pageTitle: "All Tanks"
    property string pageSubtitle: "Select a tank to view details"
    property bool mobileSearchVisible: false

    readonly property bool isMaximized: Window.window ? Window.window.visibility === Window.Maximized : false
    readonly property string trainState: TrainManager.trainConnectionState
    readonly property bool isTrainConnected: trainState === "Connected"
    readonly property bool isTrainConnecting: trainState === "Connecting"

    property string liveTimeStr: Qt.formatDateTime(new Date(), "h:mm:ss AP")
    property string liveDateStr: Qt.formatDateTime(new Date(), "dd MMMM yyyy")

    Timer {
        interval: 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            header.liveTimeStr = Qt.formatDateTime(new Date(), "h:mm:ss AP")
            header.liveDateStr = Qt.formatDateTime(new Date(), "dd MMMM yyyy")
        }
    }

    // Subtle bottom border
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.colors.border
        z: 2
    }

    // ========================================================================
    // MAIN HEADER ROW
    // ========================================================================
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: header.isMobile ? 12 : 16
        anchors.rightMargin: header.isMobile ? 12 : 16
        spacing: header.isMobile ? 8 : 12

        // ====================================================================
        // LEFT: Hamburger / Logo / Title
        // ====================================================================
        RowLayout {
            spacing: header.isMobile ? 8 : 10
            Layout.alignment: Qt.AlignVCenter
            Layout.fillWidth: !header.isDesktop

            // Hamburger Menu Button (Drawer toggle on mobile, sidebar collapse on desktop)
            Rectangle {
                id: hamburgerBtn
                width: header.isMobile ? 44 : 36
                height: header.isMobile ? 44 : 36
                radius: 6
                color: menuMouse.pressed ? "#DBEAFE" : (menuMouse.containsMouse ? "#EFF6FF" : "#FFFFFF")
                border.width: 1
                border.color: menuMouse.containsMouse ? Theme.colors.primary : "#DCE3EA"
                scale: menuMouse.pressed ? 0.94 : 1.0

                property bool throttled: false
                Timer {
                    id: menuThrottleTimer
                    interval: 250
                    repeat: false
                    onTriggered: hamburgerBtn.throttled = false
                }

                Column {
                    anchors.centerIn: parent
                    spacing: 4
                    Rectangle { width: 16; height: 2; radius: 1; color: menuMouse.containsMouse ? Theme.colors.primary : "#334155" }
                    Rectangle { width: 16; height: 2; radius: 1; color: menuMouse.containsMouse ? Theme.colors.primary : "#334155" }
                    Rectangle { width: 16; height: 2; radius: 1; color: menuMouse.containsMouse ? Theme.colors.primary : "#334155" }
                }

                ToolTip.visible: menuMouse.containsMouse && header.isDesktop
                ToolTip.text: "Toggle Navigation"
                ToolTip.delay: 300

                MouseArea {
                    id: menuMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        if (hamburgerBtn.throttled) return;
                        hamburgerBtn.throttled = true;
                        menuThrottleTimer.start();
                        header.menuClicked();
                    }
                }
            }

            // Panorama Icon (Clearly recognizable, preserved aspect ratio, vertically centered)
            Image {
                source: "qrc:/qt/qml/PanoramaWaterTank/resources/images/panorama_icon.png"
                Layout.preferredWidth: 32
                Layout.preferredHeight: 32
                fillMode: Image.PreserveAspectFit
            }

            // Page Title (and Subtitle on desktop)
            ColumnLayout {
                spacing: 1
                Layout.fillWidth: !header.isDesktop
                Layout.maximumWidth: !header.isDesktop ? 1000 : Math.max(160, header.width * 0.22)

                Text {
                    Layout.fillWidth: true
                    text: header.pageTitle
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: header.isMobile ? 15 : 16
                    font.weight: Font.Bold
                    elide: Text.ElideRight
                }

                Text {
                    Layout.fillWidth: true
                    text: header.pageSubtitle
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Normal
                    visible: header.isDesktop && header.pageSubtitle.length > 0
                    elide: Text.ElideRight
                }
            }
        }

        // ====================================================================
        // CENTER: GLOBAL SEARCH BAR (Desktop only)
        // ====================================================================
        Item {
            visible: header.isDesktop
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumWidth: 220

            SearchBar {
                id: globalSearch
                anchors.centerIn: parent
                width: Math.min(parent.width - 24, 440)
                height: 36

                onLocationSelected: (lat, lon, name) => header.searchLocationSelected(lat, lon, name)
                onTrainSelected: (trainNumber) => header.searchTrainSelected(trainNumber)
                onCoachSelected: (coachId, coachNumber, trainNumber) => header.searchCoachSelected(coachId, coachNumber, trainNumber)
                onTankSelected: (tankId, tankNumber) => header.searchTankSelected(tankId, tankNumber)
            }
        }

        // ====================================================================
        // RIGHT: Desktop Controls (Role, Status, Settings, Logout, Time)
        // ====================================================================
        RowLayout {
            visible: header.isDesktop
            Layout.alignment: Qt.AlignVCenter
            spacing: 8

            // Role Badge: [ADMIN] or [EMPLOYEE]
            Rectangle {
                Layout.preferredHeight: 28
                Layout.preferredWidth: roleRow.implicitWidth + 16
                radius: 4
                color: PermissionManager.isAdmin ? "#EFF6FF" : "#F1F5F9"
                border.width: 1
                border.color: PermissionManager.isAdmin ? "#BFDBFE" : "#CBD5E1"

                RowLayout {
                    id: roleRow
                    anchors.centerIn: parent
                    spacing: 4

                    Rectangle {
                        width: 6; height: 6; radius: 3
                        color: PermissionManager.isAdmin ? Theme.colors.primary : "#475569"
                    }

                    Text {
                        text: PermissionManager.isAdmin ? "ADMIN" : "EMPLOYEE"
                        color: PermissionManager.isAdmin ? Theme.colors.primary : "#1E293B"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Bold
                        font.letterSpacing: 0.8
                    }
                }
            }

            // Connection Status Pill
            Rectangle {
                Layout.preferredHeight: 28
                Layout.preferredWidth: pillContent.implicitWidth + 14
                radius: 14
                color: header.isTrainConnected ? Theme.colors.successSurface : (header.isTrainConnecting ? Theme.colors.warningSurface : Theme.colors.criticalSurface)
                border.width: 1
                border.color: header.isTrainConnected ? "#DCFCE7" : (header.isTrainConnecting ? "#FEF3C7" : "#FEE2E2")

                RowLayout {
                    id: pillContent
                    anchors.centerIn: parent
                    spacing: 5

                    Rectangle {
                        width: 6; height: 6; radius: 3
                        color: header.isTrainConnected ? Theme.colors.success : (header.isTrainConnecting ? Theme.colors.warning : Theme.colors.critical)
                    }

                    Text {
                        text: header.isTrainConnected ? "ONLINE" : (header.isTrainConnecting ? "CONNECTING" : "OFFLINE")
                        color: header.isTrainConnected ? Theme.colors.success : (header.isTrainConnecting ? Theme.colors.warning : Theme.colors.critical)
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Bold
                    }
                }
            }

            // Settings Button (Visible only if Admin)
            Rectangle {
                visible: PermissionManager.canAccessSystemSettings
                Layout.preferredWidth: 32
                Layout.preferredHeight: 32
                radius: 6
                color: setMouse.containsMouse ? "#F8FAFC" : "transparent"
                border.width: 1
                border.color: setMouse.containsMouse ? Theme.colors.border : "transparent"

                Text { anchors.centerIn: parent; text: "⚙"; font.pixelSize: 15; color: "#64748B" }
                ToolTip.visible: setMouse.containsMouse
                ToolTip.text: "System Settings (Admin)"

                MouseArea {
                    id: setMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: header.settingsClicked()
                }
            }

            // Logout Button
            Rectangle {
                Layout.preferredHeight: 28
                Layout.preferredWidth: logoutRow.implicitWidth + 16
                radius: 4
                color: logoutMouse.containsMouse ? "#FEE2E2" : "#FFFFFF"
                border.width: 1
                border.color: logoutMouse.containsMouse ? Theme.colors.critical : "#CBD5E1"

                RowLayout {
                    id: logoutRow
                    anchors.centerIn: parent
                    spacing: 4

                    Text {
                        text: "Logout"
                        color: logoutMouse.containsMouse ? Theme.colors.critical : "#475569"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                    }
                }

                MouseArea {
                    id: logoutMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        header.logoutClicked()
                        AuthManager.logout()
                    }
                }
            }

            // Vertical Divider
            Rectangle {
                Layout.preferredHeight: 20
                Layout.preferredWidth: 1
                color: Theme.colors.border
            }

            // Live Date / Time Block
            ColumnLayout {
                visible: header.width > 920
                spacing: 1

                Text {
                    text: header.liveTimeStr
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    font.weight: Font.Bold
                }

                Text {
                    visible: header.width > 1150
                    text: header.liveDateStr
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 10
                    font.weight: Font.Medium
                }
            }
        }

        // ====================================================================
        // RIGHT: Mobile & Tablet Controls (Status Pill, Tablet controls, Profile Dropdown)
        // ====================================================================
        RowLayout {
            visible: !header.isDesktop
            Layout.alignment: Qt.AlignVCenter
            spacing: header.isMobile ? 6 : 8

            // Compact Connection Pill: [LIVE]
            Rectangle {
                Layout.preferredHeight: 28
                Layout.preferredWidth: mobPillContent.implicitWidth + 14
                radius: 14
                color: header.isTrainConnected ? Theme.colors.successSurface : (header.isTrainConnecting ? Theme.colors.warningSurface : Theme.colors.criticalSurface)
                border.width: 1
                border.color: header.isTrainConnected ? "#DCFCE7" : (header.isTrainConnecting ? "#FEF3C7" : "#FEE2E2")

                RowLayout {
                    id: mobPillContent
                    anchors.centerIn: parent
                    spacing: 4

                    Rectangle {
                        width: 6; height: 6; radius: 3
                        color: header.isTrainConnected ? Theme.colors.success : (header.isTrainConnecting ? Theme.colors.warning : Theme.colors.critical)
                    }

                    Text {
                        text: header.isTrainConnected ? "LIVE" : (header.isTrainConnecting ? "SYNC" : "OFF")
                        color: header.isTrainConnected ? Theme.colors.success : (header.isTrainConnecting ? Theme.colors.warning : Theme.colors.critical)
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Bold
                    }
                }
            }

            // Tablet Search Button (Rendered only on Tablet 431px - 800px)
            Rectangle {
                visible: header.isTablet
                Layout.preferredWidth: 34
                Layout.preferredHeight: 34
                radius: 6
                color: header.mobileSearchVisible ? "#EFF6FF" : (mobSearchMouse.containsMouse ? "#F8FAFC" : "#FFFFFF")
                border.width: 1
                border.color: header.mobileSearchVisible ? Theme.colors.primary : "#CBD5E1"

                Text {
                    anchors.centerIn: parent
                    text: header.mobileSearchVisible ? "✕" : "🔍"
                    font.pixelSize: 14
                    color: header.mobileSearchVisible ? Theme.colors.primary : "#475569"
                }

                MouseArea {
                    id: mobSearchMouse
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: header.mobileSearchVisible = !header.mobileSearchVisible
                }
            }

            // Tablet Settings Button (Rendered only on Tablet 431px - 800px)
            Rectangle {
                visible: header.isTablet && PermissionManager.canAccessSystemSettings
                Layout.preferredWidth: 34
                Layout.preferredHeight: 34
                radius: 6
                color: mobSetMouse.containsMouse ? "#F8FAFC" : "#FFFFFF"
                border.width: 1
                border.color: "#CBD5E1"

                Text {
                    anchors.centerIn: parent
                    text: "⚙"
                    font.pixelSize: 15
                    color: "#475569"
                }

                MouseArea {
                    id: mobSetMouse
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: header.settingsClicked()
                }
            }

            // Responsive Profile Control: [ADM ▾] or [EMP ▾]
            Rectangle {
                id: profileBtn
                Layout.preferredHeight: 34
                Layout.preferredWidth: profileBtnRow.implicitWidth + 18
                radius: 6
                color: overflowMenuPopup.opened ? "#EFF6FF" : (profileBtnMouse.containsMouse ? "#F8FAFC" : "#FFFFFF")
                border.width: 1
                border.color: overflowMenuPopup.opened ? Theme.colors.primary : "#CBD5E1"

                RowLayout {
                    id: profileBtnRow
                    anchors.centerIn: parent
                    spacing: 4

                    Text {
                        text: PermissionManager.isAdmin ? "ADM" : "EMP"
                        color: PermissionManager.isAdmin ? Theme.colors.primary : "#1E293B"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Bold
                        font.letterSpacing: 0.5
                    }

                    Text {
                        text: "▾"
                        color: PermissionManager.isAdmin ? Theme.colors.primary : "#64748B"
                        font.pixelSize: 10
                        font.weight: Font.Bold
                    }
                }

                MouseArea {
                    id: profileBtnMouse
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: overflowMenuPopup.open()
                }

                // Profile Dropdown Menu Popup
                Popup {
                    id: overflowMenuPopup
                    x: -210 + parent.width
                    y: 38
                    width: 250
                    padding: 10
                    modal: true
                    focus: true
                    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

                    background: Rectangle {
                        color: "#FFFFFF"
                        radius: 8
                        border.width: 1
                        border.color: Theme.colors.border
                    }

                    contentItem: ColumnLayout {
                        spacing: 8
                        width: parent.width

                        // Role & User Row
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 8

                            Rectangle {
                                width: 8; height: 8; radius: 4
                                color: PermissionManager.isAdmin ? Theme.colors.primary : "#64748B"
                            }
                            ColumnLayout {
                                spacing: 1
                                Text {
                                    text: PermissionManager.isAdmin ? "ADMINISTRATOR" : "OPERATOR"
                                    color: Theme.colors.textPrimary
                                    font.pixelSize: 12
                                    font.weight: Font.Bold
                                }
                                Text {
                                    text: header.liveTimeStr
                                    color: Theme.colors.textSecondary
                                    font.pixelSize: 10
                                }
                            }
                        }

                        Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                        // On Mobile: Alerts & Notifications Action
                        Rectangle {
                            visible: header.isMobile
                            Layout.fillWidth: true
                            height: 34
                            radius: 6
                            color: popAlertMouse.containsMouse ? "#EFF6FF" : "#F8FAFC"
                            border.width: 1
                            border.color: "#E2E8F0"

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 10
                                anchors.rightMargin: 10
                                spacing: 8
                                Text { text: "🔔"; font.pixelSize: 14 }
                                Text { text: "Alerts & Notifications"; font.pixelSize: 12; color: Theme.colors.textPrimary; font.weight: Font.Medium }
                            }

                            MouseArea {
                                id: popAlertMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    overflowMenuPopup.close()
                                    header.alertsClicked()
                                }
                            }
                        }

                        // On Mobile: Settings Action
                        Rectangle {
                            visible: header.isMobile && PermissionManager.canAccessSystemSettings
                            Layout.fillWidth: true
                            height: 34
                            radius: 6
                            color: popSetMouse.containsMouse ? "#EFF6FF" : "#F8FAFC"
                            border.width: 1
                            border.color: "#E2E8F0"

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 10
                                spacing: 8
                                Text { text: "⚙"; font.pixelSize: 14; color: "#475569" }
                                Text { text: "System Settings"; font.pixelSize: 12; color: Theme.colors.textPrimary; font.weight: Font.Medium }
                            }

                            MouseArea {
                                id: popSetMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    overflowMenuPopup.close()
                                    header.settingsClicked()
                                }
                            }
                        }

                        // On Mobile: Search Action
                        Rectangle {
                            visible: header.isMobile
                            Layout.fillWidth: true
                            height: 34
                            radius: 6
                            color: popSearchMouse.containsMouse ? "#EFF6FF" : "#F8FAFC"
                            border.width: 1
                            border.color: "#E2E8F0"

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 10
                                spacing: 8
                                Text { text: "🔍"; font.pixelSize: 14 }
                                Text { text: "Search Fleet & Coaches"; font.pixelSize: 12; color: Theme.colors.textPrimary; font.weight: Font.Medium }
                            }

                            MouseArea {
                                id: popSearchMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    overflowMenuPopup.close()
                                    header.mobileSearchVisible = true
                                }
                            }
                        }

                        Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                        // Logout Action
                        Rectangle {
                            Layout.fillWidth: true
                            height: 34
                            radius: 6
                            color: popLogMouse.containsMouse ? "#FEE2E2" : "#FEF2F2"
                            border.width: 1
                            border.color: "#FEE2E2"

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 10
                                spacing: 8
                                Text { text: "🚪"; font.pixelSize: 14; color: Theme.colors.critical }
                                Text { text: "Sign Out"; font.pixelSize: 12; color: Theme.colors.critical; font.weight: Font.Bold }
                            }

                            MouseArea {
                                id: popLogMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    overflowMenuPopup.close()
                                    header.logoutClicked()
                                    AuthManager.logout()
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // MOBILE SEARCH SLIDE-DOWN DRAWER
    // ========================================================================
    Rectangle {
        id: mobileSearchDrawer
        anchors.top: parent.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        height: (header.isMobile && header.mobileSearchVisible) ? 54 : 0
        visible: height > 0
        clip: true
        color: "#F8FAFC"
        border.width: 1
        border.color: Theme.colors.border
        z: 99

        Behavior on height {
            NumberAnimation { duration: 200; easing.type: Easing.OutCubic }
        }

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            spacing: 8

            SearchBar {
                id: mobileSearch
                Layout.fillWidth: true
                Layout.preferredHeight: 36

                onLocationSelected: (lat, lon, name) => {
                    header.mobileSearchVisible = false
                    header.searchLocationSelected(lat, lon, name)
                }
                onTrainSelected: (trainNumber) => {
                    header.mobileSearchVisible = false
                    header.searchTrainSelected(trainNumber)
                }
                onCoachSelected: (coachId, coachNumber, trainNumber) => {
                    header.mobileSearchVisible = false
                    header.searchCoachSelected(coachId, coachNumber, trainNumber)
                }
                onTankSelected: (tankId, tankNumber) => {
                    header.mobileSearchVisible = false
                    header.searchTankSelected(tankId, tankNumber)
                }
            }
        }
    }
}
