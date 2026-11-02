import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// RoleSelectionView.qml — Panorama Water Tank Monitor System Access Screen
// Professional industrial SCADA desktop application access screen.
// Centered composition, compact branding, system access modules, live status.
// ============================================================================
Item {
    id: root

    signal selectAdminRole()
    signal selectUserRole()

    // Responsive helper
    readonly property bool isCompact: width < 1100 || height < 760

    Rectangle {
        anchors.fill: parent
        color: "#F7F9FC"
    }

    // Subtle entrance animation
    opacity: 0
    Component.onCompleted: entranceAnim.start()

    NumberAnimation {
        id: entranceAnim
        target: root
        property: "opacity"
        from: 0; to: 1
        duration: 200
        easing.type: Easing.OutCubic
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ====================================================================
        // 1. TOP APPLICATION HEADER (52px)
        // ====================================================================
        LandingHeader {
            Layout.fillWidth: true
            Layout.preferredHeight: 52
        }

        // ====================================================================
        // 2. MAIN CONTENT AREA — Vertically centered
        // ====================================================================
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            ColumnLayout {
                anchors.centerIn: parent
                width: Math.min(parent.width - 80, 860)
                spacing: 0

                // ============================================================
                // BRANDING SECTION
                // ============================================================
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0
                    Layout.bottomMargin: root.isCompact ? 24 : 32

                    // Water icon + Application title row
                    RowLayout {
                        spacing: 10
                        Layout.bottomMargin: 4

                        VectorIcon {
                            name: "water_drop"
                            size: 26
                            color: Theme.colors.primary
                            Layout.alignment: Qt.AlignVCenter
                        }

                        Text {
                            text: "PANORAMA WATER TANK MONITOR"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: root.isCompact ? 18 : 20
                            font.weight: Font.Bold
                            font.letterSpacing: 0.8
                            color: Theme.colors.textPrimary
                            Layout.alignment: Qt.AlignVCenter
                        }
                    }

                    // Platform descriptor
                    Text {
                        text: "Railway Water Telemetry Platform"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Medium
                        color: Theme.colors.textSecondary
                        Layout.bottomMargin: 6
                    }

                    // Short description
                    Text {
                        text: "Centralized monitoring and management of railway coach water systems."
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Normal
                        color: "#8896AB"
                    }
                }

                // ============================================================
                // SYSTEM ACCESS HEADER
                // ============================================================
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0
                    Layout.bottomMargin: root.isCompact ? 16 : 20

                    // Section label with horizontal lines
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12
                        Layout.bottomMargin: 6

                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: "#DCE5F0"
                        }

                        Text {
                            text: "SYSTEM ACCESS"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Bold
                            font.letterSpacing: 1.2
                            color: Theme.colors.primary
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: "#DCE5F0"
                        }
                    }

                    Text {
                        text: "Select your access level to continue"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Normal
                        color: Theme.colors.textSecondary
                        Layout.alignment: Qt.AlignHCenter
                    }
                }

                // ============================================================
                // DUAL ROLE SELECTION CARDS
                // ============================================================
                RowLayout {
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignHCenter
                    spacing: root.isCompact ? 16 : 20

                    // Administrator Role Card
                    RoleCard {
                        Layout.fillWidth: true
                        Layout.maximumWidth: 420
                        roleTitle: "ADMINISTRATOR"
                        roleSubtitle: "System Configuration & Control"
                        roleBadgeText: "Admin Access"
                        roleBadgeBg: "#EAF3FF"
                        roleBadgeColor: Theme.colors.primary
                        roleIcon: "settings"
                        features: [
                            { icon: "settings",  text: "Device Configuration" },
                            { icon: "network",   text: "Network & Cloud Telemetry" },
                            { icon: "shield",    text: "User Access Control" },
                            { icon: "gear",      text: "System Administration" }
                        ]
                        onClicked: root.selectAdminRole()
                    }

                    // User / Employee Role Card
                    RoleCard {
                        Layout.fillWidth: true
                        Layout.maximumWidth: 420
                        roleTitle: "USER / EMPLOYEE"
                        roleSubtitle: "Operational Monitoring"
                        roleBadgeText: "User Access"
                        roleBadgeBg: "#E7F7ED"
                        roleBadgeColor: "#149447"
                        roleIcon: "user"
                        features: [
                            { icon: "train",     text: "Train Fleet Management" },
                            { icon: "document",  text: "Coach & Consist Overview" },
                            { icon: "tank",      text: "Tank Details & Geometry" },
                            { icon: "analytics", text: "Live Telemetry & Alerts" }
                        ]
                        onClicked: root.selectUserRole()
                    }
                }

                // ============================================================
                // SYSTEM STATUS INDICATOR
                // ============================================================
                RowLayout {
                    Layout.fillWidth: true
                    Layout.topMargin: root.isCompact ? 16 : 24
                    Layout.alignment: Qt.AlignHCenter
                    spacing: 8

                    // Status dot (bound to real ApiClient state)
                    Rectangle {
                        width: 8
                        height: 8
                        radius: 4
                        color: {
                            if (typeof ApiClient === "undefined") return "#64748B";
                            switch (ApiClient.connectionStateString) {
                                case "Connected": return Theme.colors.success;
                                case "Connecting": return Theme.colors.warning;
                                case "Error": return Theme.colors.critical;
                                default: return "#64748B";
                            }
                        }
                        Layout.alignment: Qt.AlignVCenter
                    }

                    Text {
                        text: {
                            if (typeof ApiClient === "undefined") return "Monitoring Standby";
                            switch (ApiClient.connectionStateString) {
                                case "Connected": return "Services Ready";
                                case "Connecting": return "Connecting...";
                                case "Error": return "Connection Error";
                                default: return "Monitoring Standby";
                            }
                        }
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Medium
                        color: Theme.colors.textSecondary
                        Layout.alignment: Qt.AlignVCenter
                    }
                }
            }
        }

        // ====================================================================
        // 3. COMPACT CAPABILITY STRIP (44px)
        // ====================================================================
        CapabilityStrip {
            Layout.fillWidth: true
            Layout.preferredHeight: 44
        }

        // ====================================================================
        // 4. MINIMAL FOOTER (32px)
        // ====================================================================
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 32
            color: "#FFFFFF"
            z: 20

            Rectangle {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: 1
                color: "#E3E9F2"
            }

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 24
                anchors.rightMargin: 24

                Text {
                    text: "Panorama Electronics Pvt. Ltd."
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Normal
                    color: "#8896AB"
                }

                Item { Layout.fillWidth: true }

                Text {
                    text: "v2.0  |  Industrial SCADA Platform"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.Medium
                    color: "#8896AB"
                }
            }
        }
    }
}
