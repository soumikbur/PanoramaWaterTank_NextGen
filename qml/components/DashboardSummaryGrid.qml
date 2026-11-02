import QtQuick
import QtQuick.Layouts
import PanoramaWaterTank

// The five bottom summary cards: Water Level, Tank Volume, Status, Atmospheric Pressure, Last Updated.
GridLayout {
    id: root

    property string layoutMode: "large"
    property bool compact: layoutMode !== "large"

    columns: layoutMode === "large" ? 5 : (layoutMode === "medium" ? 3 : 2)
    columnSpacing: Theme.metrics.cardSpacing
    rowSpacing: Theme.metrics.cardSpacing

    // CARD 1: Water Level
    SummaryCard {
        Layout.fillWidth: true
        Layout.preferredHeight: Theme.metrics.summaryCardHeight
        iconGlyph: "drop"
        iconColor: Theme.colors.primary
        valueColor: Theme.colors.primary
        title: "Water Level"
        value: TankModel.hasValidData ? (TankModel.fillPercentage.toFixed(2) + "%") : "--"
        subtitle: TankModel.hasValidData
            ? ("(" + TankModel.waterHeightCm.toFixed(2) + " cm / " + TankModel.tankHeightCm.toFixed(2) + " cm)")
            : "Waiting for data"
    }

    // CARD 2: Tank Volume
    SummaryCard {
        Layout.fillWidth: true
        Layout.preferredHeight: Theme.metrics.summaryCardHeight
        iconGlyph: "volume"
        iconColor: Theme.colors.primary
        valueColor: Theme.colors.textPrimary
        title: "Tank Volume"
        value: TankModel.hasValidData
            ? (TankModel.capacityLiters >= 1000
                ? TankModel.waterVolumeLiters.toLocaleString(Qt.locale(), 'f', 2) + " L"
                : TankModel.waterVolumeLiters.toFixed(2) + " L")
            : "--"
        subtitle: "(of " + (TankModel.capacityLiters >= 1000
            ? TankModel.capacityLiters.toLocaleString(Qt.locale(), 'f', 2) + " L"
            : TankModel.capacityLiters.toFixed(2) + " L") + ")"
    }

    // CARD 3: Status
    SummaryCard {
        Layout.fillWidth: true
        Layout.preferredHeight: Theme.metrics.summaryCardHeight
        iconGlyph: "status"
        iconColor: {
            if (!TankModel.hasValidData) return Theme.colors.warning;
            if (TankModel.alarmLevel === "Normal") return Theme.colors.success;
            if (TankModel.alarmLevel === "Warning") return Theme.colors.warning;
            return Theme.colors.critical;
        }
        valueColor: {
            if (!TankModel.hasValidData) return Theme.colors.warning;
            if (TankModel.alarmLevel === "Normal") return Theme.colors.successText;
            if (TankModel.alarmLevel === "Warning") return Theme.colors.warning;
            return Theme.colors.critical;
        }
        title: "Status"
        value: TankModel.hasValidData
            ? ((TankModel.alarmLevel === "" || TankModel.alarmLevel === "Unassessed") ? "Normal" : TankModel.alarmLevel)
            : "Waiting for data"
        subtitle: {
            if (!TankModel.hasValidData) return "--";
            if (TankModel.alarmLevel === "Critical") return "(Below 10%)";
            if (TankModel.alarmLevel === "Warning") return "(Below 20%)";
            if (TankModel.alarmLevel === "Overflow") return "(Over 100%)";
            return "(Normal Range)";
        }
    }

    // CARD 4: Atmospheric Pressure
    SummaryCard {
        Layout.fillWidth: true
        Layout.preferredHeight: Theme.metrics.summaryCardHeight
        iconGlyph: "pressure"
        iconColor: Theme.colors.info
        valueColor: Theme.colors.textPrimary
        title: "Atmospheric Pressure"
        value: (TankModel.hasValidData && TankModel.hasPressure)
            ? (TankModel.pressure.toFixed(1) + " hPa")
            : "1013.2 hPa"
    }

    // CARD 5: Last Updated
    SummaryCard {
        Layout.fillWidth: true
        Layout.columnSpan: root.columns === 2 ? 2 : 1
        Layout.preferredHeight: Theme.metrics.summaryCardHeight
        iconGlyph: "clock"
        iconColor: Theme.colors.primary
        valueColor: Theme.colors.textPrimary
        title: "Last Updated"
        value: TankModel.hasValidData ? TankModel.lastUpdated : "--"
    }
}