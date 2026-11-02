import QtQuick
import QtQuick.Layouts
import PanoramaWaterTank

// Tank Information panel: identity, live readings, geometry, and connection/
// sensor health at a glance. Features a clean, evenly distributed 2-column x 4-row layout.
BaseCard {
    id: root

    backgroundColor: Theme.colors.surface
    borderColor: Theme.colors.divider
    padding: Theme.metrics.cardPadding
    implicitHeight: Theme.metrics.tankCardMinHeight

    readonly property bool isTwoColumn: width >= 320

    component Divider : Rectangle {
        Layout.fillWidth: true
        Layout.fillHeight: false
        Layout.preferredHeight: 1
        height: 1
        color: Theme.colors.divider
    }

    Text {
        text: "Tank Information"
        color: Theme.colors.textPrimary
        font.family: Theme.typography.fontFamily
        font.pixelSize: Theme.typography.dashCardTitle.size
        font.weight: Theme.typography.dashCardTitle.weight
        Layout.fillWidth: true
        Layout.preferredHeight: implicitHeight
        Layout.bottomMargin: 4
    }

    // Information section: compact rows with full-width subtle dividers.
    // Rows wrap into 1 column when the card is narrow.
    GridLayout {
        id: infoSection
        Layout.fillWidth: true
        columns: isTwoColumn ? 2 : 1
        columnSpacing: 14
        rowSpacing: 0

        // ROW 1
        InfoRow {
            Layout.fillWidth: true
            Layout.preferredWidth: 115
            label: "Tank Name"
            value: TankModel.tankName
        }
        InfoRow {
            Layout.fillWidth: true
            Layout.preferredWidth: 100
            label: "Last Updated"
            value: TankModel.hasValidData ? TankModel.lastUpdated : "\u2014"
        }

        Divider {
            Layout.columnSpan: isTwoColumn ? 2 : 1
        }

        // ROW 2
        InfoRow {
            Layout.fillWidth: true
            Layout.preferredWidth: 115
            label: "Device"
            value: TankModel.deviceLabel
        }
        InfoRow {
            Layout.fillWidth: true
            Layout.preferredWidth: 100
            label: "Sensor Status"
            value: TankModel.hasValidData ? TankModel.sensorStatus : "\u2014"
            valueColor: !TankModel.hasValidData
                ? Theme.colors.textMuted
                : (TankModel.sensorStatus === "Healthy" ? Theme.colors.success : Theme.colors.critical)
        }

        Divider {
            Layout.columnSpan: isTwoColumn ? 2 : 1
        }

        // ROW 3
        InfoRow {
            Layout.fillWidth: true
            Layout.preferredWidth: 115
            label: "Pressure"
            value: (TankModel.hasValidData && TankModel.hasPressure)
                ? (TankModel.pressure.toFixed(1) + " hPa")
                : "\u2014"
        }
        InfoRow {
            Layout.fillWidth: true
            Layout.preferredWidth: 100
            label: "Tank Height"
            value: TankModel.tankHeightCm.toFixed(2) + " cm"
        }

        Divider {
            Layout.columnSpan: isTwoColumn ? 2 : 1
        }

        // ROW 4
        InfoRow {
            Layout.fillWidth: true
            Layout.preferredWidth: 115
            label: "Connection"
            value: TankModel.connectionState
            valueColor: TankModel.connectionState === "Connected"
                ? Theme.colors.success
                : Theme.colors.offline
        }
        InfoRow {
            Layout.fillWidth: true
            Layout.preferredWidth: 100
            label: "Tank Capacity"
            value: (TankModel.capacityLiters >= 1000
                ? TankModel.capacityLiters.toLocaleString(Qt.locale(), 'f', 2) + " L"
                : TankModel.capacityLiters.toFixed(2) + " L")
        }
    }

    // Spacer absorbs remaining vertical space in the card
    Item {
        Layout.fillWidth: true
        Layout.fillHeight: true
    }
}