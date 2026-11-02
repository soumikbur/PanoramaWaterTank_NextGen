import QtQuick
import QtQuick.Shapes
import PanoramaWaterTank

// Reusable line + filled-area chart for level trend visualization.
// Accepts an array of items (numeric percentage or { xRatio, value, timestampMs } objects).
// Y maps fixed 0-100% (0% at bottom with padding, 100% at top with padding).
// X maps proportionally to time domain (0 at left, width at right).
// Renders horizontal grid lines, smooth trend curve, and translucent area fill.
Item {
    id: root

    property var values: []
    property color lineColor: Theme.colors.primary
    property color areaColor: Qt.rgba(Theme.colors.primary.r, Theme.colors.primary.g, Theme.colors.primary.b, 0.16)
    property color gridColor: Theme.colors.divider
    property int horizontalDivisions: 4
    readonly property real topPadding: 4
    readonly property real bottomPadding: 6

    opacity: root.points.length > 0 ? 1.0 : 0.0
    Behavior on opacity {
        NumberAnimation { duration: Theme.animSmallPanel; easing.type: Easing.OutQuad }
    }

    readonly property var points: {
        const pts = [];
        const src = root.values;
        if (!src || src.length === 0 || width <= 0 || height <= 0) {
            return pts;
        }
        const n = src.length;
        const usableH = Math.max(1, height - root.topPadding - root.bottomPadding);

        for (let i = 0; i < n; i++) {
            const item = src[i];
            let val = 0;
            let xPos = 0;
            if (typeof item === 'object' && item !== null) {
                val = parseFloat(item.value);
                const ratio = (typeof item.xRatio === 'number') ? item.xRatio : (n > 1 ? i / (n - 1) : 0.5);
                xPos = Math.max(0, Math.min(width, ratio * width));
            } else {
                val = parseFloat(item);
                xPos = n > 1 ? i * (width / (n - 1)) : width / 2;
            }
            const clamped = isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
            // y maps 100% -> topPadding, 0% -> height - bottomPadding
            const yPos = root.topPadding + usableH * (1.0 - (clamped / 100.0));
            pts.push({
                x: xPos,
                y: Math.max(root.topPadding, Math.min(height - root.bottomPadding, yPos)),
                value: clamped
            });
        }
        return pts;
    }

    readonly property string linePathData: {
        const pts = points;
        if (pts.length < 2) return "";
        if (pts.length === 2) {
            return "M " + pts[0].x.toFixed(1) + "," + pts[0].y.toFixed(1) + " L " + pts[1].x.toFixed(1) + "," + pts[1].y.toFixed(1);
        }

        let d = "M " + pts[0].x.toFixed(1) + "," + pts[0].y.toFixed(1);
        for (let i = 1; i < pts.length - 1; i++) {
            const midX = (pts[i].x + pts[i + 1].x) / 2;
            const midY = (pts[i].y + pts[i + 1].y) / 2;
            d += " Q " + pts[i].x.toFixed(1) + "," + pts[i].y.toFixed(1) + " " + midX.toFixed(1) + "," + midY.toFixed(1);
        }
        d += " L " + pts[pts.length - 1].x.toFixed(1) + "," + pts[pts.length - 1].y.toFixed(1);
        return d;
    }

    readonly property string areaPathData: {
        const pts = points;
        if (pts.length < 2 || linePathData.length === 0) return "";
        const firstX = pts[0].x.toFixed(1);
        const lastX = pts[pts.length - 1].x.toFixed(1);
        const bottomY = (height - root.bottomPadding).toFixed(1);
        return linePathData + " L " + lastX + "," + bottomY + " L " + firstX + "," + bottomY + " Z";
    }

    // Horizontal grid lines (Fixed 0%, 25%, 50%, 75%, 100%)
    Repeater {
        model: root.horizontalDivisions + 1
        delegate: Rectangle {
            required property int index
            width: root.width
            height: 1
            y: {
                const usableH = Math.max(1, root.height - root.topPadding - root.bottomPadding);
                return Math.round(root.topPadding + usableH * (index / root.horizontalDivisions));
            }
            color: root.gridColor
        }
    }

    // Line & Area Fill via Qt Quick Shapes
    Shape {
        id: shapeItem
        anchors.fill: parent
        antialiasing: true

        ShapePath {
            fillColor: root.areaColor
            strokeColor: "transparent"
            PathSvg { path: root.areaPathData }
        }
        ShapePath {
            fillColor: "transparent"
            strokeColor: root.lineColor
            strokeWidth: 2.5
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { path: root.linePathData }
        }
    }

    // Data point markers along the curve (renders honest discrete dot if only 1 point)
    Repeater {
        model: {
            const pts = root.points;
            if (pts.length === 0) return [];
            if (pts.length === 1) return pts;
            const step = pts.length > 24 ? Math.ceil(pts.length / 16) : 1;
            const sampled = [];
            for (let i = 0; i < pts.length; i += step) {
                sampled.push(pts[i]);
            }
            return sampled;
        }
        delegate: Rectangle {
            required property var modelData
            width: 6
            height: 6
            radius: 3
            x: Math.round(modelData.x - 3)
            y: Math.round(modelData.y - 3)
            color: root.lineColor
            border.width: 1.5
            border.color: "#FFFFFF"
            z: 5
        }
    }
}
