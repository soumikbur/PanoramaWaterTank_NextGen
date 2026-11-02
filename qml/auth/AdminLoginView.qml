import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window
import PanoramaWaterTank

// ============================================================================
// AdminLoginView.qml — Dedicated Administrator Authentication Screen
// Strict security: NO change password option, masked input, clear feedback.
// ============================================================================
Item {
    id: root

    signal backRequested()
    signal loginSuccess()

    Rectangle {
        anchors.fill: parent
        color: "#F8FAFC"
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // Window Titlebar
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 38
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 16
                anchors.rightMargin: 16
                spacing: 10

                Image {
                    source: "qrc:/qt/qml/PanoramaWaterTank/resources/images/panorama_icon.png"
                    Layout.preferredWidth: 20
                    Layout.preferredHeight: 20
                    fillMode: Image.PreserveAspectFit
                }

                Text {
                    text: "Panorama Water Tank Monitor — Administrator Access"
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 12
                    font.weight: Font.DemiBold
                }

                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                }
            }
        }

        // Main Login Card
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Rectangle {
                anchors.centerIn: parent
                width: 420
                height: 480
                radius: 12
                color: "#FFFFFF"
                border.width: 1
                border.color: "#E2E8F0"

                Rectangle {
                    z: -1
                    anchors.fill: parent
                    anchors.margins: -1
                    radius: 13
                    color: "#0A000000"
                }

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 36
                    spacing: 16

                    // Back button
                    RowLayout {
                        spacing: 6
                        Rectangle {
                            width: 30; height: 30; radius: 6
                            color: backMouse.containsMouse ? "#F1F5F9" : "transparent"
                            Text { anchors.centerIn: parent; text: "←"; font.pixelSize: 16; color: "#64748B" }
                            MouseArea {
                                id: backMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    passwordField.text = ""
                                    AuthManager.clearError()
                                    root.backRequested()
                                }
                            }
                        }
                        Text {
                            text: "Back to Role Selection"
                            color: "#64748B"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            font.weight: Font.Medium
                        }
                    }

                    // Panorama Logo
                    Image {
                        source: "qrc:/qt/qml/PanoramaWaterTank/resources/images/panorama_logo.png"
                        Layout.preferredWidth: 200
                        Layout.preferredHeight: 54
                        fillMode: Image.PreserveAspectFit
                        Layout.alignment: Qt.AlignHCenter
                    }

                    Text {
                        text: "Administrator Access"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 20
                        font.weight: Font.Bold
                        Layout.alignment: Qt.AlignHCenter
                    }

                    Text {
                        text: "Enter senior personnel administrative credential"
                        color: "#64748B"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        horizontalAlignment: Text.AlignHCenter
                        Layout.alignment: Qt.AlignHCenter
                        Layout.fillWidth: true
                    }

                    // Error Banner
                    Rectangle {
                        visible: AuthManager.errorMessage.length > 0
                        Layout.fillWidth: true
                        Layout.preferredHeight: errorText.implicitHeight + 16
                        radius: 6
                        color: "#FEF2F2"
                        border.width: 1
                        border.color: "#FECACA"

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 8
                            spacing: 8
                            Text { text: "⚠"; color: Theme.colors.critical; font.pixelSize: 14 }
                            Text {
                                id: errorText
                                text: AuthManager.errorMessage
                                color: Theme.colors.critical
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.DemiBold
                                wrapMode: Text.Wrap
                                Layout.fillWidth: true
                            }
                        }
                    }

                    // Password Label & Field
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 6

                        Text {
                            text: "Administrator Password"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            font.weight: Font.DemiBold
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 42
                            radius: 6
                            color: "#F8FAFC"
                            border.width: passwordField.activeFocus ? 1.8 : 1
                            border.color: passwordField.activeFocus ? Theme.colors.primary : "#CBD5E1"

                            TextInput {
                                id: passwordField
                                anchors.fill: parent
                                anchors.leftMargin: 12
                                anchors.rightMargin: 12
                                verticalAlignment: TextInput.AlignVCenter
                                echoMode: TextInput.Password
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                color: Theme.colors.textPrimary
                                selectByMouse: true
                                onAccepted: loginBtnAction()
                            }
                        }
                    }

                    Item { Layout.fillHeight: true }

                    // Login Button (Panorama Blue)
                    Rectangle {
                        id: loginBtn
                        Layout.fillWidth: true
                        Layout.preferredHeight: 44
                        radius: 6
                        color: loginMouse.pressed ? Theme.colors.primaryPressed : (loginMouse.containsMouse ? Theme.colors.primaryHover : Theme.colors.primary)
                        scale: loginMouse.pressed ? 0.98 : 1.0

                        Behavior on color { ColorAnimation { duration: 120 } }
                        Behavior on scale { NumberAnimation { duration: 80 } }

                        Text {
                            anchors.centerIn: parent
                            text: "Login to System"
                            color: "#FFFFFF"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                            font.weight: Font.Bold
                        }

                        MouseArea {
                            id: loginMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: loginBtnAction()
                        }
                    }
                }
            }
        }
    }

    function loginBtnAction() {
        if (AuthManager.loginAdmin(passwordField.text)) {
            passwordField.text = ""
            root.loginSuccess()
        }
    }
}
