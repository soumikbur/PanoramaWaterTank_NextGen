import QtQuick
import QtQuick.Layouts
import PanoramaWaterTank

// Full-width water-level rank section. A dedicated file so the page
// assembler places a section, not a specific visualization - if the
// rank display is ever replaced, only this file changes.
RankIndicator {
    Layout.fillWidth: true
}
