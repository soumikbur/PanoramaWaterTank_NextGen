import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// Professional Tank Configuration Card for Commissioning & Field Deployment
BaseCard {
    id: root

    Layout.fillWidth: true
    backgroundColor: Theme.colors.surface
    borderColor: Theme.colors.divider
    padding: Theme.metrics.spacingLarge

    // Two-tier state management
    property var deviceConfig: null
    property var editedConfig: ({})
    property var pendingConfig: null
    property bool isPendingReset: false
    property bool isDirty: false
    property bool isBusy: false
    property bool isVerifying: false
    property string syncStatus: "LOCAL_MODEL" // "LOCAL_MODEL", "UNSAVED", "APPLYING", "VERIFYING", "SYNCHRONIZED", "VERIFICATION_FAILED", "DEVICE_ERROR"
    property int configRevision: 0
    property int pendingRevision: 0

    // Local editing state properties bound to UI controls
    property int selectedShapeId: TankModel.tankShapeId
    property real editHeightCm: TankModel.tankHeightCm
    property real editDiameterCm: TankModel.tankDiameterCm
    property real editWidthCm: TankModel.tankWidthCm
    property real editLengthCm: TankModel.tankLengthCm
    property real editCapacityL: TankModel.capacityLiters
    property real editWarningPct: TankModel.warningThresholdPercent
    property real editCriticalPct: TankModel.criticalThresholdPercent
    property real editHighPct: TankModel.highThresholdPercent

    property string cardStatusMessage: ""
    property bool cardStatusIsError: false

    // Derived live preview capacity
    property real previewCapacityLiters: {
        var h = parseFloat(heightInput.text) || 0.0;
        if (selectedShapeId === 0) { // Cylinder: V = pi * r^2 * h
            var d = parseFloat(diameterInput.text) || 0.0;
            var r = (d / 100.0) / 2.0;
            var hM = h / 100.0;
            return Math.max(0.0, Math.PI * r * r * hM * 1000.0);
        } else if (selectedShapeId === 1) { // Rectangle: V = w * l * h
            var wM = (parseFloat(widthInput.text) || 0.0) / 100.0;
            var lM = (parseFloat(lengthInput.text) || 0.0) / 100.0;
            var hM = h / 100.0;
            return Math.max(0.0, wM * lM * hM * 1000.0);
        } else { // Custom
            return Math.max(0.0, parseFloat(customCapInput.text) || 0.0);
        }
    }

    function showMsg(msg, isErr) {
        cardStatusMessage = msg;
        cardStatusIsError = isErr;
    }

    function populateFromConfig(cfg) {
        if (!cfg) return;

        var shapeId = 0;
        if (cfg.shape_id !== undefined) {
            shapeId = parseInt(cfg.shape_id);
        } else if (cfg.shape !== undefined) {
            var s = String(cfg.shape).trim().toUpperCase();
            if (s === "RECTANGLE" || s === "RECTANGULAR") shapeId = 1;
            else if (s === "CUSTOM") shapeId = 2;
            else shapeId = 0;
        }
        selectedShapeId = shapeId;
        shapeCombo.currentIndex = shapeId;

        var h = cfg.height_cm !== undefined ? parseFloat(cfg.height_cm) : (cfg.max_height_cm !== undefined ? parseFloat(cfg.max_height_cm) : 50.0);
        editHeightCm = h;
        heightInput.text = h.toFixed(1);

        var d = cfg.diameter_cm !== undefined ? parseFloat(cfg.diameter_cm) : 22.5676;
        editDiameterCm = d;
        diameterInput.text = d.toFixed(1);

        var w = cfg.width_cm !== undefined ? parseFloat(cfg.width_cm) : 0.0;
        editWidthCm = w;
        widthInput.text = w.toFixed(1);

        var l = cfg.length_cm !== undefined ? parseFloat(cfg.length_cm) : 0.0;
        editLengthCm = l;
        lengthInput.text = l.toFixed(1);

        var cap = cfg.capacity_liters !== undefined ? parseFloat(cfg.capacity_liters) : (cfg.tank_capacity_l !== undefined ? parseFloat(cfg.tank_capacity_l) : 20.0);
        editCapacityL = cap;
        customCapInput.text = cap.toFixed(1);

        var warn = cfg.warning_percent !== undefined ? parseFloat(cfg.warning_percent) : 20.0;
        editWarningPct = warn;
        warningSlider.value = warn;

        var crit = cfg.critical_percent !== undefined ? parseFloat(cfg.critical_percent) : 10.0;
        editCriticalPct = crit;
        criticalSlider.value = crit;

        var high = cfg.high_percent !== undefined ? parseFloat(cfg.high_percent) : 90.0;
        editHighPct = high;
        highSlider.value = high;

        // Synchronize editedConfig working copy
        var shapeName = (shapeId === 0) ? "CYLINDER" : ((shapeId === 1) ? "RECTANGLE" : "CUSTOM");
        editedConfig = {
            "shape": shapeName,
            "shape_id": shapeId,
            "height_cm": h,
            "max_height_cm": h,
            "diameter_cm": d,
            "width_cm": w,
            "length_cm": l,
            "capacity_liters": cap,
            "warning_percent": warn,
            "critical_percent": crit,
            "high_percent": high
        };
    }

    function syncFromModel() {
        selectedShapeId = TankModel.tankShapeId;
        shapeCombo.currentIndex = selectedShapeId;
        editHeightCm = TankModel.tankHeightCm;
        heightInput.text = editHeightCm.toFixed(1);
        editDiameterCm = TankModel.tankDiameterCm;
        diameterInput.text = editDiameterCm.toFixed(1);
        editWidthCm = TankModel.tankWidthCm;
        widthInput.text = editWidthCm.toFixed(1);
        editLengthCm = TankModel.tankLengthCm;
        lengthInput.text = editLengthCm.toFixed(1);
        editCapacityL = TankModel.capacityLiters;
        customCapInput.text = editCapacityL.toFixed(1);

        editWarningPct = TankModel.warningThresholdPercent;
        warningSlider.value = editWarningPct;
        editCriticalPct = TankModel.criticalThresholdPercent;
        criticalSlider.value = editCriticalPct;
        editHighPct = TankModel.highThresholdPercent;
        highSlider.value = editHighPct;

        var shapeName = (selectedShapeId === 0) ? "CYLINDER" : ((selectedShapeId === 1) ? "RECTANGLE" : "CUSTOM");
        editedConfig = {
            "shape": shapeName,
            "shape_id": selectedShapeId,
            "height_cm": editHeightCm,
            "max_height_cm": editHeightCm,
            "diameter_cm": editDiameterCm,
            "width_cm": editWidthCm,
            "length_cm": editLengthCm,
            "capacity_liters": editCapacityL,
            "warning_percent": editWarningPct,
            "critical_percent": editCriticalPct,
            "high_percent": editHighPct
        };

        isDirty = false;
        showMsg("Configuration loaded from active tank model.", false);
    }

    // 1. Read From Device: Query authoritative configuration from ESP32
    function requestReadFromDevice() {
        if (typeof ApiClient !== "undefined" && ApiClient && ApiClient.isConnected) {
            isBusy = true;
            showMsg("Reading configuration from ESP32...", false);
            ApiClient.getConfig();
        } else {
            syncFromModel();
            showMsg("ESP32 is offline. Loaded active configuration from local tank model.", false);
        }
    }

    // 2. Apply Configuration: Validate & send to ESP32; persist only upon confirmed verification
    function applyConfiguration() {
        var h = parseFloat(heightInput.text) || 0.0;
        if (h <= 0.0 || h > 1000.0) {
            showMsg("Invalid Height: Must be between 1 and 1000 cm.", true);
            return;
        }

        var d = 0.0;
        var w = 0.0;
        var l = 0.0;
        var cap = 0.0;

        if (selectedShapeId === 0) {
            d = parseFloat(diameterInput.text) || 0.0;
            if (d <= 0.0 || d > 1000.0) {
                showMsg("Invalid Diameter: Must be between 1 and 1000 cm.", true);
                return;
            }
            cap = previewCapacityLiters;
        } else if (selectedShapeId === 1) {
            w = parseFloat(widthInput.text) || 0.0;
            l = parseFloat(lengthInput.text) || 0.0;
            if (w <= 0.0 || w > 1000.0 || l <= 0.0 || l > 1000.0) {
                showMsg("Invalid Dimensions: Width and Length must be between 1 and 1000 cm.", true);
                return;
            }
            cap = previewCapacityLiters;
        } else {
            cap = parseFloat(customCapInput.text) || 0.0;
            if (cap <= 0.0 || cap > 1000000.0) {
                showMsg("Invalid Capacity: Must be between 0.1 and 1,000,000 Liters.", true);
                return;
            }
        }

        var warn = parseFloat(warningSlider.value);
        var crit = parseFloat(criticalSlider.value);
        var high = parseFloat(highSlider.value);

        if (isNaN(crit) || isNaN(warn) || isNaN(high)) {
            showMsg("Validation Error: All alarm thresholds must be numeric values.", true);
            return;
        }

        if (crit < 0.0 || crit > 100.0 || warn < 0.0 || warn > 100.0 || high < 0.0 || high > 100.0) {
            showMsg("Validation Error: Alarm thresholds must be between 0% and 100%.", true);
            return;
        }

        if (crit >= warn) {
            showMsg("Validation Error: Critical threshold (" + crit.toFixed(1) + "%) must be strictly lower than Warning threshold (" + warn.toFixed(1) + "%). Configuration rejected; retaining last valid settings.", true);
            return;
        }

        if (warn >= high) {
            showMsg("Validation Error: Warning threshold (" + warn.toFixed(1) + "%) must be strictly lower than High threshold (" + high.toFixed(1) + "%). Configuration rejected; retaining last valid settings.", true);
            return;
        }

        if (!TankModel.validateThresholds(crit, warn, high)) {
            showMsg("Validation Error: Thresholds must satisfy 0 <= Critical < Warning < High <= 100. Configuration rejected; retaining last valid settings.", true);
            return;
        }

        // Apply to local TankModel and SettingsManager
        TankModel.updateTankConfiguration(
            selectedShapeId,
            h,
            d,
            w,
            l,
            cap,
            warn,
            crit,
            high
        );
        if (typeof Settings !== "undefined" && Settings) {
            Settings.tankShapeId = selectedShapeId;
            Settings.tankHeight = h / 100.0;
            Settings.tankDiameterCm = d;
            Settings.tankWidthCm = w;
            Settings.tankLengthCm = l;
            Settings.tankCapacityLiters = cap;
            Settings.warningThresholdPercent = warn;
            Settings.criticalThresholdPercent = crit;
            Settings.highThresholdPercent = high;
        }

        var shapeName = (selectedShapeId === 0) ? "CYLINDER" : ((selectedShapeId === 1) ? "RECTANGLE" : "CUSTOM");

        var configObj = {
            "shape": shapeName,
            "shape_id": selectedShapeId,
            "height_cm": h,
            "max_height_cm": h,
            "diameter_cm": d,
            "width_cm": w,
            "length_cm": l,
            "capacity_liters": cap,
            "warning_percent": warn,
            "critical_percent": crit,
            "high_percent": high
        };

        console.log("[CONFIG][UI] User edited: shape = " + shapeName + " (id=" + selectedShapeId + "), height = " + h + " cm, diameter = " + d + " cm, width = " + w + " cm, length = " + l + " cm, capacity = " + cap.toFixed(1) + " L, warning = " + warn + "%, critical = " + crit + "%, high = " + high + "%");

        if (typeof ApiClient !== "undefined" && ApiClient && ApiClient.isConnected) {
            pendingConfig = configObj;
            isPendingReset = false;
            isBusy = true;
            isVerifying = false;
            configRevision++;
            pendingRevision = configRevision;
            syncStatus = "APPLYING";
            showMsg("Dispatching configuration to ESP32 (" + shapeName + ", " + cap.toFixed(1) + " L)...", false);
            ApiClient.postTankConfig(configObj);
        } else {
            isDirty = false;
            syncStatus = "LOCAL_MODEL";
            showMsg("Configuration applied to local tank model. (ESP32 is offline; changes will synchronize when device connects).", false);
        }
    }

    // 3. Reset Changes: Local GUI-only. Discards unsaved edits and restores to last device config
    function resetChanges() {
        if (deviceConfig !== null) {
            populateFromConfig(deviceConfig);
            showMsg("Unsaved changes discarded. Reverted to last device configuration.", false);
        } else {
            syncFromModel();
            showMsg("Unsaved changes discarded. Reverted to active tank model.", false);
        }
        isDirty = false;
        syncStatus = (deviceConfig !== null) ? "SYNCHRONIZED" : "LOCAL_MODEL";
    }

    // 4. Factory Reset: Triggered after explicit user confirmation dialog
    function executeFactoryReset() {
        if (!PermissionManager.isAdmin && !PermissionManager.canConfigureDevice) {
            showMsg("Permission Denied: Administrator authorization required for Factory Reset.", true);
            return;
        }

        // Restore factory geometry defaults locally
        selectedShapeId = 0;
        shapeCombo.currentIndex = 0;
        editHeightCm = 50.0;
        heightInput.text = "50.0";
        editDiameterCm = 22.5676;
        diameterInput.text = "22.6";
        editWidthCm = 0.0;
        widthInput.text = "0.0";
        editLengthCm = 0.0;
        lengthInput.text = "0.0";
        editCapacityL = 20.0;
        customCapInput.text = "20.0";
        editCriticalPct = 10.0;
        criticalSlider.value = 10.0;
        editWarningPct = 20.0;
        warningSlider.value = 20.0;
        editHighPct = 90.0;
        highSlider.value = 90.0;

        TankModel.updateTankConfiguration(0, 50.0, 22.5676, 0.0, 0.0, 20.0, 20.0, 10.0, 90.0);
        if (typeof Settings !== "undefined" && Settings) {
            Settings.tankShapeId = 0;
            Settings.tankHeight = 0.5;
            Settings.tankDiameterCm = 22.5676;
            Settings.tankWidthCm = 0.0;
            Settings.tankLengthCm = 0.0;
            Settings.tankCapacityLiters = 20.0;
            Settings.warningThresholdPercent = 20.0;
            Settings.criticalThresholdPercent = 10.0;
            Settings.highThresholdPercent = 90.0;
        }

        if (typeof ApiClient !== "undefined" && ApiClient && ApiClient.isConnected) {
            isPendingReset = true;
            pendingConfig = null;
            isBusy = true;
            isVerifying = false;
            syncStatus = "APPLYING";
            showMsg("Sending factory reset command to ESP32...", false);
            ApiClient.factoryResetTankConfig();
        } else {
            isDirty = false;
            syncStatus = "LOCAL_MODEL";
            showMsg("Factory defaults restored locally (50 cm, 20 L, 10%/20%/90%). ESP32 is offline.", false);
        }
    }

    Component.onCompleted: {
        syncFromModel();
        // If ApiClient is connected, proactively fetch authoritative device config
        if (typeof ApiClient !== "undefined" && ApiClient && ApiClient.isConnected) {
            root.isBusy = true;
            root.syncStatus = "VERIFYING";
            root.showMsg("Requesting authoritative configuration from ESP32...", false);
            ApiClient.getConfig();
        }
    }

    // Reactive bindings to ApiClient signals
    Connections {
        target: (typeof ApiClient !== "undefined" && ApiClient) ? ApiClient : null

        function onConnectionStatusChanged(state, stateStr) {
            if (ApiClient.isConnected && root.deviceConfig === null && !root.isDirty) {
                root.isBusy = true;
                root.syncStatus = "VERIFYING";
                root.showMsg("Connected to ESP32. Synchronizing configuration...", false);
                ApiClient.getConfig();
            }
        }

        function onConfigReceived(cfg) {
            // Guard against empty / malformed responses that lack config fields
            if (!cfg || (cfg.shape === undefined && cfg.shape_id === undefined && cfg.height_cm === undefined && cfg.max_height_cm === undefined)) {
                return;
            }

            console.log("[CONFIG][ESP32] readback =", JSON.stringify(cfg));

            if (root.isVerifying && root.pendingConfig !== null) {
                var req = root.pendingConfig;

                // 1. Verify Shape
                var actualShapeId = 0;
                if (cfg.shape_id !== undefined) {
                    actualShapeId = parseInt(cfg.shape_id);
                } else if (cfg.shape !== undefined) {
                    var s = String(cfg.shape).trim().toUpperCase();
                    if (s === "RECTANGLE" || s === "RECTANGULAR") actualShapeId = 1;
                    else if (s === "CUSTOM") actualShapeId = 2;
                    else actualShapeId = 0;
                }
                var shapeMatches = (actualShapeId === req.shape_id);

                // 2. Verify Height
                var actualH = cfg.height_cm !== undefined ? parseFloat(cfg.height_cm) : (cfg.max_height_cm !== undefined ? parseFloat(cfg.max_height_cm) : 0.0);
                var heightMatches = Math.abs(actualH - req.height_cm) <= 0.1;

                // 3. Verify Geometry Dimensions
                var dimMatches = true;
                if (req.shape_id === 0) { // Cylinder
                    var actualD = cfg.diameter_cm !== undefined ? parseFloat(cfg.diameter_cm) : 0.0;
                    dimMatches = Math.abs(actualD - req.diameter_cm) <= 0.1;
                } else if (req.shape_id === 1) { // Rectangle
                    var actualW = cfg.width_cm !== undefined ? parseFloat(cfg.width_cm) : 0.0;
                    var actualL = cfg.length_cm !== undefined ? parseFloat(cfg.length_cm) : 0.0;
                    dimMatches = Math.abs(actualW - req.width_cm) <= 0.1 && Math.abs(actualL - req.length_cm) <= 0.1;
                }

                // 4. Verify Alarm Thresholds
                var actualWarn = cfg.warning_percent !== undefined ? parseFloat(cfg.warning_percent) : 20.0;
                var actualCrit = cfg.critical_percent !== undefined ? parseFloat(cfg.critical_percent) : 10.0;
                var actualHigh = cfg.high_percent !== undefined ? parseFloat(cfg.high_percent) : 90.0;
                var threshMatches = (Math.abs(actualWarn - req.warning_percent) <= 0.5) &&
                                    (Math.abs(actualCrit - req.critical_percent) <= 0.5) &&
                                    (Math.abs(actualHigh - req.high_percent) <= 0.5);

                var isVerified = shapeMatches && heightMatches && dimMatches && threshMatches;

                console.log("[CONFIG][VERIFY] requested =", JSON.stringify(req),
                            ", actual =", JSON.stringify(cfg),
                            ", result =", isVerified ? "MATCH" : "MISMATCH");

                if (!isVerified) {
                    root.isBusy = false;
                    root.isVerifying = false;
                    root.syncStatus = "VERIFICATION_FAILED";
                    var mismatchDetails = "Requested: " + req.shape + " (" + req.height_cm.toFixed(1) + "cm), Returned: " + (cfg.shape || actualShapeId) + " (" + actualH.toFixed(1) + "cm)";
                    root.showMsg("Configuration verification failed: " + mismatchDetails + ". Re-check device.", true);
                    // CRITICAL: DO NOT call populateFromConfig! Retain user inputs so changes are not lost!
                    return;
                }

                // Verification SUCCEEDED
                root.isBusy = false;
                root.isVerifying = false;
                root.isDirty = false;
                root.syncStatus = "SYNCHRONIZED";
                root.deviceConfig = cfg;
                root.pendingConfig = null;

                // Update active TankModel and local Settings
                Settings.tankShape = cfg.shape || (actualShapeId === 1 ? "RECTANGLE" : (actualShapeId === 2 ? "CUSTOM" : "CYLINDER"));
                Settings.tankShapeId = actualShapeId;
                Settings.tankHeight = actualH / 100.0;
                Settings.tankDiameterCm = cfg.diameter_cm !== undefined ? parseFloat(cfg.diameter_cm) : req.diameter_cm;
                Settings.tankWidthCm = cfg.width_cm !== undefined ? parseFloat(cfg.width_cm) : req.width_cm;
                Settings.tankLengthCm = cfg.length_cm !== undefined ? parseFloat(cfg.length_cm) : req.length_cm;
                var capL = cfg.capacity_liters !== undefined ? parseFloat(cfg.capacity_liters) : (cfg.tank_capacity_l !== undefined ? parseFloat(cfg.tank_capacity_l) : req.capacity_liters);
                Settings.tankCapacityLiters = capL;
                Settings.warningThresholdPercent = actualWarn;
                Settings.criticalThresholdPercent = actualCrit;
                Settings.highThresholdPercent = actualHigh;

                TankModel.updateTankConfiguration(
                    actualShapeId,
                    actualH,
                    Settings.tankDiameterCm,
                    Settings.tankWidthCm,
                    Settings.tankLengthCm,
                    capL,
                    actualWarn,
                    actualCrit,
                    actualHigh
                );

                root.populateFromConfig(cfg);

                var shapeStr = (actualShapeId === 1) ? "Rectangular" : ((actualShapeId === 2) ? "Custom Vessel" : "Cylindrical");
                var capStr = capL.toFixed(1) + " L";
                root.showMsg("Configuration verified and synchronized with ESP32 (" + shapeStr + ", " + capStr + ").", false);
            } else {
                // Not in verification mode (e.g. Read From Device or initial connection synchronization)
                // Stale response protection: do not overwrite if user has unsaved edits
                if (root.isDirty && !root.isBusy) {
                    console.log("[CONFIG][QT] Background config read arrived while user is editing; ignoring to protect unsaved input.");
                    return;
                }

                root.isBusy = false;
                root.isVerifying = false;
                root.isDirty = false;
                root.syncStatus = "SYNCHRONIZED";
                root.deviceConfig = cfg;
                root.populateFromConfig(cfg);

                var fallbackShapeId = (cfg.shape_id !== undefined) ? parseInt(cfg.shape_id) : ((cfg.shape === "RECTANGLE") ? 1 : ((cfg.shape === "CUSTOM") ? 2 : 0));
                var shapeNameStr = (fallbackShapeId === 1) ? "Rectangular" : ((fallbackShapeId === 2) ? "Custom Vessel" : "Cylindrical");
                var capacityStr = root.previewCapacityLiters.toFixed(1) + " L";
                root.showMsg("Configuration read from ESP32 (" + shapeNameStr + ", " + capacityStr + ").", false);
            }
        }

        function onConfigPostCompleted(success, message) {
            console.log("[CONFIG][ESP32] POST /config reply: success = " + success + ", message = " + message);
            if (success) {
                if (root.isPendingReset) {
                    root.isPendingReset = false;
                    Settings.tankShape = "CYLINDER";
                    Settings.tankShapeId = 0;
                    Settings.tankHeight = 0.50;
                    Settings.tankDiameterCm = 22.5676;
                    Settings.tankWidthCm = 0.0;
                    Settings.tankLengthCm = 0.0;
                    Settings.tankCapacityLiters = 20.0;
                    Settings.warningThresholdPercent = 20.0;
                    Settings.criticalThresholdPercent = 10.0;
                    Settings.highThresholdPercent = 90.0;

                    TankModel.updateTankConfiguration(0, 50.0, 22.5676, 0.0, 0.0, 20.0, 20.0, 10.0, 90.0);
                    root.deviceConfig = {
                        "shape": "CYLINDER",
                        "shape_id": 0,
                        "height_cm": 50.0,
                        "max_height_cm": 50.0,
                        "diameter_cm": 22.5676,
                        "width_cm": 0.0,
                        "length_cm": 0.0,
                        "capacity_liters": 20.0,
                        "warning_percent": 20.0,
                        "critical_percent": 10.0,
                        "high_percent": 90.0
                    };
                    root.populateFromConfig(root.deviceConfig);
                    root.isDirty = false;
                    root.isBusy = false;
                    root.syncStatus = "SYNCHRONIZED";
                    root.showMsg("Reset to factory defaults applied and confirmed by ESP32 (50.0 cm / 20.0 L Cylinder).", false);
                } else if (root.pendingConfig !== null) {
                    // Retain root.pendingConfig for read-back verification in onConfigReceived!
                    root.isVerifying = true;
                    root.syncStatus = "VERIFYING";
                    root.showMsg("Configuration acknowledged by ESP32. Verifying persisted NVS state...", false);
                    ApiClient.getConfig();
                } else {
                    root.isBusy = false;
                    root.isDirty = false;
                    root.syncStatus = "SYNCHRONIZED";
                    root.showMsg("ESP32: " + message, false);
                }
            } else {
                root.isBusy = false;
                root.isVerifying = false;
                root.syncStatus = "DEVICE_ERROR";
                // Preserve user's edited state so changes are not lost upon network/validation error
                root.showMsg("Failed to update ESP32 configuration: " + message, true);
            }
        }
    }

    ColumnLayout {
        Layout.fillWidth: true
        spacing: Theme.metrics.spacingMedium

        // Title, Description, and Status Indicator
        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.metrics.spacingMedium

            ColumnLayout {
                Layout.fillWidth: true
                spacing: Theme.metrics.space4

                Text {
                    text: "Tank Geometry & Commissioning Configuration"
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 17
                    font.weight: Font.DemiBold
                }
                Text {
                    text: "Configure vessel geometry, physical dimensions, and alarm thresholds. Changes persist in ESP32 NVS across reboots without firmware recompilation."
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
            }

            // Status Pill (Unsaved Changes / Applying / Verifying / Synchronized / Verification Failed / Local Model)
            Rectangle {
                Layout.alignment: Qt.AlignTop | Qt.AlignRight
                height: 26
                implicitWidth: statusPillRow.implicitWidth + 16
                radius: 13
                color: root.syncStatus === "UNSAVED" || root.isDirty ? "#FEF3C7" :
                       (root.syncStatus === "VERIFICATION_FAILED" || root.syncStatus === "DEVICE_ERROR" || root.cardStatusIsError ? "#FEE2E2" :
                       (root.syncStatus === "APPLYING" || root.syncStatus === "VERIFYING" ? "#DBEAFE" :
                       (root.syncStatus === "SYNCHRONIZED" || (!root.isDirty && root.deviceConfig !== null) ? "#DCFCE7" : "#F3F4F6")))
                border.color: root.syncStatus === "UNSAVED" || root.isDirty ? "#F59E0B" :
                              (root.syncStatus === "VERIFICATION_FAILED" || root.syncStatus === "DEVICE_ERROR" || root.cardStatusIsError ? "#EF4444" :
                              (root.syncStatus === "APPLYING" || root.syncStatus === "VERIFYING" ? "#3B82F6" :
                              (root.syncStatus === "SYNCHRONIZED" || (!root.isDirty && root.deviceConfig !== null) ? "#22C55E" : "#D1D5DB")))
                border.width: 1

                RowLayout {
                    id: statusPillRow
                    anchors.centerIn: parent
                    spacing: 6

                    Rectangle {
                        width: 8
                        height: 8
                        radius: 4
                        color: root.syncStatus === "UNSAVED" || root.isDirty ? "#D97706" :
                               (root.syncStatus === "VERIFICATION_FAILED" || root.syncStatus === "DEVICE_ERROR" || root.cardStatusIsError ? "#DC2626" :
                               (root.syncStatus === "APPLYING" || root.syncStatus === "VERIFYING" ? "#2563EB" :
                               (root.syncStatus === "SYNCHRONIZED" || (!root.isDirty && root.deviceConfig !== null) ? "#16A34A" : "#6B7280")))
                    }

                    Text {
                        text: root.syncStatus === "UNSAVED" || root.isDirty ? "Unsaved Changes" :
                              (root.syncStatus === "APPLYING" ? "Applying..." :
                              (root.syncStatus === "VERIFYING" ? "Verifying..." :
                              (root.syncStatus === "VERIFICATION_FAILED" ? "Verification Failed" :
                              (root.syncStatus === "DEVICE_ERROR" ? "Device Error" :
                              (root.syncStatus === "SYNCHRONIZED" || (!root.isDirty && root.deviceConfig !== null) ? "Device Synchronized" : "Local Model")))))
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Bold
                        color: root.syncStatus === "UNSAVED" || root.isDirty ? "#92400E" :
                               (root.syncStatus === "VERIFICATION_FAILED" || root.syncStatus === "DEVICE_ERROR" || root.cardStatusIsError ? "#991B1B" :
                               (root.syncStatus === "APPLYING" || root.syncStatus === "VERIFYING" ? "#1E40AF" :
                               (root.syncStatus === "SYNCHRONIZED" || (!root.isDirty && root.deviceConfig !== null) ? "#15803D" : "#4B5563")))
                    }
                }
            }
        }

        // Shape Selection
        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.metrics.spacingMedium

            Label {
                text: "Tank Shape"
                Layout.preferredWidth: 160
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 14
                font.weight: Font.Medium
            }

            StyledComboBox {
                id: shapeCombo
                Layout.fillWidth: true
                model: ["Cylindrical (Height + Diameter)", "Rectangular (Height + Width + Length)", "Custom Vessel (Height + Direct Capacity)"]
                currentIndex: root.selectedShapeId
                onActivated: function(index) {
                    root.selectedShapeId = index;
                    root.isDirty = true;
                    root.syncStatus = "UNSAVED";
                }
            }
        }

        // Dynamic Dimension Inputs
        GridLayout {
            Layout.fillWidth: true
            columns: 2
            columnSpacing: Theme.metrics.spacingMedium
            rowSpacing: Theme.metrics.spacingMedium

            // Height (Always present)
            Label {
                text: "Total Height (cm)"
                Layout.preferredWidth: 160
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 14
            }
            StyledTextField {
                id: heightInput
                Layout.fillWidth: true
                text: root.editHeightCm.toFixed(1)
                placeholderText: "50.0"
                inputMethodHints: Qt.ImhFormattedNumbersOnly
                onTextEdited: {
                    root.isDirty = true;
                    root.syncStatus = "UNSAVED";
                }
            }

            // Cylinder: Diameter
            Label {
                text: "Tank Diameter (cm)"
                Layout.preferredWidth: 160
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 14
                visible: root.selectedShapeId === 0
            }
            StyledTextField {
                id: diameterInput
                Layout.fillWidth: true
                text: root.editDiameterCm.toFixed(1)
                placeholderText: "22.6"
                visible: root.selectedShapeId === 0
                inputMethodHints: Qt.ImhFormattedNumbersOnly
                onTextEdited: {
                    root.isDirty = true;
                    root.syncStatus = "UNSAVED";
                }
            }

            // Rectangle: Width
            Label {
                text: "Tank Width (cm)"
                Layout.preferredWidth: 160
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 14
                visible: root.selectedShapeId === 1
            }
            StyledTextField {
                id: widthInput
                Layout.fillWidth: true
                text: root.editWidthCm.toFixed(1)
                placeholderText: "20.0"
                visible: root.selectedShapeId === 1
                inputMethodHints: Qt.ImhFormattedNumbersOnly
                onTextEdited: {
                    root.isDirty = true;
                    root.syncStatus = "UNSAVED";
                }
            }

            // Rectangle: Length
            Label {
                text: "Tank Length (cm)"
                Layout.preferredWidth: 160
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 14
                visible: root.selectedShapeId === 1
            }
            StyledTextField {
                id: lengthInput
                Layout.fillWidth: true
                text: root.editLengthCm.toFixed(1)
                placeholderText: "20.0"
                visible: root.selectedShapeId === 1
                inputMethodHints: Qt.ImhFormattedNumbersOnly
                onTextEdited: {
                    root.isDirty = true;
                    root.syncStatus = "UNSAVED";
                }
            }

            // Custom: Total Capacity
            Label {
                text: "Rated Capacity (Liters)"
                Layout.preferredWidth: 160
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 14
                visible: root.selectedShapeId === 2
            }
            StyledTextField {
                id: customCapInput
                Layout.fillWidth: true
                text: root.editCapacityL.toFixed(1)
                placeholderText: "20.0"
                visible: root.selectedShapeId === 2
                inputMethodHints: Qt.ImhFormattedNumbersOnly
                onTextEdited: {
                    root.isDirty = true;
                    root.syncStatus = "UNSAVED";
                }
            }
        }

        // Live Calculated Capacity Preview Card
        Rectangle {
            Layout.fillWidth: true
            height: 38
            radius: 6
            color: Theme.colors.primarySurface
            border.color: "#BFDBFE"
            border.width: 1

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12

                Text {
                    text: "Derived Vessel Capacity:"
                    color: Theme.colors.primary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.Medium
                }

                Item { Layout.fillWidth: true }

                Text {
                    text: root.previewCapacityLiters >= 1000
                        ? (root.previewCapacityLiters.toLocaleString(Qt.locale(), 'f', 1) + " L (" + (root.previewCapacityLiters / 1000.0).toFixed(2) + " m³)")
                        : (root.previewCapacityLiters.toFixed(2) + " Liters")
                    color: Theme.colors.primary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 14
                    font.weight: Font.Bold
                }
            }
        }

        // Divider
        Rectangle {
            Layout.fillWidth: true
            height: 1
            color: Theme.colors.divider
            Layout.topMargin: 4
            Layout.bottomMargin: 4
        }

        // Alarm Thresholds Section
        Text {
            text: "Alarm Thresholds"
            color: Theme.colors.textPrimary
            font.family: Theme.typography.fontFamily
            font.pixelSize: 15
            font.weight: Font.DemiBold
        }

        GridLayout {
            Layout.fillWidth: true
            columns: 3
            columnSpacing: Theme.metrics.spacingMedium
            rowSpacing: Theme.metrics.spacingSmall

            // Critical Threshold
            Label {
                text: "Critical Alert Level"
                color: "#EF4444"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                font.weight: Font.Medium
                Layout.preferredWidth: 150
            }
            StyledSlider {
                id: criticalSlider
                Layout.fillWidth: true
                from: 1
                to: 50
                stepSize: 1
                value: root.editCriticalPct
                onMoved: {
                    root.isDirty = true;
                    root.syncStatus = "UNSAVED";
                }
            }
            Label {
                text: criticalSlider.value.toFixed(0) + " %"
                color: "#EF4444"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                font.weight: Font.Bold
                Layout.preferredWidth: 50
            }

            // Warning Threshold
            Label {
                text: "Warning Alert Level"
                color: "#F59E0B"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                font.weight: Font.Medium
                Layout.preferredWidth: 150
            }
            StyledSlider {
                id: warningSlider
                Layout.fillWidth: true
                from: 5
                to: 75
                stepSize: 1
                value: root.editWarningPct
                onMoved: {
                    root.isDirty = true;
                    root.syncStatus = "UNSAVED";
                }
            }
            Label {
                text: warningSlider.value.toFixed(0) + " %"
                color: "#F59E0B"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                font.weight: Font.Bold
                Layout.preferredWidth: 50
            }

            // High / Overflow Threshold
            Label {
                text: "High Alert Level"
                color: "#3B82F6"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                font.weight: Font.Medium
                Layout.preferredWidth: 150
            }
            StyledSlider {
                id: highSlider
                Layout.fillWidth: true
                from: 70
                to: 99
                stepSize: 1
                value: root.editHighPct
                onMoved: {
                    root.isDirty = true;
                    root.syncStatus = "UNSAVED";
                }
            }
            Label {
                text: highSlider.value.toFixed(0) + " %"
                color: "#3B82F6"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                font.weight: Font.Bold
                Layout.preferredWidth: 50
            }
        }

        // Action Buttons Row
        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.metrics.spacingMedium
            Layout.topMargin: 8

            StyledButton {
                id: readDeviceBtn
                text: "Read From Device"
                variant: "secondary"
                enabled: !root.isBusy
                onClicked: {
                    root.requestReadFromDevice();
                }
            }

            StyledButton {
                id: applyConfigBtn
                text: "Apply Configuration"
                enabled: !root.isBusy && (root.isDirty || root.deviceConfig === null)
                variant: (root.isDirty || root.deviceConfig === null) ? "primary" : "secondary"
                onClicked: {
                    root.applyConfiguration();
                }
            }

            StyledButton {
                id: resetChangesBtn
                text: "Reset Changes"
                variant: "secondary"
                enabled: !root.isBusy && root.isDirty
                onClicked: {
                    root.resetChanges();
                }
            }

            Item { Layout.fillWidth: true }

            BusyIndicator {
                running: root.isBusy
                visible: root.isBusy
                Layout.preferredWidth: 24
                Layout.preferredHeight: 24
            }

            StyledButton {
                id: factoryResetBtn
                text: "Factory Reset"
                variant: "danger"
                visible: PermissionManager.isAdmin || PermissionManager.canConfigureDevice
                enabled: !root.isBusy && (PermissionManager.isAdmin || PermissionManager.canConfigureDevice)
                onClicked: {
                    confirmResetOverlay.visible = true;
                }
            }
        }

        // Status Feedback Banner
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: cardStatusText.implicitHeight + 16
            radius: 6
            color: root.cardStatusIsError ? "#FEF2F2" : "#F0FDF4"
            border.color: root.cardStatusIsError ? "#FCA5A5" : "#86EFAC"
            border.width: 1
            visible: root.cardStatusMessage.length > 0

            Text {
                id: cardStatusText
                anchors.verticalCenter: parent.verticalCenter
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                text: root.cardStatusMessage
                color: root.cardStatusIsError ? "#991B1B" : "#166534"
                font.family: Theme.typography.fontFamily
                font.pixelSize: 13
                wrapMode: Text.Wrap
            }
        }
    }

    // Factory Reset Confirmation Modal Overlay
    Rectangle {
        id: confirmResetOverlay
        parent: root
        anchors.fill: parent
        color: Qt.rgba(0, 0, 0, 0.45)
        radius: root.radius
        visible: false
        z: 100

        MouseArea {
            anchors.fill: parent
            preventStealing: true
            onClicked: {} // Block background clicks while dialog is open
        }

        Rectangle {
            anchors.centerIn: parent
            width: Math.min(480, parent.width - 32)
            implicitHeight: modalCol.implicitHeight + 40
            radius: 12
            color: Theme.colors.surface
            border.color: "#EF4444"
            border.width: 1

            ColumnLayout {
                id: modalCol
                anchors.fill: parent
                anchors.margins: 20
                spacing: 14

                RowLayout {
                    spacing: 10
                    Rectangle {
                        width: 32
                        height: 32
                        radius: 16
                        color: "#FEE2E2"
                        Text {
                            text: "!"
                            anchors.centerIn: parent
                            color: "#DC2626"
                            font.bold: true
                            font.pixelSize: 18
                        }
                    }
                    Text {
                        text: "Confirm Factory Reset"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 16
                        font.weight: Font.Bold
                        color: Theme.colors.textPrimary
                    }
                }

                Text {
                    Layout.fillWidth: true
                    text: "Are you sure you want to reset tank geometry and thresholds to factory defaults (50.0 cm / 20.0 L Cylinder)?\n\nSensor calibration (A_air), WiFi credentials, and device settings will NOT be erased."
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    color: Theme.colors.textSecondary
                    wrapMode: Text.Wrap
                }

                RowLayout {
                    Layout.fillWidth: true
                    Layout.topMargin: 6
                    spacing: 12

                    Item { Layout.fillWidth: true }

                    StyledButton {
                        text: "Cancel"
                        variant: "secondary"
                        onClicked: confirmResetOverlay.visible = false
                    }

                    StyledButton {
                        text: "Reset to Defaults"
                        variant: "danger"
                        onClicked: {
                            confirmResetOverlay.visible = false;
                            root.executeFactoryReset();
                        }
                    }
                }
            }
        }
    }
}
