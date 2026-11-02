#pragma once

#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>
#include <QSqlDatabase>

namespace Panorama {

class DatabaseManager : public QObject
{
    Q_OBJECT

public:
    explicit DatabaseManager(QObject *parent = nullptr);
    ~DatabaseManager() override;

    bool initialize(const QString &dbPath = QString());
    bool isOpen() const;

    // Train CRUD
    QVariantList getAllTrains();
    QVariantList getRegions();
    QVariantList getTrainsByRegion(const QString &region);
    QVariantMap getTrainByNumber(const QString &trainNumber);
    int getTrainId(const QString &trainNumber);
    bool addTrain(const QString &trainNumber, const QString &trainName,
                  const QString &region, const QString &description,
                  const QString &location, const QString &status = QStringLiteral("Online"));
    bool updateTrain(const QString &trainNumber, const QString &trainName,
                     const QString &region, const QString &description,
                     const QString &location, const QString &status);
    bool deleteTrain(const QString &trainNumber);
    int getTrainCoachCount(const QString &trainNumber);
    int getTrainTankCount(const QString &trainNumber);

    // Coach CRUD
    QVariantList getCoachesForTrain(const QString &trainNumber);
    QVariantMap getCoach(int coachId);
    bool addCoach(const QString &trainNumber, const QString &coachNumber,
                  const QString &coachType, int position,
                  const QString &description = QString());
    bool updateCoach(int coachId, const QString &coachNumber,
                     const QString &coachType, int position,
                     const QString &description);
    bool deleteCoach(int coachId);
    int ensureCoach(const QString &trainNumber, int position,
                    const QString &coachNumber = QString(),
                    const QString &coachType = QStringLiteral("General"));

    // Tank CRUD & Geometry
    QVariantList getTanksForCoach(int coachId);
    QVariantList getTanksForTrain(const QString &trainNumber);
    QVariantList getAllTanks();
    QVariantMap getTank(int tankId);
    bool addTank(int coachId, const QString &tankNumber, const QString &tankName,
                 const QString &geometryType, double lengthCm, double widthCm,
                 double heightCm, double diameterCm, double capacityLiters,
                 double maxHeightCm, const QString &deviceId = QString());
    bool updateTank(int tankId, const QString &tankNumber, const QString &tankName,
                    const QString &geometryType, double lengthCm, double widthCm,
                    double heightCm, double diameterCm, double capacityLiters,
                    double maxHeightCm, const QString &deviceId = QString());
    bool deleteTank(int tankId);
    bool assignDeviceToTank(int tankId, const QString &deviceId);

    // User Authentication & Password Management
    bool verifyUserCredential(const QString &username, const QString &password);
    QString getUserRole(const QString &username);
    QString getUserDisplayName(const QString &username);
    bool updateUserPassword(const QString &username, const QString &newPassword);
    bool createUser(const QString &username, const QString &password, const QString &role,
                    const QString &name = QString(), const QString &status = QStringLiteral("Active"));
    QVariantList getAllUsers();
    int getOperatorCount();
    bool deleteUser(const QString &username);

    // Device Management
    QVariantList getAllDevices();
    QVariantMap getDevice(const QString &deviceId);
    bool addDevice(const QString &deviceId, const QString &name, const QString &deviceType,
                   const QString &connectionType, const QString &status, const QString &location,
                   const QString &trainNumber = QString(), const QString &coachNumber = QString(),
                   const QString &tankNumber = QString());
    bool updateDevice(const QString &deviceId, const QString &name, const QString &deviceType,
                      const QString &connectionType, const QString &status, const QString &location,
                      const QString &trainNumber = QString(), const QString &coachNumber = QString(),
                      const QString &tankNumber = QString());
    bool deleteDevice(const QString &deviceId);

    // System Settings (Admin persistent store)
    QString getSetting(const QString &key, const QString &defaultValue = QString());
    bool setSetting(const QString &key, const QString &value);

signals:
    void databaseChanged();

private:
    bool createTables();
    void migrateData();
    void seedInitialData();
    static QString hashPassword(const QString &password, const QString &salt);

    QSqlDatabase m_db;
    QString m_connectionName;
};

} // namespace Panorama
