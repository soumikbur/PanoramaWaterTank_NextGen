#pragma once

#include <QObject>
#include <QString>
#include <QStringList>
#include <QVariantList>
#include <QVariantMap>
#include <qqml.h>

namespace Panorama {

// ============================================================================
// Static train/region/route configuration data.
//
// This class provides ONLY static metadata (train numbers, names, regions,
// routes, coach assignments, tank assignments). It does NOT provide or
// fabricate any live telemetry (water level, sensor status, etc.).
//
// The data here is static configuration that can be replaced with
// a real train database/API without changing the UI architecture.
// ============================================================================

struct RouteStation {
    QString id;
    QString name;
    QString code;
    double latitude{0.0};
    double longitude{0.0};
    int routeOrder{0};
    bool isSource{false};
    bool isDestination{false};
    bool isJunction{false};
    bool isWaterSource{false};
    bool waterFillingAvailable{false};
    double waterFillingCapacityLiters{0.0};
    QString operationalStatus{"No Facility"};
    QString lastVerified{"--"};

    QVariantMap toMap() const {
        QVariantMap m;
        m[QStringLiteral("id")] = id;
        m[QStringLiteral("name")] = name;
        m[QStringLiteral("code")] = code;
        m[QStringLiteral("latitude")] = latitude;
        m[QStringLiteral("longitude")] = longitude;
        m[QStringLiteral("routeOrder")] = routeOrder;
        m[QStringLiteral("isSource")] = isSource;
        m[QStringLiteral("isDestination")] = isDestination;
        m[QStringLiteral("isJunction")] = isJunction;
        m[QStringLiteral("isWaterSource")] = isWaterSource || waterFillingAvailable;
        m[QStringLiteral("waterFillingAvailable")] = waterFillingAvailable || isWaterSource;
        m[QStringLiteral("waterFillingCapacityLiters")] = waterFillingCapacityLiters;
        m[QStringLiteral("capacityLiters")] = waterFillingCapacityLiters;
        m[QStringLiteral("operationalStatus")] = operationalStatus;
        m[QStringLiteral("facilityStatus")] = operationalStatus;
        m[QStringLiteral("lastVerified")] = lastVerified;
        return m;
    }
};

struct TankConfig {
    QString tankId;                     // e.g. "T-12301-01"
    QString tankNumber;                 // e.g. "T01"
    QString legacyId;                   // e.g. "tank-001" for test compatibility
    QString deviceId;                   // e.g. "wli"
    QString trainNumber;                // e.g. "12301"
    QString trainName;                  // e.g. "Rajdhani Express"
    QString regionId;                   // e.g. "er"
    QString regionName;                 // e.g. "Eastern Railway"
    QString coachNumber;                // e.g. "S1"
    QString coachName;                  // e.g. "Coach S1"
    QString coachType;                  // e.g. "Sleeper Class"
    QString position{"Front"};          // "Front", "Rear", etc.
    QString tankName;                   // e.g. "Toilet Front"
    QString tankType{"Main Tank"};      // "Main Tank" or "Aux Tank"
    double maxHeightCm{50.0};
    double capacityLiters{2500.0};
    bool isPrimaryHardwareDevice{false};

    QVariantMap toMap() const {
        QVariantMap m;
        m[QStringLiteral("tankId")] = tankId;
        m[QStringLiteral("id")] = tankId;
        m[QStringLiteral("tankNumber")] = tankNumber.isEmpty() ? QStringLiteral("T01") : tankNumber;
        m[QStringLiteral("legacyId")] = legacyId;
        m[QStringLiteral("deviceId")] = deviceId;
        m[QStringLiteral("trainNumber")] = trainNumber;
        m[QStringLiteral("trainName")] = trainName;
        m[QStringLiteral("regionId")] = regionId;
        m[QStringLiteral("region")] = regionName;
        m[QStringLiteral("regionName")] = regionName;
        m[QStringLiteral("coachNumber")] = coachNumber;
        m[QStringLiteral("coachId")] = coachNumber;
        m[QStringLiteral("coachName")] = coachName.isEmpty() ? (QStringLiteral("Coach ") + coachNumber) : coachName;
        m[QStringLiteral("coachType")] = coachType;
        m[QStringLiteral("position")] = position;
        m[QStringLiteral("tankName")] = tankName;
        m[QStringLiteral("tankType")] = tankType;
        m[QStringLiteral("maxHeightCm")] = maxHeightCm;
        m[QStringLiteral("capacityLiters")] = capacityLiters;
        m[QStringLiteral("capacity")] = QStringLiteral("%1 L").arg(static_cast<int>(capacityLiters));
        m[QStringLiteral("isPrimaryHardwareDevice")] = isPrimaryHardwareDevice;
        return m;
    }
};

struct CoachConfig {
    QString coachNumber;
    QString coachName;
    QString coachType;
    QStringList tankIds;

    QVariantMap toMap() const {
        QVariantMap m;
        m[QStringLiteral("coachNumber")] = coachNumber;
        m[QStringLiteral("coachId")] = coachNumber;
        m[QStringLiteral("coachName")] = coachName.isEmpty() ? (QStringLiteral("Coach ") + coachNumber) : coachName;
        m[QStringLiteral("coachType")] = coachType;
        QVariantList ids;
        for (const auto &id : tankIds) ids.append(id);
        m[QStringLiteral("tankIds")] = ids;
        m[QStringLiteral("tankCount")] = tankIds.size();
        return m;
    }
};

struct TrainConfig {
    QString trainNumber;
    QString trainName;
    QString regionId;
    QString source;
    QString destination;
    QList<RouteStation> routeStations;
    QList<CoachConfig> coaches;
    QList<TankConfig> tanks;

    QStringList allTankIds() const {
        if (!tanks.isEmpty()) {
            QStringList ids;
            ids.reserve(tanks.size());
            for (const auto &t : tanks) ids.append(t.tankId);
            return ids;
        }
        QStringList ids;
        for (const auto &c : coaches) {
            ids.append(c.tankIds);
        }
        return ids;
    }

    QVariantMap toMap() const {
        QVariantMap m;
        m[QStringLiteral("trainNumber")] = trainNumber;
        m[QStringLiteral("trainName")] = trainName;
        m[QStringLiteral("regionId")] = regionId;
        m[QStringLiteral("source")] = source;
        m[QStringLiteral("destination")] = destination;

        QVariantList stationList;
        for (const auto &s : routeStations) stationList.append(s.toMap());
        m[QStringLiteral("routeStations")] = stationList;

        QVariantList coachList;
        for (const auto &c : coaches) coachList.append(c.toMap());
        m[QStringLiteral("coaches")] = coachList;

        QVariantList tankList;
        for (const auto &t : tanks) tankList.append(t.toMap());
        m[QStringLiteral("tanks")] = tankList;

        m[QStringLiteral("tankIds")] = QVariant::fromValue(allTankIds());
        m[QStringLiteral("coachCount")] = coaches.size();
        m[QStringLiteral("tankCount")] = tanks.isEmpty() ? allTankIds().size() : tanks.size();

        int junctionCount = 0;
        int waterStopCount = 0;
        for (const auto &s : routeStations) {
            if (s.isJunction) ++junctionCount;
            if (s.waterFillingAvailable || s.isWaterSource) ++waterStopCount;
        }
        m[QStringLiteral("junctionCount")] = junctionCount;
        m[QStringLiteral("waterStopCount")] = waterStopCount;
        m[QStringLiteral("waterJunctionCount")] = waterStopCount;
        m[QStringLiteral("routeStopCount")] = routeStations.size();

        if (!routeStations.isEmpty()) {
            m[QStringLiteral("sourceCode")] = routeStations.first().code;
            m[QStringLiteral("destinationCode")] = routeStations.last().code;
        } else {
            m[QStringLiteral("sourceCode")] = QStringLiteral("--");
            m[QStringLiteral("destinationCode")] = QStringLiteral("--");
        }

        return m;
    }
};

struct RegionConfig {
    QString regionId;
    QString regionName;
    QStringList trainNumbers;

    QVariantMap toMap() const {
        QVariantMap m;
        m[QStringLiteral("regionId")] = regionId;
        m[QStringLiteral("regionName")] = regionName;
        QVariantList nums;
        for (const auto &n : trainNumbers) nums.append(n);
        m[QStringLiteral("trainNumbers")] = nums;
        m[QStringLiteral("trainCount")] = trainNumbers.size();
        return m;
    }
};

class TrainConfigProvider : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

public:
    explicit TrainConfigProvider(QObject *parent = nullptr);

    // Region queries
    Q_INVOKABLE QVariantList regions() const;
    Q_INVOKABLE QVariantMap regionInfo(const QString &regionId) const;
    Q_INVOKABLE bool isValidRegion(const QString &regionId) const;
    Q_INVOKABLE int trainCountForRegion(const QString &regionId) const;
    Q_INVOKABLE int tankCountForRegion(const QString &regionId) const;
    Q_INVOKABLE int junctionCountForRegion(const QString &regionId) const;

    // Train queries
    Q_INVOKABLE QVariantList trainsForRegion(const QString &regionId) const;
    Q_INVOKABLE QVariantMap trainInfo(const QString &trainNumber) const;
    Q_INVOKABLE bool isValidTrain(const QString &trainNumber) const;
    Q_INVOKABLE QString regionForTrain(const QString &trainNumber) const;
    Q_INVOKABLE QString regionNameForTrain(const QString &trainNumber) const;

    // Route queries
    Q_INVOKABLE QVariantList routeStations(const QString &trainNumber) const;
    Q_INVOKABLE QVariantList waterJunctions(const QString &trainNumber) const;

    // Tank association queries
    Q_INVOKABLE QStringList tankIdsForTrain(const QString &trainNumber) const;
    Q_INVOKABLE QVariantList coachesForTrain(const QString &trainNumber) const;
    Q_INVOKABLE QVariantList tanksForTrain(const QString &trainNumber) const;
    Q_INVOKABLE QVariantList allConfiguredTanks() const;

    // Direct C++ accessors
    const QList<TankConfig>& tankConfigsForTrain(const QString &trainNumber) const;
    QList<TankConfig> allTankConfigs() const;

    // Validation
    bool validateConfiguration() const;

private:
    void initializeRegions();
    void initializeTrains();

    QList<RegionConfig> m_regions;
    QHash<QString, TrainConfig> m_trains;  // keyed by trainNumber
};

} // namespace Panorama
