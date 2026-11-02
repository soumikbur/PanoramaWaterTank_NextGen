// main.cpp - Panorama Water Tank Monitor NextGen Entry Point
#include <QFont>
#include <QGuiApplication>
#include <QIcon>
#include <QQuickStyle>
#include <QSurfaceFormat>

#include "ApplicationController.h"

int main(int argc, char *argv[])
{
    // High-DPI pass-through scale factor rounding policy
    QGuiApplication::setHighDpiScaleFactorRoundingPolicy(
        Qt::HighDpiScaleFactorRoundingPolicy::PassThrough);

    // Request vsync-synchronised buffer swaps for smooth 60+ FPS presentation
    {
        QSurfaceFormat fmt = QSurfaceFormat::defaultFormat();
        fmt.setSwapInterval(1);
        QSurfaceFormat::setDefaultFormat(fmt);
    }

    QGuiApplication app(argc, argv);
    app.setQuitOnLastWindowClosed(true);
    QQuickStyle::setStyle(QStringLiteral("Basic"));
    app.setOrganizationName(QStringLiteral("Panorama Electronics"));
    app.setOrganizationDomain(QStringLiteral("panorama-electronics.example"));
    app.setApplicationName(QStringLiteral("Panorama Water Tank Monitor"));
    app.setApplicationVersion(QStringLiteral("2.0.0"));
    app.setWindowIcon(QIcon(QStringLiteral(":/assets/images/panorama_icon.png")));

    // Industrial Inter font family
    QFont defaultFont(QStringLiteral("Inter"));
    QGuiApplication::setFont(defaultFont);

    // Modern modular lifecycle orchestration
    Panorama::ApplicationController controller(&app);
    if (!controller.initialize()) {
        return -1;
    }

    return app.exec();
}

