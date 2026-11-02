import QtQuick
import QtQuick.Shapes

// Animated water fill for the tank visualization. A solid body plus a
// slow, subtle wave crest, built entirely with Qt Quick Shapes (SVG path
// data) - never Canvas, per the redesign specification.
//
// The wave path is generated wide enough to always fully cover the
// container regardless of the current animation phase: the shape is
// root.width + 2 * wavePeriod wide, and only ever shifts left by one
// wavePeriod, so it never runs out of coverage on the right edge. The
// path tiles exactly every wavePeriod, so a linear NumberAnimation from
// x=0 to x=-wavePeriod loops with no visible seam.
Item {
    id: root

    property color waterColor: "#2196F3"
    property color surfaceColor: Qt.lighter(waterColor, 1.18)
    property real waveAmplitude: 4
    property real wavePeriod: 140
    property int waveDuration: 4200

    readonly property real waveShapeWidth: width + wavePeriod * 2
    readonly property string wavePathData: {
        const half = wavePeriod / 2;
        const segmentCount = Math.ceil(waveShapeWidth / half) + 2;
        const bottom = waveAmplitude * 2 + 4;

        let path = "M0," + waveAmplitude + " Q " + (half / 2) + ",0 " + half + "," + waveAmplitude;
        let x = half;
        for (let i = 1; i < segmentCount; i++) {
            x += half;
            path += " T " + x + "," + waveAmplitude;
        }
        path += " L " + x + "," + bottom + " L 0," + bottom + " Z";
        return path;
    }

    clip: true

    // Solid body beneath the animated crest.
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: parent.height
        color: root.waterColor
    }

    Shape {
        id: waveShape
        width: root.waveShapeWidth
        height: root.waveAmplitude * 2 + 4
        y: -root.waveAmplitude
        antialiasing: true

        ShapePath {
            fillColor: root.surfaceColor
            strokeColor: "transparent"
            PathSvg { path: root.wavePathData }
        }

        NumberAnimation on x {
            from: 0
            to: -root.wavePeriod
            duration: root.waveDuration
            loops: Animation.Infinite
            easing.type: Easing.Linear
            running: root.visible && root.opacity > 0
                     && !Theme.reducedMotion
                     && (root.Window ? root.Window.visibility !== Window.Hidden : true)
        }
    }
}
