import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// Devices Page — Fully Functional Industrial IoT Device Management Screen
// ============================================================================
// Features:
// 1. Page Header with Search Bar, Status Filter, Connection Filter, and Refresh.
// 2. 4 Overview Metric Cards (Total Devices, Online, Offline, Warning).
// 3. Responsive Device Management Table with live telemetry, status pills, and actions.
// 4. Slide-in Detailed Diagnostics Drawer (Identity, BME280, ADS1115, EEPROM, Tasks).
// 5. Zero-state and No-match filtering state handlers.
// ============================================================================
Item {
    id: root

    readonly property bool compact: width < Theme.metrics.compactBreakpoint

    // Search and filter properties
    property string searchQuery: ""
    property string selectedStatusFilter: "All"
    property string selectedConnFilter: "All"

    // Detail Drawer selected device
    property var selectedDevice: null
    property bool drawerOpen: selectedDevice !== null

    // Live Device Model dynamically linked to RailwayManager
    property var allDevices: RailwayManager.devices

    Connections {
        target: RailwayManager
        function onDevicesChanged() {
            root.allDevices = RailwayManager.devices
        }
    }

    // Filtered device list based on search and dropdown selections
    readonly property var filteredDevices: {
        var list = [];
        for (var i = 0; i < allDevices.length; i++) {
            var dev = allDevices[i];
            // 1. Search Query Filter
            if (root.searchQuery.length > 0) {
                var q = root.searchQuery.toLowerCase();
                var matchName = dev.name.toLowerCase().indexOf(q) !== -1;
                var matchId = dev.id.toLowerCase().indexOf(q) !== -1;
                var matchLoc = dev.location.toLowerCase().indexOf(q) !== -1;
                if (!matchName && !matchId && !matchLoc) continue;
            }
            // 2. Status Filter
            if (root.selectedStatusFilter !== "All" && dev.status !== root.selectedStatusFilter) {
                continue;
            }
            // 3. Connection Filter
            if (root.selectedConnFilter !== "All" && dev.connectionType.indexOf(root.selectedConnFilter) === -1) {
                continue;
            }
            list.push(dev);
        }
        return list;
    }

    // Counts for overview cards
    readonly property int totalCount: allDevices.length
    readonly property int onlineCount: {
        var c = 0;
        for (var i = 0; i < allDevices.length; i++) {
            if (allDevices[i].status === "Online") c++;
        }
        return c;
    }
    readonly property int offlineCount: {
        var c = 0;
        for (var i = 0; i < allDevices.length; i++) {
            if (allDevices[i].status === "Offline") c++;
        }
        return c;
    }
    readonly property int warningCount: {
        var c = 0;
        for (var i = 0; i < allDevices.length; i++) {
            if (allDevices[i].status === "Warning") c++;
        }
        return c;
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Flickable {
        id: scrollArea
        anchors.fill: parent
        anchors.rightMargin: root.drawerOpen ? 460 : 0
        Behavior on anchors.rightMargin { NumberAnimation { duration: 250; easing.type: Easing.OutCubic } }
        contentWidth: width
        contentHeight: mainColumn.implicitHeight + 40
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ScrollBar.vertical: ScrollBar {
            policy: ScrollBar.AsNeeded
            active: true
        }

        ColumnLayout {
            id: mainColumn
            width: parent.width - (root.compact ? 24 : 36)
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: 18
            spacing: Theme.metrics.space16

            // ================================================================
            // 1. Page Header with Title & Action Controls
            // ================================================================
            RowLayout {
                Layout.fillWidth: true
                spacing: 16

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2

                    Text {
                        text: "Devices"
                        color: "#0F172A"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 24
                        font.weight: Font.Bold
                    }

                    Text {
                        text: "Manage and monitor connected water-level monitoring devices"
                        color: "#64748B"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 14
                    }
                }

                // Global Refresh Button
                StyledButton {
                    text: "\u27F3 Refresh"
                    variant: "secondary"
                    onClicked: {
                        root.allDevices = RailwayManager.devices
                    }
                }

                // + Add Device Button (Admin only)
                StyledButton {
                    text: "+ Add Device"
                    variant: "primary"
                    visible: PermissionManager.isAdmin
                    onClicked: addDeviceDialog.resetAndOpen()
                }
            }

            // ================================================================
            // 2. Search & Filter Bar
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 12

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    // Search Input Field
                    StyledTextField {
                        id: searchField
                        Layout.fillWidth: true
                        placeholderText: "Search devices by name, ID, or location..."
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        onTextChanged: root.searchQuery = text.trim()
                    }

                    // Status Filter Dropdown
                    RowLayout {
                        spacing: 6
                        Text { text: "Status:"; color: "#64748B"; font.pixelSize: 13; font.family: Theme.typography.fontFamily }
                        StyledComboBox {
                            model: ["All", "Online", "Offline", "Warning"]
                            currentIndex: 0
                            onActivated: function(index) { root.selectedStatusFilter = model[index]; }
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            Layout.preferredWidth: 120
                        }
                    }

                    // Connection Filter Dropdown
                    RowLayout {
                        spacing: 6
                        Text { text: "Connection:"; color: "#64748B"; font.pixelSize: 13; font.family: Theme.typography.fontFamily }
                        StyledComboBox {
                            model: ["All", "LTE", "BLE", "RS485"]
                            currentIndex: 0
                            onActivated: function(index) { root.selectedConnFilter = model[index]; }
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            Layout.preferredWidth: 110
                        }
                    }

                    // Reset Filters Button
                    StyledButton {
                        text: "Reset"
                        variant: "secondary"
                        visible: root.searchQuery.length > 0 || root.selectedStatusFilter !== "All" || root.selectedConnFilter !== "All"
                        onClicked: {
                            searchField.text = "";
                            root.searchQuery = "";
                            root.selectedStatusFilter = "All";
                            root.selectedConnFilter = "All";
                        }
                    }
                }
            }

            // ================================================================
            // 3. Device Overview Metric Cards (4 Tiles)
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                columns: root.compact ? 2 : 4
                columnSpacing: Theme.metrics.space12
                rowSpacing: Theme.metrics.space12

                // Total Devices Card
                BaseCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 100
                    padding: 14

                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 2

                        Text { text: "TOTAL DEVICES"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }
                        Text {
                            text: "" + root.totalCount
                            color: "#0F172A"
                            font.pixelSize: 26
                            font.weight: Font.Bold
                            font.family: Theme.typography.fontFamily
                        }
                        Text { text: "Registered Monitoring Nodes"; color: "#94A3B8"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                    }
                }

                // Online Devices Card
                BaseCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 100
                    padding: 14

                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 2

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "ONLINE"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                            Rectangle { width: 8; height: 8; radius: 4; color: "#10B981" }
                        }

                        Text {
                            text: "" + root.onlineCount
                            color: "#059669"
                            font.pixelSize: 26
                            font.weight: Font.Bold
                            font.family: Theme.typography.fontFamily
                        }
                        Text { text: "Active Telemetry Uplink"; color: "#94A3B8"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                    }
                }

                // Offline Devices Card
                BaseCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 100
                    padding: 14

                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 2

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "OFFLINE"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                            Rectangle { width: 8; height: 8; radius: 4; color: "#EF4444" }
                        }

                        Text {
                            text: "" + root.offlineCount
                            color: root.offlineCount > 0 ? "#DC2626" : "#64748B"
                            font.pixelSize: 26
                            font.weight: Font.Bold
                            font.family: Theme.typography.fontFamily
                        }
                        Text { text: "No Signal / Link Timeout"; color: "#94A3B8"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                    }
                }

                // Warning / Alert Devices Card
                BaseCard {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 100
                    padding: 14

                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 2

                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "WARNINGS"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                            Rectangle { width: 8; height: 8; radius: 4; color: "#F59E0B" }
                        }

                        Text {
                            text: "" + root.warningCount
                            color: root.warningCount > 0 ? "#D97706" : "#64748B"
                            font.pixelSize: 26
                            font.weight: Font.Bold
                            font.family: Theme.typography.fontFamily
                        }
                        Text { text: "Subsystem / Level Alarms"; color: "#94A3B8"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                    }
                }
            }

            // ================================================================
            // 4. Device Management Table
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 16

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    // Table Header Bar
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8

                        Text {
                            text: "Registered Water Monitoring Devices (" + root.filteredDevices.length + ")"
                            color: "#0F172A"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 16
                            font.weight: Font.Bold
                            Layout.fillWidth: true
                        }

                        Text {
                            text: "Click any device row to view full hardware telemetry"
                            color: "#94A3B8"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                        }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        height: 1
                        color: "#E2E8F0"
                    }

                    // Table Column Headers (Desktop view)
                    RowLayout {
                        Layout.fillWidth: true
                        visible: !root.compact
                        Layout.leftMargin: 12
                        Layout.rightMargin: 12
                        spacing: 12

                        Text { text: "DEVICE NAME / ID"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 180 }
                        Text { text: "STATUS"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 100 }
                        Text { text: "CONNECTION"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 130 }
                        Text { text: "WATER LEVEL"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 150 }
                        Text { text: "SENSOR HEALTH"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 120 }
                        Text { text: "FIRMWARE"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 90 }
                        Text { text: "LAST UPDATE"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                        Text { text: "ACTION"; color: "#64748B"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily; Layout.preferredWidth: 90 }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        height: 1
                        color: "#F1F5F9"
                        visible: !root.compact
                    }

                    // Table Rows
                    Repeater {
                        model: root.filteredDevices

                        delegate: Rectangle {
                            required property var modelData
                            required property int index

                            Layout.fillWidth: true
                            height: root.compact ? 130 : 64
                            radius: 8
                            color: rowHover.hovered ? "#F8FAFC" : (index % 2 === 1 ? "#FAFAFA" : "#FFFFFF")
                            border.width: 1
                            border.color: modelData === root.selectedDevice ? "#3B82F6" : (rowHover.hovered ? "#CBD5E1" : "#F1F5F9")

                            Behavior on color { ColorAnimation { duration: 120 } }
                            Behavior on border.color { ColorAnimation { duration: 120 } }

                            HoverHandler { id: rowHover; cursorShape: Qt.PointingHandCursor }
                            TapHandler { onTapped: root.selectedDevice = modelData }

                            // Desktop Row View
                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 12
                                anchors.rightMargin: 12
                                spacing: 12
                                visible: !root.compact

                                // Device Name & ID
                                ColumnLayout {
                                    Layout.preferredWidth: 180
                                    spacing: 2
                                    Text {
                                        text: modelData.name
                                        color: "#0F172A"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 13
                                        font.weight: Font.Bold
                                        elide: Text.ElideRight
                                    }
                                    Text {
                                        text: "ID: " + modelData.id
                                        color: "#64748B"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 11
                                    }
                                }

                                // Status Badge
                                Item {
                                    Layout.preferredWidth: 100
                                    Layout.fillHeight: true

                                    Rectangle {
                                        anchors.verticalCenter: parent.verticalCenter
                                        height: 24
                                        width: statusText.implicitWidth + 16
                                        radius: 12
                                        color: modelData.status === "Online" ? "#ECFDF5" : (modelData.status === "Warning" ? "#FFFBEB" : "#FEF2F2")
                                        border.color: modelData.status === "Online" ? "#A7F3D0" : (modelData.status === "Warning" ? "#FDE68A" : "#FECACA")
                                        border.width: 1

                                        RowLayout {
                                            anchors.centerIn: parent
                                            spacing: 4
                                            Rectangle {
                                                width: 6; height: 6; radius: 3
                                                color: modelData.status === "Online" ? "#10B981" : (modelData.status === "Warning" ? "#F59E0B" : "#EF4444")
                                            }
                                            Text {
                                                id: statusText
                                                text: modelData.status
                                                color: modelData.status === "Online" ? "#065F46" : (modelData.status === "Warning" ? "#92400E" : "#991B1B")
                                                font.pixelSize: 11
                                                font.weight: Font.Bold
                                                font.family: Theme.typography.fontFamily
                                            }
                                        }
                                    }
                                }

                                // Connection Type
                                Text {
                                    Layout.preferredWidth: 130
                                    text: modelData.connectionType
                                    color: "#334155"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                }

                                // Water Level with Mini Progress Bar
                                ColumnLayout {
                                    Layout.preferredWidth: 150
                                    spacing: 4

                                    RowLayout {
                                        Layout.fillWidth: true
                                        Text {
                                            text: (modelData.waterLevel !== undefined && modelData.waterLevel >= 0 && modelData.hasTank) ? modelData.waterLevel.toFixed(1) + "%" : "—"
                                            color: (modelData.waterLevel !== undefined && modelData.waterLevel >= 0 && modelData.hasTank) ? Theme.colors.primary : "#64748B"
                                            font.weight: Font.Bold
                                            font.pixelSize: 12
                                            font.family: Theme.typography.fontFamily
                                        }
                                        Text {
                                            text: (modelData.waterHeightCm !== undefined && modelData.waterHeightCm >= 0 && modelData.hasTank) ? "(" + modelData.waterHeightCm.toFixed(1) + " cm)" : "(Not Assigned)"
                                            color: "#64748B"
                                            font.pixelSize: 11
                                            font.family: Theme.typography.fontFamily
                                            Layout.fillWidth: true
                                        }
                                    }

                                    Rectangle {
                                        Layout.fillWidth: true
                                        height: 5
                                        radius: 2.5
                                        color: "#E2E8F0"

                                        Rectangle {
                                            width: (modelData.waterLevel !== undefined && modelData.waterLevel >= 0 && modelData.hasTank) ? parent.width * Math.max(0.0, Math.min(1.0, modelData.waterLevel / 100.0)) : 0
                                            height: parent.height
                                            radius: 2.5
                                            color: modelData.waterLevel >= 100.0 ? "#EF4444" : (modelData.waterLevel < 20.0 ? "#F59E0B" : "#0878E8")
                                            visible: modelData.waterLevel !== undefined && modelData.waterLevel >= 0 && modelData.hasTank
                                        }
                                    }
                                }

                                // Sensor Health
                                Text {
                                    Layout.preferredWidth: 120
                                    text: modelData.sensorStatus
                                    color: modelData.sensorStatus === "Healthy" ? "#059669" : "#D97706"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.Medium
                                }

                                // Firmware Version
                                Text {
                                    Layout.preferredWidth: 90
                                    text: modelData.firmwareVersion
                                    color: "#64748B"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                }

                                // Last Update Timestamp
                                Text {
                                    Layout.fillWidth: true
                                    text: modelData.lastUpdate
                                    color: "#64748B"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                }

                                // Action View Button & Remove Button
                                RowLayout {
                                    Layout.preferredWidth: 160
                                    spacing: 6

                                    StyledButton {
                                        Layout.preferredWidth: 88
                                        text: "Details"
                                        variant: "secondary"
                                        onClicked: root.selectedDevice = modelData
                                    }

                                    StyledButton {
                                        Layout.preferredWidth: 64
                                        text: "Remove"
                                        variant: "danger"
                                        visible: PermissionManager.isAdmin && !modelData.isPrimary
                                        onClicked: {
                                            confirmDeleteDeviceDialog.targetDeviceId = modelData.id
                                            confirmDeleteDeviceDialog.targetDeviceName = modelData.name
                                            confirmDeleteDeviceDialog.open()
                                        }
                                    }
                                }
                            }

                            // Compact Mobile/Tablet Card View
                            ColumnLayout {
                                anchors.fill: parent
                                anchors.margins: 12
                                spacing: 6
                                visible: root.compact

                                RowLayout {
                                    Layout.fillWidth: true
                                    Text { text: modelData.name; font.weight: Font.Bold; font.pixelSize: 14; color: "#0F172A"; Layout.fillWidth: true }
                                    Rectangle {
                                        height: 22
                                        width: compactStatusText.implicitWidth + 14
                                        radius: 11
                                        color: modelData.status === "Online" ? "#ECFDF5" : (modelData.status === "Warning" ? "#FFFBEB" : "#FEF2F2")
                                        Text {
                                            id: compactStatusText
                                            anchors.centerIn: parent
                                            text: modelData.status
                                            color: modelData.status === "Online" ? "#065F46" : (modelData.status === "Warning" ? "#92400E" : "#991B1B")
                                            font.pixelSize: 10
                                            font.weight: Font.Bold
                                        }
                                    }
                                }

                                RowLayout {
                                    Layout.fillWidth: true
                                    Text { text: "ID: " + modelData.id + " | " + modelData.connectionType; color: "#64748B"; font.pixelSize: 12; Layout.fillWidth: true }
                                    Text {
                                        text: (modelData.waterLevel !== undefined && modelData.waterLevel >= 0 && modelData.hasTank) ?
                                                  "Level: " + modelData.waterLevel.toFixed(1) + "% (" + modelData.waterHeightCm.toFixed(1) + " cm)" :
                                                  "Tank: Not Assigned"
                                        color: (modelData.waterLevel !== undefined && modelData.waterLevel >= 0 && modelData.hasTank) ? Theme.colors.primary : "#64748B"
                                        font.weight: Font.Bold
                                        font.pixelSize: 12
                                    }
                                }

                                RowLayout {
                                    Layout.fillWidth: true
                                    Text { text: "Updated: " + modelData.lastUpdate; color: "#94A3B8"; font.pixelSize: 11; Layout.fillWidth: true }
                                    StyledButton {
                                        text: "Details"
                                        variant: "secondary"
                                        onClicked: root.selectedDevice = modelData
                                    }
                                    StyledButton {
                                        text: "Remove"
                                        variant: "danger"
                                        visible: PermissionManager.isAdmin && !modelData.isPrimary
                                        onClicked: {
                                            confirmDeleteDeviceDialog.targetDeviceId = modelData.id
                                            confirmDeleteDeviceDialog.targetDeviceName = modelData.name
                                            confirmDeleteDeviceDialog.open()
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Zero-State (When filter matches nothing)
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: 24
                        Layout.bottomMargin: 24
                        visible: root.filteredDevices.length === 0
                        spacing: 8

                        Text {
                            Layout.alignment: Qt.AlignHCenter
                            text: "No Devices Found Matching Query"
                            color: "#0F172A"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 16
                            font.weight: Font.Bold
                        }

                        Text {
                            Layout.alignment: Qt.AlignHCenter
                            text: "Try adjusting your search query or reset the filter dropdowns."
                            color: "#64748B"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }

                        StyledButton {
                            Layout.alignment: Qt.AlignHCenter
                            text: "Reset All Filters"
                            variant: "secondary"
                            onClicked: {
                                searchField.text = "";
                                root.searchQuery = "";
                                root.selectedStatusFilter = "All";
                                root.selectedConnFilter = "All";
                            }
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // 5. Slide-in Device Detail Drawer (Right Side Sheet)
    // ========================================================================
    Rectangle {
        id: detailDrawer
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.right: parent.right
        width: 440
        visible: root.drawerOpen
        x: root.drawerOpen ? parent.width - width : parent.width
        color: "#FFFFFF"
        border.color: "#CBD5E1"
        border.width: 1
        z: 20

        Flickable {
            anchors.fill: parent
            anchors.margins: 18
            contentWidth: width
            contentHeight: drawerColumn.implicitHeight + 30
            clip: true
            boundsBehavior: Flickable.StopAtBounds

            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded; active: true }

            ColumnLayout {
                id: drawerColumn
                width: parent.width
                spacing: 14

                // Drawer Header Bar
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2

                        Text {
                            text: root.selectedDevice ? root.selectedDevice.name : "Device Details"
                            color: "#0F172A"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 18
                            font.weight: Font.Bold
                        }
                        Text {
                            text: root.selectedDevice ? "Device ID: " + root.selectedDevice.id : ""
                            color: "#64748B"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                        }
                    }

                    StyledButton {
                        text: "\u2715 Close"
                        variant: "secondary"
                        onClicked: root.selectedDevice = null
                    }
                }

                Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

                // Section 1: Live Water Level & Geometry
                Text { text: "LIVE TELEMETRY & TANK LEVEL"; color: "#475569"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }

                Rectangle {
                    Layout.fillWidth: true
                    height: 80
                    radius: 8
                    color: "#F8FAFC"
                    border.color: "#E2E8F0"
                    border.width: 1

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 12

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2
                            Text { text: "Water Level"; color: "#64748B"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                            Text {
                                text: (root.selectedDevice && root.selectedDevice.waterLevel !== undefined && root.selectedDevice.waterLevel >= 0 && root.selectedDevice.hasTank) ? root.selectedDevice.waterLevel.toFixed(2) + "%" : "—"
                                color: Theme.colors.primary; font.pixelSize: 22; font.weight: Font.Bold; font.family: Theme.typography.fontFamily
                            }
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2
                            Text { text: "Water Height"; color: "#64748B"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                            Text {
                                text: (root.selectedDevice && root.selectedDevice.waterHeightCm !== undefined && root.selectedDevice.waterHeightCm >= 0 && root.selectedDevice.hasTank) ? root.selectedDevice.waterHeightCm.toFixed(1) + " cm" : "—"
                                color: "#0F172A"; font.pixelSize: 20; font.weight: Font.Bold; font.family: Theme.typography.fontFamily
                            }
                        }
                    }
                }

                InfoRow { Layout.fillWidth: true; label: "Assigned Tank"; value: (root.selectedDevice && root.selectedDevice.hasTank && root.selectedDevice.tankNumber) ? root.selectedDevice.tankNumber : "Not Assigned" }
                InfoRow { Layout.fillWidth: true; label: "Configured Tank Height"; value: (root.selectedDevice && root.selectedDevice.tankHeightCm !== undefined && root.selectedDevice.tankHeightCm > 0 && root.selectedDevice.hasTank) ? root.selectedDevice.tankHeightCm.toFixed(1) + " cm" : "--" }
                InfoRow { Layout.fillWidth: true; label: "Liquid Volume"; value: (root.selectedDevice && root.selectedDevice.volumeLiters !== undefined && root.selectedDevice.volumeLiters >= 0 && root.selectedDevice.hasTank) ? root.selectedDevice.volumeLiters.toFixed(1) + " L" : "--" }
                InfoRow { Layout.fillWidth: true; label: "Sensor Health Status"; value: root.selectedDevice ? root.selectedDevice.sensorStatus : "--" }

                Rectangle { Layout.fillWidth: true; height: 1; color: "#F1F5F9" }

                // Section 2: Environmental Sensors (BME280)
                Text { text: "ENVIRONMENTAL SENSORS (BME280)"; color: "#475569"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }

                InfoRow { Layout.fillWidth: true; label: "Atmospheric Pressure"; value: root.selectedDevice ? root.selectedDevice.pressure.toFixed(1) + " hPa (LIVE)" : "--" }
                InfoRow { Layout.fillWidth: true; label: "Relative Humidity"; value: root.selectedDevice ? root.selectedDevice.humidity.toFixed(1) + " % RH" : "--" }
                InfoRow { Layout.fillWidth: true; label: "BME280 Health"; value: "Healthy (EEPROM Backup Ready)" }

                Rectangle { Layout.fillWidth: true; height: 1; color: "#F1F5F9" }

                // Section 3: Hardware Diagnostics & Calibration
                Text { text: "ADC DIAGNOSTICS & CALIBRATION (EEPROM)"; color: "#475569"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }

                InfoRow { Layout.fillWidth: true; label: "ADC Differential Mode"; value: root.selectedDevice ? root.selectedDevice.sensorType : "--" }
                InfoRow { Layout.fillWidth: true; label: "PGA Gain & Rate"; value: root.selectedDevice ? root.selectedDevice.gain : "--" }
                InfoRow { Layout.fillWidth: true; label: "Air Baseline (A_air)"; value: root.selectedDevice ? "" + root.selectedDevice.airBaseline + " counts" : "--" }
                InfoRow { Layout.fillWidth: true; label: "Deadband Threshold"; value: root.selectedDevice ? root.selectedDevice.deadband : "--" }
                InfoRow { Layout.fillWidth: true; label: "Calibration State"; value: root.selectedDevice ? root.selectedDevice.calibrationStatus : "--" }

                Rectangle { Layout.fillWidth: true; height: 1; color: "#F1F5F9" }

                // Section 4: Connectivity & FreeRTOS Tasks
                Text { text: "CONNECTIVITY & FREERTOS RUNTIME"; color: "#475569"; font.pixelSize: 11; font.weight: Font.Bold; font.family: Theme.typography.fontFamily }

                InfoRow { Layout.fillWidth: true; label: "Uplink Protocol"; value: root.selectedDevice ? root.selectedDevice.connectionType : "--" }
                InfoRow { Layout.fillWidth: true; label: "Modem / Radio"; value: root.selectedDevice ? root.selectedDevice.modemModel : "--" }
                InfoRow { Layout.fillWidth: true; label: "Signal Strength"; value: root.selectedDevice ? root.selectedDevice.signalQuality : "--" }
                InfoRow { Layout.fillWidth: true; label: "Firmware Version"; value: root.selectedDevice ? root.selectedDevice.firmwareVersion : "--" }
                InfoRow { Layout.fillWidth: true; label: "RTOS Kernel"; value: root.selectedDevice ? root.selectedDevice.runtime : "--" }
                InfoRow { Layout.fillWidth: true; label: "Cloud Upload Interval"; value: root.selectedDevice ? root.selectedDevice.uploadInterval : "--" }
                InfoRow { Layout.fillWidth: true; label: "Last Reported Telemetry"; value: root.selectedDevice ? root.selectedDevice.lastUpdate : "--" }

                Item { Layout.fillHeight: true; Layout.preferredHeight: 12 }

                StyledButton {
                    Layout.fillWidth: true
                    text: "Close Device Drawer"
                    variant: "secondary"
                    onClicked: root.selectedDevice = null
                }
            }
        }
    }

    // ========================================================================
    // DIALOG 1: ADD DEVICE DIALOG
    // ========================================================================
    Dialog {
        id: addDeviceDialog
        anchors.centerIn: parent
        width: 480
        modal: true
        padding: 24

        function resetAndOpen() {
            newDeviceIdField.text = ""
            newDeviceNameField.text = ""
            newDeviceTypeBox.currentIndex = 0
            newConnTypeBox.currentIndex = 0
            newStatusBox.currentIndex = 0
            newLocationField.text = ""
            addDeviceErrorText.text = ""
            updateTrainOptions()
            open()
        }

        property var trainList: []
        property var coachList: []
        property var tankList: []

        function updateTrainOptions() {
            var trs = RailwayManager.trains || []
            var tnames = ["(Unassigned)"]
            for (var i = 0; i < trs.length; i++) {
                var t = trs[i]
                tnames.push(t.trainNumber + " - " + t.trainName)
            }
            trainList = trs
            newTrainBox.model = tnames
            newTrainBox.currentIndex = 0
            updateCoachOptions()
        }

        function updateCoachOptions() {
            var cnames = ["(Unassigned)"]
            coachList = []
            if (newTrainBox.currentIndex > 0 && trainList.length >= newTrainBox.currentIndex) {
                var selectedTrain = trainList[newTrainBox.currentIndex - 1]
                var cs = RailwayManager.getCoaches(selectedTrain.trainNumber) || []
                coachList = cs
                for (var j = 0; j < cs.length; j++) {
                    var c = cs[j]
                    var cLabel = "Coach " + (c.twoDigitNumber || c.coachNumber) + (c.assigned ? (c.coachType ? (" (" + c.coachType + ")") : "") : " (Available)")
                    cnames.push(cLabel)
                }
            }
            newCoachBox.model = cnames
            newCoachBox.currentIndex = 0
            updateTankOptions()
        }

        function updateTankOptions() {
            var tknames = ["(Unassigned)"]
            tankList = []
            if (newCoachBox.currentIndex > 0 && coachList.length >= newCoachBox.currentIndex) {
                var selectedCoach = coachList[newCoachBox.currentIndex - 1]
                var tks = (selectedCoach.coachId > 0) ? (RailwayManager.getTanksForCoach(selectedCoach.coachId) || []) : []
                tankList = []
                for (var k = 0; k < tks.length; k++) {
                    tankList.push(tks[k])
                    tknames.push(tks[k].tankNumber + (tks[k].tankName ? " (" + tks[k].tankName + ")" : ""))
                }
                if (tks.length === 0) {
                    tknames.push("T01 (New Tank)")
                    tankList.push({ tankNumber: "T01", tankName: "Primary Tank" })
                }
            }
            newTankBox.model = tknames
            newTankBox.currentIndex = 0
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
                text: "Add New Device"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
                color: Theme.colors.textPrimary
            }

            Text {
                text: "Register an IoT telemetry device and optionally assign it to a train tank."
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                color: Theme.colors.textSecondary
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

            // Error banner
            Rectangle {
                visible: addDeviceErrorText.text.length > 0
                Layout.fillWidth: true
                Layout.preferredHeight: addDeviceErrorText.implicitHeight + 12
                radius: 6
                color: "#FEF2F2"
                border.width: 1
                border.color: "#FECACA"
                RowLayout {
                    anchors.fill: parent; anchors.margins: 6; spacing: 6
                    Text { text: "⚠"; color: Theme.colors.critical; font.pixelSize: 12 }
                    Text {
                        id: addDeviceErrorText
                        Layout.fillWidth: true
                        text: ""
                        color: Theme.colors.critical
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                        wrapMode: Text.Wrap
                    }
                }
            }

            GridLayout {
                Layout.fillWidth: true
                columns: 2
                columnSpacing: 12
                rowSpacing: 10

                // Device ID
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 3
                    Text { text: "Device ID *"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    StyledTextField {
                        id: newDeviceIdField
                        Layout.fillWidth: true
                        placeholderText: "e.g. EC200U-984211"
                    }
                }

                // Device Name
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 3
                    Text { text: "Device Name *"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    StyledTextField {
                        id: newDeviceNameField
                        Layout.fillWidth: true
                        placeholderText: "e.g. Water Level Sensor 02"
                    }
                }

                // Device Type
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 3
                    Text { text: "Device Type"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    StyledComboBox {
                        id: newDeviceTypeBox
                        Layout.fillWidth: true
                        model: ["Quectel EC200U-CN LTE Cat-1", "ESP32-S3 Industrial Node", "Modbus RS485 Transducer", "BLE Sensor Tag"]
                    }
                }

                // Communication Type
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 3
                    Text { text: "Communication Type"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    StyledComboBox {
                        id: newConnTypeBox
                        Layout.fillWidth: true
                        model: ["LTE / Cellular", "BLE", "RS485", "LoRaWAN"]
                    }
                }

                // Status
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 3
                    Text { text: "Initial Status"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    StyledComboBox {
                        id: newStatusBox
                        Layout.fillWidth: true
                        model: ["Online", "Offline", "Warning"]
                    }
                }

                // Train Assignment
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 3
                    Text { text: "Train Assignment"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    StyledComboBox {
                        id: newTrainBox
                        Layout.fillWidth: true
                        onActivated: function(index) { addDeviceDialog.updateCoachOptions(); }
                    }
                }

                // Coach Assignment
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 3
                    Text { text: "Coach Assignment"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    StyledComboBox {
                        id: newCoachBox
                        Layout.fillWidth: true
                        onActivated: function(index) { addDeviceDialog.updateTankOptions(); }
                    }
                }

                // Tank Assignment
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 3
                    Text { text: "Tank Assignment"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    StyledComboBox {
                        id: newTankBox
                        Layout.fillWidth: true
                    }
                }
            }

            // Location Notes
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 3
                Text { text: "Location / Mounting Description"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                StyledTextField {
                    id: newLocationField
                    Layout.fillWidth: true
                    placeholderText: "e.g. Under-chassis tank sensor"
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
                    onClicked: addDeviceDialog.close()
                }

                StyledButton {
                    text: "Create Device"
                    variant: "primary"
                    onClicked: {
                        var did = newDeviceIdField.text.trim()
                        var name = newDeviceNameField.text.trim()
                        var dtype = newDeviceTypeBox.currentText
                        var ctype = newConnTypeBox.currentText
                        var stat = newStatusBox.currentText
                        var loc = newLocationField.text.trim()

                        if (did === "") {
                            addDeviceErrorText.text = "Device ID cannot be empty."
                            return
                        }

                        var trNum = ""
                        var cNum = ""
                        var tkNum = ""

                        if (newTrainBox.currentIndex > 0 && addDeviceDialog.trainList.length >= newTrainBox.currentIndex) {
                            trNum = addDeviceDialog.trainList[newTrainBox.currentIndex - 1].trainNumber
                        }
                        if (newCoachBox.currentIndex > 0 && addDeviceDialog.coachList.length >= newCoachBox.currentIndex) {
                            cNum = addDeviceDialog.coachList[newCoachBox.currentIndex - 1].coachNumber
                        }
                        if (newTankBox.currentIndex > 0 && addDeviceDialog.tankList.length >= newTankBox.currentIndex) {
                            tkNum = addDeviceDialog.tankList[newTankBox.currentIndex - 1].tankNumber
                        }

                        if (loc === "" && trNum !== "") {
                            loc = "Train " + trNum + (cNum !== "" ? " - Coach " + cNum : "") + (tkNum !== "" ? " - Tank " + tkNum : "")
                        }

                        var ok = RailwayManager.addDevice(did, name, dtype, ctype, stat, loc, trNum, cNum, tkNum)
                        if (ok) {
                            addDeviceDialog.close()
                            root.allDevices = RailwayManager.devices
                        } else {
                            addDeviceErrorText.text = "Failed to add device. Please ensure Device ID is unique."
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // DIALOG 2: CONFIRM DELETE DEVICE DIALOG
    // ========================================================================
    Dialog {
        id: confirmDeleteDeviceDialog
        anchors.centerIn: parent
        width: 400
        modal: true
        padding: 24

        property string targetDeviceId: ""
        property string targetDeviceName: ""

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
                        text: "Remove Device?"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 16
                        font.weight: Font.Bold
                        color: Theme.colors.textPrimary
                    }
                    Text {
                        text: "This action will unlink any tank assignment."
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        color: Theme.colors.textSecondary
                    }
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.divider }

            Text {
                Layout.fillWidth: true
                text: "Are you sure you want to remove device <b>" + confirmDeleteDeviceDialog.targetDeviceName + "</b> (" + confirmDeleteDeviceDialog.targetDeviceId + ")?<br><br>Any connected tank will revert to unassigned status."
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
                    onClicked: confirmDeleteDeviceDialog.close()
                }

                StyledButton {
                    text: "Remove"
                    variant: "danger"
                    onClicked: {
                        var ok = RailwayManager.removeDevice(confirmDeleteDeviceDialog.targetDeviceId)
                        confirmDeleteDeviceDialog.close()
                        root.allDevices = RailwayManager.devices
                    }
                }
            }
        }
    }
}
