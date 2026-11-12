import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// LocationPage.qml — Map-First Industrial SCADA Train Location & Route Intelligence
// Displays live interactive Google Maps railway corridor with telemetry,
// contextual right-side detail drawer, and synchronized station refill table.
// ============================================================================
Item {
    id: root

    signal openSettingsRequested()

    // Fullscreen and Corridor expansion states
    property bool isMapFullscreen: false
    property bool isCorridorExpanded: false

    // Selection State: "" (closed/none) | "train" | "facility" | "station" | "destination"
    property string selectedEntityType: ""
    property var selectedEntity: null
    property string selectedStationCode: ""

    // Backward compatible bindings for inner drawer views
    readonly property string selectedMode: selectedEntityType
    readonly property var selectedData: selectedEntity
    readonly property bool isPanelOpen: selectedEntity !== null && selectedEntityType !== ""

    function openLocation(latitude, longitude, name) {
        if (mainMap) {
            mainMap.centerOnStation(latitude, longitude)
            mainMap.zoomLevel = 12
        }
        root.selectedEntityType = "station"
        root.selectedStationCode = name
        root.selectedEntity = {
            "name": name,
            "code": name,
            "latitude": latitude,
            "longitude": longitude,
            "distanceKm": 0,
            "operationalStatus": "Active Station / Facility",
            "etaString": "--"
        }
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background // #F8FAFC
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: root.isMapFullscreen ? 0 : 14
        spacing: root.isMapFullscreen ? 0 : 12

        // ====================================================================
        // SECTION 1: MAP + DETAILS PANEL (Map expands to full width when drawer is closed)
        // ====================================================================
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: root.isMapFullscreen ? 0 : 340
            spacing: (root.isPanelOpen && !root.isMapFullscreen) ? 12 : 0

            // Primary Google Map Viewport
            LocationMap {
                id: mainMap
                Layout.fillWidth: true
                Layout.fillHeight: true
                selectedCode: root.selectedStationCode
                isFullscreen: root.isMapFullscreen
                radius: root.isMapFullscreen ? 0 : 10
                border.width: root.isMapFullscreen ? 0 : 1

                onToggleFullscreenRequested: {
                    root.isMapFullscreen = !root.isMapFullscreen;
                    if (root.isMapFullscreen) {
                        root.selectedEntityType = "";
                        root.selectedEntity = null;
                        root.selectedStationCode = "";
                    }
                }

                onOpenSettingsRequested: root.openSettingsRequested()

                onTrainClicked: {
                    root.selectedEntityType = "train";
                    root.selectedEntity = LocationManager.trainLocation;
                    root.selectedStationCode = "TRAIN";
                }

                onFacilityClicked: (facilityData) => {
                    root.selectedEntityType = "facility";
                    root.selectedEntity = facilityData;
                    root.selectedStationCode = facilityData.code;
                }

                onStationClicked: (stationData) => {
                    root.selectedEntityType = "station";
                    root.selectedEntity = stationData;
                    root.selectedStationCode = stationData.code;
                }

                onDestinationClicked: (destData) => {
                    root.selectedEntityType = "destination";
                    root.selectedEntity = destData;
                    root.selectedStationCode = destData.code;
                }

                onEmptyMapClicked: {
                    root.selectedEntityType = "";
                    root.selectedEntity = null;
                    root.selectedStationCode = "";
                }
            }

            // Contextual Right Detail Drawer (Collapses completely to 0 width when closed or fullscreen)
            Rectangle {
                id: detailDrawer
                visible: Layout.preferredWidth > 0 && !root.isMapFullscreen
                Layout.preferredWidth: (root.isPanelOpen && !root.isMapFullscreen) ? 360 : 0
                Layout.fillHeight: true
                clip: true
                radius: 10
                color: "#FFFFFF"
                border.width: root.isPanelOpen ? 1 : 0
                border.color: Theme.colors.border
                opacity: root.isPanelOpen ? 1.0 : 0.0

                Behavior on Layout.preferredWidth {
                    NumberAnimation {
                        duration: Theme.animLargeDrawer
                        easing.type: Easing.OutCubic
                    }
                }
                Behavior on opacity {
                    NumberAnimation {
                        duration: Theme.animSmallPanel
                        easing.type: Easing.OutQuad
                    }
                }

                // Scrollable Content inside Drawer
                Flickable {
                    anchors.fill: parent
                    contentWidth: width
                    contentHeight: drawerContent.implicitHeight + 30
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds

                    ScrollBar.vertical: ScrollBar {
                        policy: ScrollBar.AsNeeded
                        active: true
                    }

                    ColumnLayout {
                        id: drawerContent
                        width: parent.width - 32
                        anchors.horizontalCenter: parent.horizontalCenter
                        anchors.top: parent.top
                        anchors.topMargin: 16
                        spacing: 14

                        // --------------------------------------------------------
                        // Top Drawer Header (Title + Reset to Train Button)
                        // --------------------------------------------------------
                        RowLayout {
                            Layout.fillWidth: true

                            Text {
                                text: {
                                    if (root.selectedMode === "train") return "TRAIN LOCATION DETAILS";
                                    if (root.selectedMode === "facility") return "WATER REFILL FACILITY";
                                    if (root.selectedMode === "station") return "RAILWAY STATION DETAILS";
                                    if (root.selectedMode === "destination") return "ROUTE DESTINATION";
                                    return "LOCATION DETAILS";
                                }
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.Bold
                                color: "#64748B"
                                font.letterSpacing: 0.8
                                Layout.fillWidth: true
                            }

                            // Close Details Drawer Button
                            Rectangle {
                                width: 26
                                height: 26
                                radius: 13
                                visible: true
                                color: closeMouse.containsMouse ? "#F1F5F9" : "transparent"
                                scale: closeMouse.pressed ? 0.92 : 1.0

                                Behavior on color {
                                    ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
                                }
                                Behavior on scale {
                                    NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad }
                                }

                                Text {
                                    anchors.centerIn: parent
                                    text: "✕"
                                    font.pixelSize: 12
                                    font.weight: Font.Bold
                                    color: closeMouse.containsMouse ? Theme.colors.textPrimary : "#64748B"
                                }

                                MouseArea {
                                    id: closeMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        root.selectedEntityType = "";
                                        root.selectedEntity = null;
                                        root.selectedStationCode = "";
                                    }
                                }
                            }
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: "#E2E8F0"
                        }

                        // ========================================================
                        // VIEW A: TRAIN SELECTED (Default View)
                        // ========================================================
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 12
                            visible: root.selectedMode === "train"

                            // Train Identity & Status Pill
                            RowLayout {
                                Layout.fillWidth: true
                                Text {
                                    text: LocationManager.trainLocation.trainId ? LocationManager.trainLocation.trainId : "Train 001"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 18
                                    font.weight: Font.Bold
                                    color: Theme.colors.textPrimary
                                    Layout.fillWidth: true
                                }

                                Rectangle {
                                    height: 22
                                    radius: 11
                                    width: statusRow.implicitWidth + 12
                                    color: LocationManager.isGpsLive ? "#DCFCE7" : "#FEE2E2"

                                    RowLayout {
                                        id: statusRow
                                        anchors.centerIn: parent
                                        spacing: 5
                                        Rectangle {
                                            width: 6; height: 6; radius: 3
                                            color: LocationManager.isGpsLive ? "#16A34A" : "#DC2626"
                                        }
                                        Text {
                                            text: LocationManager.gpsStatus
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            font.weight: Font.Bold
                                            color: LocationManager.hasValidFix ? "#16A34A" : "#DC2626"
                                        }
                                    }
                                }
                            }

                            // Telemetry Grid
                            GridLayout {
                                Layout.fillWidth: true
                                columns: 2
                                rowSpacing: 8
                                columnSpacing: 12

                                Text { text: "GPS Status:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.gpsStatus; font.weight: Font.Bold; font.pixelSize: 12; color: LocationManager.hasValidFix ? "#16A34A" : "#DC2626"; font.family: Theme.typography.fontFamily }

                                Text { text: "Live Train Position:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.currentStationName; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Latitude:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.hasValidFix ? (LocationManager.trainLocation.latitude.toFixed(6) + "° N") : "Unavailable"; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Longitude:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.hasValidFix ? (LocationManager.trainLocation.longitude.toFixed(6) + "° E") : "Unavailable"; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Altitude:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.hasValidFix ? (LocationManager.trainLocation.altitudeMeters.toFixed(1) + " m") : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Satellites:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.hasValidFix ? LocationManager.trainLocation.satellites : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Live Speed:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.hasValidFix ? (LocationManager.trainSpeed.toFixed(0) + " km/h") : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Heading:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.hasValidFix ? LocationManager.trainHeading : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Destination:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.destinationStationName; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Distance Remaining:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.hasValidFix ? (LocationManager.destinationDistanceKm.toFixed(0) + " km") : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: "#0284C7"; font.family: Theme.typography.fontFamily }

                                Text { text: "Destination ETA:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.hasValidFix ? LocationManager.destinationEtaString : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: "#0284C7"; font.family: Theme.typography.fontFamily }

                                Text { text: "Last GPS Update:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.gpsLastUpdate; font.pixelSize: 12; color: "#64748B"; font.family: Theme.typography.fontFamily }
                            }

                            Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

                            // Water Status Sub-card
                            Text {
                                text: "WATER STATUS & ENDURANCE"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.Bold
                                color: "#64748B"
                                font.letterSpacing: 0.8
                            }

                            Rectangle {
                                Layout.fillWidth: true
                                Layout.preferredHeight: 110
                                radius: 8
                                color: "#F8FAFC"
                                border.width: 1
                                border.color: "#E2E8F0"

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 12
                                    spacing: 6

                                    RowLayout {
                                        Layout.fillWidth: true
                                        Text {
                                            text: Number(LocationManager.waterEndurance.totalMeasurableWaterLiters).toLocaleString(Qt.locale()) + " L"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 16
                                            font.weight: Font.Bold
                                            color: Theme.colors.textPrimary
                                        }
                                        Text {
                                            text: "/ " + Number(LocationManager.waterEndurance.totalCapacityLiters).toLocaleString(Qt.locale()) + " L"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 12
                                            color: "#64748B"
                                            Layout.fillWidth: true
                                        }
                                        Text {
                                            text: LocationManager.waterEndurance.fillPercentage.toFixed(1) + "%"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 14
                                            font.weight: Font.Bold
                                            color: "#0284C7"
                                        }
                                    }

                                    // Level Progress Bar
                                    Rectangle {
                                        Layout.fillWidth: true
                                        height: 7
                                        radius: 3.5
                                        color: "#E2E8F0"
                                        clip: true

                                        Rectangle {
                                            anchors.left: parent.left
                                            anchors.top: parent.top
                                            anchors.bottom: parent.bottom
                                            radius: 3.5
                                            width: parent.width * Math.max(0.0, Math.min(1.0, LocationManager.waterEndurance.fillPercentage / 100.0))
                                            color: LocationManager.waterEndurance.fillPercentage < 10.0 ? "#EF4444" : (LocationManager.waterEndurance.fillPercentage < 20.0 ? "#F59E0B" : "#0284C7")
                                        }
                                    }

                                    RowLayout {
                                        Layout.fillWidth: true
                                        Text { text: "Est. Consumption:"; color: "#64748B"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                                        Text { text: Number(LocationManager.waterEndurance.consumptionRateLph).toLocaleString(Qt.locale()) + " L/h"; font.weight: Font.DemiBold; font.pixelSize: 11; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily; Layout.fillWidth: true }
                                        Text { text: "Critical in:"; color: "#64748B"; font.pixelSize: 11; font.family: Theme.typography.fontFamily }
                                        Text { text: LocationManager.waterEndurance.timeUntilCriticalString; font.weight: Font.Bold; font.pixelSize: 11; color: "#EF4444"; font.family: Theme.typography.fontFamily }
                                    }
                                }
                            }

                            // Refill Decision Box
                            Rectangle {
                                Layout.fillWidth: true
                                Layout.preferredHeight: 90
                                radius: 8
                                color: {
                                    if (LocationManager.refillDecision === "SAFE") return "#F0FDF4";
                                    if (LocationManager.refillDecision === "REFILL RECOMMENDED") return "#FEFCE8";
                                    return "#FEF2F2";
                                }
                                border.width: 1
                                border.color: {
                                    if (LocationManager.refillDecision === "SAFE") return "#BBF7D0";
                                    if (LocationManager.refillDecision === "REFILL RECOMMENDED") return "#FEF08A";
                                    return "#FECACA";
                                }

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 12
                                    spacing: 4

                                    RowLayout {
                                        Layout.fillWidth: true
                                        Text {
                                            text: LocationManager.refillDecision === "SAFE" ? "✓  " + LocationManager.refillDecision : "⚠  " + LocationManager.refillDecision
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 12
                                            font.weight: Font.Bold
                                            color: {
                                                if (LocationManager.refillDecision === "SAFE") return "#16A34A";
                                                if (LocationManager.refillDecision === "REFILL RECOMMENDED") return "#CA8A04";
                                                return "#DC2626";
                                            }
                                            Layout.fillWidth: true
                                        }
                                        Text {
                                            text: "Margin: " + LocationManager.waterEndurance.marginString
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            font.weight: Font.Bold
                                            color: {
                                                if (LocationManager.refillDecision === "SAFE") return "#16A34A";
                                                if (LocationManager.refillDecision === "REFILL RECOMMENDED") return "#CA8A04";
                                                return "#DC2626";
                                            }
                                        }
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        text: {
                                            if (LocationManager.refillDecision === "SAFE") {
                                                return "Water supply is sufficient to reach destination within safe margin.";
                                            } else if (LocationManager.refillDecision === "REFILL RECOMMENDED") {
                                                return "Refill advised at next facility to prevent low water reserve.";
                                            }
                                            return "Water will reach critical 10% reserve before destination. Refill mandatory!";
                                        }
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 11
                                        color: "#475569"
                                        wrapMode: Text.Wrap
                                    }
                                }
                            }
                        }

                        // ========================================================
                        // VIEW B: WATER FILLING FACILITY SELECTED
                        // ========================================================
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 12
                            visible: root.selectedMode === "facility"

                            RowLayout {
                                Layout.fillWidth: true
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2
                                    Text {
                                        text: root.selectedData ? root.selectedData.name : "Facility"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 16
                                        font.weight: Font.Bold
                                        color: Theme.colors.textPrimary
                                        elide: Text.ElideRight
                                    }
                                    Text {
                                        text: root.selectedData ? ("Station Code: " + root.selectedData.code) : ""
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 11
                                        color: "#64748B"
                                    }
                                }

                                Rectangle {
                                    height: 22
                                    radius: 11
                                    width: facPill.implicitWidth + 12
                                    color: "#E0F2FE"
                                    RowLayout {
                                        id: facPill
                                        anchors.centerIn: parent
                                        spacing: 4
                                        Rectangle { width: 6; height: 6; radius: 3; color: "#0284C7" }
                                        Text {
                                            text: "Verified Refill"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            font.weight: Font.Bold
                                            color: "#0369A1"
                                        }
                                    }
                                }
                            }

                            Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

                            GridLayout {
                                Layout.fillWidth: true
                                columns: 2
                                rowSpacing: 8
                                columnSpacing: 12

                                Text { text: "Distance from Train:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: (root.selectedData && root.selectedData.distanceKm) ? (root.selectedData.distanceKm.toFixed(1) + " km") : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: "#0284C7"; font.family: Theme.typography.fontFamily }

                                Text { text: "Estimated Arrival:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: (root.selectedData && root.selectedData.etaString) ? root.selectedData.etaString : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: "#0284C7"; font.family: Theme.typography.fontFamily }

                                Text { text: "Verified Capacity:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: (root.selectedData && root.selectedData.waterFillingCapacityLiters > 0) ? (Number(root.selectedData.waterFillingCapacityLiters).toLocaleString(Qt.locale()) + " L") : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Operational Status:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: (root.selectedData && root.selectedData.operationalStatus) ? root.selectedData.operationalStatus : "Operational"; font.weight: Font.Bold; font.pixelSize: 12; color: "#16A34A"; font.family: Theme.typography.fontFamily }

                                Text { text: "Current Train Water:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: Number(LocationManager.waterEndurance.totalMeasurableWaterLiters).toLocaleString(Qt.locale()) + " L"; font.weight: Font.Medium; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Est. Water Endurance:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.waterEndurance.timeUntilCriticalString; font.weight: Font.Medium; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Arrival Before Critical:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text {
                                    text: {
                                        var etaMin = root.selectedData ? (root.selectedData.etaMinutes || 0) : 0;
                                        var critMin = LocationManager.waterEndurance.timeUntilCriticalMinutes || 0;
                                        var delta = critMin - etaMin;
                                        var h = Math.floor(Math.abs(delta) / 60);
                                        var m = Math.abs(delta) % 60;
                                        return (delta >= 0 ? "+" : "-") + (h > 0 ? (h + "h " + m + "m") : (m + "m"));
                                    }
                                    font.weight: Font.Bold
                                    font.pixelSize: 12
                                    color: "#16A34A"
                                    font.family: Theme.typography.fontFamily
                                }
                            }

                            // Decision Card
                            Rectangle {
                                Layout.fillWidth: true
                                Layout.preferredHeight: 64
                                radius: 8
                                color: "#F0FDF4"
                                border.width: 1
                                border.color: "#BBF7D0"

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.margins: 12
                                    spacing: 10

                                    Rectangle {
                                        width: 28; height: 28; radius: 14; color: "#DCFCE7"
                                        Text { anchors.centerIn: parent; text: "✓"; font.pixelSize: 14; font.weight: Font.Bold; color: "#16A34A" }
                                    }
                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        spacing: 1
                                        Text { text: "SAFE TO REFILL"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.Bold; color: "#16A34A" }
                                        Text { text: "Train arrives well before critical threshold."; font.family: Theme.typography.fontFamily; font.pixelSize: 11; color: "#475569" }
                                    }
                                }
                            }
                        }

                        // ========================================================
                        // VIEW C: STANDARD RAILWAY STATION SELECTED
                        // ========================================================
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 12
                            visible: root.selectedMode === "station"

                            RowLayout {
                                Layout.fillWidth: true
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2
                                    Text {
                                        text: root.selectedData ? root.selectedData.name : "Station"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 16
                                        font.weight: Font.Bold
                                        color: Theme.colors.textPrimary
                                        elide: Text.ElideRight
                                    }
                                    Text {
                                        text: root.selectedData ? ("Station Code: " + root.selectedData.code) : ""
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 11
                                        color: "#64748B"
                                    }
                                }

                                Rectangle {
                                    height: 22
                                    radius: 11
                                    width: stPill.implicitWidth + 12
                                    color: "#F1F5F9"
                                    RowLayout {
                                        id: stPill
                                        anchors.centerIn: parent
                                        spacing: 4
                                        Rectangle { width: 6; height: 6; radius: 3; color: "#94A3B8" }
                                        Text {
                                            text: "Standard Station"
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            font.weight: Font.Bold
                                            color: "#64748B"
                                        }
                                    }
                                }
                            }

                            Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

                            // No Water Facility Alert
                            Rectangle {
                                Layout.fillWidth: true
                                Layout.preferredHeight: 70
                                radius: 8
                                color: "#FFFBEB"
                                border.width: 1
                                border.color: "#FDE68A"

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.margins: 12
                                    spacing: 10

                                    Text { text: "⚠"; font.pixelSize: 18; color: "#D97706" }
                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        spacing: 1
                                        Text { text: "No Verified Refill Facility"; font.family: Theme.typography.fontFamily; font.pixelSize: 12; font.weight: Font.Bold; color: "#B45309" }
                                        Text { text: "Wayside passenger stop only. Train cannot refill water here."; font.family: Theme.typography.fontFamily; font.pixelSize: 11; color: "#78350F"; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                    }
                                }
                            }

                            GridLayout {
                                Layout.fillWidth: true
                                columns: 2
                                rowSpacing: 8
                                columnSpacing: 12

                                Text { text: "Distance from Train:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: (root.selectedData && root.selectedData.distanceKm) ? (root.selectedData.distanceKm.toFixed(1) + " km") : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Estimated Arrival:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: (root.selectedData && root.selectedData.etaString) ? root.selectedData.etaString : "--"; font.weight: Font.Bold; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Route Sequence:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: root.selectedData ? ("Stop #" + (root.selectedData.routeOrder + 1)) : "--"; font.weight: Font.Medium; font.pixelSize: 12; color: "#64748B"; font.family: Theme.typography.fontFamily }
                            }
                        }

                        // ========================================================
                        // VIEW D: ROUTE DESTINATION SELECTED
                        // ========================================================
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 12
                            visible: root.selectedMode === "destination"

                            RowLayout {
                                Layout.fillWidth: true
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2
                                    Text {
                                        text: root.selectedData ? root.selectedData.name : "Asansol Junction"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 16
                                        font.weight: Font.Bold
                                        color: Theme.colors.textPrimary
                                    }
                                    Text {
                                        text: "Mainline Route Terminal Destination"
                                        font.family: Theme.typography.fontFamily
                                        font.pixelSize: 11
                                        color: "#7C3AED"
                                        font.weight: Font.DemiBold
                                    }
                                }

                                Rectangle {
                                    width: 26; height: 26; rotation: 45; radius: 4; color: "#7C3AED"
                                    Rectangle { anchors.centerIn: parent; width: 10; height: 10; radius: 2; color: "#FFFFFF" }
                                }
                            }

                            Rectangle { Layout.fillWidth: true; height: 1; color: "#E2E8F0" }

                            GridLayout {
                                Layout.fillWidth: true
                                columns: 2
                                rowSpacing: 8
                                columnSpacing: 12

                                Text { text: "Distance Remaining:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.destinationDistanceKm.toFixed(0) + " km"; font.weight: Font.Bold; font.pixelSize: 12; color: "#7C3AED"; font.family: Theme.typography.fontFamily }

                                Text { text: "Estimated Arrival:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.destinationEtaString; font.weight: Font.Bold; font.pixelSize: 12; color: "#7C3AED"; font.family: Theme.typography.fontFamily }

                                Text { text: "Current Train Water:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: Number(LocationManager.waterEndurance.totalMeasurableWaterLiters).toLocaleString(Qt.locale()) + " L"; font.weight: Font.Medium; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Estimated Endurance:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text { text: LocationManager.waterEndurance.timeUntilCriticalString; font.weight: Font.Medium; font.pixelSize: 12; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }

                                Text { text: "Water Safety Margin:"; color: "#64748B"; font.pixelSize: 12; font.family: Theme.typography.fontFamily }
                                Text {
                                    text: LocationManager.waterEndurance.marginString
                                    font.weight: Font.Bold
                                    font.pixelSize: 12
                                    color: {
                                        if (LocationManager.refillDecision === "SAFE") return "#16A34A";
                                        if (LocationManager.refillDecision === "REFILL RECOMMENDED") return "#D97706";
                                        return "#DC2626";
                                    }
                                    font.family: Theme.typography.fontFamily
                                }
                            }

                            // Decision Banner
                            Rectangle {
                                Layout.fillWidth: true
                                Layout.preferredHeight: 64
                                radius: 8
                                color: LocationManager.refillDecision === "SAFE" ? "#F0FDF4" : "#FEF2F2"
                                border.width: 1
                                border.color: LocationManager.refillDecision === "SAFE" ? "#BBF7D0" : "#FECACA"

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.margins: 12
                                    spacing: 10

                                    Rectangle {
                                        width: 28; height: 28; radius: 14
                                        color: LocationManager.refillDecision === "SAFE" ? "#DCFCE7" : "#FEE2E2"
                                        Text {
                                            anchors.centerIn: parent
                                            text: LocationManager.refillDecision === "SAFE" ? "✓" : "!"
                                            font.pixelSize: 14
                                            font.weight: Font.Bold
                                            color: LocationManager.refillDecision === "SAFE" ? "#16A34A" : "#DC2626"
                                        }
                                    }

                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        spacing: 1
                                        Text {
                                            text: LocationManager.refillDecision
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 12
                                            font.weight: Font.Bold
                                            color: LocationManager.refillDecision === "SAFE" ? "#16A34A" : "#DC2626"
                                        }
                                        Text {
                                            text: LocationManager.refillDecision === "SAFE"
                                                ? "Water endurance is sufficient to reach Asansol safely."
                                                : "Refill required at upcoming facility before reaching Asansol."
                                            font.family: Theme.typography.fontFamily
                                            font.pixelSize: 11
                                            color: "#475569"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ====================================================================
        // SECTION 2: SYNCHRONIZED REFILL STATION TABLE (SCADA Style)
        // ====================================================================
        Rectangle {
            id: stationTableContainer
            visible: !root.isMapFullscreen
            Layout.fillWidth: true
            Layout.preferredHeight: root.isMapFullscreen ? 0 : (root.isCorridorExpanded ? 440 : 195)
            radius: 8
            color: "#FFFFFF"
            border.width: 1
            border.color: Theme.colors.border
            clip: true

            Behavior on Layout.preferredHeight {
                NumberAnimation {
                    duration: 220
                    easing.type: Easing.OutCubic
                }
            }

            ColumnLayout {
                anchors.fill: parent
                spacing: 0

                // Table Title Header Bar
                Rectangle {
                    Layout.fillWidth: true
                    height: 38
                    color: "#F8FAFC"
                    border.width: 0
                    border.color: "#E2E8F0"

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 16
                        anchors.rightMargin: 16
                        spacing: 12

                        Text {
                            text: "ROUTE CORRIDOR & REFILL FACILITIES — HOWRAH TO ASANSOL"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            font.weight: Font.Bold
                            color: "#334155"
                            font.letterSpacing: 0.5
                        }

                        Item { Layout.fillWidth: true }

                        Text {
                            text: "7 Route Stations • 4 Verified Water Refill Hubs • Click to locate on map"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 11
                            color: "#64748B"
                        }

                        // Expand / Collapse Route Corridor Toggle Button
                        Rectangle {
                            id: expandCorridorBtn
                            height: 26
                            radius: 4
                            width: expandCorridorContent.implicitWidth + 16
                            color: corridorMouse.pressed ? "#DBEAFE" : (corridorMouse.containsMouse ? "#EFF6FF" : "#FFFFFF")
                            border.width: 1
                            border.color: corridorMouse.containsMouse ? Theme.colors.primary : "#CBD5E1"
                            scale: corridorMouse.pressed ? 0.95 : 1.0

                            Behavior on color { ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad } }
                            Behavior on border.color { ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad } }
                            Behavior on scale { NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad } }

                            RowLayout {
                                id: expandCorridorContent
                                anchors.centerIn: parent
                                spacing: 5

                                Text {
                                    text: root.isCorridorExpanded ? "\u25BC" : "\u25B2"
                                    font.pixelSize: 9
                                    color: Theme.colors.primary
                                }

                                Text {
                                    text: root.isCorridorExpanded ? "Collapse Route Corridor" : "Expand Route Corridor"
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 11
                                    font.weight: Font.DemiBold
                                    color: Theme.colors.textPrimary
                                }
                            }

                            ToolTip.visible: corridorMouse.containsMouse
                            ToolTip.text: root.isCorridorExpanded ? "Collapse route corridor table" : "Expand route corridor to inspect all facilities"
                            ToolTip.delay: 300

                            MouseArea {
                                id: corridorMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    root.isCorridorExpanded = !root.isCorridorExpanded
                                }
                            }
                        }
                    }

                    Rectangle {
                        anchors.bottom: parent.bottom
                        width: parent.width
                        height: 1
                        color: "#E2E8F0"
                    }
                }

                // Table Column Header Row
                Rectangle {
                    Layout.fillWidth: true
                    height: 30
                    color: "#F1F5F9"

                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: 16
                        anchors.rightMargin: 16
                        spacing: 8

                        Text { text: "#"; width: 35; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 10; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                        Text { text: "CODE"; width: 55; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 10; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                        Text { text: "STATION NAME"; width: 155; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 10; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                        Text { text: "WATER REFILL CAPABILITY"; width: 175; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 10; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                        Text { text: "DISTANCE"; width: 90; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 10; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                        Text { text: "EST. ARRIVAL"; width: 90; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 10; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                        Text { text: "VERIFIED CAPACITY"; width: 120; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 10; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                        Text { text: "FACILITY STATUS"; width: 105; height: parent.height; verticalAlignment: Text.AlignVCenter; font.pixelSize: 10; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                        Text { text: "ACTION"; width: 55; height: parent.height; verticalAlignment: Text.AlignVCenter; horizontalAlignment: Text.AlignHCenter; font.pixelSize: 10; font.weight: Font.Bold; color: "#64748B"; font.family: Theme.typography.fontFamily }
                    }

                    Rectangle {
                        anchors.bottom: parent.bottom
                        width: parent.width
                        height: 1
                        color: "#E2E8F0"
                    }
                }

                // Scrollable Table Rows
                ListView {
                    id: stationListView
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    model: LocationManager.stations
                    spacing: 1

                    ScrollBar.vertical: ScrollBar {
                        policy: ScrollBar.AsNeeded
                        active: true
                    }

                    delegate: Rectangle {
                        id: rowDelegate
                        required property var modelData
                        required property int index

                        readonly property bool isSelected: root.selectedStationCode === modelData.code
                        readonly property bool isDestination: modelData.code === "ASN" || modelData.routeOrder === 6
                        readonly property bool isRefill: modelData.waterFillingAvailable && !isDestination

                        width: stationListView.width
                        height: 32
                        color: isSelected ? "#EFF6FF" : (rowMouseArea.containsMouse ? "#F8FAFC" : (index % 2 === 0 ? "#FFFFFF" : "#FDFEFE"))
                        border.width: isSelected ? 1 : 0
                        border.color: "#3B82F6"

                        Behavior on color {
                            ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
                        }
                        Behavior on border.color {
                            ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
                        }

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: 16
                            anchors.rightMargin: 16
                            spacing: 8

                            // 1. Order #
                            Text {
                                width: 35
                                height: parent.height
                                verticalAlignment: Text.AlignVCenter
                                text: String(modelData.routeOrder + 1)
                                font.pixelSize: 11
                                font.weight: Font.Medium
                                color: "#64748B"
                                font.family: Theme.typography.fontFamily
                            }

                            // 2. Station Code Badge
                            Item {
                                width: 55
                                height: parent.height

                                Rectangle {
                                    anchors.verticalCenter: parent.verticalCenter
                                    height: 18
                                    radius: 3
                                    width: 44
                                    color: rowDelegate.isDestination ? "#EDE9FE" : (rowDelegate.isRefill ? "#E0F2FE" : "#F1F5F9")
                                    border.width: 1
                                    border.color: rowDelegate.isDestination ? "#DDD6FE" : (rowDelegate.isRefill ? "#BAE6FD" : "#E2E8F0")

                                    Text {
                                        anchors.centerIn: parent
                                        text: modelData.code
                                        font.pixelSize: 10
                                        font.weight: Font.Bold
                                        color: rowDelegate.isDestination ? "#6D28D9" : (rowDelegate.isRefill ? "#0284C7" : "#475569")
                                        font.family: Theme.typography.fontFamily
                                    }
                                }
                            }

                            // 3. Station Name
                            Text {
                                width: 155
                                height: parent.height
                                verticalAlignment: Text.AlignVCenter
                                text: modelData.name
                                font.pixelSize: 12
                                font.weight: rowDelegate.isSelected ? Font.Bold : Font.DemiBold
                                color: rowDelegate.isSelected ? "#1D4ED8" : Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                elide: Text.ElideRight
                            }

                            // 4. Water Refill Capability
                            Item {
                                width: 175
                                height: parent.height

                                RowLayout {
                                    anchors.verticalCenter: parent.verticalCenter
                                    spacing: 6

                                    Rectangle {
                                        width: 7
                                        height: 7
                                        radius: 3.5
                                        color: rowDelegate.isRefill ? "#0284C7" : (rowDelegate.isDestination ? "#7C3AED" : "#94A3B8")
                                    }

                                    Text {
                                        text: rowDelegate.isDestination ? "Terminal • Refill Hub" : (rowDelegate.isRefill ? "Water Refill Available" : "No Refill Facility")
                                        font.pixelSize: 11
                                        font.weight: rowDelegate.isRefill ? Font.DemiBold : Font.Normal
                                        color: rowDelegate.isRefill ? "#0369A1" : (rowDelegate.isDestination ? "#6D28D9" : "#64748B")
                                        font.family: Theme.typography.fontFamily
                                    }
                                }
                            }

                            // 5. Distance from Train
                            Text {
                                width: 90
                                height: parent.height
                                verticalAlignment: Text.AlignVCenter
                                text: modelData.distanceKm ? (modelData.distanceKm.toFixed(1) + " km") : "--"
                                font.pixelSize: 11
                                font.weight: Font.Bold
                                color: "#0284C7"
                                font.family: Theme.typography.fontFamily
                            }

                            // 6. Estimated Arrival (ETA)
                            Text {
                                width: 90
                                height: parent.height
                                verticalAlignment: Text.AlignVCenter
                                text: modelData.etaString ? modelData.etaString : "--"
                                font.pixelSize: 11
                                font.weight: Font.Medium
                                color: "#334155"
                                font.family: Theme.typography.fontFamily
                            }

                            // 7. Verified Capacity
                            Text {
                                width: 120
                                height: parent.height
                                verticalAlignment: Text.AlignVCenter
                                text: (modelData.waterFillingCapacityLiters > 0) ? (Number(modelData.waterFillingCapacityLiters).toLocaleString(Qt.locale()) + " L") : "--"
                                font.pixelSize: 11
                                color: (modelData.waterFillingCapacityLiters > 0) ? Theme.colors.textPrimary : "#94A3B8"
                                font.family: Theme.typography.fontFamily
                            }

                            // 8. Facility Status
                            Item {
                                width: 105
                                height: parent.height

                                RowLayout {
                                    anchors.verticalCenter: parent.verticalCenter
                                    spacing: 5

                                    Rectangle {
                                        width: 6; height: 6; radius: 3
                                        color: modelData.operationalStatus === "Operational" ? "#16A34A" : "#94A3B8"
                                    }

                                    Text {
                                        text: modelData.operationalStatus
                                        font.pixelSize: 11
                                        color: modelData.operationalStatus === "Operational" ? "#16A34A" : "#64748B"
                                        font.family: Theme.typography.fontFamily
                                    }
                                }
                            }

                            // 9. Action Button (Locate on Map)
                            Item {
                                width: 55
                                height: parent.height

                                Rectangle {
                                    anchors.centerIn: parent
                                    height: 22
                                    width: 48
                                    radius: 4
                                    color: locateMouse.containsMouse ? "#0284C7" : "#F1F5F9"
                                    scale: locateMouse.pressed ? 0.94 : 1.0

                                    Behavior on color {
                                        ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
                                    }
                                    Behavior on scale {
                                        NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad }
                                    }

                                    Text {
                                        anchors.centerIn: parent
                                        text: "⌖ Map"
                                        font.pixelSize: 10
                                        font.weight: Font.Bold
                                        color: locateMouse.containsMouse ? "#FFFFFF" : "#475569"
                                        font.family: Theme.typography.fontFamily
                                    }

                                    MouseArea {
                                        id: locateMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            root.selectedStationCode = modelData.code;
                                            mainMap.centerOnStation(modelData.latitude, modelData.longitude);
                                            if (rowDelegate.isDestination) {
                                                root.selectedEntityType = "destination";
                                                root.selectedEntity = modelData;
                                            } else if (modelData.waterFillingAvailable) {
                                                root.selectedEntityType = "facility";
                                                root.selectedEntity = modelData;
                                            } else {
                                                root.selectedEntityType = "station";
                                                root.selectedEntity = modelData;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        MouseArea {
                            id: rowMouseArea
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.selectedStationCode = modelData.code;
                                mainMap.centerOnStation(modelData.latitude, modelData.longitude);
                                if (rowDelegate.isDestination) {
                                    root.selectedEntityType = "destination";
                                    root.selectedEntity = modelData;
                                } else if (modelData.waterFillingAvailable) {
                                    root.selectedEntityType = "facility";
                                    root.selectedEntity = modelData;
                                } else {
                                    root.selectedEntityType = "station";
                                    root.selectedEntity = modelData;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
