import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import PanoramaWaterTank

// ============================================================================
// CapabilityItem.qml — Compact single-line capability label
// Horizontal: small icon + title only. No description.
// ============================================================================
Item {
    id: root

    property string iconName: "water_drop"
    property string title: "REAL-TIME MONITORING"
    property string description: ""  // kept for API compat, not rendered

    implicitHeight: 44
    implicitWidth: capRow.implicitWidth

    RowLayout {
        id: capRow
        anchors.centerIn: parent
        spacing: 6

        VectorIcon {
            name: root.iconName
            size: 14
            color: "#617493"
            Layout.alignment: Qt.AlignVCenter
        }

        Text {
            text: root.title
            font.family: Theme.typography.fontFamily
            font.pixelSize: 11
            font.weight: Font.DemiBold
            font.letterSpacing: 0.4
            color: "#617493"
            Layout.alignment: Qt.AlignVCenter
        }
    }
}
