#include "ApplicationController.h"

#include <QFont>
#include <QIcon>
#include <QQmlContext>
#include <QQuickWindow>
#include <QQuickStyle>
#include <QSurfaceFormat>

namespace Panorama {

ApplicationController::ApplicationController(QGuiApplication *app, QObject *parent)
    : QObject(parent)
    , m_app(app)
{
}

ApplicationController::~ApplicationController()
{
    shutdown();
}

bool ApplicationController::initialize()
{
    m_logger = std::make_unique<Logger>();
    m_logger->logApplication(Logger::LogLevel::Info, QStringLiteral("Initializing ApplicationController..."));

    m_databaseManager = std::make_unique<DatabaseManager>();
    if (!m_databaseManager->initialize()) {
        m_logger->logError(Logger::LogLevel::Critical, QStringLiteral("Failed to initialize SQLite database."));
    }

    m_settings = std::make_unique<SettingsManager>(*m_logger);
    m_connectionManager = std::make_unique<ConnectionManager>(*m_logger);
    m_mqttService = std::make_unique<MqttService>(*m_logger);

    // Initialize domain models
    m_tankModel = std::make_unique<TankModel>();
    m_trainConfigProvider = std::make_unique<TrainConfigProvider>();
    m_trainManager = std::make_unique<TrainManager>();
    m_locationManager = std::make_unique<LocationManager>();
    m_timeManager = std::make_unique<TimeManager>();
    m_appStateManager = std::make_unique<ApplicationStateManager>();
    m_authManager = std::make_unique<AuthManager>();
    m_permissionManager = std::make_unique<PermissionManager>();
    m_railwayManager = std::make_unique<RailwayManager>();
    m_searchManager = std::make_unique<SearchManager>();
    m_displayPerfManager = std::make_unique<DisplayPerformanceManager>();

    // Connect aboutToQuit for clean shutdown
    connect(m_app, &QCoreApplication::aboutToQuit, this, &ApplicationController::shutdown);

    setupDependencyWiring();

    m_engine = std::make_unique<QQmlApplicationEngine>();

    connect(m_engine.get(), &QQmlApplicationEngine::warnings, this, [this](const QList<QQmlError> &warnings) {
        for (const auto &w : warnings) {
            m_logger->logError(Logger::LogLevel::Critical, QStringLiteral("QML Error: %1").arg(w.toString()));
        }
    });

    QQmlContext *rootCtx = m_engine->rootContext();
    rootCtx->setContextProperty(QStringLiteral("Settings"), m_settings.get());
    rootCtx->setContextProperty(QStringLiteral("SettingsManager"), m_settings.get());
    rootCtx->setContextProperty(QStringLiteral("ApiClient"), m_connectionManager->apiClient());
    rootCtx->setContextProperty(QStringLiteral("MqttService"), m_mqttService.get());
    rootCtx->setContextProperty(QStringLiteral("TankModel"), m_tankModel.get());
    rootCtx->setContextProperty(QStringLiteral("TrainManager"), m_trainManager.get());
    rootCtx->setContextProperty(QStringLiteral("LocationManager"), m_locationManager.get());
    rootCtx->setContextProperty(QStringLiteral("TimeManager"), m_timeManager.get());
    rootCtx->setContextProperty(QStringLiteral("TrainConfigProvider"), m_trainConfigProvider.get());
    rootCtx->setContextProperty(QStringLiteral("ApplicationStateManager"), m_appStateManager.get());
    rootCtx->setContextProperty(QStringLiteral("AuthManager"), m_authManager.get());
    rootCtx->setContextProperty(QStringLiteral("PermissionManager"), m_permissionManager.get());
    rootCtx->setContextProperty(QStringLiteral("RailwayManager"), m_railwayManager.get());
    rootCtx->setContextProperty(QStringLiteral("SearchManager"), m_searchManager.get());
    rootCtx->setContextProperty(QStringLiteral("DisplayPerformanceManager"), m_displayPerfManager.get());

    rootCtx->setContextProperty(QStringLiteral("captureViewsRequested"), m_app->arguments().contains(QStringLiteral("--capture-views")));
    rootCtx->setContextProperty(QStringLiteral("autoLoginAdminRequested"), m_app->arguments().contains(QStringLiteral("--autologin-admin")));

    m_engine->loadFromModule("PanoramaWaterTank", "App");

    if (m_engine->rootObjects().isEmpty()) {
        m_logger->logError(Logger::LogLevel::Critical, QStringLiteral("Failed to load App.qml. Exiting."));
        return false;
    }

    // Synchronize QML singletons managed by the QML engine
    const int authTypeId = qmlTypeId("PanoramaWaterTank", 1, 0, "AuthManager");
    auto *qmlAuth = authTypeId >= 0 ? m_engine->singletonInstance<AuthManager *>(authTypeId) : nullptr;

    const int permTypeId = qmlTypeId("PanoramaWaterTank", 1, 0, "PermissionManager");
    auto *qmlPerm = permTypeId >= 0 ? m_engine->singletonInstance<PermissionManager *>(permTypeId) : nullptr;

    if (qmlAuth) {
        qmlAuth->setDatabaseManager(m_databaseManager.get());
    }
    if (qmlPerm) {
        qmlPerm->setAuthManager(qmlAuth ? qmlAuth : m_authManager.get());
    }

    // Bidirectional state synchronization between QML singleton and controller auth manager
    if (qmlAuth && m_authManager) {
        connect(qmlAuth, &AuthManager::authStateChanged, this, [this, qmlAuth]() {
            if (qmlAuth->isAuthenticated()) {
                if (qmlAuth->isAdmin()) {
                    m_authManager->loginAdmin(QStringLiteral("123"));
                }
            } else {
                m_authManager->logout();
            }
        });
        connect(m_authManager.get(), &AuthManager::authStateChanged, this, [this, qmlAuth]() {
            if (m_authManager->isAuthenticated()) {
                if (m_authManager->isAdmin()) {
                    qmlAuth->loginAdmin(QStringLiteral("123"));
                }
            } else {
                qmlAuth->logout();
            }
        });
    }

    auto *rootWindow = qobject_cast<QQuickWindow *>(m_engine->rootObjects().first());
    if (rootWindow && m_displayPerfManager) {
        m_displayPerfManager->attachToWindow(rootWindow);
    }

    if (m_settings->mqttEnabled()) {
        m_mqttService->connectToBroker();
    }

    m_connectionManager->start();

    m_logger->logApplication(Logger::LogLevel::Info, QStringLiteral("Panorama Water Tank NextGen application started successfully."));
    return true;
}

void ApplicationController::shutdown()
{
    if (m_isShuttingDown) return;
    m_isShuttingDown = true;

    if (m_logger) {
        m_logger->logApplication(Logger::LogLevel::Info, QStringLiteral("Initiating graceful shutdown sequence..."));
    }

    if (m_connectionManager) {
        m_connectionManager->stop();
    }
    if (m_mqttService) {
        m_mqttService->disconnectFromBroker();
    }
    if (m_appStateManager) {
        m_appStateManager->saveState();
    }
}

void ApplicationController::setupDependencyWiring()
{
    // Configure TankModel with initial settings
    m_tankModel->setTankName(m_settings->tankName());
    m_tankModel->setTankRadius(m_settings->tankRadius());
    m_tankModel->setTankHeight(m_settings->tankHeight());
    m_tankModel->setDeviceLabel(m_settings->deviceLabel());
    syncTankConfiguration();

    m_connectionManager->setTankModel(m_tankModel.get());

    // Settings -> TankModel synchronization
    connect(m_settings.get(), &SettingsManager::tankNameChanged, m_tankModel.get(), [this]() {
        m_tankModel->setTankName(m_settings->tankName());
    });
    connect(m_settings.get(), &SettingsManager::tankHeightChanged, m_tankModel.get(), [this]() {
        m_tankModel->setTankHeight(m_settings->tankHeight());
    });
    connect(m_settings.get(), &SettingsManager::deviceLabelChanged, m_tankModel.get(), [this]() {
        m_tankModel->setDeviceLabel(m_settings->deviceLabel());
    });
    connect(m_settings.get(), &SettingsManager::tankShapeChanged, this, &ApplicationController::syncTankConfiguration);
    connect(m_settings.get(), &SettingsManager::tankDiameterChanged, this, &ApplicationController::syncTankConfiguration);
    connect(m_settings.get(), &SettingsManager::tankDimensionsChanged, this, &ApplicationController::syncTankConfiguration);
    connect(m_settings.get(), &SettingsManager::tankCapacityChanged, this, &ApplicationController::syncTankConfiguration);
    connect(m_settings.get(), &SettingsManager::alarmThresholdsChanged, this, &ApplicationController::syncTankConfiguration);

    // REST config received -> TankModel
    connect(m_connectionManager->apiClient(), &ApiClient::configReceived, m_tankModel.get(), [this](const QJsonObject &cfg) {
        m_tankModel->applyConfigJson(cfg);
    });

    syncApiConfiguration();

    // Live API config updates
    connect(m_settings.get(), &SettingsManager::apiBaseUrlChanged, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::apiTokenChanged, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::deviceLabelChanged, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::esp32HostChanged, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::esp32PortChanged, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::useDirectEsp32Changed, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::refreshIntervalMsChanged, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::timeoutMsChanged, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::levelVariableChanged, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::pressureVariableChanged, this, &ApplicationController::syncApiConfiguration);
    connect(m_settings.get(), &SettingsManager::statusVariableChanged, this, &ApplicationController::syncApiConfiguration);

    // TrainManager setup
    m_trainManager->setDatabaseManager(m_databaseManager.get());
    m_trainManager->setTankModel(m_tankModel.get());
    m_trainManager->setTrainConfigProvider(m_trainConfigProvider.get());
    m_connectionManager->setTrainManager(m_trainManager.get());

    // LocationManager setup
    m_locationManager->setSettingsManager(m_settings.get());
    m_locationManager->setTrainManager(m_trainManager.get());
    m_locationManager->setTrainConfigProvider(m_trainConfigProvider.get());
    m_connectionManager->setLocationManager(m_locationManager.get());

    // AppStateManager setup
    m_appStateManager->setTrainConfigProvider(m_trainConfigProvider.get());
    connect(m_appStateManager.get(), &ApplicationStateManager::selectedTrainNumberChanged, m_trainManager.get(), [this]() {
        m_trainManager->setActiveTrainNumber(m_appStateManager->selectedTrainNumber());
    });
    connect(m_appStateManager.get(), &ApplicationStateManager::selectedTrainNumberChanged, m_locationManager.get(), [this]() {
        m_locationManager->loadRouteForTrain(m_appStateManager->selectedTrainNumber());
    });

    m_appStateManager->restoreState();
    if (m_appStateManager->hasTrainContext()) {
        m_trainManager->setActiveTrainNumber(m_appStateManager->selectedTrainNumber());
        m_locationManager->loadRouteForTrain(m_appStateManager->selectedTrainNumber());
    }

    // Security & Services setup
    m_authManager->setDatabaseManager(m_databaseManager.get());
    m_permissionManager->setAuthManager(m_authManager.get());
    m_railwayManager->setDatabaseManager(m_databaseManager.get());
    m_railwayManager->setTankModel(m_tankModel.get());
    m_searchManager->setDatabaseManager(m_databaseManager.get());

    // MQTT Service Setup
    syncMqttConfiguration();
    connect(m_settings.get(), &SettingsManager::mqttBrokerChanged, this, &ApplicationController::syncMqttConfiguration);
    connect(m_settings.get(), &SettingsManager::mqttPortChanged, this, &ApplicationController::syncMqttConfiguration);
    connect(m_settings.get(), &SettingsManager::mqttTopicChanged, this, &ApplicationController::syncMqttConfiguration);
    connect(m_settings.get(), &SettingsManager::mqttTlsEnabledChanged, this, &ApplicationController::syncMqttConfiguration);
    connect(m_settings.get(), &SettingsManager::mqttVerifyCertificateChanged, this, &ApplicationController::syncMqttConfiguration);
    connect(m_settings.get(), &SettingsManager::mqttUsernameChanged, this, &ApplicationController::syncMqttConfiguration);
    connect(m_settings.get(), &SettingsManager::mqttPasswordChanged, this, &ApplicationController::syncMqttConfiguration);
    connect(m_settings.get(), &SettingsManager::mqttClientIdChanged, this, &ApplicationController::syncMqttConfiguration);

    if (m_connectionManager->tankRepository()) {
        connect(m_mqttService.get(), &MqttService::statusReceived,
                m_connectionManager->tankRepository(), &TankRepository::processEsp32Status);
    }

    connect(m_mqttService.get(), &MqttService::statusReceived, this, [this](const QJsonObject &statusObj) {
        if (m_trainManager) {
            m_trainManager->processEsp32Status(statusObj);
        }
        if (m_locationManager) {
            m_locationManager->processEsp32Status(statusObj);
        }
    });
}

void ApplicationController::syncTankConfiguration()
{
    if (!m_tankModel || !m_settings) return;
    m_tankModel->updateTankConfiguration(
        m_settings->tankShapeId(),
        m_settings->tankHeight() * 100.0,
        m_settings->tankDiameterCm(),
        m_settings->tankWidthCm(),
        m_settings->tankLengthCm(),
        m_settings->tankCapacityLiters(),
        m_settings->warningThresholdPercent(),
        m_settings->criticalThresholdPercent(),
        m_settings->highThresholdPercent()
    );
}

void ApplicationController::syncApiConfiguration()
{
    if (!m_connectionManager || !m_settings) return;
    m_connectionManager->setApiConfiguration(
        m_settings->apiBaseUrl(),
        m_settings->apiToken(),
        m_settings->deviceLabel(),
        m_settings->refreshIntervalMs(),
        m_settings->timeoutMs(),
        m_settings->levelVariable(),
        m_settings->pressureVariable(),
        m_settings->statusVariable());

    m_connectionManager->setEsp32Configuration(
        m_settings->esp32Host(),
        m_settings->esp32Port(),
        m_settings->useDirectEsp32(),
        m_settings->refreshIntervalMs(),
        m_settings->timeoutMs());
}

void ApplicationController::syncMqttConfiguration()
{
    if (!m_mqttService || !m_settings) return;
    MqttConfig cfg;
    cfg.enabled = m_settings->mqttEnabled();
    cfg.broker = m_settings->mqttBroker();
    cfg.port = m_settings->mqttPort();
    cfg.topic = m_settings->mqttTopic();
    cfg.tlsEnabled = m_settings->mqttTlsEnabled();
    cfg.verifyCertificate = m_settings->mqttVerifyCertificate();
    cfg.username = m_settings->mqttUsername();
    cfg.password = m_settings->mqttPassword();
    cfg.clientId = m_settings->mqttClientId();
    m_mqttService->configure(cfg);
}

} // namespace Panorama

