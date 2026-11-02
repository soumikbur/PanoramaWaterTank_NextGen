import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// Single sidebar navigation item: 48-52px height, 24px icon, 16px text.
// Modern SCADA-style styling with soft light blue active state (#EFF6FF),
// rounded rectangular clickable area (10-12px radius), smooth hover states,
// and a 3px blue left-border accent strip on the active item (per reference spec).
Rectangle {
    id: root

    property string label: ""
    property string iconGlyph: "dashboard" // dashboard | tank | devices | alerts | history | reports | settings | config | users | logs
    property bool active: false
    property bool collapsed: false
    property int badgeCount: 0

    signal clicked()

    Layout.fillWidth: true
    Layout.preferredHeight: 38
    radius: 6

    color: active ? Theme.colors.primarySurface
        : (hoverHandler.hovered ? "#F8FAFC" : "transparent")

    scale: tapHandler.pressed ? 0.98 : 1.0

    Behavior on color {
        ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
    }

    Behavior on scale {
        NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad }
    }

    HoverHandler {
        id: hoverHandler
        cursorShape: Qt.PointingHandCursor
    }

    TapHandler {
        id: tapHandler
        onTapped: root.clicked()
    }

    ToolTip.visible: root.collapsed && hoverHandler.hovered
    ToolTip.text: root.label
    ToolTip.delay: 200

    // Subtle blue active indicator on the left edge
    Rectangle {
        id: activeIndicator
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        width: 3
        height: root.active ? 20 : 0
        radius: 1.5
        color: Theme.colors.primary
        opacity: root.active ? 1.0 : 0.0

        Behavior on height {
            NumberAnimation { duration: Theme.animSidebar; easing.type: Easing.OutQuad }
        }
        Behavior on opacity {
            NumberAnimation { duration: Theme.animSidebar; easing.type: Easing.OutQuad }
        }
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: root.collapsed ? 0 : 12
        anchors.rightMargin: root.collapsed ? 0 : 12
        spacing: root.collapsed ? 0 : 10

        Item {
            id: iconArea
            Layout.preferredWidth: 20
            Layout.preferredHeight: 20
            Layout.alignment: root.collapsed ? Qt.AlignCenter : Qt.AlignVCenter

            readonly property color tint: root.active ? Theme.colors.primary : Theme.colors.textSecondary
            readonly property real strokeWidth: 1.8

            // Train Selection: Locomotive front silhouette
            Item {
                anchors.centerIn: parent
                width: 18
                height: 18
                visible: root.iconGlyph === "train" || root.iconGlyph === "train-selection"

                Rectangle {
                    x: 2; y: 1
                    width: 14; height: 13
                    radius: 3
                    color: "transparent"
                    border.width: iconArea.strokeWidth
                    border.color: iconArea.tint
                }
                // Windshield
                Rectangle {
                    x: 4.5; y: 3
                    width: 9; height: 3.5
                    radius: 1
                    color: "transparent"
                    border.width: 1.2
                    border.color: iconArea.tint
                }
                // Dual headlights
                Rectangle {
                    x: 4.5; y: 9.5
                    width: 2.5; height: 2.5
                    radius: 1.25
                    color: iconArea.tint
                }
                Rectangle {
                    x: 11; y: 9.5
                    width: 2.5; height: 2.5
                    radius: 1.25
                    color: iconArea.tint
                }
                // Track rail base
                Rectangle {
                    x: 1; y: 16
                    width: 16; height: 1.5
                    radius: 0.75
                    color: iconArea.tint
                }
            }

            // 0. All Tanks: 3x2 grid of tank cards
            Grid {
                anchors.centerIn: parent
                visible: root.iconGlyph === "all-tanks"
                columns: 3
                spacing: 2.5
                Repeater {
                    model: 6
                    delegate: Rectangle {
                        width: 5
                        height: 6
                        radius: 1.2
                        color: iconArea.tint
                    }
                }
            }

            // 1. Dashboard: 2x2 grid of rounded squares
            Grid {
                anchors.centerIn: parent
                visible: root.iconGlyph === "dashboard"
                columns: 2
                spacing: 3
                Repeater {
                    model: 4
                    delegate: Rectangle {
                        width: 7.5
                        height: 7.5
                        radius: 2
                        color: iconArea.tint
                    }
                }
            }

            // Location: Map pin navigation marker
            Item {
                anchors.centerIn: parent
                width: 18
                height: 18
                visible: root.iconGlyph === "location"

                Shape {
                    anchors.centerIn: parent
                    width: 16
                    height: 18
                    antialiasing: true

                    ShapePath {
                        fillColor: "transparent"
                        strokeColor: iconArea.tint
                        strokeWidth: iconArea.strokeWidth
                        capStyle: ShapePath.RoundCap
                        joinStyle: ShapePath.RoundJoin
                        PathSvg {
                            path: "M8,1 C4.7,1 2,3.7 2,7 C2,11.5 8,17 8,17 C8,17 14,11.5 14,7 C14,3.7 11.3,1 8,1 Z"
                        }
                    }
                }
                Rectangle {
                    anchors.centerIn: parent
                    anchors.verticalCenterOffset: -2
                    width: 4
                    height: 4
                    radius: 2
                    color: iconArea.tint
                }
            }

            // 2. Water Tank: Cylinder/tank outline
            Item {
                anchors.centerIn: parent
                width: 18
                height: 18
                visible: root.iconGlyph === "tank"

                Rectangle {
                    anchors.centerIn: parent
                    width: 16
                    height: 16
                    radius: 3
                    color: "transparent"
                    border.width: iconArea.strokeWidth
                    border.color: iconArea.tint
                }
                Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    y: 7
                    width: 12
                    height: 1.5
                    color: iconArea.tint
                }
            }

            // 3. Devices: Router/sensor icon
            Item {
                anchors.centerIn: parent
                width: 18
                height: 18
                visible: root.iconGlyph === "devices"

                Rectangle {
                    anchors.bottom: parent.bottom
                    anchors.bottomMargin: 2
                    width: 18
                    height: 8
                    radius: 2
                    color: "transparent"
                    border.width: iconArea.strokeWidth
                    border.color: iconArea.tint
                }
                Rectangle {
                    x: 4
                    y: 1
                    width: iconArea.strokeWidth
                    height: 7
                    color: iconArea.tint
                }
                Rectangle {
                    x: 12
                    y: 1
                    width: iconArea.strokeWidth
                    height: 7
                    color: iconArea.tint
                }
            }

            // 4. Alerts: Bell icon
            Item {
                anchors.centerIn: parent
                width: 18
                height: 18
                visible: root.iconGlyph === "alerts"

                Rectangle {
                    anchors.top: parent.top
                    anchors.topMargin: 2
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 14
                    height: 11
                    radius: 4
                    color: "transparent"
                    border.width: iconArea.strokeWidth
                    border.color: iconArea.tint
                }
                Rectangle {
                    anchors.bottom: parent.bottom
                    anchors.bottomMargin: 2
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 18
                    height: iconArea.strokeWidth
                    color: iconArea.tint
                }
                Rectangle {
                    anchors.bottom: parent.bottom
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 4
                    height: 2.5
                    radius: 1.2
                    color: iconArea.tint
                }
            }

            // 5. History: Clock / rewind icon
            Item {
                anchors.centerIn: parent
                width: 18
                height: 18
                visible: root.iconGlyph === "history" || root.iconGlyph === "logs"

                Rectangle {
                    anchors.fill: parent
                    radius: 9
                    color: "transparent"
                    border.width: iconArea.strokeWidth
                    border.color: iconArea.tint
                }
                Rectangle {
                    x: 8
                    y: 4
                    width: iconArea.strokeWidth
                    height: 6
                    radius: 1
                    color: iconArea.tint
                }
                Rectangle {
                    x: 8
                    y: 8
                    width: 5
                    height: iconArea.strokeWidth
                    radius: 1
                    color: iconArea.tint
                }
            }

            // 6. Reports: Document / chart icon
            Item {
                anchors.centerIn: parent
                width: 18
                height: 18
                visible: root.iconGlyph === "reports"

                Rectangle {
                    anchors.fill: parent
                    radius: 2
                    color: "transparent"
                    border.width: iconArea.strokeWidth
                    border.color: iconArea.tint
                }
                Rectangle {
                    x: 3; y: 5; width: 10; height: 1.5; color: iconArea.tint
                }
                Rectangle {
                    x: 3; y: 9; width: 8; height: 1.5; color: iconArea.tint
                }
                Rectangle {
                    x: 3; y: 13; width: 11; height: 1.5; color: iconArea.tint
                }
            }

            // 7. Settings / Config: Gear icon
            Item {
                id: settingsIcon
                anchors.centerIn: parent
                width: 18
                height: 18
                visible: root.iconGlyph === "settings" || root.iconGlyph === "config"

                Rectangle {
                    anchors.centerIn: parent
                    width: 10
                    height: 10
                    radius: 5
                    color: "transparent"
                    border.width: iconArea.strokeWidth
                    border.color: iconArea.tint
                }
                Repeater {
                    model: 6
                    delegate: Rectangle {
                        required property int index
                        readonly property real angle: index * (Math.PI / 3)
                        width: 2.2
                        height: 3.5
                        radius: 1
                        color: iconArea.tint
                        x: settingsIcon.width / 2 - width / 2 + Math.cos(angle) * (settingsIcon.width / 2 - 2)
                        y: settingsIcon.height / 2 - height / 2 + Math.sin(angle) * (settingsIcon.height / 2 - 2)
                    }
                }
            }

            // 8. Users: User profile icon
            Item {
                anchors.centerIn: parent
                width: 18
                height: 18
                visible: root.iconGlyph === "users"

                Rectangle {
                    anchors.top: parent.top
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 8
                    height: 8
                    radius: 4
                    color: "transparent"
                    border.width: iconArea.strokeWidth
                    border.color: iconArea.tint
                }
                Rectangle {
                    anchors.bottom: parent.bottom
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 16
                    height: 7
                    radius: 3
                    color: "transparent"
                    border.width: iconArea.strokeWidth
                    border.color: iconArea.tint
                }
            }
        }

        Text {
            Layout.fillWidth: true
            text: root.label
            color: root.active ? Theme.colors.primary : Theme.colors.textPrimary
            font.family: Theme.typography.fontFamily
            font.pixelSize: 13
            font.weight: root.active ? Font.DemiBold : Font.Medium
            elide: Text.ElideRight
            visible: !root.collapsed
        }

        // Circular Red Notification Badge (expanded mode)
        Rectangle {
            Layout.preferredWidth: 18
            Layout.preferredHeight: 18
            radius: 9
            color: Theme.colors.critical
            visible: !root.collapsed && root.badgeCount > 0

            Text {
                anchors.centerIn: parent
                text: root.badgeCount.toString()
                color: "#FFFFFF"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 11
                font.weight: Font.Bold
            }
        }

        // Compact notification dot over icon when collapsed
        Rectangle {
            parent: iconArea
            anchors.top: iconArea.top
            anchors.right: iconArea.right
            anchors.topMargin: -2
            anchors.rightMargin: -3
            width: 7
            height: 7
            radius: 3.5
            color: Theme.colors.critical
            border.width: 1
            border.color: "#FFFFFF"
            visible: root.collapsed && root.badgeCount > 0
        }
    }
}
