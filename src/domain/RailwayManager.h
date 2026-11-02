#pragma once

#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>
#include <qqml.h>

namespace Panorama {

class DatabaseManager;
class TankModel;

class RailwayManager : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(QVariantList regions READ regions NOTIFY trainsChanged)
    Q_PROPERTY(QVariantList trains READ trains NOTIFY trainsChanged)
    Q_PROPERTY(int totalTrains READ totalTrains NOTIFY trainsChanged)
    Q_PROPERTY(int onlineTrains READ onlineTrains NOTIFY trainsChanged)
    Q_PROPERTY(int offlineTrains READ offlineTrains NOTIFY trainsChanged)
    Q_PROPERTY(QString activeTrainNumber READ activeTrainNumber WRITE setActiveTrainNumber NOTIFY activeTrainChanged)
    Q_PROPERTY(QVariantMap activeTrain READ activeTrain NOTIFY activeTrainChanged)
    Q_PROPERTY(QVariantList coaches READ coaches NOTIFY coachesChanged)
    Q_PROPERTY(int assignedCoachCount READ assignedCoachCount NOTIFY coachesChanged)
    Q_PROPERTY(int maxCoachCapacity READ maxCoachCapacity CONSTANT)
    Q_PROPERTY(int totalTanks READ totalTanks NOTIFY tanksChanged)
    Q_PROPERTY(int connectedTanks READ connectedTanks NOTIFY tanksChanged)
    Q_PROPERTY(int unconnectedTanks READ unconnectedTanks NOTIFY tanksChanged)
    Q_PROPERTY(int selectedTankId READ selectedTankId NOTIFY selectedTankChanged)
    Q_PROPERTY(QVariantList devices READ devices NOTIFY devicesChanged)

public:
    explicit RailwayManager(QObject *parent = nullptr);

    void setDatabaseManager(DatabaseManager *dbManager);
    void setTankModel(TankModel *tankModel);

    QVariantList regions() const;
    QVariantList trains() const;
    int totalTrains() const;
    int onlineTrains() const;
    int offlineTrains() const;
    QString activeTrainNumber() const { return m_activeTrainNumber; }
    QVariantMap activeTrain() const;
    QVariantList coaches() const;
    int assignedCoachCount() const;
    int maxCoachCapacity() const { return 24; }
    int totalTanks() const;
    int connectedTanks() const;
    int unconnectedTanks() const;
    int selectedTankId() const { return m_selectedTankId; }
    QVariantList devices() const;

    // Region & Train Management
    Q_INVOKABLE QVariantList getRegions();
    Q_INVOKABLE QVariantList getTrainsByRegion(const QString &region);
    Q_INVOKABLE void setActiveTrainNumber(const QString &trainNumber);
    Q_INVOKABLE QVariantList getTrains();
    Q_INVOKABLE QVariantMap getTrain(const QString &trainNumber);
    Q_INVOKABLE bool addTrain(const QString &trainNumber, const QString &trainName,
                              const QString &region, const QString &description,
                              const QString &location, const QString &status = QStringLiteral("Online"));
    Q_INVOKABLE bool updateTrain(const QString &trainNumber, const QString &trainName,
                                 const QString &region, const QString &description,
                                 const QString &location, const QString &status);
    Q_INVOKABLE bool deleteTrain(const QString &trainNumber);

    // Coach Management
    Q_INVOKABLE QVariantList getCoaches(const QString &trainNumber);
    Q_INVOKABLE QVariantMap getCoach(int coachId);
    Q_INVOKABLE bool addCoach(const QString &trainNumber, const QString &coachNumber,
                              const QString &coachType, int position,
                              const QString &description = QString());
    Q_INVOKABLE bool updateCoach(int coachId, const QString &coachNumber,
                                 const QString &coachType, int position,
                                 const QString &description);
    Q_INVOKABLE bool deleteCoach(int coachId);
    Q_INVOKABLE int ensureCoach(const QString &trainNumber, int position);

    // Tank Management & Geometry
    Q_INVOKABLE QVariantList getTanksForCoach(int coachId);
    Q_INVOKABLE QVariantList getTanksForTrain(const QString &trainNumber);
    Q_INVOKABLE QVariantList getAllTanks();
    Q_INVOKABLE QVariantMap getTank(int tankId);
    Q_INVOKABLE bool selectTank(int tankId);
    Q_INVOKABLE bool addTank(int coachId, const QString &tankNumber, const QString &tankName,
                             const QString &geometryType, double lengthCm, double widthCm,
                             double heightCm, double diameterCm, double capacityLiters,
                             double maxHeightCm, const QString &deviceId = QString());
    Q_INVOKABLE bool updateTank(int tankId, const QString &tankNumber, const QString &tankName,
                                const QString &geometryType, double lengthCm, double widthCm,
                                double heightCm, double diameterCm, double capacityLiters,
                                double maxHeightCm, const QString &deviceId = QString());
    Q_INVOKABLE bool deleteTank(int tankId);
    Q_INVOKABLE bool assignDevice(int tankId, const QString &deviceId);

    // Device Management
    Q_INVOKABLE QVariantList getDevices();
    Q_INVOKABLE bool addDevice(const QString &deviceId, const QString &name, const QString &deviceType,
                               const QString &connectionType, const QString &status, const QString &location,
                               const QString &trainNumber = QString(), const QString &coachNumber = QString(),
                               const QString &tankNumber = QString());
    Q_INVOKABLE bool removeDevice(const QString &deviceId);

    // Geometry Calculation
    Q_INVOKABLE double calculateCapacity(const QString &geometryType, double lengthCm,
                                         double widthCm, double heightCm, double diameterCm) const;

    // Real hardware telemetry sync
    void updateConnectedDeviceTelemetry(const QString &deviceId, double waterLevelCm, double rawVoltage,
                                        double pressureHpa, double humidity,
                                        const QString &sensorStatus);

signals:
    void trainsChanged();
    void activeTrainChanged();
    void coachesChanged();
    void tanksChanged();
    void devicesChanged();
    void selectedTankChanged();
    void feedbackMessage(bool success, const QString &message);

private:
    void reloadData();

    DatabaseManager *m_dbManager{nullptr};
    TankModel *m_tankModel{nullptr};
    QString m_activeTrainNumber{QStringLiteral("12301")};
    int m_selectedTankId{-1};
};

} // namespace Panorama
