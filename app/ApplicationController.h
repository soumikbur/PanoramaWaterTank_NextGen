#pragma once

#include <QObject>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <memory>

#include "Logger.h"
#include "SettingsManager.h"
#include "TankModel.h"
#include "TrainManager.h"
#include "TrainConfigProvider.h"
#include "LocationManager.h"
#include "TimeManager.h"
#include "ApplicationStateManager.h"
#include "ConnectionManager.h"
#include "ApiClient.h"
#include "DatabaseManager.h"
#include "AuthManager.h"
#include "PermissionManager.h"
#include "RailwayManager.h"
#include "SearchManager.h"
#include "DisplayPerformanceManager.h"
#include "MqttService.h"
#include "MqttConfig.h"
#include "TankRepository.h"

namespace Panorama {

class ApplicationController : public QObject
{
    Q_OBJECT

public:
    explicit ApplicationController(QGuiApplication *app, QObject *parent = nullptr);
    ~ApplicationController() override;

    bool initialize();
    void shutdown();

    QQmlApplicationEngine *qmlEngine() const { return m_engine.get(); }
    Logger *logger() const { return m_logger.get(); }

private:
    void registerQmlTypes();
    void setupDependencyWiring();
    void syncMqttConfiguration();
    void syncApiConfiguration();
    void syncTankConfiguration();

    QGuiApplication *m_app{nullptr};
    std::unique_ptr<QQmlApplicationEngine> m_engine;

    // Core singletons and services
    std::unique_ptr<Logger> m_logger;
    std::unique_ptr<DatabaseManager> m_databaseManager;
    std::unique_ptr<SettingsManager> m_settings;
    std::unique_ptr<ConnectionManager> m_connectionManager;
    std::unique_ptr<MqttService> m_mqttService;

    // Domain models and managers
    std::unique_ptr<TankModel> m_tankModel;
    std::unique_ptr<TrainConfigProvider> m_trainConfigProvider;
    std::unique_ptr<TrainManager> m_trainManager;
    std::unique_ptr<LocationManager> m_locationManager;
    std::unique_ptr<TimeManager> m_timeManager;
    std::unique_ptr<ApplicationStateManager> m_appStateManager;
    std::unique_ptr<AuthManager> m_authManager;
    std::unique_ptr<PermissionManager> m_permissionManager;
    std::unique_ptr<RailwayManager> m_railwayManager;
    std::unique_ptr<SearchManager> m_searchManager;
    std::unique_ptr<DisplayPerformanceManager> m_displayPerfManager;

    bool m_isShuttingDown{false};
};

} // namespace Panorama

