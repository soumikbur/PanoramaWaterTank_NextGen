import QtQuick
import QtQuick.Controls
import QtQuick.Window
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Modern Industrial SCADA Top Header
// Height ~72px, white background, subtle bottom border (#E7ECF2),
// hamburger button, draggable window title area, live connection pill,
// notification bell with red badge, settings button, live dynamic date/time,
// and window controls.
Rectangle {
    id: header

    height: Theme.metrics.headerHeight
    color: "#FFFFFF"

    signal homeClicked()
    signal menuClicked()
    signal settingsClicked()
    signal searchLocationSelected(real lat, real lon, string name)
    signal searchTrainSelected(string trainNumber)
    signal searchCoachSelected(int coachId, string coachNumber, string trainNumber)
    signal searchTankSelected(int tankId, string tankNumber)
    signal logoutClicked()

    property string pageTitle: "All Tanks"
    property string pageSubtitle: "Select a tank to view details"

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
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 16
        anchors.rightMargin: 16
        spacing: 12

        // ====================================================================
        // Left: Panorama Icon & Page Title
        // ====================================================================
        RowLayout {
            spacing: 10
            Layout.alignment: Qt.AlignVCenter

            // Small Panorama Icon
            Image {
                source: "qrc:/qt/qml/PanoramaWaterTank/resources/images/panorama_icon.png"
                Layout.preferredWidth: 26
                Layout.preferredHeight: 26
                fillMode: Image.PreserveAspectFit
            }

            Rectangle {
                id: homeBtn
                width: 34
                height: 34
                radius: 6
                color: homeMouse.pressed ? "#DBEAFE" : (homeMouse.containsMouse ? "#EFF6FF" : "#FFFFFF")
                border.width: 1
                border.color: homeMouse.containsMouse ? Theme.colors.primary : "#DCE3EA"
                scale: homeMouse.pressed ? 0.94 : 1.0

                // Vector House / Home Icon
                Shape {
                    anchors.centerIn: parent
                    width: 18
                    height: 18
                    antialiasing: true

                    ShapePath {
                        fillColor: "transparent"
                        strokeColor: homeMouse.containsMouse ? Theme.colors.primary : "#334155"
                        strokeWidth: 1.8
                        capStyle: ShapePath.RoundCap
                        joinStyle: ShapePath.RoundJoin
                        PathSvg {
                            path: "M3,9.5 L10,3 L17,9.5 L17,17.5 C17,18.05 16.55,18.5 16,18.5 L12,18.5 L12,12.5 L8,12.5 L8,18.5 L4,18.5 C3.45,18.5 3,18.05 3,17.5 Z"
                        }
                    }
                }

                ToolTip.visible: homeMouse.containsMouse
                ToolTip.text: "Train Management"
                ToolTip.delay: 300

                MouseArea {
                    id: homeMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        header.homeClicked()
                        header.menuClicked()
                    }
                }
            }

            ColumnLayout {
                spacing: 1
                Layout.maximumWidth: Math.max(160, header.width * 0.22)

                Text {
                    Layout.fillWidth: true
                    text: header.pageTitle
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 16
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
                    visible: header.pageSubtitle.length > 0
                    elide: Text.ElideRight
                }
            }
        }

        // ====================================================================
        // Center: GLOBAL SEARCH BAR
        // ====================================================================
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumWidth: 260

            SearchBar {
                id: globalSearch
                anchors.centerIn: parent
                width: Math.min(parent.width - 24, 440)
                height: 36

                onLocationSelected: (lat, lon, name) => {
                    header.searchLocationSelected(lat, lon, name)
                }
                onTrainSelected: (trainNumber) => {
                    header.searchTrainSelected(trainNumber)
                }
                onCoachSelected: (coachId, coachNumber, trainNumber) => {
                    header.searchCoachSelected(coachId, coachNumber, trainNumber)
                }
                onTankSelected: (tankId, tankNumber) => {
                    header.searchTankSelected(tankId, tankNumber)
                }
            }
        }

        // ====================================================================
        // Right: Role Badge, User Info, Connection, Logout, Window Controls
        // ====================================================================
        RowLayout {
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
    }
}
