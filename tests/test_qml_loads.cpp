#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QQuickStyle>
#include <cassert>
#include <iostream>

#include "Logger.h"
#include "SettingsManager.h"
#include "DatabaseManager.h"
#include "AuthManager.h"
#include "PermissionManager.h"
#include "RailwayManager.h"
#include "SearchManager.h"

using namespace Panorama;

int main(int argc, char *argv[])
{
    // Force offscreen for headless verification
    qputenv("QT_QPA_PLATFORM", QByteArray("offscreen"));

    QGuiApplication app(argc, argv);
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    Logger logger;
    SettingsManager settings(logger);
    DatabaseManager dbManager;
    assert(dbManager.initialize());

    QQmlApplicationEngine engine;

    QList<QString> qmlErrors;
    QObject::connect(&engine, &QQmlApplicationEngine::warnings,
                     [&qmlErrors](const QList<QQmlError> &warnings) {
        for (const auto &w : warnings) {
            std::cerr << "QML Warning: " << w.toString().toStdString() << std::endl;
            qmlErrors.append(w.toString());
        }
    });

    engine.rootContext()->setContextProperty(QStringLiteral("Settings"), &settings);
    engine.rootContext()->setContextProperty(QStringLiteral("SettingsManager"), &settings);

    std::cout << "Loading App.qml..." << std::endl;
    engine.loadFromModule("PanoramaWaterTank", "App");

    if (engine.rootObjects().isEmpty()) {
        std::cerr << "FATAL: Failed to load App.qml into QQmlApplicationEngine!" << std::endl;
        return 1;
    }

    std::cout << "[PASS] App.qml loaded successfully. Root objects count: " << engine.rootObjects().size() << std::endl;

    // Verify singletons
    const int authManagerTypeId = qmlTypeId("PanoramaWaterTank", 1, 0, "AuthManager");
    auto *authManager = authManagerTypeId >= 0
        ? engine.singletonInstance<AuthManager *>(authManagerTypeId)
        : nullptr;
    assert(authManager != nullptr);
    authManager->setDatabaseManager(&dbManager);
    std::cout << "[PASS] AuthManager singleton resolved." << std::endl;

    const int permissionManagerTypeId = qmlTypeId("PanoramaWaterTank", 1, 0, "PermissionManager");
    auto *permissionManager = permissionManagerTypeId >= 0
        ? engine.singletonInstance<PermissionManager *>(permissionManagerTypeId)
        : nullptr;
    assert(permissionManager != nullptr);
    permissionManager->setAuthManager(authManager);
    std::cout << "[PASS] PermissionManager singleton resolved." << std::endl;

    const int railwayManagerTypeId = qmlTypeId("PanoramaWaterTank", 1, 0, "RailwayManager");
    auto *railwayManager = railwayManagerTypeId >= 0
        ? engine.singletonInstance<RailwayManager *>(railwayManagerTypeId)
        : nullptr;
    assert(railwayManager != nullptr);
    railwayManager->setDatabaseManager(&dbManager);
    std::cout << "[PASS] RailwayManager singleton resolved." << std::endl;

    const int searchManagerTypeId = qmlTypeId("PanoramaWaterTank", 1, 0, "SearchManager");
    auto *searchManager = searchManagerTypeId >= 0
        ? engine.singletonInstance<SearchManager *>(searchManagerTypeId)
        : nullptr;
    assert(searchManager != nullptr);
    searchManager->setDatabaseManager(&dbManager);
    std::cout << "[PASS] SearchManager singleton resolved." << std::endl;

    // Test Role Switching in QML context
    assert(!authManager->isAuthenticated());
    std::cout << "[PASS] Initial state is unauthenticated (Role Selection Screen active)." << std::endl;

    // Simulate Admin Login
    bool adminOk = authManager->loginAdmin(QStringLiteral("Admin@Panorama2026"));
    assert(adminOk);
    assert(authManager->isAuthenticated());
    assert(authManager->isAdmin());
    assert(permissionManager->canAccessSystemSettings());
    std::cout << "[PASS] Admin login switches app to authenticated state with full system permissions." << std::endl;

    // Logout
    authManager->logout();
    assert(!authManager->isAuthenticated());
    std::cout << "[PASS] Logout successfully returns to Role Selection." << std::endl;

    // Simulate Employee Login
    bool userOk = authManager->loginUser(QStringLiteral("employee"), QStringLiteral("panorama123"));
    assert(userOk);
    assert(authManager->isAuthenticated());
    assert(authManager->isUser());
    assert(!permissionManager->canAccessSystemSettings());
    assert(permissionManager->canManageTrains());
    std::cout << "[PASS] Employee login switches app to authenticated state with employee permissions." << std::endl;

    authManager->logout();

    std::cout << "\n=======================================================" << std::endl;
    std::cout << "  ALL QML & UI ENGINE INTEGRATION TESTS PASSED (100%)" << std::endl;
    std::cout << "=======================================================" << std::endl;

    return 0;
}
