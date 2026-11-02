#include "TrainManager.h"
#include "TankModel.h"
#include "TrainConfigProvider.h"
#include "DatabaseManager.h"
#include <algorithm>
#include <cmath>

namespace Panorama {

QVariantMap TankItem::toMap() const
{
    QVariantMap map;
    map[QStringLiteral("id")] = id;
    map[QStringLiteral("tankId")] = id;
    map[QStringLiteral("tankNumber")] = tankNumber.isEmpty() ? QStringLiteral("T01") : tankNumber;
    map[QStringLiteral("legacyId")] = legacyId;
    map[QStringLiteral("deviceId")] = deviceId;
    map[QStringLiteral("trainNumber")] = trainNumber;
    map[QStringLiteral("trainName")] = trainName;
    map[QStringLiteral("regionId")] = regionId;
    map[QStringLiteral("region")] = regionName;
    map[QStringLiteral("regionName")] = regionName;
    map[QStringLiteral("coachId")] = coachId;
    map[QStringLiteral("coachNumber")] = coachId;
    map[QStringLiteral("coachName")] = coachName;
    map[QStringLiteral("coachType")] = coachType;
    map[QStringLiteral("position")] = position;
    map[QStringLiteral("tankName")] = tankName;
    map[QStringLiteral("tankType")] = tankType;
    map[QStringLiteral("maxHeightCm")] = maxHeightCm;
    map[QStringLiteral("capacityLiters")] = capacityLiters;
    map[QStringLiteral("capacity")] = QStringLiteral("%1 L").arg(static_cast<int>(capacityLiters));
    map[QStringLiteral("levelCm")] = levelCm;
    map[QStringLiteral("levelPercent")] = levelPercent;
    map[QStringLiteral("volumeLiters")] = volumeLiters;
    map[QStringLiteral("rawVoltage")] = rawVoltage;
    map[QStringLiteral("pressureHpa")] = pressureHpa;
    map[QStringLiteral("humidityPercent")] = humidityPercent;
    map[QStringLiteral("sensorStatus")] = sensorStatus;
    map[QStringLiteral("alarmState")] = alarmState;
    map[QStringLiteral("connectionState")] = connectionState;
    map[QStringLiteral("isOnline")] = (connectionState == QStringLiteral("Online"));
    map[QStringLiteral("lastUpdate")] = lastUpdate.isValid() ? lastUpdate.toString(QStringLiteral("hh:mm:ss AP")) : QStringLiteral("--");
    return map;
}

TrainManager::TrainManager(QObject *parent)
    : QObject(parent)
{
    initializeTrainConsist();
    recalculateAlarmsAndCounters();
}

int TrainManager::totalTanks() const
{
    return m_tanks.size();
}

int TrainManager::onlineTanks() const
{
    return m_onlineTanks;
}

int TrainManager::offlineTanks() const
{
    return m_offlineTanks;
}

int TrainManager::alertCount() const
{
    return m_alertCount;
}

int TrainManager::lowLevelCount() const
{
    return m_lowLevelCount;
}

QVariantMap TrainManager::selectedTank() const
{
    return getTank(m_selectedTankId);
}

QVariantList TrainManager::allTanks() const
{
    QVariantList list;
    list.reserve(m_tanks.size());
    for (const auto &tank : m_tanks) {
        list.append(tank.toMap());
    }
    return list;
}

QVariantList TrainManager::getTanksFiltered(const QString &searchQuery, const QString &statusFilter) const
{
    QVariantList result;
    const QString q = searchQuery.trimmed().toLower();

    for (const auto &t : m_tanks) {
        // 1. Search Filter (Coach ID/name, Tank ID/name, Device ID, legacy ID, train number, train name, region)
        if (!q.isEmpty()) {
            bool matches = t.coachId.toLower().contains(q) ||
                           t.coachName.toLower().contains(q) ||
                           t.tankName.toLower().contains(q) ||
                           t.tankNumber.toLower().contains(q) ||
                           t.id.toLower().contains(q) ||
                           t.legacyId.toLower().contains(q) ||
                           t.deviceId.toLower().contains(q) ||
                           t.tankType.toLower().contains(q) ||
                           t.trainNumber.toLower().contains(q) ||
                           t.trainName.toLower().contains(q) ||
                           t.regionName.toLower().contains(q);
            if (!matches) continue;
        }

        // 2. Status Filter: "All", "Online", "Offline", "Low Level" (case-insensitive)
        QString sf = statusFilter.trimmed().toLower();
        if (sf == QStringLiteral("online")) {
            if (t.connectionState != QStringLiteral("Online")) continue;
        } else if (sf == QStringLiteral("offline")) {
            if (t.connectionState == QStringLiteral("Online")) continue;
        } else if (sf == QStringLiteral("low level") || sf == QStringLiteral("low_level")) {
            if (t.connectionState != QStringLiteral("Online") || t.levelPercent >= 20.0) continue;
        }

        result.append(t.toMap());
    }

    return result;
}

QVariantMap TrainManager::getTank(const QString &tankId) const
{
    for (const auto &t : m_tanks) {
        if (t.id == tankId || t.tankNumber == tankId || t.legacyId == tankId || t.deviceId == tankId) {
            return t.toMap();
        }
    }
    return m_tanks.isEmpty() ? QVariantMap() : m_tanks.first().toMap();
}

void TrainManager::selectTank(const QString &tankId)
{
    QString matchedId = tankId;
    for (const auto &t : m_tanks) {
        if (t.id == tankId || t.tankNumber == tankId || t.legacyId == tankId || t.deviceId == tankId) {
            matchedId = t.id;
            break;
        }
    }

    if (m_selectedTankId != matchedId) {
        m_selectedTankId = matchedId;
        emit selectedTankChanged();
    }

    // Synchronize the selected tank's parameters into the active TankModel
    if (m_tankModel) {
        for (const auto &t : m_tanks) {
            if (t.id == matchedId || t.tankNumber == matchedId || t.legacyId == matchedId || t.deviceId == matchedId) {
                m_tankModel->setTankName(t.tankName.isEmpty() ? (QStringLiteral("Tank ") + t.tankNumber) : (t.tankName + QStringLiteral(" (") + t.coachName + QStringLiteral(")")));
                m_tankModel->setDeviceLabel(t.deviceId.isEmpty() ? t.tankNumber : t.deviceId);
                m_tankModel->setTankHeight(t.maxHeightCm / 100.0);
                const QString timeStr = t.lastUpdate.isValid() ? t.lastUpdate.toString(QStringLiteral("h:mm:ss AP")) : QStringLiteral("--");

                if (t.connectionState == QStringLiteral("Online") || t.connectionState == QStringLiteral("Connected")) {
                    m_tankModel->setConnectionState(QStringLiteral("Connected"));
                    m_tankModel->applyAuthoritativeReading(
                        t.levelCm,
                        t.levelPercent,
                        t.volumeLiters,
                        t.maxHeightCm,
                        t.capacityLiters,
                        t.pressureHpa,
                        t.sensorStatus,
                        t.alarmState,
                        QStringLiteral("VALID"),
                        true
                    );
                    m_tankModel->setLastUpdated(timeStr);
                } else if (t.connectionState == QStringLiteral("NOT CONNECTED")) {
                    m_tankModel->setConnectionState(QStringLiteral("Not Connected"));
                    m_tankModel->applyOfflineState(t.maxHeightCm, t.capacityLiters, timeStr);
                } else {
                    m_tankModel->setConnectionState(QStringLiteral("Offline"));
                    m_tankModel->applyOfflineState(t.maxHeightCm, t.capacityLiters, timeStr);
                }
                break;
            }
        }
    }

    emit tankSelectedForDetail(matchedId);
}

void TrainManager::setTankModel(TankModel *tankModel)
{
    m_tankModel = tankModel;
}

void TrainManager::setDatabaseManager(DatabaseManager *dbManager)
{
    if (m_dbManager == dbManager) return;
    m_dbManager = dbManager;
    if (m_dbManager) {
        connect(m_dbManager, &DatabaseManager::databaseChanged, this, [this]() {
            initializeTrainConsist();
            
            // Rebuild active train tank IDs cache for correct filtering after database changes (Bug 2 Fix)
            m_activeTrainTankIds.clear();
            if (!m_activeTrainNumber.isEmpty()) {
                for (const auto &t : m_tanks) {
                    if (t.trainNumber.compare(m_activeTrainNumber, Qt::CaseInsensitive) == 0 ||
                        t.trainName.compare(m_activeTrainNumber, Qt::CaseInsensitive) == 0) {
                        m_activeTrainTankIds.append(t.id);
                    }
                }
                if (m_activeTrainTankIds.isEmpty() && m_configProvider) {
                    m_activeTrainTankIds = m_configProvider->tankIdsForTrain(m_activeTrainNumber);
                }
            }

            recalculateAlarmsAndCounters();
            emit tanksUpdated();
            emit filteredTanksChanged();
            emit countsChanged();
        });
        initializeTrainConsist();
        recalculateAlarmsAndCounters();
        emit tanksUpdated();
        emit filteredTanksChanged();
        emit countsChanged();
    }
}

void TrainManager::setTrainConfigProvider(TrainConfigProvider *provider)
{
    m_configProvider = provider;
    if (m_configProvider) {
        initializeTrainConsist();
        if (!m_activeTrainNumber.isEmpty()) {
            m_activeTrainTankIds = m_configProvider->tankIdsForTrain(m_activeTrainNumber);
        }
        recalculateAlarmsAndCounters();
        emit tanksUpdated();
        emit filteredTanksChanged();
        emit countsChanged();
    }
}

void TrainManager::setActiveTrainNumber(const QString &trainNumber)
{
    if (m_activeTrainNumber != trainNumber) {
        m_activeTrainNumber = trainNumber;

        // Cache the tank IDs for the active train
        m_activeTrainTankIds.clear();
        if (!trainNumber.isEmpty()) {
            for (const auto &t : m_tanks) {
                if (t.trainNumber.compare(trainNumber, Qt::CaseInsensitive) == 0 ||
                    t.trainName.compare(trainNumber, Qt::CaseInsensitive) == 0) {
                    m_activeTrainTankIds.append(t.id);
                }
            }
            if (m_activeTrainTankIds.isEmpty() && m_configProvider) {
                m_activeTrainTankIds = m_configProvider->tankIdsForTrain(trainNumber);
            }
        }

        emit activeTrainChanged();
        emit filteredTanksChanged();
        emit countsChanged();
    }
}

QVariantList TrainManager::filteredTanks() const
{
    if (m_activeTrainNumber.isEmpty()) {
        return QVariantList();
    }

    QVariantList list;
    for (const auto &tank : m_tanks) {
        if (m_activeTrainTankIds.contains(tank.id) || (m_activeTrainTankIds.isEmpty() && tank.trainNumber == m_activeTrainNumber)) {
            list.append(tank.toMap());
        }
    }
    return list;
}

int TrainManager::filteredTotalTanks() const
{
    if (m_activeTrainNumber.isEmpty()) return 0;
    int count = 0;
    for (const auto &t : m_tanks) {
        if (m_activeTrainTankIds.contains(t.id) || (m_activeTrainTankIds.isEmpty() && t.trainNumber == m_activeTrainNumber)) ++count;
    }
    return count;
}

int TrainManager::filteredOnlineTanks() const
{
    if (m_activeTrainNumber.isEmpty()) return 0;
    int count = 0;
    for (const auto &t : m_tanks) {
        if ((m_activeTrainTankIds.contains(t.id) || (m_activeTrainTankIds.isEmpty() && t.trainNumber == m_activeTrainNumber))
            && t.connectionState == QStringLiteral("Online")) ++count;
    }
    return count;
}

int TrainManager::filteredOfflineTanks() const
{
    if (m_activeTrainNumber.isEmpty()) return 0;
    int count = 0;
    for (const auto &t : m_tanks) {
        if ((m_activeTrainTankIds.contains(t.id) || (m_activeTrainTankIds.isEmpty() && t.trainNumber == m_activeTrainNumber))
            && t.connectionState != QStringLiteral("Online")) ++count;
    }
    return count;
}

int TrainManager::filteredAlertCount() const
{
    if (m_activeTrainNumber.isEmpty()) return 0;
    int count = 0;
    for (const auto &t : m_tanks) {
        if ((m_activeTrainTankIds.contains(t.id) || (m_activeTrainTankIds.isEmpty() && t.trainNumber == m_activeTrainNumber)) &&
            (t.alarmState == QStringLiteral("Critical") || t.alarmState == QStringLiteral("Warning"))) {
            ++count;
        }
    }
    return count;
}

int TrainManager::filteredLowLevelCount() const
{
    if (m_activeTrainNumber.isEmpty()) return 0;
    int count = 0;
    for (const auto &t : m_tanks) {
        if ((m_activeTrainTankIds.contains(t.id) || (m_activeTrainTankIds.isEmpty() && t.trainNumber == m_activeTrainNumber))
            && t.connectionState == QStringLiteral("Online") && t.levelPercent < 20.0) {
            ++count;
        }
    }
    return count;
}

QVariantList TrainManager::getFilteredTanksForTrain(const QString &trainNumber, const QString &searchQuery, const QString &statusFilter) const
{
    QStringList trainTankIds;
    if (!trainNumber.isEmpty()) {
        for (const auto &t : m_tanks) {
            if (t.trainNumber.compare(trainNumber, Qt::CaseInsensitive) == 0 ||
                t.trainName.compare(trainNumber, Qt::CaseInsensitive) == 0) {
                trainTankIds.append(t.id);
            }
        }
    }
    if (trainTankIds.isEmpty() && m_configProvider && !trainNumber.isEmpty()) {
        trainTankIds = m_configProvider->tankIdsForTrain(trainNumber);
    }
    if (trainTankIds.isEmpty()) return QVariantList();

    QVariantList result;
    const QString q = searchQuery.trimmed().toLower();

    for (const auto &t : m_tanks) {
        if (!trainTankIds.contains(t.id)) continue;

        // Search filter
        if (!q.isEmpty()) {
            bool matches = t.coachId.toLower().contains(q) ||
                           t.coachName.toLower().contains(q) ||
                           t.tankName.toLower().contains(q) ||
                           t.tankNumber.toLower().contains(q) ||
                           t.id.toLower().contains(q) ||
                           t.legacyId.toLower().contains(q) ||
                           t.deviceId.toLower().contains(q) ||
                           t.tankType.toLower().contains(q) ||
                           t.trainNumber.toLower().contains(q) ||
                           t.trainName.toLower().contains(q) ||
                           t.regionName.toLower().contains(q);
            if (!matches) continue;
        }

        // Status filter
        QString sf = statusFilter.trimmed().toLower();
        if (sf == QStringLiteral("online")) {
            if (t.connectionState != QStringLiteral("Online")) continue;
        } else if (sf == QStringLiteral("offline")) {
            if (t.connectionState == QStringLiteral("Online")) continue;
        } else if (sf == QStringLiteral("low level") || sf == QStringLiteral("low_level")) {
            if (t.connectionState != QStringLiteral("Online") || t.levelPercent >= 20.0) continue;
        }

        result.append(t.toMap());
    }
    return result;
}

void TrainManager::initializeTrainConsist()
{
    // Preserve existing live primary tank readings if already online
    double preservedLevelCm = 0.0, preservedLevelPercent = 0.0, preservedVolume = 0.0;
    double preservedPress = 1013.25, preservedVolt = 0.0, preservedHum = 50.0;
    QString preservedStatus = QStringLiteral("Healthy"), preservedAlarm = QStringLiteral("Normal");
    bool hasPreservedReading = false;
    QDateTime preservedTime;

    for (const auto &t : m_tanks) {
        if ((t.deviceId == QStringLiteral("wli") || t.tankNumber == QStringLiteral("T01")) &&
            (t.connectionState == QStringLiteral("Online") || t.connectionState == QStringLiteral("Connected"))) {
            preservedLevelCm = t.levelCm;
            preservedLevelPercent = t.levelPercent;
            preservedVolume = t.volumeLiters;
            preservedPress = t.pressureHpa;
            preservedVolt = t.rawVoltage;
            preservedHum = t.humidityPercent;
            preservedStatus = t.sensorStatus;
            preservedAlarm = t.alarmState;
            preservedTime = t.lastUpdate;
            hasPreservedReading = true;
            break;
        }
    }

    m_tanks.clear();

    if (m_dbManager) {
        const QVariantList dbTanks = m_dbManager->getAllTanks();
        for (const auto &var : dbTanks) {
            const QVariantMap m = var.toMap();
            TankItem item;
            int intId = m.value(QStringLiteral("id")).toInt();
            item.id = QString::number(intId);
            item.tankNumber = m.value(QStringLiteral("tankNumber")).toString();
            if (item.tankNumber.isEmpty()) item.tankNumber = QStringLiteral("T01");
            item.legacyId = QStringLiteral("tank-%1").arg(intId, 3, 10, QLatin1Char('0'));
            item.deviceId = m.value(QStringLiteral("deviceId")).toString().trimmed();
            item.trainNumber = m.value(QStringLiteral("trainNumber")).toString();
            item.trainName = m.value(QStringLiteral("trainName")).toString();
            item.regionName = m.value(QStringLiteral("region")).toString();
            item.regionId = QStringLiteral("er");
            item.coachId = m.value(QStringLiteral("coachNumber")).toString();
            item.coachName = QStringLiteral("Coach ") + item.coachId;
            item.coachType = m.value(QStringLiteral("coachType")).toString();
            item.position = QStringLiteral("Front");
            item.tankName = m.value(QStringLiteral("tankName")).toString();
            item.tankType = m.value(QStringLiteral("geometryType")).toString();
            item.maxHeightCm = m.value(QStringLiteral("maxHeightCm")).toDouble();
            if (item.maxHeightCm <= 0) item.maxHeightCm = 50.0;
            item.capacityLiters = m.value(QStringLiteral("capacityLiters")).toDouble();
            if (item.capacityLiters <= 0) item.capacityLiters = 60.0;

            if (item.deviceId.isEmpty()) {
                item.connectionState = QStringLiteral("NOT CONNECTED");
                item.sensorStatus = QStringLiteral("Not Assigned");
                item.alarmState = QStringLiteral("Offline");
                item.lastUpdate = QDateTime::currentDateTime().addSecs(-300);
            } else if (item.deviceId == QStringLiteral("wli")) {
                if (hasPreservedReading) {
                    item.connectionState = QStringLiteral("Online");
                    item.levelCm = preservedLevelCm;
                    item.levelPercent = preservedLevelPercent;
                    item.volumeLiters = preservedVolume;
                    item.pressureHpa = preservedPress;
                    item.rawVoltage = preservedVolt;
                    item.humidityPercent = preservedHum;
                    item.sensorStatus = preservedStatus;
                    item.alarmState = preservedAlarm;
                    item.lastUpdate = preservedTime;
                } else {
                    item.connectionState = QStringLiteral("Offline");
                    item.sensorStatus = QStringLiteral("Disconnected");
                    item.alarmState = QStringLiteral("Offline");
                    item.lastUpdate = QDateTime();
                    item.levelCm = 0.0;
                    item.levelPercent = 0.0;
                    item.volumeLiters = 0.0;
                }
            } else {
                const QString devStatus = m.value(QStringLiteral("deviceStatus")).toString();
                if (devStatus.compare(QStringLiteral("Online"), Qt::CaseInsensitive) == 0) {
                    item.connectionState = QStringLiteral("Online");
                    item.sensorStatus = QStringLiteral("Healthy");
                    item.alarmState = QStringLiteral("Normal");
                    item.lastUpdate = QDateTime::currentDateTime();
                    item.levelCm = 30.0;
                    item.levelPercent = 60.0;
                    item.volumeLiters = (item.levelPercent / 100.0) * item.capacityLiters;
                } else if (devStatus.compare(QStringLiteral("Warning"), Qt::CaseInsensitive) == 0) {
                    item.connectionState = QStringLiteral("Online");
                    item.sensorStatus = QStringLiteral("Warning");
                    item.alarmState = QStringLiteral("Warning");
                    item.lastUpdate = QDateTime::currentDateTime();
                    item.levelCm = 10.0;
                    item.levelPercent = 18.0;
                    item.volumeLiters = (item.levelPercent / 100.0) * item.capacityLiters;
                } else {
                    item.connectionState = QStringLiteral("Offline");
                    item.sensorStatus = QStringLiteral("Disconnected");
                    item.alarmState = QStringLiteral("Offline");
                    item.lastUpdate = QDateTime::currentDateTime().addSecs(-300);
                }
            }

            m_tanks.append(item);
        }
    } else {
        // Fallback to TrainConfigProvider
        QList<TankConfig> configs;
        if (m_configProvider) {
            configs = m_configProvider->allTankConfigs();
        } else {
            TrainConfigProvider defaultProvider;
            configs = defaultProvider.allTankConfigs();
        }

        for (const auto &tk : configs) {
            TankItem item;
            item.id = tk.tankId;
            item.tankNumber = tk.tankNumber.isEmpty() ? QStringLiteral("T01") : tk.tankNumber;
            item.legacyId = tk.legacyId;
            item.deviceId = tk.deviceId;
            item.trainNumber = tk.trainNumber;
            item.trainName = tk.trainName;
            item.regionId = tk.regionId;
            item.regionName = tk.regionName;
            item.coachId = tk.coachNumber;
            item.coachName = tk.coachName;
            item.coachType = tk.coachType;
            item.position = tk.position;
            item.tankName = tk.tankName;
            item.tankType = tk.tankType;
            item.maxHeightCm = tk.maxHeightCm;
            item.capacityLiters = tk.capacityLiters;

            if (tk.deviceId.trimmed().isEmpty()) {
                item.connectionState = QStringLiteral("NOT CONNECTED");
                item.sensorStatus = QStringLiteral("Not Assigned");
                item.alarmState = QStringLiteral("Offline");
                item.lastUpdate = QDateTime::currentDateTime().addSecs(-300);
            } else if (tk.deviceId == QStringLiteral("wli")) {
                if (hasPreservedReading) {
                    item.connectionState = QStringLiteral("Online");
                    item.levelCm = preservedLevelCm;
                    item.levelPercent = preservedLevelPercent;
                    item.volumeLiters = preservedVolume;
                    item.pressureHpa = preservedPress;
                    item.rawVoltage = preservedVolt;
                    item.humidityPercent = preservedHum;
                    item.sensorStatus = preservedStatus;
                    item.alarmState = preservedAlarm;
                    item.lastUpdate = preservedTime;
                } else {
                    item.connectionState = QStringLiteral("Offline");
                    item.sensorStatus = QStringLiteral("Disconnected");
                    item.alarmState = QStringLiteral("Offline");
                    item.lastUpdate = QDateTime();
                    item.levelCm = 0.0;
                    item.levelPercent = 0.0;
                    item.volumeLiters = 0.0;
                }
            } else {
                item.connectionState = QStringLiteral("Offline");
                item.sensorStatus = QStringLiteral("Disconnected");
                item.alarmState = QStringLiteral("Offline");
                item.lastUpdate = QDateTime::currentDateTime().addSecs(-300);
            }

            m_tanks.append(item);
        }
    }
}

void TrainManager::recalculateAlarmsAndCounters()
{
    m_onlineTanks = 0;
    m_offlineTanks = 0;
    m_alertCount = 0;
    m_lowLevelCount = 0;

    for (auto &t : m_tanks) {
        if (t.connectionState == QStringLiteral("Online")) {
            m_onlineTanks++;
            if (t.levelPercent < 10.0) {
                t.alarmState = QStringLiteral("Critical");
                m_alertCount++;
                m_lowLevelCount++;
            } else if (t.levelPercent < 20.0) {
                t.alarmState = QStringLiteral("Warning");
                m_alertCount++;
                m_lowLevelCount++;
            } else {
                t.alarmState = QStringLiteral("Normal");
            }
        } else {
            t.alarmState = QStringLiteral("Offline");
            m_offlineTanks++;
        }
    }

    emit countsChanged();
    emit tanksUpdated();
}

TankItem* TrainManager::findPrimaryTank()
{
    if (m_tanks.isEmpty()) return nullptr;

    // 1. Primary priority: physical hardware device 'wli'
    for (auto &t : m_tanks) {
        if (t.deviceId == QStringLiteral("wli")) {
            return &t;
        }
    }
    // 2. Second priority: canonical Train 12301 Coach S1 Tank T01
    for (auto &t : m_tanks) {
        if (t.trainNumber == QStringLiteral("12301") &&
            (t.coachId == QStringLiteral("S1") || t.coachId == QStringLiteral("01")) &&
            t.tankNumber == QStringLiteral("T01")) {
            return &t;
        }
    }
    // 3. Third priority: canonical primary tank IDs
    for (auto &t : m_tanks) {
        if (t.id == QStringLiteral("1") || t.id == QStringLiteral("T-12301-01") || t.legacyId == QStringLiteral("tank-001")) {
            return &t;
        }
    }
    return &m_tanks[0];
}

void TrainManager::processReading(double waterLevel, double pressure, const QString &sensorStatus, qint64 timestampMs, bool isFresh)
{
    TankItem *primaryPtr = findPrimaryTank();
    if (!primaryPtr) return;
    auto &primary = *primaryPtr;

    if (!isFresh) {
        primary.connectionState = QStringLiteral("Offline");
        primary.sensorStatus = QStringLiteral("Disconnected");
        primary.alarmState = QStringLiteral("Offline");
        recalculateAlarmsAndCounters();

        if (m_tankModel && (m_selectedTankId == primary.id || m_selectedTankId == primary.tankNumber ||
                            m_selectedTankId == primary.deviceId || m_selectedTankId == primary.legacyId ||
                            m_selectedTankId == QStringLiteral("1") || m_selectedTankId == QStringLiteral("T-12301-01") ||
                            m_selectedTankId == QStringLiteral("T01"))) {
            m_tankModel->applyOfflineState(primary.maxHeightCm, primary.capacityLiters,
                primary.lastUpdate.isValid() ? primary.lastUpdate.toString(QStringLiteral("h:mm:ss AP")) : QStringLiteral("--"));
        }
        return;
    }

    primary.connectionState = QStringLiteral("Online");
    if (timestampMs > 0) {
        primary.lastUpdate = QDateTime::fromMSecsSinceEpoch(timestampMs).toLocalTime();
    } else {
        primary.lastUpdate = QDateTime::currentDateTime();
    }

    double levelCm = (waterLevel > 2.0) ? waterLevel : (waterLevel * 100.0);
    primary.levelCm = std::max(0.0, levelCm);
    primary.levelPercent = std::clamp((primary.levelCm / primary.maxHeightCm) * 100.0, 0.0, 100.0);
    primary.volumeLiters = (primary.levelPercent / 100.0) * primary.capacityLiters;
    primary.pressureHpa = pressure;
    primary.sensorStatus = sensorStatus;

    recalculateAlarmsAndCounters();

    if (m_tankModel && (m_selectedTankId == primary.id || m_selectedTankId == primary.tankNumber ||
                        m_selectedTankId == primary.deviceId || m_selectedTankId == primary.legacyId ||
                        m_selectedTankId == QStringLiteral("1") || m_selectedTankId == QStringLiteral("T-12301-01") ||
                        m_selectedTankId == QStringLiteral("T01"))) {
        m_tankModel->setConnectionState(QStringLiteral("Connected"));
        m_tankModel->applyAuthoritativeReading(
            primary.levelCm,
            primary.levelPercent,
            primary.volumeLiters,
            primary.maxHeightCm,
            primary.capacityLiters,
            primary.pressureHpa,
            primary.sensorStatus,
            primary.alarmState,
            QStringLiteral("VALID"),
            true
        );
        m_tankModel->setLastUpdated(primary.lastUpdate.toString(QStringLiteral("h:mm:ss AP")));
    }
}

void TrainManager::processEsp32Status(const QJsonObject &statusObj)
{
    TankItem *primaryPtr = findPrimaryTank();
    if (!primaryPtr) return;
    auto &primary = *primaryPtr;

    primary.connectionState = QStringLiteral("Online");

    qint64 ts = static_cast<qint64>(statusObj.value(QStringLiteral("timestamp")).toDouble(0));
    if (statusObj.contains(QStringLiteral("sensor_measurement_timestamp"))) {
        ts = static_cast<qint64>(statusObj.value(QStringLiteral("sensor_measurement_timestamp")).toDouble(0));
    }
    if (ts > 0) {
        if (ts < 10000000000LL) {
            primary.lastUpdate = QDateTime::fromSecsSinceEpoch(ts).toLocalTime();
        } else {
            primary.lastUpdate = QDateTime::fromMSecsSinceEpoch(ts).toLocalTime();
        }
    } else {
        primary.lastUpdate = QDateTime::currentDateTime();
    }

    if (statusObj.contains(QStringLiteral("water_level_cm"))) {
        primary.levelCm = statusObj.value(QStringLiteral("water_level_cm")).toDouble();
    }
    if (statusObj.contains(QStringLiteral("tank_height_cm"))) {
        double h = statusObj.value(QStringLiteral("tank_height_cm")).toDouble();
        if (h > 0) primary.maxHeightCm = h;
    }
    if (statusObj.contains(QStringLiteral("tank_capacity_l"))) {
        double cap = statusObj.value(QStringLiteral("tank_capacity_l")).toDouble();
        if (cap > 0) primary.capacityLiters = cap;
    }
    if (statusObj.contains(QStringLiteral("tank_volume_l"))) {
        primary.volumeLiters = statusObj.value(QStringLiteral("tank_volume_l")).toDouble();
    } else {
        primary.volumeLiters = (primary.levelCm / primary.maxHeightCm) * primary.capacityLiters;
    }

    primary.levelPercent = std::clamp((primary.levelCm / primary.maxHeightCm) * 100.0, 0.0, 100.0);

    if (statusObj.contains(QStringLiteral("raw_voltage"))) {
        primary.rawVoltage = statusObj.value(QStringLiteral("raw_voltage")).toDouble();
    }
    if (statusObj.contains(QStringLiteral("pressure_hpa"))) {
        primary.pressureHpa = statusObj.value(QStringLiteral("pressure_hpa")).toDouble();
    }
    if (statusObj.contains(QStringLiteral("humidity_percent"))) {
        primary.humidityPercent = statusObj.value(QStringLiteral("humidity_percent")).toDouble();
    }
    if (statusObj.contains(QStringLiteral("sensor_status"))) {
        int st = statusObj.value(QStringLiteral("sensor_status")).toInt(1);
        primary.sensorStatus = (st == 1) ? QStringLiteral("Healthy") : QStringLiteral("Error");
    }

    recalculateAlarmsAndCounters();

    if (m_tankModel && (m_selectedTankId == primary.id || m_selectedTankId == primary.tankNumber ||
                        m_selectedTankId == primary.deviceId || m_selectedTankId == primary.legacyId ||
                        m_selectedTankId == QStringLiteral("1") || m_selectedTankId == QStringLiteral("T-12301-01") ||
                        m_selectedTankId == QStringLiteral("T01"))) {
        m_tankModel->setConnectionState(QStringLiteral("Connected"));
        m_tankModel->applyAuthoritativeReading(
            primary.levelCm,
            primary.levelPercent,
            primary.volumeLiters,
            primary.maxHeightCm,
            primary.capacityLiters,
            primary.pressureHpa,
            primary.sensorStatus,
            primary.alarmState,
            QStringLiteral("VALID"),
            true
        );
        m_tankModel->setLastUpdated(primary.lastUpdate.toString(QStringLiteral("h:mm:ss AP")));
    }
}

void TrainManager::setConnectionState(const QString &state)
{
    if (m_trainConnectionState != state) {
        m_trainConnectionState = state;
        emit trainConnectionStateChanged();
    }

    TankItem *primaryPtr = findPrimaryTank();

    if (state == QStringLiteral("Disconnected") || state == QStringLiteral("Offline") || state == QStringLiteral("Error")) {
        if (primaryPtr) {
            primaryPtr->connectionState = QStringLiteral("Offline");
            primaryPtr->sensorStatus = QStringLiteral("Disconnected");
            primaryPtr->alarmState = QStringLiteral("Offline");
            recalculateAlarmsAndCounters();
            if (m_tankModel && (m_selectedTankId == primaryPtr->id || m_selectedTankId == primaryPtr->tankNumber ||
                                m_selectedTankId == primaryPtr->deviceId || m_selectedTankId == primaryPtr->legacyId ||
                                m_selectedTankId == QStringLiteral("1") || m_selectedTankId == QStringLiteral("T-12301-01") ||
                                m_selectedTankId == QStringLiteral("T01"))) {
                m_tankModel->applyOfflineState(primaryPtr->maxHeightCm, primaryPtr->capacityLiters,
                    primaryPtr->lastUpdate.isValid() ? primaryPtr->lastUpdate.toString(QStringLiteral("h:mm:ss AP")) : QStringLiteral("--"));
            }
        }
    } else if (state == QStringLiteral("Connected")) {
        if (primaryPtr && primaryPtr->lastUpdate.isValid()) {
            primaryPtr->connectionState = QStringLiteral("Online");
            primaryPtr->sensorStatus = QStringLiteral("Healthy");
            recalculateAlarmsAndCounters();
        }
    }
}

} // namespace Panorama
