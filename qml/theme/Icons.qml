pragma Singleton
import QtQuick

// Icon token resolver (docs/03-ui-ux-design-system.md, Section 2.6 and
// Section 12). Components ask for an icon by semantic name; this
// singleton is the only place that knows where the underlying SVG asset
// actually lives, so populating or swapping the icon set later never
// touches component code. No assets are populated yet in this milestone
// (docs/06-development-workflow-roadmap.md, Milestone 6) - resolving a
// name today yields a path with nothing behind it yet, which QML's Image
// element tolerates without error.
QtObject {
    // Verified against a real qt_add_qml_module build (see the Milestone 1
    // build verification): a RESOURCES entry at "resources/icons/<file>"
    // is embedded under the qresource prefix "/PanoramaWaterTank/", so the
    // resolved path is qrc:/PanoramaWaterTank/resources/icons/<file>.svg -
    // not a qrc:/qt/qml/... path. Reconfirm this prefix if the project's
    // actual Qt 6.9 toolchain ever changes qt_add_qml_module's default
    // resource layout.
    readonly property string basePath: "qrc:/PanoramaWaterTank/resources/icons/"

    function source(name) {
        return basePath + name + ".svg";
    }
}
