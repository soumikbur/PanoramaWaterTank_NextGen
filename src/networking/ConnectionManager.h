// ConnectionManager.h
#ifndef PANORAMA_CONNECTIONMANAGER_H
#define PANORAMA_CONNECTIONMANAGER_H

#include <QObject>
#include <QString>

namespace Panorama {

class ApiClient;
class TankRepository;
class TankModel;
class TrainManager;
class LocationManager;
class Logger;

class ConnectionManager : public QObject
{
    Q_OBJECT

public:
    explicit ConnectionManager(Logger &logger, QObject *parent = nullptr);

    void setTankModel(TankModel *model);
    void setTrainManager(TrainManager *trainManager);
    void setLocationManager(LocationManager *locationManager);

    void setApiConfiguration(const QString &baseUrl,
                             const QString &token,
                             const QString &deviceLabel,
                             int pollingIntervalMs,
                             int transferTimeoutMs,
                             const QString &levelVar,
                             const QString &pressureVar,
                             const QString &statusVar);

    void setEsp32Configuration(const QString &host,
                               int port,
                               bool useDirect,
                               int pollingIntervalMs,
                               int transferTimeoutMs);

    void start();
    void stop();
    ApiClient *apiClient() const { return m_apiClient; }
    TankRepository *tankRepository() const { return m_tankRepository; }

private:
    Logger &m_logger;
    ApiClient *m_apiClient;
    TankRepository *m_tankRepository;
    TankModel *m_tankModel{nullptr};
    TrainManager *m_trainManager{nullptr};
    LocationManager *m_locationManager{nullptr};
};

} // namespace Panorama

#endif // PANORAMA_CONNECTIONMANAGER_H