import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// CoachConfigurationPage.qml — Coach Configuration & Tank Geometry
// Configure tanks physically installed in each coach with custom geometry
// (Rectangular, Cylindrical, Custom), live capacity math, and device assignments.
// ============================================================================
Item {
    id: root

    signal backRequested()
    signal inspectTankDetails(int tankId, string tankNumber)

    property string trainNumber: RailwayManager.activeTrainNumber
    property int selectedCoachId: -1
    property string selectedCoachNumber: ""

    onTrainNumberChanged: refreshCoachSelection()

    function refreshCoachSelection() {
        var coaches = RailwayManager.getCoaches(trainNumber)
        if (coaches.length > 0) {
            selectedCoachId = coaches[0].id
            selectedCoachNumber = coaches[0].coachNumber
        } else {
            selectedCoachId = -1
            selectedCoachNumber = ""
        }
    }

    Component.onCompleted: refreshCoachSelection()

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 16

        // ====================================================================
        // COACH HEADER
        // ====================================================================
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 74
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 20
                anchors.rightMargin: 20
                spacing: 24

                // Back to Trains
                Rectangle {
                    width: 34; height: 34; radius: 6
                    color: backMouse.containsMouse ? "#F1F5F9" : "transparent"
                    Text { anchors.centerIn: parent; text: "←"; font.pixelSize: 18; color: "#475569" }
                    MouseArea {
                        id: backMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.backRequested()
                    }
                }

                ColumnLayout {
                    spacing: 2
                    Text {
                        text: "COACH CONFIGURATION & TANK GEOMETRY"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 16
                        font.weight: Font.Bold
                        color: Theme.colors.textPrimary
                    }
                    RowLayout {
                        spacing: 16
                        Text {
                            text: "Train: " + root.trainNumber + " (" + (RailwayManager.activeTrain.trainName || "Express") + ")"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            font.weight: Font.DemiBold
                            color: Theme.colors.panoramaRed
                        }
                        Text { text: "•"; color: "#CBD5E1" }
                        Text {
                            text: "Region: " + (RailwayManager.activeTrain.region || "Eastern Railway")
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            color: "#64748B"
                        }
                    }
                }

                Item { Layout.fillWidth: true }

                // Coach Selector Tab Bar
                RowLayout {
                    spacing: 6
                    Repeater {
                        model: RailwayManager.coaches
                        delegate: Rectangle {
                            required property var modelData
                            height: 36
                            width: cTabRow.implicitWidth + 24
                            radius: 6
                            color: root.selectedCoachId === modelData.id ? Theme.colors.panoramaRed : (tabMouse.containsMouse ? "#F1F5F9" : "#FFFFFF")
                            border.width: 1
                            border.color: root.selectedCoachId === modelData.id ? Theme.colors.panoramaRed : "#CBD5E1"

                            RowLayout {
                                id: cTabRow
                                anchors.centerIn: parent
                                spacing: 6
                                Text {
                                    text: "Coach " + modelData.coachNumber
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.Bold
                                    color: root.selectedCoachId === modelData.id ? "#FFFFFF" : Theme.colors.textPrimary
                                }
                                Rectangle {
                                    width: 18; height: 18; radius: 9
                                    color: root.selectedCoachId === modelData.id ? "#FFFFFF" : "#E2E8F0"
                                    Text {
                                        anchors.centerIn: parent
                                        text: (modelData.tankCount || 0).toString()
                                        font.pixelSize: 10
                                        font.weight: Font.Bold
                                        color: root.selectedCoachId === modelData.id ? Theme.colors.panoramaRed : "#475569"
                                    }
                                }
                            }

                            MouseArea {
                                id: tabMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    root.selectedCoachId = modelData.id
                                    root.selectedCoachNumber = modelData.coachNumber
                                }
                            }
                        }
                    }

                    // + Add Coach Button
                    Rectangle {
                        height: 36
                        width: 36
                        radius: 6
                        color: addCMouse.containsMouse ? "#EFF6FF" : "#FFFFFF"
                        border.width: 1
                        border.color: "#3B82F6"
                        Text { anchors.centerIn: parent; text: "+"; color: "#2563EB"; font.pixelSize: 16; font.weight: Font.Bold }
                        ToolTip.visible: addCMouse.containsMouse
                        ToolTip.text: "Add new coach to train " + root.trainNumber
                        MouseArea {
                            id: addCMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: addCoachDialog.open()
                        }
                    }
                }
            }
        }

        // ====================================================================
        // TANK CONFIGURATION TABLE
        // ====================================================================
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
            clip: true

            ColumnLayout {
                anchors.fill: parent
                spacing: 0

                // Sub-header with + Add Tank button
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 52
                    color: "#FFFFFF"

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 20
                        anchors.rightMargin: 20

                        Text {
                            text: "Installed Water Tanks in Coach " + root.selectedCoachNumber
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                            font.weight: Font.Bold
                            color: Theme.colors.textPrimary
                        }

                        Item { Layout.fillWidth: true }

                        Rectangle {
                            height: 36
                            width: addTankRow.implicitWidth + 20
                            radius: 6
                            color: addTankMouse.pressed ? Theme.colors.primaryPressed : (addTankMouse.containsMouse ? Theme.colors.primaryHover : Theme.colors.panoramaRed)

                            RowLayout {
                                id: addTankRow
                                anchors.centerIn: parent
                                spacing: 6
                                Text { text: "+"; color: "#FFFFFF"; font.pixelSize: 16; font.weight: Font.Bold }
                                Text {
                                    text: "Add Tank"
                                    color: "#FFFFFF"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.DemiBold
                                }
                            }

                            MouseArea {
                                id: addTankMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    tankDialog.isEditMode = false
                                    tankDialog.tankId = -1
                                    tankDialog.tankNumber = "T0" + (RailwayManager.getTanksForCoach(root.selectedCoachId).length + 1)
                                    tankDialog.tankName = "Main Water Tank"
                                    tankDialog.geometryType = "Rectangular"
                                    tankDialog.lengthCm = 40.0
                                    tankDialog.widthCm = 30.0
                                    tankDialog.heightCm = 50.0
                                    tankDialog.diameterCm = 30.0
                                    tankDialog.capacityLiters = 60.0
                                    tankDialog.maxHeightCm = 50.0
                                    tankDialog.deviceId = ""
                                    tankDialog.open()
                                }
                            }
                        }
                    }
                }

                // Table Column Headers
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 38
                    color: "#F8FAFC"
                    border.width: 1
                    border.color: "#E2E8F0"

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 20
                        anchors.rightMargin: 20
                        spacing: 12

                        Text { Layout.preferredWidth: 80; text: "TANK #"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B" }
                        Text { Layout.preferredWidth: 120; text: "TYPE / NAME"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B" }
                        Text { Layout.preferredWidth: 120; text: "GEOMETRY"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B" }
                        Text { Layout.fillWidth: true; text: "DIMENSIONS"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B" }
                        Text { Layout.preferredWidth: 90; text: "CAPACITY"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; horizontalAlignment: Text.AlignHCenter }
                        Text { Layout.preferredWidth: 90; text: "HEIGHT"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; horizontalAlignment: Text.AlignHCenter }
                        Text { Layout.preferredWidth: 130; text: "ASSIGNED DEVICE"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B" }
                        Text { Layout.preferredWidth: 110; text: "STATUS"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; horizontalAlignment: Text.AlignHCenter }
                        Text { Layout.preferredWidth: 100; text: "ACTIONS"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#64748B"; horizontalAlignment: Text.AlignRight }
                    }
                }

                // Table Rows
                ListView {
                    id: tankListView
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds

                    model: RailwayManager.getTanksForCoach(root.selectedCoachId)

                    delegate: Rectangle {
                        required property var modelData
                        width: tankListView.width
                        height: 52
                        color: tRowHover.containsMouse ? "#F8FAFC" : "#FFFFFF"

                        Rectangle {
                            anchors.bottom: parent.bottom
                            width: parent.width
                            height: 1
                            color: "#E2E8F0"
                        }

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: 20
                            anchors.rightMargin: 20
                            spacing: 12

                            Text {
                                Layout.preferredWidth: 80
                                text: modelData.tankNumber
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 13
                                font.weight: Font.Bold
                                color: Theme.colors.panoramaRed
                            }

                            Text {
                                Layout.preferredWidth: 120
                                text: modelData.tankName ? modelData.tankName : "Standard Tank"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: Theme.colors.textPrimary
                                elide: Text.ElideRight
                            }

                            Text {
                                Layout.preferredWidth: 120
                                text: modelData.geometryType
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: Font.DemiBold
                                color: "#475569"
                            }

                            Text {
                                Layout.fillWidth: true
                                text: {
                                    if (modelData.geometryType === "Cylindrical") {
                                        return "Ø " + modelData.diameterCm + " × " + modelData.heightCm + " cm"
                                    } else {
                                        return modelData.lengthCm + " × " + modelData.widthCm + " × " + modelData.heightCm + " cm"
                                    }
                                }
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: "#334155"
                            }

                            Text {
                                Layout.preferredWidth: 90
                                text: (modelData.capacityLiters || 0).toFixed(1) + " L"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: Font.Bold
                                color: Theme.colors.textPrimary
                                horizontalAlignment: Text.AlignHCenter
                            }

                            Text {
                                Layout.preferredWidth: 90
                                text: (modelData.heightCm || 0) + " cm"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: "#64748B"
                                horizontalAlignment: Text.AlignHCenter
                            }

                            Text {
                                Layout.preferredWidth: 130
                                text: modelData.deviceId && modelData.deviceId.trim().length > 0 ? modelData.deviceId : "(Not Assigned)"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                color: modelData.deviceId ? "#1D4ED8" : "#94A3B8"
                                font.weight: modelData.deviceId ? Font.DemiBold : Font.Normal
                                elide: Text.ElideRight
                            }

                            // Device Status Pill
                            Item {
                                Layout.preferredWidth: 110
                                height: parent.height
                                Rectangle {
                                    anchors.centerIn: parent
                                    height: 22
                                    width: 96
                                    radius: 11
                                    color: {
                                        if (modelData.deviceStatus === "Online") return "#DCFCE7"
                                        if (modelData.deviceStatus === "NOT CONNECTED") return "#F1F5F9"
                                        return "#FEE2E2"
                                    }
                                    Text {
                                        anchors.centerIn: parent
                                        text: modelData.deviceStatus
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 9
                                        font.weight: Font.Bold
                                        color: {
                                            if (modelData.deviceStatus === "Online") return "#16A34A"
                                            if (modelData.deviceStatus === "NOT CONNECTED") return "#64748B"
                                            return "#DC2626"
                                        }
                                    }
                                }
                            }

                            // Actions
                            RowLayout {
                                Layout.preferredWidth: 100
                                Layout.alignment: Qt.AlignRight
                                spacing: 6

                                // Edit
                                Rectangle {
                                    width: 30; height: 28; radius: 4
                                    color: tEditMouse.containsMouse ? "#F1F5F9" : "#FFFFFF"
                                    border.width: 1
                                    border.color: "#CBD5E1"
                                    Text { anchors.centerIn: parent; text: "✏"; font.pixelSize: 11 }
                                    MouseArea {
                                        id: tEditMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            tankDialog.isEditMode = true
                                            tankDialog.tankId = modelData.id
                                            tankDialog.tankNumber = modelData.tankNumber
                                            tankDialog.tankName = modelData.tankName || ""
                                            tankDialog.geometryType = modelData.geometryType || "Rectangular"
                                            tankDialog.lengthCm = modelData.lengthCm || 40.0
                                            tankDialog.widthCm = modelData.widthCm || 30.0
                                            tankDialog.heightCm = modelData.heightCm || 50.0
                                            tankDialog.diameterCm = modelData.diameterCm || 30.0
                                            tankDialog.capacityLiters = modelData.capacityLiters || 60.0
                                            tankDialog.maxHeightCm = modelData.maxHeightCm || 50.0
                                            tankDialog.deviceId = modelData.deviceId || ""
                                            tankDialog.open()
                                        }
                                    }
                                }

                                // Delete
                                Rectangle {
                                    width: 30; height: 28; radius: 4
                                    color: tDelMouse.containsMouse ? "#FEE2E2" : "#FFFFFF"
                                    border.width: 1
                                    border.color: tDelMouse.containsMouse ? "#EF4444" : "#CBD5E1"
                                    Text { anchors.centerIn: parent; text: "🗑"; font.pixelSize: 11; color: tDelMouse.containsMouse ? "#EF4444" : "#64748B" }
                                    MouseArea {
                                        id: tDelMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            RailwayManager.deleteTank(modelData.id)
                                        }
                                    }
                                }
                            }
                        }

                        MouseArea {
                            id: tRowHover
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.ArrowCursor
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // TANK GEOMETRY CONFIGURATION DIALOG
    // ========================================================================
    Dialog {
        id: tankDialog
        anchors.centerIn: parent
        width: 480
        modal: true
        padding: 24

        property bool isEditMode: false
        property int tankId: -1
        property string tankNumber: ""
        property string tankName: ""
        property string geometryType: "Rectangular"
        property real lengthCm: 40.0
        property real widthCm: 30.0
        property real heightCm: 50.0
        property real diameterCm: 30.0
        property real capacityLiters: 60.0
        property real maxHeightCm: 50.0
        property string deviceId: ""

        background: Rectangle {
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: "#E2E8F0"
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            Text {
                text: tankDialog.isEditMode ? "Edit Tank Geometry — " + tankDialog.tankNumber : "Configure New Tank Geometry"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 16
                font.weight: Font.Bold
                color: Theme.colors.textPrimary
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                // Tank Number
                ColumnLayout {
                    Layout.preferredWidth: 140
                    spacing: 4
                    Text { text: "Tank Number *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: tankNumIn
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.tankNumber
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12
                        }
                    }
                }

                // Tank Name
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Tank Name / Location"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: tankNameIn
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.tankName
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12
                        }
                    }
                }
            }

            // Geometry Type Selector (Rectangular vs Cylindrical vs Custom)
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "Tank Geometry Shape *"; font.family: Theme.typography.fontFamily; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                RowLayout {
                    spacing: 12
                    RadioButton {
                        id: rectRadio
                        text: "Rectangular"
                        checked: tankDialog.geometryType === "Rectangular"
                        onClicked: {
                            tankDialog.geometryType = "Rectangular"
                            updateCalculatedCapacity()
                        }
                    }
                    RadioButton {
                        id: cylRadio
                        text: "Cylindrical"
                        checked: tankDialog.geometryType === "Cylindrical"
                        onClicked: {
                            tankDialog.geometryType = "Cylindrical"
                            updateCalculatedCapacity()
                        }
                    }
                    RadioButton {
                        id: custRadio
                        text: "Custom"
                        checked: tankDialog.geometryType === "Custom"
                        onClicked: {
                            tankDialog.geometryType = "Custom"
                            updateCalculatedCapacity()
                        }
                    }
                }
            }

            // Dynamic Dimensions Form based on geometry
            GridLayout {
                Layout.fillWidth: true
                columns: 3
                rowSpacing: 8
                columnSpacing: 12

                // RECTANGULAR: Length, Width, Height
                ColumnLayout {
                    visible: rectRadio.checked || custRadio.checked
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Length (cm)"; font.pixelSize: 11; font.weight: Font.DemiBold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 34; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: lenInput
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.lengthCm.toString()
                            onTextChanged: updateCalculatedCapacity()
                        }
                    }
                }

                ColumnLayout {
                    visible: rectRadio.checked || custRadio.checked
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Width (cm)"; font.pixelSize: 11; font.weight: Font.DemiBold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 34; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: widthInput
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.widthCm.toString()
                            onTextChanged: updateCalculatedCapacity()
                        }
                    }
                }

                // CYLINDRICAL: Diameter
                ColumnLayout {
                    visible: cylRadio.checked
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Diameter (cm)"; font.pixelSize: 11; font.weight: Font.DemiBold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 34; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: diamInput
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.diameterCm.toString()
                            onTextChanged: updateCalculatedCapacity()
                        }
                    }
                }

                // Physical Height (Universal)
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Physical Height (cm)"; font.pixelSize: 11; font.weight: Font.DemiBold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 34; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: heightInput
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.heightCm.toString()
                            onTextChanged: updateCalculatedCapacity()
                        }
                    }
                }
            }

            // Calculated Capacity display & override
            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Calculated Capacity (Liters)"; font.pixelSize: 11; font.weight: Font.DemiBold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 34; radius: 4; color: "#F8FAFC"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: capInput
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.capacityLiters.toFixed(1)
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.Bold; color: Theme.colors.panoramaRed
                        }
                    }
                }

                // Device Assignment
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Text { text: "Assign Real ESP32 / Hardware Device"; font.pixelSize: 11; font.weight: Font.DemiBold; color: "#475569" }
                    Rectangle {
                        Layout.fillWidth: true; height: 34; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                        TextInput {
                            id: devInput
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8
                            verticalAlignment: TextInput.AlignVCenter
                            text: tankDialog.deviceId
                            font.family: Theme.typography.fontFamily; font.pixelSize: 12
                        }
                    }
                }
            }

            // Dialog Buttons
            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 8
                spacing: 12

                Item { Layout.fillWidth: true }

                Rectangle {
                    width: 80; height: 36; radius: 4; color: "#F1F5F9"; border.width: 1; border.color: "#CBD5E1"
                    Text { anchors.centerIn: parent; text: "Cancel"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.DemiBold; color: "#475569" }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: tankDialog.close() }
                }

                Rectangle {
                    width: 100; height: 36; radius: 4; color: Theme.colors.panoramaRed
                    Text { anchors.centerIn: parent; text: "Save Geometry"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.Bold; color: "#FFFFFF" }
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            var tNum = tankNumIn.text.trim()
                            var tName = tankNameIn.text.trim()
                            var geom = rectRadio.checked ? "Rectangular" : (cylRadio.checked ? "Cylindrical" : "Custom")
                            var l = parseFloat(lenInput.text) || 0.0
                            var w = parseFloat(widthInput.text) || 0.0
                            var h = parseFloat(heightInput.text) || 50.0
                            var d = parseFloat(diamInput.text) || 0.0
                            var cap = parseFloat(capInput.text) || 0.0
                            var dev = devInput.text.trim()

                            if (tankDialog.isEditMode) {
                                RailwayManager.updateTank(tankDialog.tankId, tNum, tName, geom, l, w, h, d, cap, h, dev)
                            } else {
                                RailwayManager.addTank(root.selectedCoachId, tNum, tName, geom, l, w, h, d, cap, h, dev)
                            }
                            tankDialog.close()
                        }
                    }
                }
            }
        }

        function updateCalculatedCapacity() {
            var geom = rectRadio.checked ? "Rectangular" : (cylRadio.checked ? "Cylindrical" : "Custom")
            var l = parseFloat(lenInput.text) || 0.0
            var w = parseFloat(widthInput.text) || 0.0
            var h = parseFloat(heightInput.text) || 0.0
            var d = parseFloat(diamInput.text) || 0.0
            var calc = RailwayManager.calculateCapacity(geom, l, w, h, d)
            if (calc > 0.0) {
                capInput.text = calc.toFixed(1)
            }
        }
    }

    // Add Coach Dialog
    Dialog {
        id: addCoachDialog
        anchors.centerIn: parent
        width: 360
        modal: true
        padding: 20

        background: Rectangle {
            radius: 8; color: "#FFFFFF"; border.width: 1; border.color: "#E2E8F0"
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 12

            Text { text: "Add Coach to Train " + root.trainNumber; font.family: Theme.typography.fontFamily; font.pixelSize: 15; font.weight: Font.Bold; color: Theme.colors.textPrimary }
            Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

            ColumnLayout {
                Layout.fillWidth: true; spacing: 4
                Text { text: "Coach Number * (e.g. S4, B2, A1)"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                Rectangle {
                    Layout.fillWidth: true; height: 36; radius: 4; color: "#FFFFFF"; border.width: 1; border.color: "#CBD5E1"
                    TextInput { id: newCNumIn; anchors.fill: parent; anchors.margins: 8; font.pixelSize: 12 }
                }
            }

            ColumnLayout {
                Layout.fillWidth: true; spacing: 4
                Text { text: "Coach Type"; font.pixelSize: 11; font.weight: Font.Bold; color: "#475569" }
                ComboBox {
                    id: newCTypeCombo
                    Layout.fillWidth: true
                    model: ["Sleeper Class", "AC 3-Tier", "AC 2-Tier", "AC First Class", "General / Unreserved", "Pantry Car"]
                }
            }

            RowLayout {
                Layout.fillWidth: true; Layout.topMargin: 8
                Item { Layout.fillWidth: true }
                Rectangle {
                    width: 70; height: 32; radius: 4; color: "#F1F5F9"
                    Text { anchors.centerIn: parent; text: "Cancel"; font.pixelSize: 12; color: "#475569" }
                    MouseArea { anchors.fill: parent; onClicked: addCoachDialog.close() }
                }
                Rectangle {
                    width: 80; height: 32; radius: 4; color: Theme.colors.panoramaRed
                    Text { anchors.centerIn: parent; text: "Add Coach"; font.pixelSize: 12; font.weight: Font.Bold; color: "#FFFFFF" }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            var cNum = newCNumIn.text.trim()
                            if (cNum.length > 0) {
                                RailwayManager.addCoach(root.trainNumber, cNum, newCTypeCombo.currentText, RailwayManager.coaches.length + 1, "")
                                newCNumIn.text = ""
                                addCoachDialog.close()
                                root.refreshCoachSelection()
                            }
                        }
                    }
                }
            }
        }
    }
}
