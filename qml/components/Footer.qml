import QtQuick
import PanoramaWaterTank

// Application Footer displaying copyright information
Rectangle {
    id: footer

    height: Theme.metrics.footerHeight
    color: "transparent"

    Text {
        anchors.centerIn: parent
        text: "\u00A9 2026 Panorama Water Tank Monitoring System"
        color: Theme.colors.textSecondary
        font.family: Theme.typography.fontFamily
        font.pixelSize: 12
    }
}
