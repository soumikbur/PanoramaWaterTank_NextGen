import QtQuick
import QtQuick.Window

// Overlay providing 8-direction mouse edge and corner resize handlers
// for frameless ApplicationWindows in Qt 6.
Item {
    id: root
    anchors.fill: parent
    z: 9999

    property int resizeMargin: 6
    property int cornerMargin: 10

    // Disable edge resize handles when window is maximized
    visible: Window.window ? Window.window.visibility !== Window.Maximized : true

    // Top Edge
    MouseArea {
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: root.cornerMargin
        anchors.rightMargin: root.cornerMargin
        height: root.resizeMargin
        cursorShape: Qt.SizeVerCursor
        onPressed: if (Window.window) Window.window.startSystemResize(Qt.TopEdge)
    }

    // Bottom Edge
    MouseArea {
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: root.cornerMargin
        anchors.rightMargin: root.cornerMargin
        height: root.resizeMargin
        cursorShape: Qt.SizeVerCursor
        onPressed: if (Window.window) Window.window.startSystemResize(Qt.BottomEdge)
    }

    // Left Edge
    MouseArea {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.topMargin: root.cornerMargin
        anchors.bottomMargin: root.cornerMargin
        width: root.resizeMargin
        cursorShape: Qt.SizeHorCursor
        onPressed: if (Window.window) Window.window.startSystemResize(Qt.LeftEdge)
    }

    // Right Edge
    MouseArea {
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.topMargin: root.cornerMargin
        anchors.bottomMargin: root.cornerMargin
        width: root.resizeMargin
        cursorShape: Qt.SizeHorCursor
        onPressed: if (Window.window) Window.window.startSystemResize(Qt.RightEdge)
    }

    // Top-Left Corner
    MouseArea {
        anchors.top: parent.top
        anchors.left: parent.left
        width: root.cornerMargin
        height: root.cornerMargin
        cursorShape: Qt.SizeFDiagCursor
        onPressed: if (Window.window) Window.window.startSystemResize(Qt.TopEdge | Qt.LeftEdge)
    }

    // Top-Right Corner
    MouseArea {
        anchors.top: parent.top
        anchors.right: parent.right
        width: root.cornerMargin
        height: root.cornerMargin
        cursorShape: Qt.SizeBDiagCursor
        onPressed: if (Window.window) Window.window.startSystemResize(Qt.TopEdge | Qt.RightEdge)
    }

    // Bottom-Left Corner
    MouseArea {
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        width: root.cornerMargin
        height: root.cornerMargin
        cursorShape: Qt.SizeBDiagCursor
        onPressed: if (Window.window) Window.window.startSystemResize(Qt.BottomEdge | Qt.LeftEdge)
    }

    // Bottom-Right Corner
    MouseArea {
        anchors.bottom: parent.bottom
        anchors.right: parent.right
        width: root.cornerMargin
        height: root.cornerMargin
        cursorShape: Qt.SizeFDiagCursor
        onPressed: if (Window.window) Window.window.startSystemResize(Qt.BottomEdge | Qt.RightEdge)
    }
}
