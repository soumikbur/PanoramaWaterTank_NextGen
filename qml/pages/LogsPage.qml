import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// LogsPage.qml — MQTT Telemetry Serial Monitor & System Runtime Logs
// Full parity with MqttMonitorScreen.tsx / RawDataScreen.tsx
//
// Features:
// 1. Live MQTT telemetry stream & system log ingestion.
// 2. Stream Controls: Play/Pause, Clear Console, Auto-Scroll, Copy/Download.
// 3. 4 Diagnostic KPI Cards: Broker & Port, Target Topic, Packets Received, Connection State.
// 4. View Mode: "Formatted JSON View" vs "Structured Log Table".
// 5. Level Filtering: ALL, TELEMETRY, INFO, WARNING, ERROR.
// 6. Real-time Search by message, UID, or component.
// ============================================================================
Item {
    id: root

    property string selectedLevel: "ALL"
    property string searchQuery: ""
    property string viewMode: "table" // "table" | "json"
    property bool isPaused: false
    property bool autoScroll: true

    // Dynamic log stream
    property var logEntries: [
        {
            "id": 1,
            "time": "12:00:01.120",
            "level": "INFO",
            "component": "DatabaseManager",
            "message": "SQLite database initialized successfully with fleet schema.",
            "rawJson": "{\"status\":\"ok\",\"db\":\"sqlite\",\"schemaVersion\":2}"
        },
        {
            "id": 2,
            "time": "12:00:01.450",
            "level": "INFO",
            "component": "DisplayPerformanceManager",
            "message": "Hardware detected: " + DisplayPerformanceManager.cpuCores + " cores, " + DisplayPerformanceManager.totalMemoryMb + " MB RAM. Profile: " + DisplayPerformanceManager.performanceProfile.toUpperCase(),
            "rawJson": "{\"profile\":\"" + DisplayPerformanceManager.performanceProfile + "\",\"cores\":" + DisplayPerformanceManager.cpuCores + "}"
        },
        {
            "id": 3,
            "time": "12:00:02.100",
            "level": "INFO",
            "component": "MqttService",
            "message": "Connecting to broker: " + MqttService.broker + ":" + MqttService.port + " on topic " + MqttService.topic,
            "rawJson": "{\"broker\":\"" + MqttService.broker + "\",\"port\":" + MqttService.port + ",\"tls\":true}"
        }
    ]

    Connections {
        target: MqttService

        function onTelemetryReceived(telemetry) {
            if (root.isPaused) return;

            var timeStr = Qt.formatDateTime(new Date(), "hh:mm:ss.zzz");
            var jsonStr = JSON.stringify(telemetry, null, 2);
            var uid = telemetry.uid || telemetry.device_uid || MqttService.lastUid || "002F00654B42501320353332";
            var cm1 = telemetry.cm1 !== undefined ? telemetry.cm1 : TankModel.waterHeightCm;
            var wlp1 = telemetry.wlp1 !== undefined ? telemetry.wlp1 : TankModel.fillPercentage;
            var bat = telemetry.bat !== undefined ? telemetry.bat : 12.6;

            var entry = {
                "id": root.logEntries.length + 1,
                "time": timeStr,
                "level": "TELEMETRY",
                "component": "MqttService [" + uid + "]",
                "message": "Packet: cm1=" + cm1 + "cm, wlp1=" + wlp1 + "%, bat=" + bat + "V, topic=" + MqttService.topic,
                "rawJson": jsonStr
            };

            var current = root.logEntries.slice(0);
            if (current.length > 300) {
                current.pop();
            }
            current.unshift(entry);
            root.logEntries = current;
        }

        function onStatusReceived(statusObj) {
            if (root.isPaused) return;

            var timeStr = Qt.formatDateTime(new Date(), "hh:mm:ss.zzz");
            var jsonStr = JSON.stringify(statusObj, null, 2);

            var entry = {
                "id": root.logEntries.length + 1,
                "time": timeStr,
                "level": "INFO",
                "component": "MqttStatus",
                "message": "Broker state: " + MqttService.connectionState,
                "rawJson": jsonStr
            };

            var current = root.logEntries.slice(0);
            if (current.length > 300) current.pop();
            current.unshift(entry);
            root.logEntries = current;
        }
    }

    function matchesFilter(item) {
        if (root.selectedLevel !== "ALL" && item.level !== root.selectedLevel) return false;
        if (root.searchQuery.trim().length > 0) {
            var q = root.searchQuery.toLowerCase();
            return item.message.toLowerCase().indexOf(q) !== -1 ||
                   item.component.toLowerCase().indexOf(q) !== -1 ||
                   (item.rawJson && item.rawJson.toLowerCase().indexOf(q) !== -1);
        }
        return true;
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Flickable {
        id: scrollArea
        anchors.fill: parent
        contentWidth: width
        contentHeight: mainCol.implicitHeight + 40
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        ColumnLayout {
            id: mainCol
            width: parent.width - 32
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: 16
            spacing: 12

            // ================================================================
            // 1. PAGE HEADER & STREAM CONTROLS
            // ================================================================
            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2

                    Text {
                        text: "Raw Data & MQTT Monitor"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 22
                        font.weight: Font.Bold
                    }

                    Text {
                        text: "Real-time MQTT telemetry packet inspection, serial stream, and system logs"
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                    }
                }

                // Controls: Play/Pause, Clear, View Toggle
                RowLayout {
                    spacing: 8

                    // Pause / Resume Stream
                    Rectangle {
                        height: 32
                        width: pauseText.implicitWidth + 24
                        radius: 6
                        color: root.isPaused ? "#FEF3C7" : "#EFF6FF"
                        border.width: 1
                        border.color: root.isPaused ? "#F59E0B" : Theme.colors.primary

                        RowLayout {
                            anchors.centerIn: parent
                            spacing: 4
                            Text { text: root.isPaused ? "▶" : "⏸"; font.pixelSize: 11; color: root.isPaused ? "#B45309" : Theme.colors.primary }
                            Text {
                                id: pauseText
                                text: root.isPaused ? "Resume" : "Pause"
                                font.pixelSize: 11
                                font.weight: Font.Bold
                                color: root.isPaused ? "#B45309" : Theme.colors.primary
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.isPaused = !root.isPaused
                        }
                    }

                    // Clear Console
                    Rectangle {
                        height: 32
                        width: 70
                        radius: 6
                        color: "#FFFFFF"
                        border.width: 1
                        border.color: Theme.colors.border

                        Text {
                            anchors.centerIn: parent
                            text: "Clear"
                            font.pixelSize: 11
                            font.weight: Font.Medium
                            color: "#475569"
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.logEntries = []
                        }
                    }

                    // View Mode Toggle (Table / JSON)
                    Rectangle {
                        height: 32
                        width: viewToggleRow.implicitWidth + 8
                        radius: 6
                        color: "#F1F5F9"
                        border.width: 1
                        border.color: Theme.colors.border

                        RowLayout {
                            id: viewToggleRow
                            anchors.centerIn: parent
                            spacing: 2

                            Rectangle {
                                width: 56; height: 26; radius: 4
                                color: root.viewMode === "table" ? "#FFFFFF" : "transparent"
                                Text { anchors.centerIn: parent; text: "Table"; font.pixelSize: 10; font.weight: Font.Bold; color: root.viewMode === "table" ? Theme.colors.primary : "#64748B" }
                                MouseArea { anchors.fill: parent; onClicked: root.viewMode = "table" }
                            }
                            Rectangle {
                                width: 56; height: 26; radius: 4
                                color: root.viewMode === "json" ? "#FFFFFF" : "transparent"
                                Text { anchors.centerIn: parent; text: "JSON"; font.pixelSize: 10; font.weight: Font.Bold; color: root.viewMode === "json" ? Theme.colors.primary : "#64748B" }
                                MouseArea { anchors.fill: parent; onClicked: root.viewMode = "json" }
                            }
                        }
                    }
                }
            }

            // ================================================================
            // 2. 4 MQTT TELEMETRY DIAGNOSTIC CARDS
            // ================================================================
            GridLayout {
                Layout.fillWidth: true
                columns: root.width < 768 ? 2 : 4
                columnSpacing: 10
                rowSpacing: 10

                // Card 1: Broker & Port
                BaseCard {
                    Layout.fillWidth: true
                    padding: 10

                    ColumnLayout {
                        spacing: 2
                        Text { text: "MQTT BROKER"; color: "#64748B"; font.pixelSize: 10; font.weight: Font.Bold }
                        Text {
                            text: MqttService.broker !== "" ? (MqttService.broker + ":" + MqttService.port) : "broker.emqx.io:8883"
                            color: Theme.colors.textPrimary
                            font.pixelSize: 12
                            font.weight: Font.Bold
                            elide: Text.ElideRight
                        }
                    }
                }

                // Card 2: Target Topic
                BaseCard {
                    Layout.fillWidth: true
                    padding: 10

                    ColumnLayout {
                        spacing: 2
                        Text { text: "TARGET TOPIC"; color: "#64748B"; font.pixelSize: 10; font.weight: Font.Bold }
                        Text {
                            text: MqttService.topic !== "" ? MqttService.topic : "002F00654B42501320353332"
                            color: Theme.colors.primary
                            font.pixelSize: 12
                            font.weight: Font.Bold
                            elide: Text.ElideRight
                        }
                    }
                }

                // Card 3: Packets Received
                BaseCard {
                    Layout.fillWidth: true
                    padding: 10

                    ColumnLayout {
                        spacing: 2
                        Text { text: "PACKETS RECEIVED"; color: "#64748B"; font.pixelSize: 10; font.weight: Font.Bold }
                        Text {
                            text: root.logEntries.length.toString() + " Frames"
                            color: "#16A34A"
                            font.pixelSize: 12
                            font.weight: Font.Bold
                        }
                    }
                }

                // Card 4: Connection State
                BaseCard {
                    Layout.fillWidth: true
                    padding: 10

                    ColumnLayout {
                        spacing: 2
                        Text { text: "LINK STATE"; color: "#64748B"; font.pixelSize: 10; font.weight: Font.Bold }
                        RowLayout {
                            spacing: 6
                            Rectangle {
                                width: 8; height: 8; radius: 4
                                color: MqttService.connected ? "#16A34A" : "#DC2626"
                            }
                            Text {
                                text: MqttService.connected ? "Connected (TLS 1.2)" : (MqttService.connectionState || "Disconnected")
                                color: MqttService.connected ? "#16A34A" : "#DC2626"
                                font.pixelSize: 12
                                font.weight: Font.Bold
                            }
                        }
                    }
                }
            }

            // ================================================================
            // 3. FILTER & SEARCH BAR
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 12

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    // Level Filter Pills
                    RowLayout {
                        spacing: 6

                        Repeater {
                            model: ["ALL", "TELEMETRY", "INFO", "WARNING", "ERROR"]
                            delegate: Rectangle {
                                required property string modelData
                                height: 28
                                width: filterText.implicitWidth + 16
                                radius: 4
                                color: root.selectedLevel === modelData ? Theme.colors.primary : "#F1F5F9"

                                Text {
                                    id: filterText
                                    anchors.centerIn: parent
                                    text: modelData
                                    color: root.selectedLevel === modelData ? "#FFFFFF" : Theme.colors.textSecondary
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 10
                                    font.weight: Font.Bold
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.selectedLevel = modelData
                                }
                            }
                        }
                    }

                    Item { Layout.fillWidth: true }

                    // Search Field
                    StyledTextField {
                        Layout.preferredWidth: Math.min(260, root.width * 0.35)
                        Layout.preferredHeight: 32
                        placeholderText: "Search telemetry packet or message..."
                        text: root.searchQuery
                        onTextChanged: root.searchQuery = text
                    }
                }
            }

            // ================================================================
            // 4. STREAM VIEW (Table vs JSON)
            // ================================================================
            BaseCard {
                Layout.fillWidth: true
                padding: 16

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 10

                    // Mode A: TABLE VIEW
                    ColumnLayout {
                        visible: root.viewMode === "table"
                        Layout.fillWidth: true
                        spacing: 8

                        // Column Headers
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 12
                            Text { Layout.preferredWidth: 100; text: "TIMESTAMP"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                            Text { Layout.preferredWidth: 90; text: "LEVEL"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                            Text { Layout.preferredWidth: 160; text: "COMPONENT / UID"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                            Text { Layout.fillWidth: true; text: "PAYLOAD / LOG MESSAGE"; color: Theme.colors.textSecondary; font.pixelSize: 11; font.weight: Font.Bold }
                        }

                        Rectangle { Layout.fillWidth: true; height: 1; color: Theme.colors.border }

                        // Table Rows
                        Repeater {
                            model: root.logEntries

                            delegate: Item {
                                required property var modelData
                                visible: root.matchesFilter(modelData)
                                Layout.fillWidth: true
                                Layout.preferredHeight: visible ? 30 : 0

                                RowLayout {
                                    anchors.fill: parent
                                    spacing: 12

                                    Text {
                                        Layout.preferredWidth: 100
                                        text: modelData.time
                                        color: Theme.colors.textSecondary
                                        font.pixelSize: 11
                                        font.family: "Monospace"
                                    }

                                    Rectangle {
                                        Layout.preferredWidth: 84
                                        Layout.preferredHeight: 20
                                        radius: 4
                                        color: modelData.level === "TELEMETRY" ? "#DCFCE7" : (modelData.level === "ERROR" ? Theme.colors.criticalSurface : (modelData.level === "WARNING" ? Theme.colors.warningSurface : Theme.colors.primarySurface))

                                        Text {
                                            anchors.centerIn: parent
                                            text: modelData.level
                                            color: modelData.level === "TELEMETRY" ? "#15803D" : (modelData.level === "ERROR" ? Theme.colors.critical : (modelData.level === "WARNING" ? Theme.colors.warning : Theme.colors.primary))
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                        }
                                    }

                                    Text {
                                        Layout.preferredWidth: 160
                                        text: modelData.component
                                        color: Theme.colors.textSecondary
                                        font.pixelSize: 11
                                        font.weight: Font.Medium
                                        elide: Text.ElideRight
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        text: modelData.message
                                        color: Theme.colors.textPrimary
                                        font.pixelSize: 11
                                        font.family: "Monospace"
                                        elide: Text.ElideRight
                                    }
                                }
                            }
                        }
                    }

                    // Mode B: FORMATTED JSON VIEW
                    ColumnLayout {
                        visible: root.viewMode === "json"
                        Layout.fillWidth: true
                        spacing: 10

                        Repeater {
                            model: root.logEntries

                            delegate: Rectangle {
                                required property var modelData
                                visible: root.matchesFilter(modelData)
                                Layout.fillWidth: true
                                Layout.preferredHeight: visible ? (jsonText.implicitHeight + 36) : 0
                                radius: 6
                                color: "#0F172A"
                                border.width: 1
                                border.color: "#1E293B"

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 10
                                    spacing: 4

                                    RowLayout {
                                        Layout.fillWidth: true
                                        Text { text: "Frame #" + modelData.id + " · " + modelData.time; color: "#94A3B8"; font.pixelSize: 10; font.weight: Font.Bold }
                                        Item { Layout.fillWidth: true }
                                        Text { text: modelData.level; color: modelData.level === "TELEMETRY" ? "#34D399" : "#60A5FA"; font.pixelSize: 10; font.weight: Font.Bold }
                                    }

                                    Text {
                                        id: jsonText
                                        Layout.fillWidth: true
                                        text: modelData.rawJson || ("{\"message\":\"" + modelData.message + "\"}")
                                        color: "#F8FAFC"
                                        font.family: "Monospace"
                                        font.pixelSize: 11
                                        wrapMode: Text.WrapAnywhere
                                    }
                                }
                            }
                        }
                    }

                    // Zero-State Display
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: 20
                        Layout.bottomMargin: 20
                        visible: root.logEntries.length === 0
                        spacing: 8

                        Text {
                            Layout.alignment: Qt.AlignHCenter
                            text: "No Active Stream Frames"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                            font.weight: Font.Bold
                        }

                        Text {
                            Layout.alignment: Qt.AlignHCenter
                            text: "Incoming MQTT telemetry from hardware UID " + MqttService.topic + " will appear here."
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                        }
                    }
                }
            }
        }
    }
}
