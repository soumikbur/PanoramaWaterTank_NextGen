#pragma once

#include <QObject>
#include <QString>
#include <QStringList>
#include <QVariantList>
#include <QVariantMap>
#include <QJsonObject>
#include <QDateTime>
#include <QTimer>
#include <qqml.h>

namespace Panorama {

class TankModel;
class TrainConfigProvider;
class DatabaseManager;

struct TankItem {
    QString id;                 // e.g. "T-12301-01" or database ID
    QString tankNumber{"T01"};  // e.g. "T01"
    QString legacyId;           // e.g. "tank-001"
    QString deviceId;           // e.g. "wli"
    QString trainNumber;        // e.g. "12301"
    QString trainName;          // e.g. "Rajdhani Express"
    QString regionId;           // e.g. "er"
    QString regionName;         // e.g. "Eastern Railway"
    QString coachId;            // e.g. "S1"
    QString coachName;          // e.g. "Coach S1"
    QString coachType;          // e.g. "Sleeper Class"
    QString position{"Front"};  // e.g. "Front" or "Rear"
    QString tankName;           // e.g. "Toilet Front"
    QString tankType;           // e.g. "Main Tank" or "Aux Tank"
    double maxHeightCm{50.0};
    double capacityLiters{60.0};
    double levelCm{0.0};
    double levelPercent{0.0};
    double volumeLiters{0.0};
    double rawVoltage{0.0};
    double pressureHpa{1013.25};
    double humidityPercent{50.0};
    QString sensorStatus{"Disconnected"};
    QString alarmState{"Offline"};        // "Normal", "Warning", "Critical", "Overflow", "Offline"
    QString connectionState{"Offline"};    // "Online", "Offline", "Connecting"
    QDateTime lastUpdate;

    QVariantMap toMap() const;
};

class TrainManager : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(int totalTanks READ totalTanks NOTIFY countsChanged)
    Q_PROPERTY(int onlineTanks READ onlineTanks NOTIFY countsChanged)
    Q_PROPERTY(int offlineTanks READ offlineTanks NOTIFY countsChanged)
    Q_PROPERTY(int alertCount READ alertCount NOTIFY countsChanged)
    Q_PROPERTY(int lowLevelCount READ lowLevelCount NOTIFY countsChanged)
    Q_PROPERTY(QString trainConnectionState READ trainConnectionState NOTIFY trainConnectionStateChanged)
    Q_PROPERTY(QString selectedTankId READ selectedTankId NOTIFY selectedTankChanged)
    Q_PROPERTY(QVariantMap selectedTank READ selectedTank NOTIFY selectedTankChanged)
    Q_PROPERTY(QVariantList allTanks READ allTanks NOTIFY tanksUpdated)
    Q_PROPERTY(QString activeTrainNumber READ activeTrainNumber WRITE setActiveTrainNumber NOTIFY activeTrainChanged)
    Q_PROPERTY(QVariantList filteredTanks READ filteredTanks NOTIFY filteredTanksChanged)
    Q_PROPERTY(int filteredTotalTanks READ filteredTotalTanks NOTIFY filteredTanksChanged)
    Q_PROPERTY(int filteredOnlineTanks READ filteredOnlineTanks NOTIFY filteredTanksChanged)
    Q_PROPERTY(int filteredOfflineTanks READ filteredOfflineTanks NOTIFY filteredTanksChanged)
    Q_PROPERTY(int filteredAlertCount READ filteredAlertCount NOTIFY filteredTanksChanged)
    Q_PROPERTY(int filteredLowLevelCount READ filteredLowLevelCount NOTIFY filteredTanksChanged)
    Q_PROPERTY(QVariantList connectivityAlerts READ connectivityAlerts NOTIFY connectivityAlertsChanged)
    Q_PROPERTY(int connectivityAlertCount READ connectivityAlertCount NOTIFY connectivityAlertsChanged)

public:
    explicit TrainManager(QObject *parent = nullptr);

    int totalTanks() const;
    int onlineTanks() const;
    int offlineTanks() const;
    int alertCount() const;
    int lowLevelCount() const;
    QString trainConnectionState() const { return m_trainConnectionState; }
    QString selectedTankId() const { return m_selectedTankId; }
    QVariantMap selectedTank() const;
    QVariantList allTanks() const;
    QString activeTrainNumber() const { return m_activeTrainNumber; }
    QVariantList filteredTanks() const;
    int filteredTotalTanks() const;
    int filteredOnlineTanks() const;
    int filteredOfflineTanks() const;
    int filteredAlertCount() const;
    int filteredLowLevelCount() const;
    QVariantList connectivityAlerts() const;
    int connectivityAlertCount() const;

    Q_INVOKABLE QVariantList getTanksFiltered(const QString &searchQuery, const QString &statusFilter) const;
    Q_INVOKABLE QVariantList getFilteredTanksForTrain(const QString &trainNumber, const QString &searchQuery, const QString &statusFilter) const;
    Q_INVOKABLE QVariantMap getTank(const QString &tankId) const;
    Q_INVOKABLE void selectTank(const QString &tankId);
    Q_INVOKABLE void setActiveTrainNumber(const QString &trainNumber);
    Q_INVOKABLE void setTelemetryTimeoutMs(int timeoutMs);
    Q_INVOKABLE void checkStaleTanks(qint64 nowMs = 0);

    void setTankModel(TankModel *tankModel);
    void setTrainConfigProvider(TrainConfigProvider *provider);
    void setDatabaseManager(DatabaseManager *dbManager);

public slots:
    void processReading(double waterLevel, double pressure, const QString &sensorStatus, qint64 timestampMs = 0, bool isFresh = true);
    void processEsp32Status(const QJsonObject &statusObj);
    void setConnectionState(const QString &state);

signals:
    void countsChanged();
    void trainConnectionStateChanged();
    void selectedTankChanged();
    void tanksUpdated();
    void tankSelectedForDetail(const QString &tankId);
    void activeTrainChanged();
    void filteredTanksChanged();
    void connectivityAlertsChanged();
    void coachConnectivityChanged(const QString &coachId, const QString &tankId, bool isOnline, const QString &message);

private:
    void initializeTrainConsist();
    void recalculateAlarmsAndCounters();
    void recordConnectivityTransition(const TankItem &tank, bool wasOnline, bool isOnline);
    TankItem* findPrimaryTank();
    void updatePrimaryTankTelemetry(double waterLevelCm, double rawVoltage, double pressureHpa,
                                   double humidity, int sensorStatusInt,
                                   const QString &measState);

    QList<TankItem> m_tanks;
    QString m_trainConnectionState{"Connected"};
    QString m_selectedTankId{"T-12301-01"};
    TankModel *m_tankModel{nullptr};
    TrainConfigProvider *m_configProvider{nullptr};
    DatabaseManager *m_dbManager{nullptr};
    QString m_activeTrainNumber;
    QStringList m_activeTrainTankIds;
    QVariantList m_connectivityAlerts;
    int m_telemetryTimeoutMs{120000};
    QTimer m_staleCheckTimer;

    int m_totalTanks{18};
    int m_onlineTanks{16};
    int m_offlineTanks{2};
    int m_alertCount{0};
    int m_lowLevelCount{0};
};

} // namespace Panorama
