import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes
import PanoramaWaterTank

// ============================================================================
// LocationMap.qml — Real Interactive Google Maps Railway & Refill Intelligence Map
// High-performance Web Mercator tile streaming (Roadmap & Satellite/Hybrid),
// live train GPS tracking, authentic railway track corridor polyline,
// verified water-refill facilities, passenger stations, and destination markers.
// Fully interactive: drag to pan, scroll/buttons to zoom, click to inspect.
// ============================================================================
Rectangle {
    id: root

    radius: 10
    color: "#0F172A" // Dark slate background for map viewport
    border.width: 1
    border.color: Theme.colors.border
    clip: true

    // Interactive Signals
    signal trainClicked()
    signal stationClicked(var stationData)
    signal facilityClicked(var facilityData)
    signal destinationClicked(var destinationData)
    signal emptyMapClicked()
    signal openSettingsRequested()
    signal toggleFullscreenRequested()

    // Map Center & Projection State (Initial: train position if valid fix, or Howrah-Asansol corridor center)
    property real centerLat: (LocationManager.trainLocation && LocationManager.trainLocation.hasValidFix) ? LocationManager.trainLocation.latitude : 23.2324
    property real centerLon: (LocationManager.trainLocation && LocationManager.trainLocation.hasValidFix) ? LocationManager.trainLocation.longitude : 87.8615
    property int zoomLevel: 10 // Operational railway corridor zoom (8 - 15)
    property bool isSatelliteMode: false
    property bool isFullscreen: false

    // Active Selection State (synchronized with table and details drawer)
    property string selectedCode: "TRAIN"

    // Real API Key detection
    readonly property bool hasApiKey: LocationManager.googleMapsApiKey && LocationManager.googleMapsApiKey.trim().length > 0

    // Web Mercator Projection Formulas (Exact Google Maps coordinate math)
    function lonToMercatorX(lon, z) {
        return ((lon + 180.0) / 360.0) * 256.0 * Math.pow(2, z);
    }

    function latToMercatorY(lat, z) {
        var rad = lat * Math.PI / 180.0;
        var sinLat = Math.sin(rad);
        sinLat = Math.max(-0.9999, Math.min(0.9999, sinLat));
        return (0.5 - Math.log((1.0 + sinLat) / (1.0 - sinLat)) / (4.0 * Math.PI)) * 256.0 * Math.pow(2, z);
    }

    function geoToScreenX(lon) {
        var cx = lonToMercatorX(centerLon, zoomLevel);
        var x = lonToMercatorX(lon, zoomLevel);
        return root.width / 2.0 + (x - cx);
    }

    function geoToScreenY(lat) {
        var cy = latToMercatorY(centerLat, zoomLevel);
        var y = latToMercatorY(lat, zoomLevel);
        return root.height / 2.0 + (y - cy);
    }

    function screenToGeoLon(sx) {
        var cx = lonToMercatorX(centerLon, zoomLevel);
        var x = cx + (sx - root.width / 2.0);
        return (x / (256.0 * Math.pow(2, zoomLevel))) * 360.0 - 180.0;
    }

    function screenToGeoLat(sy) {
        var cy = latToMercatorY(centerLat, zoomLevel);
        var y = cy + (sy - root.height / 2.0);
        var n = Math.PI - (2.0 * Math.PI * y) / (256.0 * Math.pow(2, zoomLevel));
        return 180.0 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    readonly property real deviceLat: LocationManager.hasValidFix ? LocationManager.trainLocation.latitude : (LocationManager.hasLastKnownLocation ? LocationManager.lastKnownLocation.latitude : 0.0)
    readonly property real deviceLon: LocationManager.hasValidFix ? LocationManager.trainLocation.longitude : (LocationManager.hasLastKnownLocation ? LocationManager.lastKnownLocation.longitude : 0.0)
    readonly property bool hasDeviceCoords: deviceLat !== 0.0 && deviceLon !== 0.0 && !isNaN(deviceLat) && !isNaN(deviceLon)

    function centerOnCurrentLocation() {
        if (typeof ApiClient !== "undefined" && ApiClient && typeof ApiClient.getStatus === "function") {
            ApiClient.getStatus();
        }

        if (LocationManager.hasValidFix && LocationManager.trainLocation && LocationManager.trainLocation.latitude !== 0.0) {
            centerLat = LocationManager.trainLocation.latitude;
            centerLon = LocationManager.trainLocation.longitude;
            zoomLevel = 14;
            selectedCode = "DEVICE_T01";
            deviceInfoPanel.visible = true;
            showFeedbackToast("Map centered on physical GNSS position: " + LocationManager.trainLocation.latitude.toFixed(6) + ", " + LocationManager.trainLocation.longitude.toFixed(6));
            return;
        }

        if (LocationManager.hasLastKnownLocation && LocationManager.lastKnownLocation && LocationManager.lastKnownLocation.latitude !== 0.0) {
            centerLat = LocationManager.lastKnownLocation.latitude;
            centerLon = LocationManager.lastKnownLocation.longitude;
            zoomLevel = 14;
            selectedCode = "DEVICE_T01";
            deviceInfoPanel.visible = true;
            showFeedbackToast("GPS Fix Lost — Showing Last Known Location: " + LocationManager.lastKnownLocation.latitude.toFixed(6) + ", " + LocationManager.lastKnownLocation.longitude.toFixed(6));
            return;
        }

        selectedCode = "DEVICE_T01";
        deviceInfoPanel.visible = true;
        showFeedbackToast("GPS location unavailable — Waiting for EC200U-CN GNSS satellite fix.");
    }

    function centerOnTrain() {
        if (LocationManager.trainLocation && LocationManager.trainLocation.hasValidFix) {
            centerLat = LocationManager.trainLocation.latitude;
            centerLon = LocationManager.trainLocation.longitude;
            zoomLevel = 11;
            showFeedbackToast("Map centered on Train " + (ApplicationStateManager.hasTrainContext ? ApplicationStateManager.selectedTrainNumber : "001"));
        } else {
            showFeedbackToast("Train location unavailable — waiting for GPS fix.");
        }
    }

    function centerOnStation(lat, lon) {
        centerLat = lat;
        centerLon = lon;
        zoomLevel = Math.max(10, zoomLevel);
    }

    // ========================================================================
    // TILE GRID COMPUTATION
    // ========================================================================
    property var visibleTiles: []

    function updateTiles() {
        if (root.width <= 0 || root.height <= 0) return;
        var z = root.zoomLevel;
        var cx = lonToMercatorX(root.centerLon, z);
        var cy = latToMercatorY(root.centerLat, z);
        var maxTileIndex = Math.pow(2, z) - 1;

        // Viewport bounds with 1-tile preload margin
        var minTx = Math.floor((cx - root.width / 2.0) / 256.0) - 1;
        var maxTx = Math.floor((cx + root.width / 2.0) / 256.0) + 1;
        var minTy = Math.floor((cy - root.height / 2.0) / 256.0) - 1;
        var maxTy = Math.floor((cy + root.height / 2.0) / 256.0) + 1;

        var tiles = [];
        var apiKeyParam = (LocationManager.googleMapsApiKey && LocationManager.googleMapsApiKey.trim().length > 0)
                          ? ("&key=" + LocationManager.googleMapsApiKey.trim()) : "";
        // 'm' = Roadmap, 'y' = Hybrid (Satellite + Road/City labels)
        var lyrs = root.isSatelliteMode ? "y" : "m";

        for (var ty = minTy; ty <= maxTy; ++ty) {
            if (ty < 0 || ty > maxTileIndex) continue;
            for (var tx = minTx; tx <= maxTx; ++tx) {
                var wrappedTx = ((tx % (maxTileIndex + 1)) + (maxTileIndex + 1)) % (maxTileIndex + 1);
                var tileX = root.width / 2.0 + (tx * 256.0 - cx);
                var tileY = root.height / 2.0 + (ty * 256.0 - cy);
                var tileUrl = "https://mt1.google.com/vt/lyrs=" + lyrs + "&x=" + wrappedTx + "&y=" + ty + "&z=" + z + apiKeyParam;

                tiles.push({
                    tileKey: z + "_" + wrappedTx + "_" + ty + "_" + lyrs,
                    screenX: Math.round(tileX),
                    screenY: Math.round(tileY),
                    url: tileUrl
                });
            }
        }
        visibleTiles = tiles;
    }

    onCenterLatChanged: updateTiles()
    onCenterLonChanged: updateTiles()
    onZoomLevelChanged: updateTiles()
    onIsSatelliteModeChanged: updateTiles()
    onWidthChanged: updateTiles()
    onHeightChanged: updateTiles()

    Component.onCompleted: {
        centerOnTrain();
        updateTiles();
    }

    Connections {
        target: LocationManager
        function onLocationChanged() {
            // If user hasn't panned far away, keep train in focus
            if (Math.abs(root.centerLat - LocationManager.trainLocation.latitude) < 0.04 &&
                Math.abs(root.centerLon - LocationManager.trainLocation.longitude) < 0.04) {
                root.centerLat = LocationManager.trainLocation.latitude;
                root.centerLon = LocationManager.trainLocation.longitude;
            }
        }
    }

    // ========================================================================
    // 1. INTERACTIVE GOOGLE MAPS TILE LAYER (Layer z: 1)
    // ========================================================================
    Item {
        id: tileLayer
        anchors.fill: parent
        z: 1
        clip: true

        Repeater {
            model: root.visibleTiles

            delegate: Image {
                required property var modelData
                x: modelData.screenX
                y: modelData.screenY
                width: 256
                height: 256
                source: modelData.url
                asynchronous: true
                cache: true
                fillMode: Image.Stretch
            }
        }
    }

    // ========================================================================
    // 2. PAN / ZOOM GESTURE RECOGNITION (Layer z: 5)
    // ========================================================================
    MouseArea {
        id: mapDragArea
        anchors.fill: parent
        z: 5
        hoverEnabled: true

        property real pressX: 0
        property real pressY: 0
        property real initialLat: 0
        property real initialLon: 0

        onPressed: (mouse) => {
            pressX = mouse.x;
            pressY = mouse.y;
            initialLat = root.centerLat;
            initialLon = root.centerLon;
        }

        onPositionChanged: (mouse) => {
            if (pressed) {
                var dx = mouse.x - pressX;
                var dy = mouse.y - pressY;
                var newCenterLon = root.screenToGeoLon(root.width / 2.0 - dx);
                var newCenterLat = root.screenToGeoLat(root.height / 2.0 - dy);
                root.centerLon = newCenterLon;
                root.centerLat = newCenterLat;
                pressX = mouse.x;
                pressY = mouse.y;
            }
        }

        onReleased: (mouse) => {
            var dx = Math.abs(mouse.x - pressX);
            var dy = Math.abs(mouse.y - pressY);
            if (dx < 5 && dy < 5) {
                root.emptyMapClicked();
            }
        }

        onWheel: (wheel) => {
            if (wheel.angleDelta.y > 0) {
                root.zoomLevel = Math.min(15, root.zoomLevel + 1);
            } else {
                root.zoomLevel = Math.max(8, root.zoomLevel - 1);
            }
        }
    }

    // ========================================================================
    // 3. RAILWAY ROUTE POLYLINE LAYER (Layer z: 10)
    // ========================================================================
    Canvas {
        id: routeCanvas
        anchors.fill: parent
        z: 10
        antialiasing: true

        onPaint: {
            var ctx = getContext("2d");
            ctx.clearRect(0, 0, width, height);

            var stList = LocationManager.stations;
            if (!stList || stList.length < 2) return;

            // 1. Ballast bed base (dark outline)
            ctx.beginPath();
            for (var i = 0; i < stList.length; ++i) {
                var sx = root.geoToScreenX(stList[i].longitude);
                var sy = root.geoToScreenY(stList[i].latitude);
                if (i === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            }
            ctx.lineWidth = 9;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = "#0F172A";
            ctx.stroke();

            // 2. Track substrate
            ctx.beginPath();
            for (var j = 0; j < stList.length; ++j) {
                var sx2 = root.geoToScreenX(stList[j].longitude);
                var sy2 = root.geoToScreenY(stList[j].latitude);
                if (j === 0) ctx.moveTo(sx2, sy2);
                else ctx.lineTo(sx2, sy2);
            }
            ctx.lineWidth = 6;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = root.isSatelliteMode ? "#CBD5E1" : "#475569";
            ctx.stroke();

            // 3. Railway sleepers / ties (dashed pattern)
            ctx.save();
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            for (var k = 0; k < stList.length; ++k) {
                var sx3 = root.geoToScreenX(stList[k].longitude);
                var sy3 = root.geoToScreenY(stList[k].latitude);
                if (k === 0) ctx.moveTo(sx3, sy3);
                else ctx.lineTo(sx3, sy3);
            }
            ctx.lineWidth = 8;
            ctx.strokeStyle = "#FFFFFF";
            ctx.stroke();
            ctx.restore();

            // 4. Vibrant mainline route corridor line
            ctx.beginPath();
            for (var m = 0; m < stList.length; ++m) {
                var sx4 = root.geoToScreenX(stList[m].longitude);
                var sy4 = root.geoToScreenY(stList[m].latitude);
                if (m === 0) ctx.moveTo(sx4, sy4);
                else ctx.lineTo(sx4, sy4);
            }
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = "#0284C7";
            ctx.stroke();
        }

        Connections {
            target: root
            function onCenterLatChanged() { routeCanvas.requestPaint(); }
            function onCenterLonChanged() { routeCanvas.requestPaint(); }
            function onZoomLevelChanged() { routeCanvas.requestPaint(); }
            function onIsSatelliteModeChanged() { routeCanvas.requestPaint(); }
            function onWidthChanged() { routeCanvas.requestPaint(); }
            function onHeightChanged() { routeCanvas.requestPaint(); }
        }

        Connections {
            target: LocationManager
            function onRouteChanged() { routeCanvas.requestPaint(); }
        }
    }

    // ========================================================================
    // 4. RAILWAY STATIONS & FACILITIES LAYER (Layer z: 15)
    // ========================================================================
    Item {
        anchors.fill: parent
        z: 15

        Repeater {
            model: LocationManager.stations

            delegate: Item {
                id: stationMarker
                required property var modelData

                readonly property bool isDestination: modelData.code === "ASN" || modelData.routeOrder === 6
                readonly property bool isRefill: modelData.waterFillingAvailable && !isDestination
                readonly property bool isSelected: root.selectedCode === modelData.code

                x: root.geoToScreenX(modelData.longitude) - width / 2
                y: root.geoToScreenY(modelData.latitude) - height / 2
                width: 40
                height: 40

                // Outer selection halo when active
                Rectangle {
                    anchors.centerIn: parent
                    visible: stationMarker.isSelected
                    width: 48
                    height: 48
                    radius: 24
                    color: "transparent"
                    border.width: 2.5
                    border.color: "#22C55E"

                    SequentialAnimation on scale {
                        loops: Animation.Infinite
                        running: stationMarker.isSelected
                        NumberAnimation { from: 1.0; to: 1.25; duration: 900; easing.type: Easing.OutQuad }
                        NumberAnimation { from: 1.25; to: 1.0; duration: 900; easing.type: Easing.InOutQuad }
                    }
                }

                // 1. Destination Marker (Asansol - Purple Diamond)
                Rectangle {
                    anchors.centerIn: parent
                    visible: stationMarker.isDestination
                    width: 26
                    height: 26
                    rotation: 45
                    radius: 4
                    color: "#7C3AED"
                    border.width: 2
                    border.color: "#FFFFFF"

                    Rectangle {
                        anchors.centerIn: parent
                        width: 10
                        height: 10
                        radius: 2
                        color: "#FFFFFF"
                    }
                }

                // 2. Water-Refill Facility Marker (Blue with Water Droplet)
                Rectangle {
                    anchors.centerIn: parent
                    visible: stationMarker.isRefill
                    width: 32
                    height: 32
                    radius: 16
                    color: "#0284C7"
                    border.width: 2
                    border.color: "#FFFFFF"

                    // Pulse glow
                    Rectangle {
                        anchors.centerIn: parent
                        width: 40
                        height: 40
                        radius: 20
                        color: "transparent"
                        border.width: 1.5
                        border.color: "#38BDF8"
                        opacity: 0.7
                    }

                    Shape {
                        anchors.centerIn: parent
                        width: 14
                        height: 16
                        antialiasing: true

                        ShapePath {
                            fillColor: "#FFFFFF"
                            strokeColor: "transparent"
                            PathSvg {
                                path: "M7,1 C7,1 1.5,8 1.5,11.2 C1.5,14.4 4,16.5 7,16.5 C10,16.5 12.5,14.4 12.5,11.2 C12.5,8 7,1 7,1 Z"
                            }
                        }
                    }
                }

                // 3. Normal Railway Station (Slate Dot)
                Rectangle {
                    anchors.centerIn: parent
                    visible: !stationMarker.isDestination && !stationMarker.isRefill
                    width: 18
                    height: 18
                    radius: 9
                    color: "#FFFFFF"
                    border.width: 3.5
                    border.color: "#475569"
                }

                // Station Code Label Badge
                Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    anchors.top: parent.bottom
                    anchors.topMargin: 2
                    height: 18
                    radius: 4
                    color: stationMarker.isSelected ? "#16A34A" : (stationMarker.isDestination ? "#6D28D9" : (stationMarker.isRefill ? "#0369A1" : "#1E293B"))
                    border.width: stationMarker.isSelected ? 1.5 : 0
                    border.color: "#FFFFFF"
                    width: labelRow.implicitWidth + 8

                    RowLayout {
                        id: labelRow
                        anchors.centerIn: parent
                        Text {
                            text: modelData.code
                            color: "#FFFFFF"
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 10
                            font.weight: Font.Bold
                        }
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    hoverEnabled: true
                    onClicked: {
                        root.selectedCode = modelData.code;
                        if (stationMarker.isDestination) {
                            root.destinationClicked(modelData);
                        } else if (modelData.waterFillingAvailable) {
                            root.facilityClicked(modelData);
                        } else {
                            root.stationClicked(modelData);
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // 5. LIVE TRAIN MARKER LAYER (Layer z: 20)
    // ========================================================================
    Item {
        id: liveTrainMarker
        visible: LocationManager.trainLocation && LocationManager.trainLocation.hasValidFix
        x: root.geoToScreenX(LocationManager.trainLocation.longitude) - width / 2
        y: root.geoToScreenY(LocationManager.trainLocation.latitude) - height / 2
        width: 44
        height: 44
        z: 20

        Behavior on x {
            NumberAnimation { duration: 300; easing.type: Easing.OutQuad }
        }
        Behavior on y {
            NumberAnimation { duration: 300; easing.type: Easing.OutQuad }
        }

        readonly property bool isSelected: root.selectedCode === "TRAIN"

        // Selection Ring
        Rectangle {
            anchors.centerIn: parent
            visible: liveTrainMarker.isSelected
            width: 58
            height: 58
            radius: 29
            color: "transparent"
            border.width: 2.5
            border.color: "#38BDF8"
        }

        // Live Pulsing Ring Animation
        Rectangle {
            id: pulseRing
            anchors.centerIn: parent
            width: 52
            height: 52
            radius: 26
            color: "transparent"
            border.width: 2
            border.color: LocationManager.isGpsLive ? "#0284C7" : "#DC2626"
            opacity: 0.8

            SequentialAnimation on scale {
                loops: Animation.Infinite
                running: LocationManager.isGpsLive
                NumberAnimation { from: 0.9; to: 1.4; duration: 1200; easing.type: Easing.OutQuad }
                NumberAnimation { from: 1.4; to: 0.9; duration: 600; easing.type: Easing.InOutQuad }
            }
            SequentialAnimation on opacity {
                loops: Animation.Infinite
                running: LocationManager.isGpsLive
                NumberAnimation { from: 0.8; to: 0.1; duration: 1200 }
                NumberAnimation { from: 0.1; to: 0.8; duration: 600 }
            }
        }

        // Central Train Locomotive Badge
        Rectangle {
            anchors.centerIn: parent
            width: 38
            height: 38
            radius: 19
            color: LocationManager.isGpsLive ? "#0F172A" : "#7F1D1D"
            border.width: 2.5
            border.color: "#FFFFFF"

            Shape {
                anchors.centerIn: parent
                width: 18
                height: 18
                antialiasing: true

                ShapePath {
                    fillColor: "#FFFFFF"
                    strokeColor: "transparent"
                    PathSvg {
                        path: "M3,4 C3,2.5 4.5,2 9,2 C13.5,2 15,2.5 15,4 L15,11 C15,12.5 13.5,13 13,13 L14,15 L12,15 L11,13 L7,13 L6,15 L4,15 L5,13 C4.5,13 3,12.5 3,11 Z M5,5 L13,5 L13,8 L5,8 Z M6,10.5 C6.8,10.5 7.5,9.8 7.5,9 C7.5,8.2 6.8,7.5 6,7.5 C5.2,7.5 4.5,8.2 4.5,9 C4.5,9.8 5.2,10.5 6,10.5 Z M12,10.5 C12.8,10.5 13.5,9.8 13.5,9 C13.5,8.2 12.8,7.5 12,7.5 C11.2,7.5 10.5,8.2 10.5,9 C10.5,9.8 11.2,10.5 12,10.5 Z"
                    }
                }
            }
        }

        // Heading Pointer Triangle
        Item {
            anchors.centerIn: parent
            width: 44
            height: 44
            rotation: LocationManager.trainLocation.headingDegrees

            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                y: -6
                width: 9
                height: 9
                radius: 1.5
                color: "#38BDF8"
                rotation: 45
                border.width: 1
                border.color: "#FFFFFF"
            }
        }

        // Live Floating Badge Above Train
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.top
            anchors.bottomMargin: 6
            height: 20
            radius: 10
            color: LocationManager.isGpsLive ? "#0F172A" : "#991B1B"
            border.width: 1
            border.color: "#FFFFFF"
            width: trainTag.implicitWidth + 14

            RowLayout {
                id: trainTag
                anchors.centerIn: parent
                spacing: 5

                Rectangle {
                    width: 6
                    height: 6
                    radius: 3
                    color: LocationManager.isGpsLive ? "#22C55E" : "#EF4444"
                }

                Text {
                    text: LocationManager.isGpsLive 
                        ? (LocationManager.trainLocation.trainId + " • " + LocationManager.trainSpeed.toFixed(0) + " km/h")
                        : (LocationManager.trainLocation.trainId + " • GPS Stale")
                    color: "#FFFFFF"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 10
                    font.weight: Font.Bold
                }
            }
        }

        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            hoverEnabled: true
            onClicked: {
                root.selectedCode = "TRAIN";
                root.trainClicked();
            }
        }
    }

    // ========================================================================
    // 5b. REAL PHYSICAL DEVICE MARKER LAYER (T01 - Quectel EC200U-CN)
    // ========================================================================
    Item {
        id: deviceT01Marker
        visible: root.hasDeviceCoords
        x: root.geoToScreenX(root.deviceLon) - width / 2
        y: root.geoToScreenY(root.deviceLat) - height / 2
        width: 44
        height: 44
        z: 22

        Behavior on x { NumberAnimation { duration: 300; easing.type: Easing.OutQuad } }
        Behavior on y { NumberAnimation { duration: 300; easing.type: Easing.OutQuad } }

        readonly property bool isSelected: root.selectedCode === "DEVICE_T01"

        // Outer Glow / Selection Ring
        Rectangle {
            anchors.centerIn: parent
            visible: deviceT01Marker.isSelected
            width: 58
            height: 58
            radius: 29
            color: "transparent"
            border.width: 2.5
            border.color: LocationManager.hasValidFix ? "#38BDF8" : "#F59E0B"
        }

        // Live Pulsing Beacon Ring
        Rectangle {
            anchors.centerIn: parent
            width: 50
            height: 50
            radius: 25
            color: "transparent"
            border.width: 2
            border.color: LocationManager.hasValidFix ? "#0284C7" : "#D97706"
            opacity: 0.7

            SequentialAnimation on scale {
                loops: Animation.Infinite
                running: LocationManager.hasValidFix
                NumberAnimation { from: 0.9; to: 1.45; duration: 1200; easing.type: Easing.OutQuad }
                NumberAnimation { from: 1.45; to: 0.9; duration: 600; easing.type: Easing.InOutQuad }
            }
            SequentialAnimation on opacity {
                loops: Animation.Infinite
                running: LocationManager.hasValidFix
                NumberAnimation { from: 0.8; to: 0.1; duration: 1200 }
                NumberAnimation { from: 0.1; to: 0.8; duration: 600 }
            }
        }

        // Central Telemetry Badge
        Rectangle {
            anchors.centerIn: parent
            width: 36
            height: 36
            radius: 18
            color: LocationManager.hasValidFix ? "#0284C7" : "#78350F"
            border.width: 2.5
            border.color: "#FFFFFF"

            Text {
                anchors.centerIn: parent
                text: "T01"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 11
                font.weight: Font.Black
                color: "#FFFFFF"
            }
        }

        // Floating Tag Above Device Marker
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.top
            anchors.bottomMargin: 6
            height: 20
            radius: 10
            color: LocationManager.hasValidFix ? "#0F172A" : "#78350F"
            border.width: 1
            border.color: "#FFFFFF"
            width: devTagRow.implicitWidth + 14

            RowLayout {
                id: devTagRow
                anchors.centerIn: parent
                spacing: 5

                Rectangle {
                    width: 6; height: 6; radius: 3
                    color: LocationManager.hasValidFix ? "#22C55E" : "#F59E0B"
                }

                Text {
                    text: LocationManager.hasValidFix ? "T01 • Real GPS" : "T01 • Last Known"
                    color: "#FFFFFF"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 10
                    font.weight: Font.Bold
                }
            }
        }

        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            hoverEnabled: true
            onClicked: {
                root.selectedCode = "DEVICE_T01";
                deviceInfoPanel.visible = true;
            }
        }
    }

    // ========================================================================
    // 6. FLOATING UI OVERLAYS (Layer z: 25)
    // ========================================================================

    // Real Device Location Information Panel (Requirements 16 & 17)
    Rectangle {
        id: deviceInfoPanel
        visible: root.selectedCode === "DEVICE_T01" && !root.isFullscreen
        anchors.top: parent.top
        anchors.topMargin: 56
        anchors.right: parent.right
        anchors.rightMargin: 14
        width: 300
        height: devCol.implicitHeight + 28
        radius: 8
        color: Qt.rgba(1, 1, 1, 0.98)
        border.width: 1
        border.color: "#CBD5E1"
        z: 30
        clip: true

        ColumnLayout {
            id: devCol
            anchors.fill: parent
            anchors.margins: 14
            spacing: 10

            // Header Row with T01 badge and close button
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Rectangle {
                    width: 34
                    height: 22
                    radius: 4
                    color: Theme.colors.primary
                    Text {
                        anchors.centerIn: parent
                        text: "T01"
                        color: "#FFFFFF"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Bold
                    }
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 1
                    Text {
                        text: "Coach S1 • Rajdhani Express"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Bold
                        color: Theme.colors.textPrimary
                    }
                    Text {
                        text: "Train 12301 — Eastern Railway"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Medium
                        color: "#64748B"
                    }
                }

                Rectangle {
                    width: 20
                    height: 20
                    radius: 10
                    color: closeDevMouse.containsMouse ? "#F1F5F9" : "transparent"
                    Text {
                        anchors.centerIn: parent
                        text: "✕"
                        font.pixelSize: 10
                        color: "#64748B"
                    }
                    MouseArea {
                        id: closeDevMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            deviceInfoPanel.visible = false;
                            if (root.selectedCode === "DEVICE_T01") {
                                root.selectedCode = "";
                            }
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                height: 1
                color: "#E2E8F0"
            }

            // GNSS Status Pill
            Rectangle {
                Layout.fillWidth: true
                height: 24
                radius: 4
                color: LocationManager.hasValidFix ? "#ECFDF5" : (LocationManager.hasLastKnownLocation ? "#FFFBEB" : "#FEF2F2")
                border.width: 1
                border.color: LocationManager.hasValidFix ? "#A7F3D0" : (LocationManager.hasLastKnownLocation ? "#FDE68A" : "#FECACA")

                RowLayout {
                    anchors.centerIn: parent
                    spacing: 6
                    Rectangle {
                        width: 6; height: 6; radius: 3
                        color: LocationManager.hasValidFix ? "#059669" : (LocationManager.hasLastKnownLocation ? "#D97706" : "#DC2626")
                    }
                    Text {
                        text: LocationManager.hasValidFix ? "GPS FIXED (Live Physical Hardware)" : (LocationManager.hasLastKnownLocation ? "LAST KNOWN LOCATION" : "GPS FIX UNAVAILABLE")
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: LocationManager.hasValidFix ? "#065F46" : (LocationManager.hasLastKnownLocation ? "#B45309" : "#991B1B")
                    }
                }
            }

            // Telemetry Details Grid
            GridLayout {
                Layout.fillWidth: true
                columns: 2
                rowSpacing: 5
                columnSpacing: 10

                Text { text: "Latitude:"; font.pixelSize: 11; color: "#64748B"; font.weight: Font.Medium }
                Text {
                    text: root.hasDeviceCoords ? root.deviceLat.toFixed(6) : "Waiting for fix"
                    font.pixelSize: 11; font.weight: Font.DemiBold; color: Theme.colors.textPrimary; font.family: "Consolas"
                }

                Text { text: "Longitude:"; font.pixelSize: 11; color: "#64748B"; font.weight: Font.Medium }
                Text {
                    text: root.hasDeviceCoords ? root.deviceLon.toFixed(6) : "Waiting for fix"
                    font.pixelSize: 11; font.weight: Font.DemiBold; color: Theme.colors.textPrimary; font.family: "Consolas"
                }

                Text { text: "Satellites:"; font.pixelSize: 11; color: "#64748B"; font.weight: Font.Medium }
                Text {
                    text: (LocationManager.hasValidFix ? LocationManager.trainLocation.satellites : (LocationManager.hasLastKnownLocation ? LocationManager.lastKnownLocation.satellites : 0)).toString()
                    font.pixelSize: 11; font.weight: Font.DemiBold; color: Theme.colors.textPrimary
                }

                Text { text: "Altitude:"; font.pixelSize: 11; color: "#64748B"; font.weight: Font.Medium }
                Text {
                    text: ((LocationManager.hasValidFix ? LocationManager.trainLocation.altitudeMeters : (LocationManager.hasLastKnownLocation ? LocationManager.lastKnownLocation.altitudeMeters : 0.0)).toFixed(1)) + " m"
                    font.pixelSize: 11; font.weight: Font.DemiBold; color: Theme.colors.textPrimary
                }

                Text { text: "Last update:"; font.pixelSize: 11; color: "#64748B"; font.weight: Font.Medium }
                Text {
                    text: LocationManager.gpsLastUpdate
                    font.pixelSize: 11; font.weight: Font.DemiBold; color: Theme.colors.textPrimary
                }

                Text { text: "Modem:"; font.pixelSize: 10; color: "#94A3B8"; font.weight: Font.Medium }
                Text {
                    text: "EC200U-CNAA-N05-SGNSA"
                    font.pixelSize: 10; font.weight: Font.Medium; color: "#94A3B8"
                }
            }
        }
    }

    // Next Water Refill Banner (Top Left)
    Rectangle {
        id: nextRefillCard
        visible: !root.isFullscreen
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.margins: 14
        height: 52
        radius: 8
        color: Qt.rgba(1, 1, 1, 0.95)
        border.width: 1
        border.color: "#CBD5E1"
        z: 25
        width: nextRefillContent.implicitWidth + 24

        RowLayout {
            id: nextRefillContent
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            spacing: 12

            Rectangle {
                width: 32
                height: 32
                radius: 16
                color: "#E0F2FE"
                Shape {
                    anchors.centerIn: parent
                    width: 12
                    height: 14
                    ShapePath {
                        fillColor: "#0284C7"
                        strokeColor: "transparent"
                        PathSvg { path: "M6,0 C6,0 1,6 1,8.5 C1,11 3,13 6,13 C9,13 11,11 11,8.5 C11,6 6,0 6,0 Z" }
                    }
                }
            }

            ColumnLayout {
                spacing: 1
                Text {
                    text: "NEXT WATER REFILL FACILITY"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 10
                    font.weight: Font.Bold
                    color: "#64748B"
                    font.letterSpacing: 0.6
                }
                RowLayout {
                    spacing: 8
                    Text {
                        text: LocationManager.nextRefillStation.name ? LocationManager.nextRefillStation.name : "Bardhaman Junction"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Bold
                        color: Theme.colors.textPrimary
                    }
                    Text { text: "•"; color: "#94A3B8"; font.pixelSize: 12 }
                    Text {
                        text: LocationManager.nextRefillStation.distanceKm ? (LocationManager.nextRefillStation.distanceKm.toFixed(1) + " km") : "9.4 km"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.DemiBold
                        color: "#0284C7"
                    }
                    Text { text: "•"; color: "#94A3B8"; font.pixelSize: 12 }
                    Text {
                        text: LocationManager.nextRefillStation.etaString ? LocationManager.nextRefillStation.etaString : "8m"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                        font.weight: Font.Medium
                        color: "#475569"
                    }
                }
            }
        }

        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            hoverEnabled: true
            onClicked: {
                root.selectedCode = LocationManager.nextRefillStation.code || "BWN";
                root.facilityClicked(LocationManager.nextRefillStation);
            }
        }
    }

    // Map Controls Toolbar (Top Right)
    RowLayout {
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.margins: 14
        spacing: 8
        z: 25

        // Live Google Maps Status Indicator
        Rectangle {
            visible: !root.isFullscreen
            height: 32
            radius: 6
            color: "#FFFFFF"
            border.width: 1
            border.color: "#CBD5E1"
            width: mapStatusRow.implicitWidth + 16

            RowLayout {
                id: mapStatusRow
                anchors.centerIn: parent
                spacing: 6
                Rectangle {
                    width: 7; height: 7; radius: 3.5
                    color: root.hasApiKey ? "#16A34A" : "#0284C7"
                }
                Text {
                    text: root.hasApiKey ? "Google Maps Connected" : "Google Maps Live"
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                    font.weight: Font.DemiBold
                    color: "#334155"
                }
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: root.openSettingsRequested()
            }
        }

        // Full Screen Map / Exit Full Screen Control
        Rectangle {
            id: fsBtn
            height: 32
            radius: 6
            width: fsRow.implicitWidth + 18
            color: root.isFullscreen ? "#EFF6FF" : (fsMouse.containsMouse ? "#F8FAFC" : "#FFFFFF")
            border.width: 1
            border.color: root.isFullscreen ? Theme.colors.primary : (fsMouse.containsMouse ? Theme.colors.primary : "#CBD5E1")
            scale: fsMouse.pressed ? 0.94 : 1.0

            Behavior on color { ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad } }
            Behavior on border.color { ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad } }
            Behavior on scale { NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad } }

            RowLayout {
                id: fsRow
                anchors.centerIn: parent
                spacing: 5

                Text {
                    text: root.isFullscreen ? "\u2715" : "\u2922"
                    font.pixelSize: 11
                    font.weight: Font.Bold
                    color: root.isFullscreen ? Theme.colors.primary : "#475569"
                }

                Text {
                    text: root.isFullscreen ? "Exit Full Screen" : "Expand Map"
                    color: root.isFullscreen ? Theme.colors.primary : Theme.colors.textPrimary
                    font.pixelSize: 11
                    font.weight: Font.Medium
                    font.family: Theme.typography.fontFamily
                }
            }

            ToolTip.visible: fsMouse.containsMouse
            ToolTip.text: root.isFullscreen ? "Exit full screen view" : "Full Screen Map"
            ToolTip.delay: 300

            MouseArea {
                id: fsMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    root.toggleFullscreenRequested()
                }
            }
        }

        // Satellite / Roadmap toggle
        Rectangle {
            height: 32
            radius: 6
            width: satText.implicitWidth + 16
            color: root.isSatelliteMode ? "#0F172A" : (satMouse.containsMouse ? "#F8FAFC" : "#FFFFFF")
            border.width: 1
            border.color: satMouse.containsMouse ? Theme.colors.primary : "#CBD5E1"
            scale: satMouse.pressed ? 0.94 : 1.0

            Behavior on color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }
            Behavior on border.color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }
            Behavior on scale {
                NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad }
            }

            Text {
                id: satText
                anchors.centerIn: parent
                text: root.isSatelliteMode ? "Map View" : "Satellite"
                color: root.isSatelliteMode ? "#FFFFFF" : Theme.colors.textPrimary
                font.pixelSize: 11
                font.weight: Font.Medium
                font.family: Theme.typography.fontFamily
            }
            MouseArea {
                id: satMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    root.isSatelliteMode = !root.isSatelliteMode;
                }
            }
        }

        // Current Physical Hardware Location (EC200U-CN Real GNSS)
        Rectangle {
            id: currentLocBtn
            height: 32
            radius: 6
            width: currentLocRow.implicitWidth + 18
            color: root.selectedCode === "DEVICE_T01" ? "#EFF6FF" : (currentLocMouse.containsMouse ? "#F8FAFC" : "#FFFFFF")
            border.width: 1
            border.color: root.selectedCode === "DEVICE_T01" ? Theme.colors.primary : (currentLocMouse.containsMouse ? Theme.colors.primary : "#CBD5E1")
            scale: currentLocMouse.pressed ? 0.94 : 1.0

            Behavior on color { ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad } }
            Behavior on border.color { ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad } }
            Behavior on scale { NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad } }

            RowLayout {
                id: currentLocRow
                anchors.centerIn: parent
                spacing: 6

                Rectangle {
                    width: 7; height: 7; radius: 3.5
                    color: LocationManager.hasValidFix ? "#16A34A" : (LocationManager.hasLastKnownLocation ? "#D97706" : "#DC2626")

                    SequentialAnimation on opacity {
                        loops: Animation.Infinite
                        running: LocationManager.hasValidFix
                        NumberAnimation { from: 1.0; to: 0.3; duration: 800 }
                        NumberAnimation { from: 0.3; to: 1.0; duration: 800 }
                    }
                }

                Text {
                    text: "Current Location"
                    font.pixelSize: 11
                    font.weight: Font.DemiBold
                    color: root.selectedCode === "DEVICE_T01" ? Theme.colors.primary : Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                }
            }

            ToolTip.visible: currentLocMouse.containsMouse
            ToolTip.text: LocationManager.hasValidFix
                ? "Center map on real physical EC200U-CN GNSS position (T01)"
                : (LocationManager.hasLastKnownLocation
                    ? "Show last known physical location (EC200U-CN)"
                    : "Waiting for EC200U-CN satellite lock")
            ToolTip.delay: 300

            MouseArea {
                id: currentLocMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    root.centerOnCurrentLocation();
                }
            }
        }

        // Center on Train Button
        Rectangle {
            height: 32
            radius: 6
            width: centerText.implicitWidth + 16
            color: centerMouse.containsMouse ? "#F8FAFC" : "#FFFFFF"
            border.width: 1
            border.color: centerMouse.containsMouse ? Theme.colors.primary : "#CBD5E1"
            scale: centerMouse.pressed ? 0.94 : 1.0

            Behavior on color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }
            Behavior on border.color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }
            Behavior on scale {
                NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad }
            }

            RowLayout {
                id: centerText
                anchors.centerIn: parent
                spacing: 4
                Text { text: "⌖"; font.pixelSize: 12; color: Theme.colors.primary }
                Text { text: "Center Train"; font.pixelSize: 11; font.weight: Font.Medium; color: Theme.colors.textPrimary; font.family: Theme.typography.fontFamily }
            }
            MouseArea {
                id: centerMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    root.selectedCode = "TRAIN";
                    root.centerOnTrain();
                    root.trainClicked();
                }
            }
        }

        // Zoom In [+]
        Rectangle {
            width: 32
            height: 32
            radius: 6
            color: zoomInMouse.containsMouse ? "#F8FAFC" : "#FFFFFF"
            border.width: 1
            border.color: zoomInMouse.containsMouse ? Theme.colors.primary : "#CBD5E1"
            scale: zoomInMouse.pressed ? 0.92 : 1.0

            Behavior on color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }
            Behavior on border.color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }
            Behavior on scale {
                NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad }
            }

            Text { anchors.centerIn: parent; text: "+"; font.pixelSize: 15; font.weight: Font.Bold; color: Theme.colors.textPrimary }
            MouseArea {
                id: zoomInMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    root.zoomLevel = Math.min(15, root.zoomLevel + 1);
                }
            }
        }

        // Zoom Out [-]
        Rectangle {
            width: 32
            height: 32
            radius: 6
            color: zoomOutMouse.containsMouse ? "#F8FAFC" : "#FFFFFF"
            border.width: 1
            border.color: zoomOutMouse.containsMouse ? Theme.colors.primary : "#CBD5E1"
            scale: zoomOutMouse.pressed ? 0.92 : 1.0

            Behavior on color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }
            Behavior on border.color {
                ColorAnimation { duration: Theme.animHover; easing.type: Easing.OutQuad }
            }
            Behavior on scale {
                NumberAnimation { duration: Theme.animMicro; easing.type: Easing.OutQuad }
            }

            Text { anchors.centerIn: parent; text: "−"; font.pixelSize: 15; font.weight: Font.Bold; color: Theme.colors.textPrimary }
            MouseArea {
                id: zoomOutMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    root.zoomLevel = Math.max(8, root.zoomLevel - 1);
                }
            }
        }
    }

    // Map Legend (Bottom Left)
    Rectangle {
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        anchors.margins: 14
        height: 30
        radius: 6
        color: Qt.rgba(1, 1, 1, 0.95)
        border.width: 1
        border.color: "#E2E8F0"
        z: 25
        width: legendRow.implicitWidth + 20

        RowLayout {
            id: legendRow
            anchors.centerIn: parent
            spacing: 14

            RowLayout {
                spacing: 5
                Rectangle { width: 9; height: 9; radius: 4.5; color: "#0F172A" }
                Text { text: "Live Train"; font.pixelSize: 11; font.weight: Font.Medium; color: "#475569"; font.family: Theme.typography.fontFamily }
            }

            RowLayout {
                spacing: 5
                Rectangle { width: 9; height: 9; radius: 4.5; color: "#0284C7" }
                Text { text: "Water Refill Facility"; font.pixelSize: 11; font.weight: Font.Medium; color: "#475569"; font.family: Theme.typography.fontFamily }
            }

            RowLayout {
                spacing: 5
                Rectangle { width: 9; height: 9; radius: 4.5; color: "#94A3B8" }
                Text { text: "Railway Station"; font.pixelSize: 11; font.weight: Font.Medium; color: "#475569"; font.family: Theme.typography.fontFamily }
            }

            RowLayout {
                spacing: 5
                Rectangle { width: 8; height: 8; rotation: 45; color: "#7C3AED" }
                Text { text: "Destination"; font.pixelSize: 11; font.weight: Font.Medium; color: "#475569"; font.family: Theme.typography.fontFamily }
            }
        }
    }

    // Dynamic GNSS Status Banner (reflects actual EC200U modem state per Requirement 19)
    Rectangle {
        id: gpsWarningBanner
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: 14
        height: 32
        width: warningRow.implicitWidth + 24
        radius: 16
        color: {
            switch (LocationManager.gpsBannerType) {
                case "FIXED": return "#ECFDF5";
                case "LOST": return "#FFFBEB";
                case "ERROR": return "#FEF2F2";
                default: return "#EFF6FF"; // SEARCHING
            }
        }
        border.width: 1
        border.color: {
            switch (LocationManager.gpsBannerType) {
                case "FIXED": return "#10B981";
                case "LOST": return "#F59E0B";
                case "ERROR": return "#F87171";
                default: return "#60A5FA"; // SEARCHING
            }
        }
        visible: true
        z: 35

        RowLayout {
            id: warningRow
            anchors.centerIn: parent
            spacing: 8
            Rectangle {
                width: 8
                height: 8
                radius: 4
                color: {
                    switch (LocationManager.gpsBannerType) {
                        case "FIXED": return "#059669";
                        case "LOST": return "#D97706";
                        case "ERROR": return "#DC2626";
                        default: return "#2563EB";
                    }
                }
                SequentialAnimation on opacity {
                    loops: Animation.Infinite
                    running: LocationManager.gpsBannerType === "SEARCHING"
                    NumberAnimation { from: 1.0; to: 0.2; duration: 700 }
                    NumberAnimation { from: 0.2; to: 1.0; duration: 700 }
                }
            }
            Text {
                text: LocationManager.gpsBannerText
                font.family: Theme.typography.fontFamily
                font.pixelSize: 12
                font.weight: Font.Bold
                color: {
                    switch (LocationManager.gpsBannerType) {
                        case "FIXED": return "#065F46";
                        case "LOST": return "#B45309";
                        case "ERROR": return "#DC2626";
                        default: return "#1D4ED8";
                    }
                }
            }
        }
    }

    // User Feedback Toast
    Rectangle {
        id: feedbackToast
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 56
        height: 34
        width: toastText.implicitWidth + 28
        radius: 17
        color: "#0F172A"
        opacity: 0.0
        z: 40

        Text {
            id: toastText
            anchors.centerIn: parent
            text: ""
            color: "#FFFFFF"
            font.family: Theme.typography.fontFamily
            font.pixelSize: 12
            font.weight: Font.Medium
        }

        SequentialAnimation {
            id: toastAnim
            NumberAnimation { target: feedbackToast; property: "opacity"; to: 0.95; duration: 200 }
            PauseAnimation { duration: 2800 }
            NumberAnimation { target: feedbackToast; property: "opacity"; to: 0.0; duration: 300 }
        }
    }

    function showFeedbackToast(msg) {
        toastText.text = msg;
        toastAnim.restart();
    }
}
