#include "RailwayManager.h"
#include "DatabaseManager.h"
#include "TankModel.h"
#include <cmath>

namespace Panorama {

RailwayManager::RailwayManager(QObject *parent)
    : QObject(parent)
{
}

void RailwayManager::setDatabaseManager(DatabaseManager *dbManager)
{
    if (m_dbManager == dbManager) return;
    m_dbManager = dbManager;
    if (m_dbManager) {
        connect(m_dbManager, &DatabaseManager::databaseChanged,
                this, &RailwayManager::reloadData);
    }
    reloadData();
}

void RailwayManager::setTankModel(TankModel *tankModel)
{
    m_tankModel = tankModel;
}

void RailwayManager::reloadData()
{
    emit trainsChanged();
    emit coachesChanged();
    emit tanksChanged();
    emit devicesChanged();
    emit activeTrainChanged();
}

QVariantList RailwayManager::regions() const
{
    if (!m_dbManager) return QVariantList();
    return m_dbManager->getRegions();
}

QVariantList RailwayManager::trains() const
{
    if (!m_dbManager) return QVariantList();
    return m_dbManager->getAllTrains();
}

int RailwayManager::totalTrains() const
{
    return trains().size();
}

int RailwayManager::onlineTrains() const
{
    int count = 0;
    for (const auto &v : trains()) {
        if (v.toMap().value(QStringLiteral("status")).toString().compare(QStringLiteral("Online"), Qt::CaseInsensitive) == 0) {
            count++;
        }
    }
    return count;
}

int RailwayManager::offlineTrains() const
{
    return totalTrains() - onlineTrains();
}

QVariantMap RailwayManager::activeTrain() const
{
    if (!m_dbManager || m_activeTrainNumber.isEmpty()) return QVariantMap();
    return m_dbManager->getTrainByNumber(m_activeTrainNumber);
}

QVariantList RailwayManager::coaches() const
{
    if (!m_dbManager || m_activeTrainNumber.isEmpty()) return QVariantList();
    return const_cast<RailwayManager*>(this)->getCoaches(m_activeTrainNumber);
}

int RailwayManager::assignedCoachCount() const
{
    if (!m_dbManager || m_activeTrainNumber.isEmpty()) return 0;
    return m_dbManager->getTrainCoachCount(m_activeTrainNumber);
}

int RailwayManager::totalTanks() const
{
    if (!m_dbManager) return 0;
    return m_dbManager->getAllTanks().size();
}

int RailwayManager::connectedTanks() const
{
    if (!m_dbManager) return 0;
    int count = 0;
    const auto all = m_dbManager->getAllTanks();
    for (const auto &v : all) {
        const QString dev = v.toMap().value(QStringLiteral("deviceId")).toString().trimmed();
        if (!dev.isEmpty()) count++;
    }
    return count;
}

int RailwayManager::unconnectedTanks() const
{
    return totalTanks() - connectedTanks();
}

void RailwayManager::setActiveTrainNumber(const QString &trainNumber)
{
    m_activeTrainNumber = trainNumber;
    emit activeTrainChanged();
    emit coachesChanged();
}

QVariantList RailwayManager::getRegions()
{
    return regions();
}

QVariantList RailwayManager::getTrainsByRegion(const QString &region)
{
    if (!m_dbManager) return QVariantList();
    return m_dbManager->getTrainsByRegion(region);
}

QVariantList RailwayManager::getTrains()
{
    return trains();
}

QVariantMap RailwayManager::getTrain(const QString &trainNumber)
{
    if (!m_dbManager) return QVariantMap();
    return m_dbManager->getTrainByNumber(trainNumber);
}

bool RailwayManager::addTrain(const QString &trainNumber, const QString &trainName,
                              const QString &region, const QString &description,
                              const QString &location, const QString &status)
{
    if (trainNumber.trimmed().isEmpty()) {
        emit feedbackMessage(false, QStringLiteral("Train number cannot be empty."));
        return false;
    }
    if (trainName.trimmed().isEmpty()) {
        emit feedbackMessage(false, QStringLiteral("Train name cannot be empty."));
        return false;
    }
    if (region.trimmed().isEmpty()) {
        emit feedbackMessage(false, QStringLiteral("Region cannot be empty."));
        return false;
    }

    if (!m_dbManager) {
        emit feedbackMessage(false, QStringLiteral("Database connection unavailable."));
        return false;
    }

    // Check uniqueness
    if (m_dbManager->getTrainId(trainNumber.trimmed()) > 0) {
        emit feedbackMessage(false, QStringLiteral("Train number '%1' already exists.").arg(trainNumber.trimmed()));
        return false;
    }

    bool ok = m_dbManager->addTrain(trainNumber, trainName, region, description, location, status);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Train %1 added successfully.").arg(trainNumber.trimmed()));
        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to add train %1.").arg(trainNumber.trimmed()));
    }
    return ok;
}

bool RailwayManager::updateTrain(const QString &trainNumber, const QString &trainName,
                                 const QString &region, const QString &description,
                                 const QString &location, const QString &status)
{
    if (!m_dbManager) return false;
    bool ok = m_dbManager->updateTrain(trainNumber, trainName, region, description, location, status);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Train %1 updated successfully.").arg(trainNumber));
        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to update train %1.").arg(trainNumber));
    }
    return ok;
}

bool RailwayManager::deleteTrain(const QString &trainNumber)
{
    if (!m_dbManager) return false;
    bool ok = m_dbManager->deleteTrain(trainNumber);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Train %1 deleted successfully.").arg(trainNumber));
        if (m_activeTrainNumber == trainNumber) {
            const auto remaining = trains();
            m_activeTrainNumber = remaining.isEmpty() ? QString() : remaining.first().toMap().value(QStringLiteral("trainNumber")).toString();
            emit activeTrainChanged();
        }
        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to delete train %1.").arg(trainNumber));
    }
    return ok;
}

QVariantList RailwayManager::getCoaches(const QString &trainNumber)
{
    if (!m_dbManager || trainNumber.trimmed().isEmpty()) return QVariantList();
    int tid = m_dbManager->getTrainId(trainNumber);
    if (tid < 0) return QVariantList();

    // Fetch configured coaches from database
    QVariantList dbCoaches = m_dbManager->getCoachesForTrain(trainNumber);
    QMap<int, QVariantMap> coachByPos;
    for (const auto &cVar : dbCoaches) {
        QVariantMap cm = cVar.toMap();
        int pos = cm.value(QStringLiteral("position")).toInt();
        if (pos >= 1 && pos <= 24) {
            coachByPos[pos] = cm;
        } else {
            QString numStr = cm.value(QStringLiteral("coachNumber")).toString().trimmed();
            QRegularExpression numRe(QStringLiteral("(\\d+)"));
            auto m = numRe.match(numStr);
            if (m.hasMatch()) {
                int p = m.captured(1).toInt();
                if (p >= 1 && p <= 24 && !coachByPos.contains(p)) {
                    coachByPos[p] = cm;
                }
            }
        }
    }

    // Build the 24-coach consist layout (Requirement 19 & 23)
    QVariantList consist;
    consist.reserve(24);
    for (int pos = 1; pos <= 24; ++pos) {
        QString twoDigit = QString::asprintf("%02d", pos);
        QString dispName = QStringLiteral("COACH %1").arg(pos, 2, 10, QChar('0'));
        if (coachByPos.contains(pos)) {
            QVariantMap m = coachByPos[pos];
            int cid = m.value(QStringLiteral("id")).toInt();
            m[QStringLiteral("assigned")] = true;
            m[QStringLiteral("position")] = pos;
            m[QStringLiteral("displayNumber")] = twoDigit;
            m[QStringLiteral("displayName")] = dispName;
            m[QStringLiteral("twoDigitNumber")] = twoDigit;

            QVariantList tanks = m_dbManager->getTanksForCoach(cid);
            m[QStringLiteral("tanks")] = tanks;
            m[QStringLiteral("tankCount")] = tanks.size();

            int online = 0, offline = 0, alert = 0;
            for (const auto &tVar : tanks) {
                QVariantMap tm = tVar.toMap();
                QString stat = tm.value(QStringLiteral("deviceStatus")).toString().trimmed().toLower();
                if (stat == QStringLiteral("online")) online++;
                else offline++;
                if (stat == QStringLiteral("warning") || stat == QStringLiteral("critical")) alert++;
            }
            m[QStringLiteral("onlineCount")] = online;
            m[QStringLiteral("offlineCount")] = offline;
            m[QStringLiteral("alertCount")] = alert;

            // Status determination for active coach
            if (tanks.isEmpty()) {
                m[QStringLiteral("status")] = QStringLiteral("No Tank Assigned");
            } else if (online > 0 && offline == 0) {
                m[QStringLiteral("status")] = QStringLiteral("Online");
            } else if (online > 0 && offline > 0) {
                m[QStringLiteral("status")] = QStringLiteral("Partially Configured");
            } else {
                m[QStringLiteral("status")] = QStringLiteral("Offline");
            }

            consist.append(m);
        } else {
            // Empty / Available coach slot (Requirement 26 & 35: no fake data)
            QVariantMap slot;
            slot[QStringLiteral("id")] = -1;
            slot[QStringLiteral("coachId")] = -1;
            slot[QStringLiteral("trainNumber")] = trainNumber;
            slot[QStringLiteral("coachNumber")] = twoDigit;
            slot[QStringLiteral("displayNumber")] = twoDigit;
            slot[QStringLiteral("displayName")] = dispName;
            slot[QStringLiteral("twoDigitNumber")] = twoDigit;
            slot[QStringLiteral("coachType")] = QString();
            slot[QStringLiteral("position")] = pos;
            slot[QStringLiteral("description")] = QString();
            slot[QStringLiteral("assigned")] = false;
            slot[QStringLiteral("tankCount")] = 0;
            slot[QStringLiteral("onlineCount")] = 0;
            slot[QStringLiteral("offlineCount")] = 0;
            slot[QStringLiteral("alertCount")] = 0;
            slot[QStringLiteral("status")] = QStringLiteral("Available");
            slot[QStringLiteral("tanks")] = QVariantList();
            consist.append(slot);
        }
    }
    return consist;
}

QVariantMap RailwayManager::getCoach(int coachId)
{
    if (!m_dbManager) return QVariantMap();
    return m_dbManager->getCoach(coachId);
}

bool RailwayManager::addCoach(const QString &trainNumber, const QString &coachNumber,
                              const QString &coachType, int position,
                              const QString &description)
{
    if (coachNumber.trimmed().isEmpty()) {
        emit feedbackMessage(false, QStringLiteral("Coach number cannot be empty."));
        return false;
    }
    if (position < 1 || position > 24) {
        emit feedbackMessage(false, QStringLiteral("Coach position must be between 01 and 24."));
        return false;
    }
    QRegularExpression numRe(QStringLiteral("(\\d+)"));
    auto m = numRe.match(coachNumber.trimmed());
    if (m.hasMatch() && m.captured(1).toInt() > 24) {
        emit feedbackMessage(false, QStringLiteral("Coach number cannot exceed 24."));
        return false;
    }
    if (!m_dbManager) return false;

    bool ok = m_dbManager->addCoach(trainNumber, coachNumber, coachType, position, description);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Coach %1 added successfully.").arg(coachNumber));
        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to add coach %1 (exceeds limit 24 or already exists).").arg(coachNumber));
    }
    return ok;
}

bool RailwayManager::updateCoach(int coachId, const QString &coachNumber,
                                 const QString &coachType, int position,
                                 const QString &description)
{
    if (position < 1 || position > 24) {
        emit feedbackMessage(false, QStringLiteral("Coach position must be between 01 and 24."));
        return false;
    }
    QRegularExpression numRe(QStringLiteral("(\\d+)"));
    auto m = numRe.match(coachNumber.trimmed());
    if (m.hasMatch() && m.captured(1).toInt() > 24) {
        emit feedbackMessage(false, QStringLiteral("Coach number cannot exceed 24."));
        return false;
    }
    if (!m_dbManager) return false;
    bool ok = m_dbManager->updateCoach(coachId, coachNumber, coachType, position, description);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Coach %1 updated successfully.").arg(coachNumber));
        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to update coach %1.").arg(coachNumber));
    }
    return ok;
}

bool RailwayManager::deleteCoach(int coachId)
{
    if (!m_dbManager) return false;
    bool ok = m_dbManager->deleteCoach(coachId);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Coach deleted successfully."));
        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to delete coach."));
    }
    return ok;
}

int RailwayManager::ensureCoach(const QString &trainNumber, int position)
{
    if (!m_dbManager) return -1;
    if (position < 1 || position > 24) return -1;
    int id = m_dbManager->ensureCoach(trainNumber, position);
    if (id > 0) {
        reloadData();
    }
    return id;
}

static QVariantList enrichTanksWithTelemetry(const QVariantList &rawList, int selectedTankId, TankModel *tankModel)
{
    QVariantList list = rawList;
    for (int i = 0; i < list.size(); ++i) {
        QVariantMap map = list[i].toMap();
        QString devId = map.value(QStringLiteral("deviceId")).toString().trimmed();
        int tankId = map.value(QStringLiteral("id")).toInt();
        bool isPrimary = (devId.compare(QStringLiteral("wli"), Qt::CaseInsensitive) == 0);
        bool isSelected = (selectedTankId == tankId && selectedTankId > 0);

        if ((isPrimary || isSelected) && tankModel) {
            QString connState = tankModel->connectionState();
            bool isConnected = (connState == QStringLiteral("Connected"));
            bool isOnline = isConnected && tankModel->hasValidData();
            QString status = isOnline ?
                ((tankModel->alarmLevel() == QStringLiteral("Critical")) ? QStringLiteral("CRITICAL") :
                 (tankModel->alarmLevel() == QStringLiteral("Warning")) ? QStringLiteral("WARNING") :
                 QStringLiteral("ONLINE"))
                : ((connState == QStringLiteral("Connecting")) ? QStringLiteral("CONNECTING") : QStringLiteral("OFFLINE"));

            if (devId.isEmpty()) {
                status = QStringLiteral("NOT CONNECTED");
                isOnline = false;
            }

            map[QStringLiteral("status")] = status;
            map[QStringLiteral("deviceStatus")] = devId.isEmpty() ? QStringLiteral("NOT CONNECTED") : (isOnline ? QStringLiteral("Online") : QStringLiteral("Offline"));
            map[QStringLiteral("isOnline")] = isOnline;
            map[QStringLiteral("waterLevel")] = isOnline ? tankModel->fillPercentage() : -1.0;
            map[QStringLiteral("waterHeightCm")] = isOnline ? tankModel->waterHeightCm() : -1.0;
            map[QStringLiteral("tankHeightCm")] = tankModel->tankHeightCm() > 0 ? tankModel->tankHeightCm() : map.value(QStringLiteral("heightCm")).toDouble();
            map[QStringLiteral("volumeLiters")] = isOnline ? tankModel->waterVolumeLiters() : -1.0;
            map[QStringLiteral("capacityLiters")] = tankModel->capacityLiters() > 0 ? tankModel->capacityLiters() : map.value(QStringLiteral("capacityLiters")).toDouble();
            map[QStringLiteral("pressure")] = isOnline ? tankModel->pressure() : -1.0;
            map[QStringLiteral("sensorStatus")] = isOnline ? (tankModel->sensorStatus().isEmpty() ? QStringLiteral("Healthy") : tankModel->sensorStatus()) : QStringLiteral("Disconnected");
            map[QStringLiteral("lastUpdate")] = isOnline ? (tankModel->lastUpdated().isEmpty() ? QStringLiteral("Just now") : tankModel->lastUpdated()) : QStringLiteral("Offline");
            map[QStringLiteral("alarmLevel")] = tankModel->alarmLevel();
            list[i] = map;
        } else {
            QString dbDevStatus = map.value(QStringLiteral("deviceStatus")).toString();
            if (dbDevStatus.isEmpty() || devId.isEmpty()) {
                dbDevStatus = devId.isEmpty() ? QStringLiteral("NOT CONNECTED") : QStringLiteral("Offline");
            }
            bool isOnline = (dbDevStatus.compare(QStringLiteral("Online"), Qt::CaseInsensitive) == 0);
            map[QStringLiteral("isOnline")] = isOnline;
            map[QStringLiteral("waterLevel")] = -1.0;
            map[QStringLiteral("waterHeightCm")] = -1.0;
            map[QStringLiteral("volumeLiters")] = -1.0;
            map[QStringLiteral("pressure")] = -1.0;
            map[QStringLiteral("status")] = devId.isEmpty() ? QStringLiteral("NOT CONNECTED") : (isOnline ? QStringLiteral("ONLINE") : QStringLiteral("OFFLINE"));
            map[QStringLiteral("deviceStatus")] = dbDevStatus;
            list[i] = map;
        }
    }
    return list;
}

QVariantList RailwayManager::getTanksForCoach(int coachId)
{
    if (!m_dbManager) return QVariantList();
    return enrichTanksWithTelemetry(m_dbManager->getTanksForCoach(coachId), m_selectedTankId, m_tankModel);
}

QVariantList RailwayManager::getTanksForTrain(const QString &trainNumber)
{
    if (!m_dbManager) return QVariantList();
    return enrichTanksWithTelemetry(m_dbManager->getTanksForTrain(trainNumber), m_selectedTankId, m_tankModel);
}

QVariantList RailwayManager::getAllTanks()
{
    if (!m_dbManager) return QVariantList();
    return enrichTanksWithTelemetry(m_dbManager->getAllTanks(), m_selectedTankId, m_tankModel);
}

QVariantMap RailwayManager::getTank(int tankId)
{
    if (!m_dbManager) return QVariantMap();
    return m_dbManager->getTank(tankId);
}

bool RailwayManager::selectTank(int tankId)
{
    if (!m_dbManager || tankId <= 0) return false;
    QVariantMap tank = m_dbManager->getTank(tankId);
    if (tank.isEmpty()) return false;

    m_selectedTankId = tankId;
    emit selectedTankChanged();

    QString trainNum = tank.value(QStringLiteral("trainNumber")).toString();
    if (!trainNum.isEmpty()) {
        setActiveTrainNumber(trainNum);
    }

    if (m_tankModel) {
        QString tNum = tank.value(QStringLiteral("tankNumber")).toString();
        QString tName = tank.value(QStringLiteral("tankName")).toString();
        QString devId = tank.value(QStringLiteral("deviceId")).toString().trimmed();
        QString geom = tank.value(QStringLiteral("geometryType")).toString();
        double h = tank.value(QStringLiteral("heightCm")).toDouble();
        double d = tank.value(QStringLiteral("diameterCm")).toDouble();
        double w = tank.value(QStringLiteral("widthCm")).toDouble();
        double l = tank.value(QStringLiteral("lengthCm")).toDouble();
        double cap = tank.value(QStringLiteral("capacityLiters")).toDouble();

        int shapeId = (geom.compare(QStringLiteral("Cylindrical"), Qt::CaseInsensitive) == 0 ||
                       geom.compare(QStringLiteral("Cylinder"), Qt::CaseInsensitive) == 0) ? 0 :
                      (geom.compare(QStringLiteral("Rectangular"), Qt::CaseInsensitive) == 0 ? 1 : 2);

        m_tankModel->setTankName(tName.isEmpty() ? QStringLiteral("Tank %1").arg(tNum) : tName);
        m_tankModel->setDeviceLabel(devId);

        m_tankModel->updateTankConfiguration(
            shapeId,
            h > 0 ? h : 50.0,
            d > 0 ? d : (shapeId == 0 ? 22.5676 : 30.0),
            w > 0 ? w : 30.0,
            l > 0 ? l : 40.0,
            cap > 0 ? cap : 20.0,
            20.0, 10.0, 90.0
        );

        if (devId.isEmpty()) {
            m_tankModel->setConnectionState(QStringLiteral("Not Connected"));
            m_tankModel->applyOfflineState(h > 0 ? h : 50.0, cap > 0 ? cap : 20.0, QString());
        } else {
            // Check if device currently has active connection, else cleanly show Offline
            if (m_tankModel->connectionState() != QStringLiteral("Connected")) {
                m_tankModel->setConnectionState(QStringLiteral("Offline"));
                m_tankModel->applyOfflineState(h > 0 ? h : 50.0, cap > 0 ? cap : 20.0, m_tankModel->lastUpdated());
            }
        }
    }

    emit tanksChanged();
    return true;
}

double RailwayManager::calculateCapacity(const QString &geometryType, double lengthCm,
                                         double widthCm, double heightCm, double diameterCm) const
{
    const QString geom = geometryType.trimmed();
    if (geom.compare(QStringLiteral("Cylindrical"), Qt::CaseInsensitive) == 0 ||
        geom.compare(QStringLiteral("Cylinder"), Qt::CaseInsensitive) == 0) {
        if (diameterCm <= 0.0 || heightCm <= 0.0) return 0.0;
        const double r = diameterCm / 2.0;
        const double volumeCm3 = M_PI * r * r * heightCm;
        return std::round((volumeCm3 / 1000.0) * 10.0) / 10.0;
    } else {
        // Rectangular or Custom
        if (lengthCm <= 0.0 || widthCm <= 0.0 || heightCm <= 0.0) return 0.0;
        const double volumeCm3 = lengthCm * widthCm * heightCm;
        return std::round((volumeCm3 / 1000.0) * 10.0) / 10.0;
    }
}

bool RailwayManager::addTank(int coachId, const QString &tankNumber, const QString &tankName,
                             const QString &geometryType, double lengthCm, double widthCm,
                             double heightCm, double diameterCm, double capacityLiters,
                             double maxHeightCm, const QString &deviceId)
{
    if (coachId <= 0) {
        emit feedbackMessage(false, QStringLiteral("Invalid coach selection."));
        return false;
    }
    if (tankNumber.trimmed().isEmpty()) {
        emit feedbackMessage(false, QStringLiteral("Tank number cannot be empty."));
        return false;
    }
    if (heightCm <= 0.0) {
        emit feedbackMessage(false, QStringLiteral("Tank height must be greater than 0."));
        return false;
    }
    if (capacityLiters <= 0.0) {
        capacityLiters = calculateCapacity(geometryType, lengthCm, widthCm, heightCm, diameterCm);
        if (capacityLiters <= 0.0) {
            emit feedbackMessage(false, QStringLiteral("Tank capacity must be greater than 0."));
            return false;
        }
    }

    if (!m_dbManager) return false;
    bool ok = m_dbManager->addTank(coachId, tankNumber, tankName, geometryType,
                                   lengthCm, widthCm, heightCm, diameterCm,
                                   capacityLiters, maxHeightCm, deviceId);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Tank %1 configured successfully.").arg(tankNumber));
        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to add tank %1 (already exists in coach).").arg(tankNumber));
    }
    return ok;
}

bool RailwayManager::updateTank(int tankId, const QString &tankNumber, const QString &tankName,
                                const QString &geometryType, double lengthCm, double widthCm,
                                double heightCm, double diameterCm, double capacityLiters,
                                double maxHeightCm, const QString &deviceId)
{
    if (tankId <= 0) return false;
    if (heightCm <= 0.0) {
        emit feedbackMessage(false, QStringLiteral("Tank height must be greater than 0."));
        return false;
    }
    if (capacityLiters <= 0.0) {
        capacityLiters = calculateCapacity(geometryType, lengthCm, widthCm, heightCm, diameterCm);
    }

    if (!m_dbManager) return false;
    bool ok = m_dbManager->updateTank(tankId, tankNumber, tankName, geometryType,
                                      lengthCm, widthCm, heightCm, diameterCm,
                                      capacityLiters, maxHeightCm, deviceId);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Tank %1 updated successfully.").arg(tankNumber));

        // If this tank is currently loaded in TankModel, update its geometry directly
        if (m_tankModel) {
            int shapeId = (geometryType.compare(QStringLiteral("Cylindrical"), Qt::CaseInsensitive) == 0) ? 0 :
                          (geometryType.compare(QStringLiteral("Rectangular"), Qt::CaseInsensitive) == 0 ? 1 : 2);
            m_tankModel->updateTankConfiguration(
                shapeId,
                heightCm,
                diameterCm,
                widthCm,
                lengthCm,
                capacityLiters,
                20.0, 10.0, 90.0
            );
        }

        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to update tank %1.").arg(tankNumber));
    }
    return ok;
}

bool RailwayManager::deleteTank(int tankId)
{
    if (!m_dbManager) return false;
    bool ok = m_dbManager->deleteTank(tankId);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Tank deleted successfully."));
        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to delete tank."));
    }
    return ok;
}

bool RailwayManager::assignDevice(int tankId, const QString &deviceId)
{
    if (!m_dbManager) return false;
    bool ok = m_dbManager->assignDeviceToTank(tankId, deviceId);
    if (ok) {
        emit feedbackMessage(true, QStringLiteral("Device %1 assigned to tank.").arg(deviceId.isEmpty() ? QStringLiteral("(Unassigned)") : deviceId));
        reloadData();
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to assign device."));
    }
    return ok;
}

QVariantList RailwayManager::devices() const
{
    if (!m_dbManager) return QVariantList();
    QVariantList list = m_dbManager->getAllDevices();

    // Overlay live telemetry on primary hardware device "wli"
    for (int i = 0; i < list.size(); ++i) {
        QVariantMap map = list[i].toMap();
        if (map.value(QStringLiteral("id")).toString() == QStringLiteral("wli") && m_tankModel) {
            QString connState = m_tankModel->connectionState();
            QString status = (connState == QStringLiteral("Connected")) ?
                ((m_tankModel->alarmLevel() == QStringLiteral("Warning") ||
                  m_tankModel->alarmLevel() == QStringLiteral("Critical") ||
                  m_tankModel->alarmLevel() == QStringLiteral("Overflow")) ? QStringLiteral("Warning") : QStringLiteral("Online"))
                : ((connState == QStringLiteral("Connecting")) ? QStringLiteral("Warning") : QStringLiteral("Offline"));
            map[QStringLiteral("status")] = status;
            map[QStringLiteral("waterLevel")] = m_tankModel->fillPercentage();
            map[QStringLiteral("waterHeightCm")] = m_tankModel->waterHeightCm();
            map[QStringLiteral("tankHeightCm")] = m_tankModel->tankHeightCm() > 0 ? m_tankModel->tankHeightCm() : 50.0;
            map[QStringLiteral("volumeLiters")] = m_tankModel->waterVolumeLiters();
            map[QStringLiteral("capacityLiters")] = m_tankModel->capacityLiters();
            map[QStringLiteral("pressure")] = m_tankModel->pressure();
            map[QStringLiteral("sensorStatus")] = m_tankModel->sensorStatus().isEmpty() ? QStringLiteral("Healthy") : m_tankModel->sensorStatus();
            map[QStringLiteral("lastUpdate")] = m_tankModel->lastUpdated().isEmpty() ? QStringLiteral("Just now") : m_tankModel->lastUpdated();
            list[i] = map;
        }
    }
    return list;
}

QVariantList RailwayManager::getDevices()
{
    return devices();
}

bool RailwayManager::addDevice(const QString &deviceId, const QString &name, const QString &deviceType,
                              const QString &connectionType, const QString &status, const QString &location,
                              const QString &trainNumber, const QString &coachNumber, const QString &tankNumber)
{
    if (!m_dbManager) return false;
    bool ok = m_dbManager->addDevice(deviceId, name, deviceType, connectionType, status, location,
                                     trainNumber, coachNumber, tankNumber);
    if (ok) {
        reloadData();
        emit feedbackMessage(true, QStringLiteral("Device '%1' registered successfully.").arg(deviceId));
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to register device '%1'.").arg(deviceId));
    }
    return ok;
}

bool RailwayManager::removeDevice(const QString &deviceId)
{
    if (!m_dbManager) return false;
    bool ok = m_dbManager->deleteDevice(deviceId);
    if (ok) {
        reloadData();
        emit feedbackMessage(true, QStringLiteral("Device '%1' removed successfully.").arg(deviceId));
    } else {
        emit feedbackMessage(false, QStringLiteral("Failed to remove device '%1'.").arg(deviceId));
    }
    return ok;
}

} // namespace Panorama
