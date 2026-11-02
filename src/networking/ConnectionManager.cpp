// ConnectionManager.cpp
#include "ConnectionManager.h"
#include "ApiClient.h"
#include "TankRepository.h"
#include "TankModel.h"
#include "TrainManager.h"
#include "LocationManager.h"
#include "Logger.h"

namespace Panorama {

ConnectionManager::ConnectionManager(Logger &logger, QObject *parent)
    : QObject(parent)
    , m_logger(logger)
    , m_apiClient(new ApiClient(this))
    , m_tankRepository(new TankRepository(logger, this))
{
    connect(m_apiClient, &ApiClient::readingReceived,
            m_tankRepository, &TankRepository::processReading);

    connect(m_apiClient, &ApiClient::readingReceived, this, [this](double waterLevel, double pressure, const QString &status, qint64 timestampMs, bool isFresh) {
        if (m_trainManager) {
            m_trainManager->processReading(waterLevel, pressure, status, timestampMs, isFresh);
        }
    });

    connect(m_apiClient, &ApiClient::statusReceived,
            m_tankRepository, &TankRepository::processEsp32Status);

    connect(m_apiClient, &ApiClient::statusReceived, this, [this](const QJsonObject &statusObj) {
        if (m_trainManager) {
            m_trainManager->processEsp32Status(statusObj);
        }
        if (m_locationManager) {
            m_locationManager->processEsp32Status(statusObj);
        }
    });

    connect(m_apiClient, &ApiClient::connectionStatusChanged, this, [this](ConnectionState state, const QString & /*stateStr*/) {
        if (m_tankModel) {
            if (state == ConnectionState::Connected) {
                m_tankModel->setConnectionState(QStringLiteral("Connected"));
            } else if (state == ConnectionState::Connecting) {
                m_tankModel->setConnectionState(QStringLiteral("Connecting"));
            } else if (state == ConnectionState::Error) {
                m_tankModel->setConnectionState(QStringLiteral("Error"));
            } else {
                m_tankModel->setConnectionState(QStringLiteral("Disconnected"));
            }
        }
        if (m_trainManager) {
            if (state == ConnectionState::Connected) {
                m_trainManager->setConnectionState(QStringLiteral("Connected"));
            } else if (state == ConnectionState::Connecting) {
                m_trainManager->setConnectionState(QStringLiteral("Connecting"));
            } else {
                m_trainManager->setConnectionState(QStringLiteral("Disconnected"));
            }
        }
    });

    connect(m_apiClient, &ApiClient::historicalDataReceived, this, [this](const QVariantList &history) {
        if (m_tankModel) {
            m_tankModel->setTrendHistory(history);
        }
    });

    connect(m_apiClient, &ApiClient::historicalSyncReceived, this, [this](const QVariantList &history, uint32_t nextSequence, bool hasMore) {
        if (m_tankModel) {
            m_tankModel->appendTrendHistory(history);
            m_tankModel->setLastSyncedSequence(nextSequence);
            
            if (hasMore) {
                m_apiClient->syncHistoricalData(nextSequence);
            } else {
                m_tankModel->setIsSyncing(false);
                m_apiClient->ackHistoricalData(nextSequence);
            }
        }
    });

    connect(m_apiClient, &ApiClient::statusReceived, this, [this](const QJsonObject &statusObj) {
        if (m_tankModel && m_apiClient->useDirectEsp32()) {
            uint32_t lastSeq = statusObj.value(QStringLiteral("lastSequence")).toDouble(0);
            uint32_t ourSeq = m_tankModel->lastSyncedSequence();
            
            if (ourSeq < lastSeq) {
                if (!m_tankModel->isSyncing()) {
                    m_tankModel->setIsSyncing(true);
                    m_apiClient->syncHistoricalData(ourSeq);
                }
            } else {
                m_tankModel->setIsSyncing(false);
            }
        }
    });

    connect(m_apiClient, &ApiClient::networkError, this, [this](const QString &error) {
        m_logger.logError(Logger::LogLevel::Warning, QStringLiteral("ConnectionManager Network Error: %1").arg(error));
    });
}


void ConnectionManager::setTankModel(TankModel *model)
{
    if (!model) {
        return;
    }
    m_tankModel = model;
    m_tankRepository->setTankModel(m_tankModel);

    connect(m_tankModel, &TankModel::historyRangeHoursChanged,
            m_apiClient, &ApiClient::setHistoryRangeHours);

    connect(m_tankModel, &TankModel::trendRefreshRequested,
            m_apiClient, &ApiClient::fetchHistoricalData);

    // Synchronize initial range
    m_apiClient->setHistoryRangeHours(m_tankModel->historyRangeHours());
}

void ConnectionManager::setTrainManager(TrainManager *trainManager)
{
    m_trainManager = trainManager;
}

void ConnectionManager::setLocationManager(LocationManager *locationManager)
{
    m_locationManager = locationManager;
}

void ConnectionManager::setApiConfiguration(const QString &baseUrl,
                                            const QString &token,
                                            const QString &deviceLabel,
                                            int pollingIntervalMs,
                                            int transferTimeoutMs,
                                            const QString &levelVar,
                                            const QString &pressureVar,
                                            const QString &statusVar)
{
    m_apiClient->setApiConfiguration(baseUrl, token, deviceLabel, pollingIntervalMs, transferTimeoutMs, levelVar, pressureVar, statusVar);
}

void ConnectionManager::setEsp32Configuration(const QString &host,
                                              int port,
                                              bool useDirect,
                                              int pollingIntervalMs,
                                              int transferTimeoutMs)
{
    m_apiClient->setEsp32Configuration(host, port, useDirect, pollingIntervalMs, transferTimeoutMs);
}

void ConnectionManager::start()
{
    if (m_tankModel) {
        m_tankModel->setConnectionState(QStringLiteral("Connecting"));
    }

    m_apiClient->startPolling();
}

void ConnectionManager::stop()
{
    m_apiClient->stopPolling();

    if (m_tankModel) {
        m_tankModel->setConnectionState(QStringLiteral("Offline"));
    }
}

} // namespace Panorama