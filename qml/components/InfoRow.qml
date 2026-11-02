// InfoRow.qml
import QtQuick
import QtQuick.Layouts
import PanoramaWaterTank

Item {
    id: root

    property string label: ""
    property string value: ""
    property color valueColor: Theme.colors.textPrimary

    Layout.fillWidth: true
    Layout.preferredHeight: 50
    implicitHeight: 50
    implicitWidth: Math.max(labelText.implicitWidth, valueText.implicitWidth)

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 4
        spacing: 2

        Text {
            id: labelText
            Layout.fillWidth: true
            text: root.label
            color: Theme.colors.textSecondary
            font.family: Theme.typography.fontFamily
            font.pixelSize: 13
            font.weight: Font.Medium
            elide: Text.ElideRight
        }

        Text {
            id: valueText
            Layout.fillWidth: true
            text: root.value
            color: root.valueColor
            font.family: Theme.typography.fontFamily
            font.pixelSize: 14
            font.weight: Font.DemiBold
            elide: Text.ElideRight
            Behavior on color { ColorAnimation { duration: 250 } }
        }
    }
}

