import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// Users Page (Part 12)
// Clean role-based operator and access control view for the local SCADA station.
Item {
    id: root

    property string searchQuery: ""
    property string roleFilter: "All"
    property var allUsers: AuthManager.users

    Component.onCompleted: {
        root.allUsers = AuthManager.users
    }

    onVisibleChanged: {
        if (visible) {
            root.allUsers = AuthManager.users
        }
    }

    Connections {
        target: AuthManager
        function onUsersChanged() {
            root.allUsers = AuthManager.users
        }
    }

    readonly property var filteredUserList: {
        var list = root.allUsers || []
        if (!root.searchQuery || root.searchQuery.trim() === "") return list
        var q = root.searchQuery.toLowerCase().trim()
        var res = []
        for (var i = 0; i < list.length; i++) {
            var u = list[i]
            var nameMatch = u.name && u.name.toLowerCase().indexOf(q) !== -1
            var unameMatch = u.username && u.username.toLowerCase().indexOf(q) !== -1
            var roleMatch = u.role && u.role.toLowerCase().indexOf(q) !== -1
            if (nameMatch || unameMatch || roleMatch) {
                res.push(u)
            }
        }
        return res
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: mainCol.implicitHeight + 40
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        ColumnLayout {
            id: mainCol
            width: parent.width - 36
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: 20
            spacing: 16

            // ================================================================
            // 1. Page Header
            // ================================================================
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2

                Text {
                    text: "Users"
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 24
                    font.weight: Font.Bold
                }

                Text {
                    text: "System access control, operator profiles, and station permissions"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 14
                }
            }

            // Local Station Information Banner
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 40
                radius: 8
                color: Theme.colors.primarySurface
                border.width: 1
                border.color: "#DBEAFE"

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 10
                    spacing: 10

                    Text { text: "ℹ️"; font.pixelSize: 13 }
                    Text {
                        Layout.fillWidth: true
                        text: "Local SCADA Station Mode: Operating with local workstation credentials. Maximum 10 employee/operator accounts allowed."
                        color: Theme.colors.primary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                    }
                }
            }

            // ================================================================
            // 2. Summary Metric Cards
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                columns: root.width < 760 ? 2 : 4
                rowSpacing: 12
                columnSpacing: 12

                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 2
                        Text { text: "TOTAL USERS"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: "" + (root.allUsers ? root.allUsers.length : (AuthManager.operatorCount + 1)); color: Theme.colors.textPrimary; font.pixelSize: 22; font.weight: Font.Bold }
                        Text { text: "Configured accounts"; color: Theme.colors.textSecondary; font.pixelSize: 11 }
                    }
                }

                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 2
                        Text { text: "ACTIVE SESSIONS"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: AuthManager.isAuthenticated ? "1" : "0"; color: Theme.colors.success; font.pixelSize: 22; font.weight: Font.Bold }
                        Text { text: AuthManager.currentUserName ? ("Signed in as @" + AuthManager.currentUserName) : "No active session"; color: Theme.colors.textSecondary; font.pixelSize: 11; elide: Text.ElideRight }
                    }
                }

                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 2
                        Text { text: "ADMINISTRATORS"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text { text: "1"; color: Theme.colors.primary; font.pixelSize: 22; font.weight: Font.Bold }
                        Text { text: "Fixed credential (123)"; color: Theme.colors.textSecondary; font.pixelSize: 11 }
                    }
                }

                BaseCard {
                    Layout.fillWidth: true
                    padding: 14
                    ColumnLayout {
                        spacing: 2
                        Text { text: "OPERATORS / EMPLOYEES"; color: Theme.colors.textSecondary; font.pixelSize: 10; font.weight: Font.Bold }
                        Text {
                            text: AuthManager.operatorCount + " / 10"
                            color: AuthManager.operatorCount >= 10 ? Theme.colors.warning : Theme.colors.textPrimary
                            font.pixelSize: 22
                            font.weight: Font.Bold
                        }
                        Text {
                            text: AuthManager.operatorCount >= 10 ? "Maximum limit reached (10/10)" : "Configured accounts"
                            color: AuthManager.operatorCount >= 10 ? Theme.colors.warning : Theme.colors.textSecondary
                            font.pixelSize: 11
                        }
                    }
                }
            }

            // ================================================================
            // 3. User Table Card
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 18

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    // Table Header Controls
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        ColumnLayout {
                            spacing: 2
                            Text {
                                text: "User Accounts"
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 15
                                font.weight: Font.Bold
                            }
                            RowLayout {
                                spacing: 6
                                Text {
                                    text: "Users: " + AuthManager.operatorCount + " / 10"
                                    color: AuthManager.operatorCount >= 10 ? Theme.colors.warning : Theme.colors.textSecondary
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: AuthManager.operatorCount >= 10 ? Font.DemiBold : Font.Normal
                                }
                                Rectangle {
                                    visible: AuthManager.operatorCount >= 10
                                    height: 18
                                    width: maxBadgeText.implicitWidth + 8
                                    radius: 4
                                    color: "#FEF3C7"
                                    border.width: 1
                                    border.color: "#FCD34D"
                                    Text {
                                        id: maxBadgeText
                                        anchors.centerIn: parent
                                        text: "Limit Reached"
                                        color: "#B45309"
                                        font.pixelSize: 10
                                        font.weight: Font.Bold
                                    }
                                }
                            }
                        }

                        Item { Layout.fillWidth: true }

                        // Search Input
                        StyledTextField {
                            Layout.preferredWidth: 200
                            Layout.preferredHeight: 34
                            placeholderText: "Search users..."
                            text: root.searchQuery
                            onTextChanged: root.searchQuery = text
                        }

                        // + Add User Button
                        StyledButton {
                            id: addUserBtn
                            visible: PermissionManager.isAdmin
                            text: "+ Add User"
                            variant: "primary"
                            enabled: AuthManager.operatorCount < 10
                            opacity: enabled ? 1.0 : 0.6
                            onClicked: {
                                if (AuthManager.operatorCount >= 10) return;
                                addUserDialog.resetAndOpen();
                            }
                        }
                    }

                    // Limit Warning Banner
                    Rectangle {
                        visible: AuthManager.operatorCount >= 10
                        Layout.fillWidth: true
                        Layout.preferredHeight: 36
                        radius: 6
                        color: "#FFFBEB"
                        border.width: 1
                        border.color: "#FDE68A"

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 8
                            spacing: 8
                            Text { text: "⚠️"; font.pixelSize: 12 }
                            Text {
                                Layout.fillWidth: true
                                text: "Maximum 10 employee/operator accounts reached. You cannot add an 11th operator without removing an existing account."
                                color: "#92400E"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: Font.Medium
                            }
                        }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                    // Table Column Headers
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12
                        Text { Layout.preferredWidth: 200; text: "USER"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.preferredWidth: 120; text: "ROLE"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.preferredWidth: 90; text: "STATUS"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.fillWidth: true; text: "LAST ACTIVE"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        Text { Layout.preferredWidth: 80; text: "ACTION"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold; horizontalAlignment: Text.AlignHCenter }
                    }

                    Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                    // Table User Rows
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 10

                        Repeater {
                            model: root.filteredUserList

                            delegate: RowLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                spacing: 12

                                // User Avatar + Name + Username
                                RowLayout {
                                    Layout.preferredWidth: 200
                                    spacing: 10

                                    Rectangle {
                                        width: 32; height: 32; radius: 16
                                        color: modelData.role === "Administrator" ? Theme.colors.primarySurface : "#F1F5F9"
                                        border.width: 1
                                        border.color: modelData.role === "Administrator" ? "#DBEAFE" : "#E2E8F0"

                                        Text {
                                            anchors.centerIn: parent
                                            text: modelData.initial || (modelData.name ? modelData.name.charAt(0).toUpperCase() : "U")
                                            color: modelData.role === "Administrator" ? Theme.colors.primary : Theme.colors.textPrimary
                                            font.pixelSize: 13
                                            font.weight: Font.Bold
                                        }
                                    }

                                    ColumnLayout {
                                        spacing: 1
                                        Text {
                                            text: modelData.name || modelData.username
                                            color: Theme.colors.textPrimary
                                            font.pixelSize: 13
                                            font.weight: Font.DemiBold
                                            elide: Text.ElideRight
                                        }
                                        Text {
                                            text: "@" + modelData.username
                                            color: Theme.colors.textSecondary
                                            font.pixelSize: 11
                                            elide: Text.ElideRight
                                        }
                                    }
                                }

                                // Role Badge
                                Rectangle {
                                    Layout.preferredWidth: 120
                                    Layout.preferredHeight: 24
                                    radius: 6
                                    color: modelData.role === "Administrator" ? "#EFF6FF" : "#F8FAFC"
                                    border.width: 1
                                    border.color: modelData.role === "Administrator" ? "#BFDBFE" : Theme.colors.border

                                    Text {
                                        anchors.centerIn: parent
                                        text: modelData.role || "Operator"
                                        color: modelData.role === "Administrator" ? Theme.colors.primary : Theme.colors.textSecondary
                                        font.pixelSize: 11
                                        font.weight: Font.Medium
                                        elide: Text.ElideRight
                                    }
                                }

                                // Status
                                Rectangle {
                                    Layout.preferredWidth: 90
                                    Layout.preferredHeight: 22
                                    radius: 11
                                    color: modelData.status === "Active" ? Theme.colors.successSurface : "#F1F5F9"

                                    Text {
                                        anchors.centerIn: parent
                                        text: modelData.status || "Active"
                                        color: modelData.status === "Active" ? Theme.colors.success : Theme.colors.textSecondary
                                        font.pixelSize: 10
                                        font.weight: Font.Bold
                                    }
                                }

                                // Last Active
                                Text {
                                    Layout.fillWidth: true
                                    text: modelData.lastActive || "Active"
                                    color: Theme.colors.textSecondary
                                    font.pixelSize: 12
                                }

                                // Action Column: Remove Button
                                Item {
                                    Layout.preferredWidth: 80
                                    Layout.preferredHeight: 30

                                    StyledButton {
                                        anchors.centerIn: parent
                                        visible: modelData.role !== "Administrator" && modelData.username !== "admin" && PermissionManager.isAdmin
                                        text: "Remove"
                                        variant: "danger"
                                        implicitHeight: 28
                                        implicitWidth: 72
                                        onClicked: {
                                            confirmRemoveDialog.targetUsername = modelData.username
                                            confirmRemoveDialog.targetDisplayName = modelData.name || modelData.username
                                            confirmRemoveDialog.open()
                                        }
                                    }

                                    Text {
                                        anchors.centerIn: parent
                                        visible: modelData.role === "Administrator" || modelData.username === "admin"
                                        text: "Protected"
                                        color: Theme.colors.textSecondary
                                        font.pixelSize: 11
                                        font.italic: true
                                    }
                                }
                            }
                        }

                        // Zero-State Display
                        ColumnLayout {
                            Layout.fillWidth: true
                            Layout.topMargin: 20
                            Layout.bottomMargin: 20
                            visible: root.filteredUserList.length === 0
                            spacing: 8

                            Text {
                                Layout.alignment: Qt.AlignHCenter
                                text: root.searchQuery ? "No matching users found" : "No employee/operator accounts"
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.Bold
                            }

                            Text {
                                Layout.alignment: Qt.AlignHCenter
                                text: root.searchQuery ? "Try a different search query" : "Click '+ Add User' to create an operator account."
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                        }
                    }
                }
            }

            // ================================================================
            // 4. Change User / Employee Password Card (Admin only)
            // ================================================================
            BaseCard {
                visible: PermissionManager.isAdmin
                Layout.fillWidth: true
                padding: 18

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 16

                    ColumnLayout {
                        spacing: 4
                        Text {
                            text: "Change User Password"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 16
                            font.weight: Font.Bold
                        }
                        Text {
                            text: "Update credentials for railway operator / employee accounts. Administrator password is fixed ('123') and cannot be modified."
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }

                    // Status feedback banner
                    Rectangle {
                        id: feedbackBanner
                        visible: feedbackText.text.length > 0
                        Layout.fillWidth: true
                        Layout.preferredHeight: feedbackText.implicitHeight + 16
                        radius: 6
                        color: isFeedbackError ? "#FEF2F2" : "#F0FDF4"
                        border.width: 1
                        border.color: isFeedbackError ? "#FECACA" : "#BBF7D0"

                        property bool isFeedbackError: false

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 10
                            spacing: 8
                            Text {
                                text: feedbackBanner.isFeedbackError ? "⚠" : "✓"
                                color: feedbackBanner.isFeedbackError ? Theme.colors.critical : Theme.colors.success
                                font.pixelSize: 14
                            }
                            Text {
                                id: feedbackText
                                Layout.fillWidth: true
                                text: ""
                                color: feedbackBanner.isFeedbackError ? Theme.colors.critical : "#15803D"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: Font.DemiBold
                                wrapMode: Text.Wrap
                            }
                        }
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: 2
                        columnSpacing: 16
                        rowSpacing: 14

                        Label {
                            text: "Target User"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: Font.Medium
                        }
                        StyledComboBox {
                            id: targetUserCombo
                            Layout.fillWidth: true
                            model: {
                                var names = []
                                var ulist = root.allUsers || []
                                for (var i = 0; i < ulist.length; i++) {
                                    if (ulist[i].username !== "admin") {
                                        names.push(ulist[i].username)
                                    }
                                }
                                if (names.length === 0) names.push("employee")
                                return names
                            }
                        }

                        Label {
                            text: "New User Password"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: Font.Medium
                        }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 8
                            StyledTextField {
                                id: newPasswordField
                                Layout.fillWidth: true
                                placeholderText: "Enter new user password"
                                echoMode: showNewPwdBtn.checked ? TextInput.Normal : TextInput.Password
                            }
                            StyledButton {
                                id: showNewPwdBtn
                                checkable: true
                                text: checked ? "Hide" : "Show"
                                Layout.preferredWidth: 65
                                variant: "secondary"
                            }
                        }

                        Label {
                            text: "Confirm User Password"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: Font.Medium
                        }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 8
                            StyledTextField {
                                id: confirmPasswordField
                                Layout.fillWidth: true
                                placeholderText: "Re-enter new user password"
                                echoMode: showConfPwdBtn.checked ? TextInput.Normal : TextInput.Password
                            }
                            StyledButton {
                                id: showConfPwdBtn
                                checkable: true
                                text: checked ? "Hide" : "Show"
                                Layout.preferredWidth: 65
                                variant: "secondary"
                            }
                        }
                    }

                    RowLayout {
                        spacing: 12
                        Layout.topMargin: 4

                        StyledButton {
                            text: "Update User Password"
                            variant: "primary"
                            onClicked: {
                                var newP = newPasswordField.text.trim()
                                var confP = confirmPasswordField.text.trim()
                                var selectedUser = targetUserCombo.currentText

                                if (newP === "") {
                                    feedbackBanner.isFeedbackError = true
                                    feedbackText.text = "Password cannot be empty."
                                    return
                                }
                                if (newP !== confP) {
                                    feedbackBanner.isFeedbackError = true
                                    feedbackText.text = "Passwords do not match. Please verify and retry."
                                    return
                                }

                                if (AuthManager.changeUserPassword(selectedUser, newP)) {
                                    newPasswordField.text = ""
                                    confirmPasswordField.text = ""
                                    feedbackBanner.isFeedbackError = false
                                    feedbackText.text = "User password for @" + selectedUser + " updated successfully."
                                } else {
                                    feedbackBanner.isFeedbackError = true
                                    feedbackText.text = AuthManager.errorMessage || "Failed to update user password."
                                }
                            }
                        }

                        StyledButton {
                            text: "Cancel"
                            variant: "secondary"
                            onClicked: {
                                newPasswordField.text = ""
                                confirmPasswordField.text = ""
                                feedbackText.text = ""
                            }
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // DIALOG 1: ADD USER DIALOG
    // ========================================================================
    Dialog {
        id: addUserDialog
        anchors.centerIn: parent
        width: 440
        modal: true
        padding: 24

        function resetAndOpen() {
            newUserNameField.text = ""
            newUserUsernameField.text = ""
            newUserPasswordField.text = ""
            newUserConfirmPasswordField.text = ""
            newUserRoleBox.currentIndex = 0
            addUserErrorText.text = ""
            open()
        }

        background: Rectangle {
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 14

            Text {
                text: "Add New Employee / Operator"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
                color: Theme.colors.textPrimary
            }

            Text {
                text: "Create a new railway operator account (Current: " + AuthManager.operatorCount + " / 10)"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                color: Theme.colors.textSecondary
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

            // Error banner
            Rectangle {
                visible: addUserErrorText.text.length > 0
                Layout.fillWidth: true
                Layout.preferredHeight: addUserErrorText.implicitHeight + 12
                radius: 6
                color: "#FEF2F2"
                border.width: 1
                border.color: "#FECACA"
                RowLayout {
                    anchors.fill: parent; anchors.margins: 6; spacing: 6
                    Text { text: "⚠"; color: Theme.colors.critical; font.pixelSize: 12 }
                    Text {
                        id: addUserErrorText
                        Layout.fillWidth: true
                        text: ""
                        color: Theme.colors.critical
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                        wrapMode: Text.Wrap
                    }
                }
            }

            // Full Name
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Full Name *"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                StyledTextField {
                    id: newUserNameField
                    Layout.fillWidth: true
                    placeholderText: "e.g. Rajesh Kumar"
                }
            }

            // Username
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Username *"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                StyledTextField {
                    id: newUserUsernameField
                    Layout.fillWidth: true
                    placeholderText: "e.g. rkumar"
                }
            }

            // Role
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Role *"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                StyledComboBox {
                    id: newUserRoleBox
                    Layout.fillWidth: true
                    model: ["Operator", "Station Master", "Maintenance Engineer", "Technician"]
                }
            }

            // Password
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Password *"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                StyledTextField {
                    id: newUserPasswordField
                    Layout.fillWidth: true
                    placeholderText: "At least 3 characters"
                    echoMode: TextInput.Password
                }
            }

            // Confirm Password
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Confirm Password *"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                StyledTextField {
                    id: newUserConfirmPasswordField
                    Layout.fillWidth: true
                    placeholderText: "Re-enter password"
                    echoMode: TextInput.Password
                }
            }

            Item { height: 4 }

            // Action Buttons
            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Item { Layout.fillWidth: true }

                StyledButton {
                    text: "Cancel"
                    variant: "secondary"
                    onClicked: addUserDialog.close()
                }

                StyledButton {
                    text: "Create User"
                    variant: "primary"
                    onClicked: {
                        var name = newUserNameField.text.trim()
                        var uname = newUserUsernameField.text.trim()
                        var pwd = newUserPasswordField.text
                        var cpwd = newUserConfirmPasswordField.text
                        var role = newUserRoleBox.currentText

                        if (uname === "") {
                            addUserErrorText.text = "Username cannot be empty."
                            return
                        }
                        if (uname.toLowerCase() === "admin" || uname.toLowerCase() === "administrator") {
                            addUserErrorText.text = "The username 'admin' is reserved."
                            return
                        }
                        if (pwd.length < 3) {
                            addUserErrorText.text = "Password must be at least 3 characters."
                            return
                        }
                        if (pwd !== cpwd) {
                            addUserErrorText.text = "Passwords do not match."
                            return
                        }
                        if (AuthManager.operatorCount >= 10) {
                            addUserErrorText.text = "Maximum 10 employee/operator accounts reached."
                            return
                        }

                        var ok = AuthManager.addUser(name, uname, pwd, role)
                        if (ok) {
                            addUserDialog.close()
                        } else {
                            addUserErrorText.text = AuthManager.errorMessage || "Failed to create user."
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // DIALOG 2: REMOVE USER CONFIRMATION DIALOG
    // ========================================================================
    Dialog {
        id: confirmRemoveDialog
        anchors.centerIn: parent
        width: 400
        modal: true
        padding: 24

        property string targetUsername: ""
        property string targetDisplayName: ""

        background: Rectangle {
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 14

            RowLayout {
                spacing: 10
                Rectangle {
                    width: 36; height: 36; radius: 18; color: "#FEE2E2"
                    Text { anchors.centerIn: parent; text: "⚠️"; font.pixelSize: 14 }
                }
                ColumnLayout {
                    spacing: 2
                    Text {
                        text: "Remove User?"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 16
                        font.weight: Font.Bold
                        color: Theme.colors.textPrimary
                    }
                    Text {
                        text: "This action cannot be undone."
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        color: Theme.colors.textSecondary
                    }
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

            Text {
                Layout.fillWidth: true
                text: "Are you sure you want to remove user <b>" + confirmRemoveDialog.targetDisplayName + "</b> (@" + confirmRemoveDialog.targetUsername + ")?<br><br>Their application access will be immediately revoked and their credentials will be permanently removed."
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                color: Theme.colors.textPrimary
                textFormat: Text.RichText
                wrapMode: Text.Wrap
            }

            Item { height: 6 }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12
                Item { Layout.fillWidth: true }

                StyledButton {
                    text: "Cancel"
                    variant: "secondary"
                    onClicked: confirmRemoveDialog.close()
                }

                StyledButton {
                    text: "Remove"
                    variant: "danger"
                    onClicked: {
                        var ok = AuthManager.removeUser(confirmRemoveDialog.targetUsername)
                        confirmRemoveDialog.close()
                    }
                }
            }
        }
    }
}
