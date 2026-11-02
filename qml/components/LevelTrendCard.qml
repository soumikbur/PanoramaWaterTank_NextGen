import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// "Level Trend" card component with selectable time ranges: 12 Hours, 24 Hours, 7 Days.
// Binds directly to TankModel.trendHistory (populated via C++ ApiClient with UTC Unix epoch milliseconds).
// Embeds TrendChart for grid, curve, and area fill, with 0-100% Y-axis, dynamic X-axis time labels,
// and state overlays ("Loading level history...", "No water level history available").
BaseCard {
    id: root

    Layout.minimumHeight: Theme.metrics.tankCardMinHeight

    readonly property bool isOffline: TankModel.connectionState === "Offline" || !TankModel.hasValidData
    readonly property var rawHistory: (TankModel.composedTrendHistory && TankModel.composedTrendHistory.length > 0) ? TankModel.composedTrendHistory : TankModel.trendHistory
    readonly property real livePercentage: TankModel.fillPercentage
    property var numericValues: []
    property var timeLabels: []
    property bool hasData: numericValues.length > 0
    property real avgValue: 45.2
    property real minValue: 32.1
    property real maxValue: 58.7
    property real changeValue: 5.2

    // Time range selection: "12 Hours", "24 Hours", "7 Days"
    readonly property var rangeModel: ["12 Hours", "24 Hours", "7 Days"]
    readonly property var rangeHours: [12, 24, 168]

    readonly property int selectedRangeIndex: {
        var h = TankModel.historyRangeHours;
        if (h === 24) return 1;
        if (h === 168) return 2;
        return 0; // default 12 Hours
    }

    // Format a millisecond timestamp to local 12-hour AM/PM string (e.g., "8:00 PM")
    function formatTime12h(date) {
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var ampm = hours >= 12 ? "PM" : "AM";
        var h12 = hours % 12;
        if (h12 === 0) h12 = 12;
        var mm = minutes < 10 ? "0" + minutes : "" + minutes;
        return h12 + ":" + mm + " " + ampm;
    }

    // Format a millisecond timestamp for 7-day view (e.g., "Aug 17")
    function formatDate7d(date) {
        var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return months[date.getMonth()] + " " + date.getDate();
    }

        // Generate N non-overlapping labels between startMs and endMs
    function generateLabels(startMs, endMs, rangeIdx) {
        var labels = [];
        var maxLabels = root.width < 360 ? 3 : (root.width < 460 ? 4 : (rangeIdx === 2 ? 7 : 6));
        var count = Math.max(2, maxLabels);
        var step = count > 1 ? (endMs - startMs) / (count - 1) : 0;
        for (var k = 0; k < count; k++) {
            var t = new Date(startMs + k * step);
            if (rangeIdx === 2) {
                labels.push(formatDate7d(t));
            } else {
                labels.push(formatTime12h(t));
            }
        }
        return labels;
    }

    onWidthChanged: updateHistoryData()
    onRawHistoryChanged: updateHistoryData()
    onLivePercentageChanged: updateHistoryData()
    onSelectedRangeIndexChanged: updateHistoryData()
    Component.onCompleted: updateHistoryData()

    Connections {
        target: TankModel
        function onComposedTrendHistoryChanged() { root.updateHistoryData(); }
        function onFillPercentageChanged() { root.updateHistoryData(); }
        function onMeasurementStateChanged() { root.updateHistoryData(); }
        function onMeasurementValidChanged() { root.updateHistoryData(); }
        function onHasValidDataChanged() { root.updateHistoryData(); }
    }

    function updateHistoryData() {
        var maxHeightCm = TankModel.tankHeightCm > 0 ? TankModel.tankHeightCm : 50.0;
        var hours = TankModel.historyRangeHours > 0 ? TankModel.historyRangeHours : 12;
        var durationMs = hours * 3600 * 1000;
        var now = new Date().getTime();

        if (!rawHistory || rawHistory.length === 0) {
            numericValues = [];
            hasData = false;
            timeLabels = generateLabels(now - durationMs, now, selectedRangeIndex);
            return;
        }

        // Step 1: Parse and normalize all points: waterLevel (cm) -> levelPercentage (0-100%)
        var points = [];
        for (var i = 0; i < rawHistory.length; i++) {
            var item = rawHistory[i];
            if (!item || item.value === undefined || isNaN(item.value)) continue;

            var levelPercentage = 0.0;
            var waterLevelCm = 0.0;

            if (item.waterLevelCm !== undefined && !isNaN(item.waterLevelCm)) {
                waterLevelCm = parseFloat(item.waterLevelCm);
                levelPercentage = Math.max(0.0, Math.min(100.0, parseFloat(item.value)));
            } else {
                waterLevelCm = parseFloat(item.value);
                if (isNaN(waterLevelCm)) continue;

                // If waterLevelCm is reported in meters (<= 0.50 m when maxHeightCm >= 10.0 and waterLevelCm > 0), convert to cm:
                if (waterLevelCm <= (maxHeightCm / 100.0) && maxHeightCm >= 10.0 && waterLevelCm > 0) {
                    waterLevelCm *= 100.0;
                }

                // Convert physical water level (cm) to percentage (0-100%) against configured maxHeightCm
                levelPercentage = maxHeightCm > 0 ? (waterLevelCm / maxHeightCm) * 100.0 : 0.0;
                levelPercentage = Math.max(0.0, Math.min(100.0, levelPercentage));
            }

            var ts = 0;
            if (item.timestampMs !== undefined) {
                ts = Number(item.timestampMs);
            } else if (item.timestamp !== undefined) {
                ts = Number(item.timestamp);
            }

            // Normalization check: if Unix seconds (< 10^11), convert to milliseconds
            if (ts > 0 && ts < 1e11) {
                ts *= 1000;
            }

            if (ts > 0 && !isNaN(ts)) {
                points.push({
                    timestampMs: ts,
                    value: levelPercentage,
                    waterLevelCm: waterLevelCm,
                    source: item.source ? item.source : "HISTORICAL",
                    isAuthoritative: item.isAuthoritative ? true : false,
                    measurementState: item.measurementState ? item.measurementState : "VALID"
                });
            }
        }

        if (points.length === 0) {
            numericValues = [];
            hasData = false;
            timeLabels = generateLabels(now - durationMs, now, selectedRangeIndex);
            return;
        }

        // Step 2: Sort chronologically ascending (oldest -> newest)
        points.sort(function(a, b) { return a.timestampMs - b.timestampMs; });

        // Step 3: Determine selected time window bounds in milliseconds (now - durationMs -> now)
        var latestTs = points[points.length - 1].timestampMs;
        var plotEndMs = Math.max(now, latestTs);
        var plotStartMs = plotEndMs - durationMs;

        // Step 4: Filter points strictly within the active plotting window
        var inWindowPoints = [];
        for (var j = 0; j < points.length; j++) {
            if (points[j].timestampMs >= plotStartMs && points[j].timestampMs <= plotEndMs) {
                inWindowPoints.push(points[j]);
            }
        }

        if (inWindowPoints.length === 0) {
            inWindowPoints = points;
            plotEndMs = latestTs;
            plotStartMs = Math.max(0, latestTs - durationMs);
        }

        // Step 5: Map each point's temporal position proportionally across the full window
        var timeSpanMs = plotEndMs - plotStartMs;
        var chartPts = [];
        for (var k = 0; k < inWindowPoints.length; k++) {
            var pt = inWindowPoints[k];
            var xRatio = timeSpanMs > 0 ? (pt.timestampMs - plotStartMs) / timeSpanMs : (inWindowPoints.length > 1 ? k / (inWindowPoints.length - 1) : 0.5);
            xRatio = Math.max(0.0, Math.min(1.0, xRatio));
            chartPts.push({
                xRatio: xRatio,
                value: pt.value,
                timestampMs: pt.timestampMs,
                source: pt.source,
                isAuthoritative: pt.isAuthoritative,
                measurementState: pt.measurementState
            });
        }

        numericValues = chartPts;
        hasData = true;

        // Compute statistics
        if (inWindowPoints.length > 0) {
            var sum = 0;
            var min = 100.0;
            var max = 0.0;
            for (var s = 0; s < inWindowPoints.length; s++) {
                var val = inWindowPoints[s].value;
                sum += val;
                if (val < min) min = val;
                if (val > max) max = val;
            }
            avgValue = sum / inWindowPoints.length;
            minValue = min;
            maxValue = max;
            var firstVal = inWindowPoints[0].value;
            var lastVal = inWindowPoints[inWindowPoints.length - 1].value;
            changeValue = lastVal - firstVal;
        } else {
            avgValue = TankModel.fillPercentage;
            minValue = TankModel.fillPercentage;
            maxValue = TankModel.fillPercentage;
            changeValue = 0.0;
        }

        // Step 6: Generate non-overlapping X-axis labels matching the window
        timeLabels = generateLabels(plotStartMs, plotEndMs, selectedRangeIndex);
    }

    ColumnLayout {
        id: innerColumn
        Layout.fillWidth: true
        Layout.fillHeight: true
        spacing: Theme.metrics.spacingSmall

        // Card Header Row
        RowLayout {
            Layout.fillWidth: true

            Text {
                Layout.fillWidth: true
                text: "Level Trend (" + root.rangeModel[root.selectedRangeIndex] + ")"
                color: Theme.colors.textPrimary
                font.family: Theme.typography.fontFamily
                font.pixelSize: root.width < 380 ? 14 : Theme.typography.dashCardTitle.size
                font.weight: Theme.typography.dashCardTitle.weight
                elide: Text.ElideRight
            }

            StyledComboBox {
                id: rangeCombo
                model: root.rangeModel
                currentIndex: root.selectedRangeIndex
                onActivated: function(index) {
                    TankModel.historyRangeHours = root.rangeHours[index];
                }
                font.family: Theme.typography.fontFamily
                font.pixelSize: Theme.typography.dashLabel.size
                Layout.preferredWidth: root.width < 380 ? 96 : 116
            }
        }

        // Chart Plot Row with Y-Axis & TrendChart
        RowLayout {
            id: chartPlotRow
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.topMargin: Theme.metrics.space8
            spacing: 4

            // Y-Axis Title & Labels Column
            Item {
                id: yAxisArea
                Layout.fillHeight: true
                Layout.preferredWidth: root.width < 360 ? 32 : 44
                Layout.minimumWidth: root.width < 360 ? 32 : 44
                Layout.maximumWidth: root.width < 360 ? 32 : 44
                implicitWidth: root.width < 360 ? 32 : 44

                Text {
                    visible: root.width >= 360
                    text: "Water Level (%)"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 9
                    rotation: -90
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: parent.left
                    anchors.leftMargin: -18
                }

                Item {
                    id: yAxisLabelsContainer
                    anchors.top: parent.top
                    anchors.bottom: parent.bottom
                    anchors.right: parent.right
                    anchors.rightMargin: 4
                    width: 32

                    Repeater {
                        model: ["100%", "75%", "50%", "25%", "0%"]
                        delegate: Text {
                            required property int index
                            required property string modelData
                            anchors.right: parent.right
                            y: {
                                var topPad = 4;
                                var botPad = 6;
                                var usableH = Math.max(1, yAxisLabelsContainer.height - topPad - botPad);
                                return Math.round(topPad + usableH * (index / 4.0) - implicitHeight / 2);
                            }
                            text: modelData
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 10
                        }
                    }
                }
            }

            // Chart Container Area
            Item {
                id: chartContainer
                Layout.fillWidth: true
                Layout.fillHeight: true

                TrendChart {
                    id: trendChart
                    anchors.fill: parent
                    visible: !root.isOffline && root.hasData
                    values: root.numericValues
                    lineColor: Theme.colors.primary
                    gridColor: Theme.colors.divider
                }

                // Active Tooltip Badge Pill at latest data point (clamped to prevent right/bottom clipping)
                Rectangle {
                    id: tooltipBadge
                    visible: !root.isOffline && root.hasData && trendChart.points.length > 0
                    width: tooltipText.implicitWidth + 14
                    height: 22
                    radius: 4
                    color: Theme.colors.primary
                    z: 10
                    x: {
                        if (trendChart.points.length <= 0) return 0;
                        var lastPt = trendChart.points[trendChart.points.length - 1];
                        var candidateX = lastPt.x - width - 8;
                        if (candidateX < 0) candidateX = lastPt.x + 8;
                        return Math.max(0, Math.min(parent.width - width - 4, candidateX));
                    }
                    y: {
                        if (trendChart.points.length <= 0) return 0;
                        var lastPt = trendChart.points[trendChart.points.length - 1];
                        var candidateY = lastPt.y - height - 6;
                        if (candidateY < 0) candidateY = lastPt.y + 6;
                        return Math.max(0, Math.min(parent.height - height, candidateY));
                    }

                    Text {
                        id: tooltipText
                        anchors.centerIn: parent
                        text: {
                            if (TankModel.hasValidData && (TankModel.measurementState === "VALID" || TankModel.measurementState === "HOLDING_LAST_VALID" || TankModel.measurementValid)) {
                                return TankModel.fillPercentage.toFixed(2) + "%";
                            }
                            if (trendChart.points.length > 0) {
                                var lastItem = root.numericValues[root.numericValues.length - 1];
                                var val = (typeof lastItem === 'object' && lastItem !== null) ? lastItem.value : parseFloat(lastItem);
                                return (!isNaN(val) ? val.toFixed(2) : TankModel.fillPercentage.toFixed(2)) + "%";
                            }
                            return TankModel.fillPercentage.toFixed(2) + "%";
                        }
                        color: "#FFFFFF"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 11
                        font.weight: Font.Bold
                    }
                }

                // Outer Ring Marker Dot at latest data point
                Rectangle {
                    id: latestDot
                    visible: !root.isOffline && root.hasData && trendChart.points.length > 0
                    width: 10
                    height: 10
                    radius: 5
                    color: "#FFFFFF"
                    border.width: 2.5
                    border.color: Theme.colors.primary
                    z: 11
                    x: trendChart.points.length > 0 ? Math.max(0, Math.min(parent.width - 10, trendChart.points[trendChart.points.length - 1].x - 5)) : 0
                    y: trendChart.points.length > 0 ? Math.max(0, Math.min(parent.height - 10, trendChart.points[trendChart.points.length - 1].y - 5)) : 0
                }

                // Overlay Text for Offline / Empty / Loading / Error States
                ColumnLayout {
                    anchors.centerIn: parent
                    visible: root.isOffline || !root.hasData
                    spacing: 6

                    Text {
                        Layout.alignment: Qt.AlignHCenter
                        text: root.isOffline ? "TELEMETRY UNAVAILABLE" : (TankModel.connectionState === "Connecting" ? "Waiting for telemetry data..." : "No historical data available")
                        color: "#94A3B8"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 14
                        font.weight: Font.Bold
                    }

                    Text {
                        Layout.alignment: Qt.AlignHCenter
                        text: root.isOffline
                            ? "Device is currently offline • Historical data unavailable"
                            : "Telemetry samples will appear here once live packets are received"
                        color: "#94A3B8"
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 12
                    }
                }
            }
        }

        // X-Axis Time Labels Row & "Time" label
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 2

            RowLayout {
                Layout.fillWidth: true
                spacing: 4

                // Left offset matching yAxisArea exactly
                Item {
                    Layout.preferredWidth: yAxisArea.width
                }

                // Time labels container directly beneath chartContainer
                Item {
                    id: timeLabelsContainer
                    Layout.fillWidth: true
                    Layout.preferredHeight: 16

                    Repeater {
                        model: root.timeLabels
                        delegate: Text {
                            required property int index
                            required property string modelData
                            text: modelData
                            color: Theme.colors.textSecondary
                            font.family: Theme.typography.fontFamily
                            font.pixelSize: 10
                            x: {
                                if (root.timeLabels.length <= 1) return 0;
                                var totalW = timeLabelsContainer.width;
                                if (totalW <= 0) return 0;
                                if (index === 0) return 0;
                                if (index === root.timeLabels.length - 1) return Math.max(0, totalW - implicitWidth);
                                var centerPos = (index / (root.timeLabels.length - 1)) * totalW;
                                return Math.max(0, Math.min(totalW - implicitWidth, centerPos - implicitWidth / 2));
                            }
                        }
                    }
                }
            }

            Text {
                Layout.alignment: Qt.AlignHCenter
                text: "Time"
                color: Theme.colors.textSecondary
                font.family: Theme.typography.fontFamily
                font.pixelSize: 10
            }
        }

        // Section 9: Bottom Statistics
        Rectangle {
            Layout.fillWidth: true
            height: 1
            color: Theme.colors.border
            Layout.topMargin: 4
            Layout.bottomMargin: 2
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 44
            spacing: 0

            // Average
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text {
                    text: "Average"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                }
                Text {
                    text: root.avgValue.toFixed(1) + "%"
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.Bold
                }
            }

            Rectangle {
                Layout.preferredWidth: 1
                Layout.preferredHeight: 26
                color: Theme.colors.border
            }

            // Minimum
            ColumnLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 12
                spacing: 2
                Text {
                    text: "Minimum"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                }
                Text {
                    text: root.minValue.toFixed(1) + "%"
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.Bold
                }
            }

            Rectangle {
                Layout.preferredWidth: 1
                Layout.preferredHeight: 26
                color: Theme.colors.border
            }

            // Maximum
            ColumnLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 12
                spacing: 2
                Text {
                    text: "Maximum"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                }
                Text {
                    text: root.maxValue.toFixed(1) + "%"
                    color: Theme.colors.textPrimary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 13
                    font.weight: Font.Bold
                }
            }

            Rectangle {
                Layout.preferredWidth: 1
                Layout.preferredHeight: 26
                color: Theme.colors.border
            }

            // Change
            ColumnLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 12
                spacing: 2
                Text {
                    text: "Change"
                    color: Theme.colors.textSecondary
                    font.family: Theme.typography.fontFamily
                    font.pixelSize: 11
                }
                RowLayout {
                    spacing: 3
                    Text {
                        text: (root.changeValue >= 0 ? "+" : "") + root.changeValue.toFixed(1) + "%"
                        color: root.changeValue >= 0 ? Theme.colors.success : Theme.colors.warning
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 13
                        font.weight: Font.Bold
                    }
                    Text {
                        text: root.selectedRangeIndex === 1 ? "vs yesterday" : "vs start"
                        color: Theme.colors.textSecondary
                        font.family: Theme.typography.fontFamily
                        font.pixelSize: 10
                    }
                }
            }
        }
    }
}