import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

Item {
    id: settingsPage

    readonly property int maxContentWidth: 920

    // Test / Connection State properties
    property string connectionStatusState: Settings.useDirectEsp32
        ? (TankModel.connectionState === "Connected" ? "Connected" : (TankModel.connectionState === "Connecting" ? "Connecting" : "Offline"))
        : (Settings.apiToken.length > 0 ? (TankModel.connectionState === "Connected" ? "Connected" : (TankModel.connectionState === "Connecting" ? "Connecting" : "Offline")) : "Not Configured")
    property string lastSuccessfulUpdate: TankModel.hasValidData ? TankModel.lastUpdated : "--"
    property string lastErrorMessage: "--"

    property string testWaterLevel: TankModel.hasValidData ? (TankModel.fillPercentage.toFixed(2) + "%") : "--"
    property string testPressure: "--"
    property string testSensorStatus: TankModel.hasValidData ? TankModel.sensorStatus : "--"

    property string statusMessage: ""
    property bool statusIsError: false

    // Application defaults
    readonly property var defaults: ({
        esp32Host: "192.168.1.50",
        esp32Port: 80,
        useDirectEsp32: true,
        apiBaseUrl: "https://industrial.api.ubidots.com",
        deviceLabel: "wli",
        refreshIntervalMs: 5000,
        levelVariable: "waterlevel",
        pressureVariable: "pressure",
        statusVariable: "sensorstatus",
        mqttBroker: "broker.hivemq.com",
        mqttPort: 8883,
        mqttTopic: "stm32f411/ec200u/telemetry",
        mqttTlsEnabled: true,
        mqttVerifyCertificate: true,
        mqttUsername: "",
        mqttPassword: "",
        mqttClientId: "PanoramaWaterTankMonitor_ec200u"
    })

    // Refresh interval mapping
    readonly property var refreshIntervals: [1000, 5000, 10000, 30000, 60000]

    function getRefreshIndex(ms) {
        for (var i = 0; i < refreshIntervals.length; i++) {
            if (refreshIntervals[i] === ms) return i;
        }
        return 1; // Default to 5 seconds
    }

    function saveConfiguration() {
        if (!PermissionManager.canAccessSystemSettings) {
            showStatus("Access Denied: Administrator authorization required to modify system settings.", true)
            return
        }

        var espHost = esp32HostField.text.trim()
        var espPort = parseInt(esp32PortField.text.trim()) || 80
        var direct = useDirectEsp32CheckBox.checked

        if (direct && espHost === "") {
            showStatus("ESP32 IP / Hostname cannot be empty when Direct ESP32 mode is enabled.", true)
            return
        }

        // Apply ESP32 settings
        Settings.esp32Host = espHost
        Settings.esp32Port = espPort
        Settings.useDirectEsp32 = direct

        // Validation for Ubidots (only strictly required if direct mode is disabled)
        var host = apiHostField.text.trim()
        var token = apiTokenField.text.trim()
        var device = deviceLabelField.text.trim()
        var levelVar = levelVarField.text.trim()
        var pressureVar = pressureVarField.text.trim()
        var statusVar = statusVarField.text.trim()

        if (!direct) {
            if (host === "") {
                showStatus("API Host cannot be empty.", true)
                return
            }
            if (token === "") {
                showStatus("API Token cannot be empty. Please enter your Ubidots API Token.", true)
                return
            }
            if (device === "") {
                showStatus("Device API Label cannot be empty.", true)
                return
            }
            if (levelVar === "") {
                showStatus("Water Level API Label cannot be empty.", true)
                return
            }
            if (pressureVar === "") {
                showStatus("Pressure API Label cannot be empty.", true)
                return
            }
            if (statusVar === "") {
                showStatus("Sensor Status API Label cannot be empty.", true)
                return
            }
        }

        // Apply to Settings singleton
        Settings.apiBaseUrl = host
        Settings.apiToken = token
        Settings.deviceLabel = device
        Settings.refreshIntervalMs = refreshIntervals[refreshCombo.currentIndex]

        Settings.levelVariable = levelVar
        Settings.pressureVariable = pressureVar
        Settings.statusVariable = statusVar
        Settings.googleMapsApiKey = googleMapsApiKeyField.text.trim()

        // Validate & Apply MQTT Settings
        var mqttBroker = mqttBrokerField.text.trim()
        var mqttPort = parseInt(mqttPortField.text.trim()) || 8883
        var mqttTopic = mqttTopicField.text.trim()
        var mqttTls = mqttTlsSwitch.checked
        var mqttVerify = mqttVerifySwitch.checked
        var mqttUser = mqttUsernameField.text.trim()
        var mqttPass = mqttPasswordField.text
        var mqttClient = mqttClientIdField.text.trim()

        if (mqttBroker === "") {
            showStatus("MQTT Broker cannot be empty.", true)
            return
        }
        if (mqttPort < 1 || mqttPort > 65535) {
            showStatus("MQTT Port must be between 1 and 65535.", true)
            return
        }
        if (mqttTopic === "") {
            showStatus("MQTT Topic cannot be empty.", true)
            return
        }

        Settings.mqttBroker = mqttBroker
        Settings.mqttPort = mqttPort
        Settings.mqttTopic = mqttTopic
        Settings.mqttTlsEnabled = mqttTls
        Settings.mqttVerifyCertificate = mqttVerify
        Settings.mqttUsername = mqttUser
        Settings.mqttPassword = mqttPass
        Settings.mqttClientId = mqttClient

        if (typeof MqttService !== "undefined" && MqttService) {
            MqttService.applyConfiguration(mqttBroker, mqttPort, mqttTopic, mqttTls, mqttVerify, mqttUser, mqttPass, mqttClient)
        }

        if (direct) {
            showStatus("Configuration saved. Direct ESP32 REST API & MQTT TLS active (" + espHost + ":" + espPort + " / " + mqttBroker + ":" + mqttPort + ").", false)
        } else {
            showStatus("Configuration saved successfully. Ubidots client and MQTT TLS reconfigured.", false)
        }
    }

    Connections {
        target: (typeof ApiClient !== "undefined") ? ApiClient : null
        function onEsp32ConnectionTested(success, statusTitle, ip, responseDetail, errorMessage) {
            if (success) {
                connectionStatusState = "Connected"
                lastErrorMessage = "None"
                var now = new Date()
                lastSuccessfulUpdate = now.toLocaleTimeString(Qt.locale(), "hh:mm:ss AP")
                showStatus(statusTitle + "\nIP: " + ip + "\n" + responseDetail, false)
            } else {
                connectionStatusState = "Failed"
                lastErrorMessage = errorMessage
                showStatus(statusTitle + "\nIP: " + ip + "\nReason: " + errorMessage, true)
            }
        }
    }

    function testEsp32Connection() {
        if (!PermissionManager.canAccessSystemSettings) {
            showStatus("Access Denied: Administrator authorization required to test connection.", true)
            return
        }

        var host = esp32HostField.text.trim()
        var port = parseInt(esp32PortField.text.trim()) || 80

        if (host === "") {
            showStatus("ESP32 Connection: FAILED\nReason: Host IP / Hostname is required.", true)
            return
        }

        connectionStatusState = "Connecting"
        showStatus("Testing direct ESP32 REST API connection at " + host + (port === 80 ? "" : (":" + port)) + "...", false)

        if (typeof ApiClient !== "undefined" && ApiClient.testEsp32Connection) {
            ApiClient.testEsp32Connection(host, port)
            return
        }

        var url = "http://" + host + (port === 80 ? "" : (":" + port)) + "/api/v1/health"
        var xhr = new XMLHttpRequest()
        xhr.open("GET", url)
        xhr.setRequestHeader("Accept", "application/json")
        xhr.timeout = 5000

        xhr.ontimeout = function() {
            connectionStatusState = "Failed"
            lastErrorMessage = "Timeout"
            showStatus("ESP32 Connection: FAILED\nIP: " + host + "\nReason: Timeout (ESP32 did not respond within 5000ms)", true)
        }

        xhr.onerror = function() {
            connectionStatusState = "Failed"
            lastErrorMessage = "Connection refused / Host unreachable"
            showStatus("ESP32 Connection: FAILED\nIP: " + host + "\nReason: Connection refused or host unreachable", true)
        }

        xhr.onreadystatechange = function() {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    try {
                        var json = JSON.parse(xhr.responseText)
                        if (json.status === "ok") {
                            connectionStatusState = "Connected"
                            lastErrorMessage = "None"
                            var now = new Date()
                            lastSuccessfulUpdate = now.toLocaleTimeString(Qt.locale(), "hh:mm:ss AP")
                            showStatus("ESP32 Connection: SUCCESS\nIP: " + host + "\nResponse: OK", false)
                        } else {
                            connectionStatusState = "Failed"
                            lastErrorMessage = "Invalid response"
                            showStatus("ESP32 Connection: FAILED\nIP: " + host + "\nReason: Invalid response (status is not ok)", true)
                        }
                    } catch (e) {
                        connectionStatusState = "Failed"
                        lastErrorMessage = "JSON parse failure"
                        showStatus("ESP32 Connection: FAILED\nIP: " + host + "\nReason: JSON parse failure", true)
                    }
                } else if (xhr.status > 0) {
                    connectionStatusState = "Failed"
                    lastErrorMessage = "HTTP error " + xhr.status
                    showStatus("ESP32 Connection: FAILED\nIP: " + host + "\nReason: HTTP error " + xhr.status, true)
                }
            }
        }
        xhr.send()
    }

    function testConnection() {
        if (!PermissionManager.canAccessSystemSettings) {
            showStatus("Access Denied: Administrator authorization required to test connection.", true)
            return
        }

        if (useDirectEsp32CheckBox.checked) {
            testEsp32Connection()
            return
        }

        var host = apiHostField.text.trim()
        var token = apiTokenField.text.trim()
        var device = deviceLabelField.text.trim()

        if (host === "") {
            showStatus("Test Failed: API Host is required.", true)
            return
        }
        if (token === "") {
            showStatus("Test Failed: API Token is required.", true)
            return
        }
        if (device === "") {
            showStatus("Test Failed: Device API Label is required.", true)
            return
        }

        connectionStatusState = "Connecting"
        showStatus("Testing Ubidots connection...", false)

        var deviceKey = device.indexOf("~") === 0 ? device : ("~" + device)
        var url = host
        if (!url.endsWith("/")) url += "/"
        url += "api/v2.0/devices/" + deviceKey + "/_/values/last"

        var xhr = new XMLHttpRequest()
        xhr.open("GET", url)
        xhr.setRequestHeader("X-Auth-Token", token)
        xhr.setRequestHeader("Content-Type", "application/json")

        xhr.onreadystatechange = function() {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200 || xhr.status === 201) {
                    try {
                        var json = JSON.parse(xhr.responseText)
                        var foundLevel = "--"
                        var foundPressure = "--"
                        var foundStatus = "--"

                        var targetLevel = levelVarField.text.trim().toLowerCase()
                        var targetPressure = pressureVarField.text.trim().toLowerCase()
                        var targetStatus = statusVarField.text.trim().toLowerCase()

                        var processPair = function(rawLabel, rawVal) {
                            var label = (rawLabel || "").trim().toLowerCase()
                            var val = rawVal
                            if (val && typeof val === "object") {
                                if (val.value !== undefined) val = val.value
                                else if (val.last_value && val.last_value.value !== undefined) val = val.last_value.value
                            }
                            if (val !== null && val !== undefined) {
                                if (label === targetLevel) foundLevel = parseFloat(val).toFixed(2) + "%"
                                else if (label === targetPressure) foundPressure = parseFloat(val).toFixed(2)
                                else if (label === targetStatus) foundStatus = (val === 1 || val === "1") ? "Healthy" : ((val === 0 || val === "0") ? "Fault" : val)
                            }
                        }

                        if (Array.isArray(json)) {
                            for (var i = 0; i < json.length; i++) {
                                var item = json[i]
                                var lbl = item.label || (item.variable ? item.variable.label : "")
                                var v = item.value !== undefined ? item.value : item.last_value
                                processPair(lbl, v)
                            }
                        } else if (typeof json === "object") {
                            if (json.results && Array.isArray(json.results)) {
                                for (var j = 0; j < json.results.length; j++) {
                                    var r = json.results[j]
                                    processPair(r.label || "", r.last_value)
                                }
                            } else {
                                for (var key in json) {
                                    if (json.hasOwnProperty(key)) {
                                        processPair(key, json[key])
                                    }
                                }
                            }
                        }

                        testWaterLevel = foundLevel
                        testPressure = foundPressure
                        testSensorStatus = foundStatus

                        connectionStatusState = "Connected"
                        lastErrorMessage = "None"
                        var now = new Date()
                        lastSuccessfulUpdate = now.toLocaleTimeString(Qt.locale(), "hh:mm:ss AP")

                        showStatus("Connection Successful! Validated device '" + device + "' on Ubidots.", false)
                    } catch (e) {
                        connectionStatusState = "Failed"
                        lastErrorMessage = "JSON Parse Error"
                        showStatus("Test Failed: Invalid JSON payload returned from Ubidots.", true)
                    }
                } else if (xhr.status === 401) {
                    connectionStatusState = "Failed"
                    lastErrorMessage = "HTTP 401 Unauthorized"
                    showStatus("Authentication failed. Check the Ubidots token.", true)
                } else if (xhr.status === 404) {
                    connectionStatusState = "Failed"
                    lastErrorMessage = "HTTP 404 Not Found"
                    showStatus("Device or endpoint not found. Verify the device API label and API URL.", true)
                } else if (xhr.status === 429) {
                    connectionStatusState = "Failed"
                    lastErrorMessage = "HTTP 429 Rate Limited"
                    showStatus("Ubidots rate limit exceeded. Increase the refresh interval.", true)
                } else {
                    connectionStatusState = "Failed"
                    lastErrorMessage = "Ubidots server cannot be reached."
                    showStatus("Ubidots server cannot be reached.", true)
                }
            }
        }
        xhr.send()
    }


    function restoreDefaults() {
        if (!PermissionManager.canAccessSystemSettings) {
            showStatus("Access Denied: Administrator authorization required to restore defaults.", true)
            return
        }

        esp32HostField.text = defaults.esp32Host
        esp32PortField.text = defaults.esp32Port.toString()
        useDirectEsp32CheckBox.checked = defaults.useDirectEsp32
        apiHostField.text = defaults.apiBaseUrl
        deviceLabelField.text = defaults.deviceLabel
        refreshCombo.currentIndex = getRefreshIndex(defaults.refreshIntervalMs)
        levelVarField.text = defaults.levelVariable
        pressureVarField.text = defaults.pressureVariable
        statusVarField.text = defaults.statusVariable
        googleMapsApiKeyField.text = Settings.googleMapsApiKey

        mqttBrokerField.text = defaults.mqttBroker
        mqttPortField.text = defaults.mqttPort.toString()
        mqttTopicField.text = defaults.mqttTopic
        mqttTlsSwitch.checked = defaults.mqttTlsEnabled
        mqttVerifySwitch.checked = defaults.mqttVerifyCertificate
        mqttUsernameField.text = defaults.mqttUsername
        mqttPasswordField.text = defaults.mqttPassword
        mqttClientIdField.text = Settings.mqttClientId

        showStatus("Restored default fields. Click Save Configuration to apply.", false)
    }

    function showStatus(msg, isErr) {
        statusMessage = msg
        statusIsError = isErr
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.colors.background
    }

    Flickable {
        id: flickable
        anchors.fill: parent
        contentWidth: width
        contentHeight: mainColumn.implicitHeight + Theme.metrics.spacingLarge * 2
        boundsBehavior: Flickable.StopAtBounds
        clip: true

        ColumnLayout {
            id: mainColumn
            anchors.top: parent.top
            anchors.topMargin: Theme.metrics.spacingLarge
            anchors.horizontalCenter: parent.horizontalCenter
            width: Math.min(flickable.width - Theme.metrics.spacingLarge * 2, settingsPage.maxContentWidth)
            spacing: Theme.metrics.spacingMedium

            // Page Header
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.metrics.space4

                Text {
                    text: PermissionManager.isAdmin ? "Admin Settings" : "System Settings"
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 28
                    font.weight: Font.Bold
                }
                Text {
                    text: PermissionManager.isAdmin
                          ? "Configure the local ESP32-S3 REST API server, cloud telemetry, Google Maps API, and system parameters."
                          : "Restricted Access: Hardware and cloud telemetry settings require Administrator credentials."
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 14
                }
            }

            // Operator / Employee Notice Card (shown when not admin)
            BaseCard {
                visible: !PermissionManager.canAccessSystemSettings
                Layout.fillWidth: true
                backgroundColor: "#FEF2F2"
                borderColor: "#FECACA"
                padding: Theme.metrics.spacingLarge

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.metrics.spacingMedium

                    RowLayout {
                        spacing: 12
                        Rectangle {
                            width: 36; height: 36; radius: 18
                            color: "#DC2626"
                            Text { anchors.centerIn: parent; text: "🔒"; font.pixelSize: 18 }
                        }
                        ColumnLayout {
                            spacing: 2
                            Text {
                                text: "Administrator Authorization Required"
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 16
                                font.weight: Font.Bold
                                color: "#991B1B"
                            }
                            Text {
                                text: "Protected system configuration: ESP32 IP, Wi-Fi, Ubidots cloud telemetry, and Maps API keys are locked."
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 13
                                color: "#7F1D1D"
                            }
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        text: "As an Operator / Employee, your account has authorization for railway operations, train consist management, coach assignments, and physical tank geometry configuration."
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        color: "#475569"
                    }

                    RowLayout {
                        spacing: 12
                        StyledButton {
                            text: "Manage Trains"
                            variant: "primary"
                            onClicked: sidebar.currentIndex = 12
                        }
                        StyledButton {
                            text: "Configure Coaches & Tanks"
                            variant: "secondary"
                            onClicked: sidebar.currentIndex = 13
                        }
                    }
                }
            }

            // =============================================================
            // Card 0: ESP32 DIRECT REST API (AUTHORITATIVE LOCAL SERVER)
            // =============================================================
            BaseCard {
                visible: PermissionManager.canAccessSystemSettings
                Layout.fillWidth: true
                backgroundColor: Theme.colors.surface
                borderColor: Theme.colors.divider
                padding: Theme.metrics.spacingLarge

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.metrics.spacingMedium

                    ColumnLayout {
                        spacing: Theme.metrics.space4
                        Text {
                            text: "ESP32-S3 Direct REST API (Local Wi-Fi)"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 17
                            font.weight: Font.DemiBold
                        }
                        Text {
                            Layout.fillWidth: true
                            wrapMode: Text.Wrap
                            text: "The ESP32-S3 serves as the authoritative embedded HTTP/REST server for live sensor data and level calculations."
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }

                    StyledSwitch {
                        id: useDirectEsp32CheckBox
                        text: "Enable Direct ESP32 REST API (Authoritative Server)"
                        checked: Settings.useDirectEsp32
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: 2
                        columnSpacing: Theme.metrics.spacingMedium
                        rowSpacing: Theme.metrics.spacingMedium
                        opacity: useDirectEsp32CheckBox.checked ? 1.0 : 0.5
                        enabled: useDirectEsp32CheckBox.checked

                        Label {
                            text: "ESP32 IP / Hostname"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: esp32HostField
                            Layout.fillWidth: true
                            text: Settings.esp32Host
                            placeholderText: "192.168.1.50"
                        }

                        Label {
                            text: "HTTP Port"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: esp32PortField
                            Layout.fillWidth: true
                            text: Settings.esp32Port.toString()
                            placeholderText: "80"
                        }

                        Label {
                            text: "Active Endpoints"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                        Text {
                            text: "GET /api/v1/status  |  GET /api/v1/health  |  GET /api/v1/history?range=12h|24h|7d"
                            color: Theme.colors.primary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Theme.metrics.spacingMedium

                        StyledButton {
                            text: "Test ESP32 Connection"
                            variant: "secondary"
                            enabled: useDirectEsp32CheckBox.checked
                            onClicked: settingsPage.testEsp32Connection()
                        }
                        Text {
                            text: useDirectEsp32CheckBox.checked ? "Authoritative calculations & real-time telemetry from ESP32" : "Direct mode disabled (falling back to Ubidots)"
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                        }
                    }
                }
            }

            // =============================================================
            // Card 0b: TANK GEOMETRY & COMMISSIONING CONFIGURATION
            // =============================================================
            TankConfigurationCard {
                visible: PermissionManager.canAccessSystemSettings
                Layout.fillWidth: true
            }

            // =============================================================
            // Card 1: UBIDOTS CONNECTION
            // =============================================================
            BaseCard {
                visible: PermissionManager.canAccessSystemSettings
                Layout.fillWidth: true
                backgroundColor: Theme.colors.surface
                borderColor: Theme.colors.divider
                padding: Theme.metrics.spacingLarge

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.metrics.spacingMedium

                    ColumnLayout {
                        spacing: Theme.metrics.space4
                        Text {
                            text: "Ubidots Connection"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 17
                            font.weight: Font.DemiBold
                        }
                        Text {
                            text: "Configure the API connection used to retrieve live water-tank telemetry."
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: 2
                        columnSpacing: Theme.metrics.spacingMedium
                        rowSpacing: Theme.metrics.spacingMedium

                        Label {
                            text: "API Host"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: apiHostField
                            Layout.fillWidth: true
                            text: Settings.apiBaseUrl
                            placeholderText: "https://industrial.api.ubidots.com"
                        }

                        Label {
                            text: "API Token"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Theme.metrics.space4

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: Theme.metrics.spacingSmall

                                StyledTextField {
                                    id: apiTokenField
                                    Layout.fillWidth: true
                                    text: Settings.apiToken
                                    placeholderText: "Enter Ubidots API Token"
                                    echoMode: tokenVisibilityButton.checked ? TextInput.Normal : TextInput.Password
                                }
                                StyledButton {
                                    id: tokenVisibilityButton
                                    checkable: true
                                    text: checked ? "Hide" : "Show"
                                    Layout.preferredWidth: 70
                                    variant: "secondary"
                                }
                            }
                            Text {
                                text: "Used to authenticate requests to the Ubidots API."
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                        }

                        Label {
                            text: "Device API Label"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Theme.metrics.space4

                            StyledTextField {
                                id: deviceLabelField
                                Layout.fillWidth: true
                                text: Settings.deviceLabel
                                placeholderText: "wli"
                            }
                            Text {
                                text: "Ubidots device API label (e.g. wli)."
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                        }

                        Label {
                            text: "Data Refresh Interval"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledComboBox {
                            id: refreshCombo
                            Layout.fillWidth: true
                            model: ["1 second", "5 seconds", "10 seconds", "30 seconds", "60 seconds"]
                            currentIndex: settingsPage.getRefreshIndex(Settings.refreshIntervalMs)
                        }
                    }
                }
            }

            // =============================================================
            // Card 2: MQTT CONNECTION (SECURE MQTT OVER TLS)
            // =============================================================
            BaseCard {
                visible: PermissionManager.canAccessSystemSettings
                Layout.fillWidth: true
                backgroundColor: Theme.colors.surface
                borderColor: Theme.colors.divider
                padding: Theme.metrics.spacingLarge

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.metrics.spacingMedium

                    ColumnLayout {
                        spacing: Theme.metrics.space4
                        Text {
                            text: "MQTT Connection"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 17
                            font.weight: Font.DemiBold
                        }
                        Text {
                            Layout.fillWidth: true
                            wrapMode: Text.Wrap
                            text: "Configure the secure MQTT connection used to receive live telemetry from WLI devices."
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: 2
                        columnSpacing: Theme.metrics.spacingMedium
                        rowSpacing: Theme.metrics.spacingMedium

                        // MQTT Broker
                        Label {
                            text: "MQTT Broker"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: mqttBrokerField
                            Layout.fillWidth: true
                            text: Settings.mqttBroker
                            placeholderText: "broker.hivemq.com"
                        }

                        // MQTT Port
                        Label {
                            text: "MQTT Port"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: mqttPortField
                            Layout.fillWidth: true
                            text: Settings.mqttPort.toString()
                            placeholderText: "8883"
                            validator: IntValidator { bottom: 1; top: 65535 }
                        }

                        // MQTT Topic
                        Label {
                            text: "MQTT Topic"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: mqttTopicField
                            Layout.fillWidth: true
                            text: Settings.mqttTopic
                            placeholderText: "stm32f411/ec200u/telemetry"
                        }

                        // TLS Encryption Switch
                        Label {
                            text: "TLS Encryption"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledSwitch {
                            id: mqttTlsSwitch
                            text: checked ? "ON" : "OFF"
                            checked: Settings.mqttTlsEnabled
                        }

                        // Verify Server Certificate Switch
                        Label {
                            text: "Verify Server Certificate"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                            opacity: mqttTlsSwitch.checked ? 1.0 : 0.5
                        }
                        StyledSwitch {
                            id: mqttVerifySwitch
                            text: checked ? "ON" : "OFF"
                            checked: Settings.mqttVerifyCertificate
                            enabled: mqttTlsSwitch.checked
                            opacity: mqttTlsSwitch.checked ? 1.0 : 0.5
                        }

                        // MQTT Username
                        Label {
                            text: "Username"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: mqttUsernameField
                            Layout.fillWidth: true
                            text: Settings.mqttUsername
                            placeholderText: "Optional"
                        }

                        // MQTT Password
                        Label {
                            text: "Password"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Theme.metrics.spacingSmall

                            StyledTextField {
                                id: mqttPasswordField
                                Layout.fillWidth: true
                                text: Settings.mqttPassword
                                placeholderText: "Optional"
                                echoMode: mqttPasswordVisibilityButton.checked ? TextInput.Normal : TextInput.Password
                            }
                            StyledButton {
                                id: mqttPasswordVisibilityButton
                                checkable: true
                                text: checked ? "Hide" : "Show"
                                Layout.preferredWidth: 70
                                variant: "secondary"
                            }
                        }

                        // Client ID
                        Label {
                            text: "Client ID"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: mqttClientIdField
                            Layout.fillWidth: true
                            text: Settings.mqttClientId
                            placeholderText: "PanoramaWaterTankMonitor_xxxxxxxx"
                        }
                    }

                    // Compact Status Section
                    Rectangle {
                        Layout.fillWidth: true
                        radius: Theme.metrics.radiusSmall
                        color: Theme.colors.background
                        border.width: 1
                        border.color: Theme.colors.divider
                        implicitHeight: statusGrid.implicitHeight + Theme.metrics.spacingMedium * 2

                        GridLayout {
                            id: statusGrid
                            anchors.fill: parent
                            anchors.margins: Theme.metrics.spacingMedium
                            columns: 4
                            columnSpacing: Theme.metrics.spacingLarge
                            rowSpacing: Theme.metrics.spacingSmall

                            Text {
                                text: "MQTT Status:"
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                            RowLayout {
                                spacing: 6
                                Rectangle {
                                    width: 8; height: 8; radius: 4
                                    color: {
                                        if (typeof MqttService !== "undefined" && MqttService) {
                                            if (MqttService.connected) return Theme.colors.success
                                            if (MqttService.connectionState === "Reconnecting") return Theme.colors.warning
                                            if (MqttService.connectionState === "Error" || MqttService.connectionState === "TLS Error") return Theme.colors.critical
                                        }
                                        return Theme.colors.textSecondary
                                    }
                                }
                                Text {
                                    text: (typeof MqttService !== "undefined" && MqttService) ? MqttService.connectionState : "Disconnected"
                                    color: {
                                        if (typeof MqttService !== "undefined" && MqttService) {
                                            if (MqttService.connected) return Theme.colors.success
                                            if (MqttService.connectionState === "Reconnecting") return Theme.colors.warning
                                            if (MqttService.connectionState === "Error" || MqttService.connectionState === "TLS Error") return Theme.colors.critical
                                        }
                                        return Theme.colors.textPrimary
                                    }
                                    font.family: Theme.typography.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.DemiBold
                                }
                            }

                            Text {
                                text: "Broker:"
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                            Text {
                                text: ((typeof MqttService !== "undefined" && MqttService && MqttService.broker) ? MqttService.broker : Settings.mqttBroker) + ":" + ((typeof MqttService !== "undefined" && MqttService && MqttService.port) ? MqttService.port : Settings.mqttPort)
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: Font.Medium
                            }

                            Text {
                                text: "Topic:"
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                            Text {
                                text: (typeof MqttService !== "undefined" && MqttService && MqttService.topic) ? MqttService.topic : Settings.mqttTopic
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: Font.Medium
                                Layout.fillWidth: true
                                elide: Text.ElideRight
                            }

                            Text {
                                text: "Last Message:"
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                            Text {
                                text: (typeof MqttService !== "undefined" && MqttService) ? MqttService.lastMessageTime : "--"
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: Font.Medium
                            }

                            Text {
                                text: "TLS:"
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                            Text {
                                text: ((typeof MqttService !== "undefined" && MqttService && MqttService.tlsEnabled) ? "TLS 1.2" : (Settings.mqttTlsEnabled ? "TLS 1.2" : "Disabled"))
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                font.weight: Font.Medium
                            }
                        }
                    }

                    // Test Connection Banner
                    Rectangle {
                        visible: (typeof MqttService !== "undefined" && MqttService) && MqttService.testStatusMessage.length > 0
                        Layout.fillWidth: true
                        implicitHeight: testStatusText.implicitHeight + 16
                        radius: Theme.metrics.radiusSmall
                        color: ((typeof MqttService !== "undefined" && MqttService) && MqttService.testStatusIsError) ? "#FEE2E2" : "#E0F2FE"
                        border.width: 1
                        border.color: ((typeof MqttService !== "undefined" && MqttService) && MqttService.testStatusIsError) ? "#FCA5A5" : "#BAE6FD"

                        Text {
                            id: testStatusText
                            anchors.fill: parent
                            anchors.margins: 8
                            text: (typeof MqttService !== "undefined" && MqttService) ? MqttService.testStatusMessage : ""
                            color: ((typeof MqttService !== "undefined" && MqttService) && MqttService.testStatusIsError) ? Theme.colors.critical : Theme.colors.primary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            wrapMode: Text.WordWrap
                        }
                    }

                    // Card Action: Test Connection button
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Theme.metrics.spacingMedium

                        StyledButton {
                            text: (typeof MqttService !== "undefined" && MqttService && MqttService.testInProgress) ? "Testing MQTT..." : "Test Connection"
                            variant: "secondary"
                            enabled: !(typeof MqttService !== "undefined" && MqttService && MqttService.testInProgress)
                            onClicked: {
                                if (!PermissionManager.canAccessSystemSettings) {
                                    showStatus("Access Denied: Administrator authorization required to test connection.", true)
                                    return
                                }
                                if (typeof MqttService !== "undefined" && MqttService) {
                                    MqttService.testConnection(
                                        mqttBrokerField.text.trim(),
                                        parseInt(mqttPortField.text.trim()) || 8883,
                                        mqttTopicField.text.trim(),
                                        mqttTlsSwitch.checked,
                                        mqttVerifySwitch.checked,
                                        mqttUsernameField.text.trim(),
                                        mqttPasswordField.text,
                                        mqttClientIdField.text.trim()
                                    )
                                }
                            }
                        }

                        Text {
                            text: "Tests TLS 1.2 handshake and MQTT broker subscription without saving settings."
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 12
                            Layout.fillWidth: true
                        }
                    }
                }
            }

            // =============================================================
            // Card: GOOGLE MAPS & ROUTING INTEGRATION
            // =============================================================
            BaseCard {
                visible: PermissionManager.canAccessSystemSettings
                Layout.fillWidth: true
                backgroundColor: Theme.colors.surface
                borderColor: Theme.colors.divider
                padding: Theme.metrics.spacingLarge

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.metrics.spacingMedium

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Theme.metrics.space4
                        Text {
                            text: "Google Maps & Routes Platform"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 17
                            font.weight: Font.DemiBold
                        }
                        Text {
                            Layout.fillWidth: true
                            wrapMode: Text.Wrap
                            text: "Configure the Google Maps API Key for live railway route directions, distances, and ETAs. When no key is provided, the application operates in resilient offline track mode."
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: flickable.width < 600 ? 1 : 2
                        columnSpacing: Theme.metrics.spacingMedium
                        rowSpacing: Theme.metrics.spacingMedium

                        Label {
                            text: "Google Maps API Key"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            Layout.minimumWidth: 100
                            spacing: Theme.metrics.space4

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: Theme.metrics.spacingSmall

                                StyledTextField {
                                    id: googleMapsApiKeyField
                                    Layout.fillWidth: true
                                    Layout.minimumWidth: 80
                                    text: Settings.googleMapsApiKey
                                    placeholderText: "Enter Google Maps API Key"
                                    echoMode: mapsKeyVisibilityButton.checked ? TextInput.Normal : TextInput.Password
                                }
                                StyledButton {
                                    id: mapsKeyVisibilityButton
                                    checkable: true
                                    text: checked ? "Hide" : "Show"
                                    Layout.preferredWidth: 65
                                    variant: "secondary"
                                }
                            }
                            Text {
                                Layout.fillWidth: true
                                wrapMode: Text.Wrap
                                text: "Required for Google Maps satellite / roadmap layers and Routes API. Kept locally, never committed to Git."
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                            }
                        }
                    }
                }
            }

            // =============================================================
            // Card 2: DEVICE VARIABLES
            // =============================================================
            BaseCard {
                visible: PermissionManager.canAccessSystemSettings
                Layout.fillWidth: true
                backgroundColor: Theme.colors.surface
                borderColor: Theme.colors.divider
                padding: Theme.metrics.spacingLarge

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.metrics.spacingMedium

                    ColumnLayout {
                        spacing: Theme.metrics.space4
                        Text {
                            text: "Device Variables"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 17
                            font.weight: Font.DemiBold
                        }
                        Text {
                            text: "Map Ubidots variables to dashboard measurements."
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: 2
                        columnSpacing: Theme.metrics.spacingMedium
                        rowSpacing: Theme.metrics.spacingMedium

                        Label {
                            text: "Water Level"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: levelVarField
                            Layout.fillWidth: true
                            text: Settings.levelVariable
                            placeholderText: "waterlevel"
                        }

                        Label {
                            text: "Pressure"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: pressureVarField
                            Layout.fillWidth: true
                            text: Settings.pressureVariable
                            placeholderText: "pressure"
                        }



                        Label {
                            text: "Sensor Status"
                            Layout.preferredWidth: 160
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 14
                        }
                        StyledTextField {
                            id: statusVarField
                            Layout.fillWidth: true
                            text: Settings.statusVariable
                            placeholderText: "sensorstatus"
                        }
                    }
                }
            }

            // =============================================================
            // Card 2b: USER MANAGEMENT (ADMIN ONLY)
            // =============================================================
            BaseCard {
                visible: PermissionManager.canAccessSystemSettings
                Layout.fillWidth: true
                backgroundColor: Theme.colors.surface
                borderColor: Theme.colors.divider
                padding: Theme.metrics.spacingLarge

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.metrics.spacingMedium

                    ColumnLayout {
                        spacing: Theme.metrics.space4
                        Text {
                            text: "User Management & Credentials"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 17
                            font.weight: Font.DemiBold
                        }
                        Text {
                            Layout.fillWidth: true
                            wrapMode: Text.Wrap
                            text: "Configure local Operator / Employee login credentials. Note: The Administrator password is fixed ('123') and cannot be modified."
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }

                    RowLayout {
                        spacing: 12
                        StyledButton {
                            text: "Open User Management"
                            variant: "primary"
                            onClicked: sidebar.currentIndex = 9 // UsersPage
                        }
                    }
                }
            }

            // =============================================================
            // Card 3 & 4: STATUS & LATEST DEVICE DATA PREVIEW (2 Columns)
            // =============================================================
            GridLayout {
                Layout.fillWidth: true
                columns: flickable.width < 760 ? 1 : 2
                columnSpacing: Theme.metrics.cardSpacing
                rowSpacing: Theme.metrics.cardSpacing

                // Connection Status Card
                BaseCard {
                    visible: PermissionManager.canAccessSystemSettings
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1
                    backgroundColor: Theme.colors.surface
                    borderColor: Theme.colors.divider
                    padding: Theme.metrics.spacingLarge

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Theme.metrics.spacingSmall

                        Text {
                            text: "Connection Status"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 16
                            font.weight: Font.DemiBold
                            Layout.bottomMargin: Theme.metrics.space4
                        }

                        RowLayout {
                            spacing: Theme.metrics.space8
                            Rectangle {
                                width: 10
                                height: 10
                                radius: 5
                                color: {
                                    if (settingsPage.connectionStatusState === "Connected") return Theme.colors.success;
                                    if (settingsPage.connectionStatusState === "Connecting") return Theme.colors.primary;
                                    if (settingsPage.connectionStatusState === "Failed") return Theme.colors.critical;
                                    return Theme.colors.textMuted;
                                }
                            }
                            Text {
                                text: settingsPage.connectionStatusState
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.DemiBold
                            }
                        }

                        Item { Layout.preferredHeight: Theme.metrics.space4 }

                        Text {
                            text: "Last Successful Update: " + settingsPage.lastSuccessfulUpdate
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                        Text {
                            text: "Last Error: " + settingsPage.lastErrorMessage
                            color: settingsPage.lastErrorMessage !== "None" && settingsPage.lastErrorMessage !== "--" ? Theme.colors.critical : Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }
                }

                // Latest Device Data Card
                BaseCard {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1
                    backgroundColor: Theme.colors.surface
                    borderColor: Theme.colors.divider
                    padding: Theme.metrics.spacingLarge

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Theme.metrics.spacingSmall

                        Text {
                            text: "Latest Device Data"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 16
                            font.weight: Font.DemiBold
                            Layout.bottomMargin: Theme.metrics.space4
                        }

                        GridLayout {
                            Layout.fillWidth: true
                            columns: 2
                            rowSpacing: Theme.metrics.space4

                            Text { text: "Water Level:"; color: Theme.colors.textSecondary; font.pixelSize: 13 }
                            Text { text: TankModel.fillPercentage > 0 ? TankModel.fillPercentage.toFixed(2) + "%" : settingsPage.testWaterLevel; color: Theme.colors.primary; font.pixelSize: 13; font.weight: Font.Bold }

                            Text { text: "Pressure:"; color: Theme.colors.textSecondary; font.pixelSize: 13 }
                            Text { text: TankModel.hasPressure ? TankModel.pressure.toFixed(2) : settingsPage.testPressure; color: Theme.colors.textPrimary; font.pixelSize: 13 }



                            Text { text: "Sensor Status:"; color: Theme.colors.textSecondary; font.pixelSize: 13 }
                            Text {
                                text: TankModel.sensorStatus.length > 0 && TankModel.sensorStatus !== "--" ? TankModel.sensorStatus : settingsPage.testSensorStatus
                                color: (TankModel.sensorStatus === "Healthy" || settingsPage.testSensorStatus === "Healthy") ? Theme.colors.success : ((TankModel.sensorStatus === "Fault" || settingsPage.testSensorStatus === "Fault") ? Theme.colors.critical : Theme.colors.textPrimary)
                                font.pixelSize: 13
                                font.weight: Font.DemiBold
                            }

                        }
                    }
                }
            }

            // =============================================================
            // DISPLAY & PERFORMANCE
            // =============================================================
            BaseCard {
                Layout.fillWidth: true
                backgroundColor: Theme.colors.surface
                borderColor: Theme.colors.divider
                padding: Theme.metrics.spacingLarge

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.metrics.spacingSmall

                    Text {
                        text: "Display & Performance"
                        color: Theme.colors.textPrimary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 16
                        font.weight: Font.DemiBold
                        Layout.bottomMargin: Theme.metrics.space4
                    }

                    Text {
                        text: "The application automatically adapts its rendering to your monitor's refresh rate."
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        wrapMode: Text.WordWrap
                        Layout.fillWidth: true
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: 2
                        columnSpacing: Theme.metrics.spacingMedium
                        rowSpacing: Theme.metrics.space4

                        Text {
                            text: "Refresh Rate:"
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                        Text {
                            text: Theme.refreshRate.toFixed(1) + " Hz"
                            color: Theme.colors.primary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: Font.Bold
                        }

                        Text {
                            text: "Target Frame Rate:"
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                        Text {
                            text: Theme.targetFrameRate + " FPS"
                            color: Theme.colors.primary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: Font.DemiBold
                        }

                        Text {
                            text: "Performance Mode:"
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                        Text {
                            text: {
                                if (Theme.performanceMode === "high") return "High (≥ 120 Hz)";
                                if (Theme.performanceMode === "normal") return "Normal";
                                return "Low";
                            }
                            color: Theme.performanceMode === "high" ? Theme.colors.success : Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            font.weight: Font.DemiBold
                        }

                        Text {
                            text: "Frame Interval:"
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                        Text {
                            text: Theme.frameIntervalMs.toFixed(2) + " ms"
                            color: Theme.colors.textPrimary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                        }
                    }

                    Item { Layout.preferredHeight: Theme.metrics.space4 }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Theme.metrics.spacingSmall

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2

                            Text {
                                text: "Reduce Motion"
                                color: Theme.colors.textPrimary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.Medium
                            }
                            Text {
                                text: "Shortens transitions and disables decorative wave animations."
                                color: Theme.colors.textSecondary
                                font.family: Theme.typography.fontFamily
                                font.pixelSize: 12
                                wrapMode: Text.WordWrap
                                Layout.fillWidth: true
                            }
                        }

                        StyledSwitch {
                            checked: Theme.reducedMotion
                            onToggled: DisplayPerformanceManager.reducedMotion = checked
                        }
                    }
                }
            }

            // =============================================================
            // ACTIONS & STATUS FEEDBACK
            // =============================================================
            BaseCard {
                visible: PermissionManager.canAccessSystemSettings
                Layout.fillWidth: true
                backgroundColor: Theme.colors.surface
                borderColor: Theme.colors.divider
                padding: Theme.metrics.spacingLarge

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Theme.metrics.spacingMedium

                    Flow {
                        Layout.fillWidth: true
                        spacing: Theme.metrics.spacingMedium

                        StyledButton {
                            text: "Save Configuration"
                            variant: "primary"
                            onClicked: settingsPage.saveConfiguration()
                        }

                        StyledButton {
                            text: "Test Connection"
                            variant: "secondary"
                            onClicked: settingsPage.testConnection()
                        }

                        StyledButton {
                            text: "Restore Defaults"
                            variant: "secondary"
                            onClicked: settingsPage.restoreDefaults()
                        }
                    }

                    Rectangle {
                        visible: settingsPage.statusMessage.length > 0
                        Layout.fillWidth: true
                        implicitHeight: statusText.implicitHeight + 16
                        radius: Theme.metrics.radiusSmall
                        color: settingsPage.statusIsError ? "#FEE2E2" : "#E0F2FE"
                        border.width: 1
                        border.color: settingsPage.statusIsError ? "#FCA5A5" : "#BAE6FD"

                        Text {
                            id: statusText
                            anchors.fill: parent
                            anchors.margins: 8
                            text: settingsPage.statusMessage
                            color: settingsPage.statusIsError ? Theme.colors.critical : Theme.colors.primary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 13
                            wrapMode: Text.WordWrap
                        }
                    }
                }
            }

            Item { Layout.preferredHeight: Theme.metrics.spacingLarge }
        }
    }
}