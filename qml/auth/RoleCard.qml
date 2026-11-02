import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// RoleCard.qml — System Access Module (Industrial SCADA Style)
// Compact card with left accent border, concise feature list,
// and auto-width action button. Not a pricing card.
// ============================================================================
Rectangle {
    id: root

    property string roleTitle: "ADMINISTRATOR"
    property string roleSubtitle: "System Configuration & Control"
    property string roleBadgeText: "Admin Access"   // kept for API compat
    property color roleBadgeBg: "#EAF3FF"            // kept for API compat
    property color roleBadgeColor: "#246BEB"
    property string roleIcon: "settings"
    property var features: []

    signal clicked()

    implicitWidth: 380
    implicitHeight: 330
    radius: 8
    color: "#FFFFFF"
    border.width: 1
    border.color: cardMouseArea.containsMouse ? Theme.colors.primary : "#DCE5F0"

    Behavior on border.color { ColorAnimation { duration: Theme.animHover } }

    // Left accent bar (3px)
    Rectangle {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.topMargin: 1
        anchors.bottomMargin: 1
        width: 3
        radius: 2
        color: root.roleBadgeColor
    }

    // Subtle shadow
    Rectangle {
        anchors.fill: parent
        anchors.topMargin: 3
        z: -1
        radius: 8
        color: "#0F172A"
        opacity: cardMouseArea.containsMouse ? 0.05 : 0.02
        Behavior on opacity { NumberAnimation { duration: Theme.animHover } }
    }

    MouseArea {
        id: cardMouseArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.clicked()
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.leftMargin: 24
        anchors.rightMargin: 20
        anchors.topMargin: 20
        anchors.bottomMargin: 20
        spacing: 0

        // ----------------------------------------------------------------
        // Top: Icon + Role Title
        // ----------------------------------------------------------------
        RowLayout {
            Layout.fillWidth: true
            Layout.bottomMargin: 4
            spacing: 10

            Rectangle {
                width: 32
                height: 32
                radius: 6
                color: Qt.alpha(root.roleBadgeColor, 0.08)

                VectorIcon {
                    anchors.centerIn: parent
                    name: root.roleIcon
                    size: 18
                    color: root.roleBadgeColor
                }
            }

            Text {
                text: root.roleTitle
                font.family: Theme.typography.fontFamily
                font.pixelSize: 17
                font.weight: Font.Bold
                font.letterSpacing: 0.6
                color: Theme.colors.textPrimary
                Layout.fillWidth: true
            }
        }

        // Subtitle
        Text {
            text: root.roleSubtitle
            font.family: Theme.typography.fontFamily
            font.pixelSize: 13
            font.weight: Font.Normal
            color: Theme.colors.textSecondary
            Layout.bottomMargin: 12
        }

        // Separator
        Rectangle {
            Layout.fillWidth: true
            height: 1
            color: "#E3E9F2"
            Layout.bottomMargin: 10
        }

        // ----------------------------------------------------------------
        // Feature List (4 rows × 34px)
        // ----------------------------------------------------------------
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 0
            Layout.bottomMargin: 8

            Repeater {
                model: root.features
                delegate: RowLayout {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 34
                    spacing: 10

                    VectorIcon {
                        name: modelData.icon || "check"
                        size: 16
                        color: root.roleBadgeColor
                        Layout.alignment: Qt.AlignVCenter
                    }

                    Text {
                        text: modelData.text || ""
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Medium
                        color: Theme.colors.textPrimary
                        Layout.fillWidth: true
                        Layout.alignment: Qt.AlignVCenter
                        elide: Text.ElideRight
                    }
                }
            }
        }

        Item { Layout.fillHeight: true }

        // ----------------------------------------------------------------
        // Compact Action Button: "Continue →"
        // ----------------------------------------------------------------
        Rectangle {
            id: actionBtn
            Layout.preferredWidth: btnContent.implicitWidth + 32
            Layout.preferredHeight: 36
            radius: 6
            color: btnMouse.pressed
                   ? Qt.darker(root.roleBadgeColor, 1.2)
                   : (btnMouse.containsMouse ? Qt.lighter(root.roleBadgeColor, 1.1) : root.roleBadgeColor)

            scale: btnMouse.pressed ? 0.98 : 1.0
            Behavior on scale { NumberAnimation { duration: Theme.animMicro } }
            Behavior on color { ColorAnimation { duration: Theme.animHover } }

            RowLayout {
                id: btnContent
                anchors.centerIn: parent
                spacing: 6

                Text {
                    text: "Continue"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                    color: "#FFFFFF"
                }

                VectorIcon {
                    name: "arrow_right"
                    size: 14
                    color: "#FFFFFF"
                    Layout.alignment: Qt.AlignVCenter
                }
            }

            MouseArea {
                id: btnMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.clicked()
            }
        }
    }
}
