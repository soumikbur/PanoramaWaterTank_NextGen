#include "TankModel.h"

#include "VolumeCalculator.h"
#include "HistoryExporter.h"

#include <QDateTime>
#include <QDebug>
#include <algorithm>
#include <cmath>

namespace Panorama {

TankModel::TankModel(QObject *parent)
    : QObject(parent)
{
    recalculateGeometry();
}

void TankModel::setTankName(const QString &name)
{
    if (m_tankName == name) {
        return;
    }
    m_tankName = name;
    emit tankNameChanged();
}

void TankModel::setDeviceLabel(const QString &label)
{
    if (m_deviceLabel == label) {
        return;
    }
    m_deviceLabel = label;
    emit deviceLabelChanged();
}

void TankModel::setTankRadius(double radiusMeters)
{
    if (qFuzzyCompare(m_tankRadius + 1.0, radiusMeters + 1.0)) {
        return;
    }
    m_tankRadius = radiusMeters;
    emit tankRadiusChanged();
    recalculateGeometry();
}

void TankModel::setTankHeight(double heightMeters)
{
    if (qFuzzyCompare(m_tankHeight + 1.0, heightMeters + 1.0)) {
        return;
    }
    m_tankHeight = heightMeters;
    emit tankHeightChanged();
    recalculateGeometry();
}

void TankModel::setConnectionState(const QString &state)
{
    if (m_connectionState == state) {
        return;
    }
    const QString prevState = m_connectionState;
    m_connectionState = state;
    emit connectionStateChanged();
    emit telemetryHealthStateChanged();

    const QString nowStr = QDateTime::currentDateTime().toString(QStringLiteral("yyyy-MM-dd HH:mm:ss"));
    const QString name = m_tankName.isEmpty() ? QStringLiteral("Tank") : m_tankName;
    if (state == QStringLiteral("Offline") || state == QStringLiteral("Disconnected")) {
        qWarning().noquote() << QStringLiteral("[%1] [WARNING] [DEVICE_OFFLINE] - Device communication offline for %2").arg(nowStr, name);
    } else if (state == QStringLiteral("Connected") && (prevState == QStringLiteral("Offline") || prevState == QStringLiteral("Disconnected"))) {
        qInfo().noquote() << QStringLiteral("[%1] [NORMAL] [DEVICE_ONLINE] - Device communication restored for %2").arg(nowStr, name);
    }
}

void TankModel::recalculateGeometry()
{
    if (m_tankShapeId == 0) { // Cylinder
        m_tankArea = VolumeCalculator::calculateArea(m_tankRadius);
        m_maximumVolume = VolumeCalculator::calculateVolume(m_tankArea, m_tankHeight);
    } else if (m_tankShapeId == 1) { // Rectangle
        double widthM = m_tankWidthCm / 100.0;
        double lengthM = m_tankLengthCm / 100.0;
        m_tankArea = VolumeCalculator::calculateRectangularArea(widthM, lengthM);
        m_maximumVolume = VolumeCalculator::calculateRectangularVolume(widthM, lengthM, m_tankHeight);
    } else { // Custom
        m_tankArea = (m_tankHeight > 0.0) ? ((m_maximumVolume / 1000.0) / m_tankHeight) : 0.0;
    }

    emit tankAreaChanged();
    emit maximumVolumeChanged();

    // Re-derive the current reading against the new geometry
    recalculateFromHeight(m_currentHeight);
}

void TankModel::recalculateFromHeight(double heightMeters)
{
    m_currentHeight = std::max(0.0, heightMeters);

    double widthM = m_tankWidthCm / 100.0;
    double lengthM = m_tankLengthCm / 100.0;
    double diamM = m_tankDiameterCm / 100.0;
    m_currentVolume = VolumeCalculator::calculateVolumeForShape(
        m_tankShapeId, m_currentHeight, m_tankHeight, diamM, widthM, lengthM, m_maximumVolume);

    m_fillPercentageRaw = VolumeCalculator::calculateFillPercentageRaw(m_currentVolume, m_maximumVolume);
    m_fillPercentage = VolumeCalculator::clampPercentageForDisplay(m_fillPercentageRaw);
    m_emptyPercentage = 100.0 - m_fillPercentage;
    m_remainingVolume = VolumeCalculator::calculateRemainingVolume(m_maximumVolume, m_currentVolume);

    emit currentHeightChanged();
    emit currentVolumeChanged();
    emit fillPercentageChanged();
    emit emptyPercentageChanged();
    emit remainingVolumeChanged();

    deriveCapacityRank();
    deriveAlarmLevel();
}

void TankModel::updateTankConfiguration(int shapeId, double heightCm, double diameterCm,
                                        double widthCm, double lengthCm, double capacityL,
                                        double warnPct, double critPct, double highPct)
{
    m_tankShapeId = std::clamp(shapeId, 0, 2);
    if (m_tankShapeId == 0) m_tankShape = QStringLiteral("CYLINDER");
    else if (m_tankShapeId == 1) m_tankShape = QStringLiteral("RECTANGLE");
    else m_tankShape = QStringLiteral("CUSTOM");
    emit tankShapeChanged();

    if (heightCm > 0.0) {
        m_tankHeight = heightCm / 100.0;
        emit tankHeightChanged();
    }

    m_tankDiameterCm = diameterCm;
    if (m_tankDiameterCm > 0.0) {
        m_tankRadius = (diameterCm / 100.0) / 2.0;
        emit tankRadiusChanged();
    }
    emit tankDiameterChanged();

    m_tankWidthCm = widthCm;
    m_tankLengthCm = lengthCm;
    emit tankDimensionsChanged();

    if (warnPct > 0.0 || critPct > 0.0 || highPct > 0.0) {
        double testCrit = (critPct > 0.0) ? critPct : m_criticalThresholdPercent;
        double testWarn = (warnPct > 0.0) ? warnPct : m_warningThresholdPercent;
        double testHigh = (highPct > 0.0) ? highPct : m_highThresholdPercent;
        QString err;
        if (validateThresholdValues(testCrit, testWarn, testHigh, &err)) {
            m_criticalThresholdPercent = testCrit;
            m_warningThresholdPercent = testWarn;
            m_highThresholdPercent = testHigh;
            emit alarmThresholdsChanged();
        } else {
            qWarning().noquote() << "[TankModel] Invalid alarm thresholds rejected:" << err;
        }
    }

    if (capacityL > 0.0) {
        m_maximumVolume = capacityL;
    } else {
        double widthM = m_tankWidthCm / 100.0;
        double lengthM = m_tankLengthCm / 100.0;
        double diamM = m_tankDiameterCm / 100.0;
        m_maximumVolume = VolumeCalculator::calculateCapacityForShape(
            m_tankShapeId, m_tankHeight, diamM, widthM, lengthM, m_maximumVolume);
    }
    emit maximumVolumeChanged();

    recalculateGeometry();
}

void TankModel::applyConfigJson(const QJsonObject &configObj)
{
    // Guard against empty / non-config response payloads
    if (!configObj.contains(QStringLiteral("shape")) &&
        !configObj.contains(QStringLiteral("shape_id")) &&
        !configObj.contains(QStringLiteral("height_cm")) &&
        !configObj.contains(QStringLiteral("max_height_cm")) &&
        !configObj.contains(QStringLiteral("capacity_liters"))) {
        return;
    }

    int shapeId = m_tankShapeId;
    if (configObj.contains(QStringLiteral("shape_id"))) {
        shapeId = configObj.value(QStringLiteral("shape_id")).toInt();
    } else if (configObj.contains(QStringLiteral("shape"))) {
        QString s = configObj.value(QStringLiteral("shape")).toString().trimmed().toUpper();
        if (s == QStringLiteral("RECTANGLE") || s == QStringLiteral("RECTANGULAR")) shapeId = 1;
        else if (s == QStringLiteral("CUSTOM")) shapeId = 2;
        else if (s == QStringLiteral("CYLINDER") || s == QStringLiteral("CYLINDRICAL")) shapeId = 0;
        // else retain current shapeId
    }

    double heightCm = configObj.value(QStringLiteral("height_cm")).toDouble(
        configObj.value(QStringLiteral("max_height_cm")).toDouble(m_tankHeight * 100.0));
    if (heightCm <= 0.0) {
        heightCm = m_tankHeight * 100.0;
    }

    double diamCm = configObj.contains(QStringLiteral("diameter_cm"))
        ? configObj.value(QStringLiteral("diameter_cm")).toDouble(m_tankDiameterCm)
        : m_tankDiameterCm;

    double widthCm = configObj.contains(QStringLiteral("width_cm"))
        ? configObj.value(QStringLiteral("width_cm")).toDouble(m_tankWidthCm)
        : m_tankWidthCm;

    double lengthCm = configObj.contains(QStringLiteral("length_cm"))
        ? configObj.value(QStringLiteral("length_cm")).toDouble(m_tankLengthCm)
        : m_tankLengthCm;

    double capL = configObj.contains(QStringLiteral("capacity_liters"))
        ? configObj.value(QStringLiteral("capacity_liters")).toDouble(m_maximumVolume)
        : (configObj.contains(QStringLiteral("tank_capacity_l"))
            ? configObj.value(QStringLiteral("tank_capacity_l")).toDouble(m_maximumVolume)
            : m_maximumVolume);

    double warnPct = configObj.value(QStringLiteral("warning_percent")).toDouble(m_warningThresholdPercent);
    double critPct = configObj.value(QStringLiteral("critical_percent")).toDouble(m_criticalThresholdPercent);
    double highPct = configObj.value(QStringLiteral("high_percent")).toDouble(m_highThresholdPercent);

    updateTankConfiguration(shapeId, heightCm, diamCm, widthCm, lengthCm, capL, warnPct, critPct, highPct);
}

void TankModel::recalculateFromVolume(double volumeLiters)
{
    m_currentVolume = std::max(0.0, volumeLiters);
    m_currentHeight = VolumeCalculator::calculateHeight(m_currentVolume, m_tankArea);

    m_fillPercentageRaw = VolumeCalculator::calculateFillPercentageRaw(m_currentVolume, m_maximumVolume);
    m_fillPercentage = VolumeCalculator::clampPercentageForDisplay(m_fillPercentageRaw);
    m_emptyPercentage = 100.0 - m_fillPercentage;
    m_remainingVolume = VolumeCalculator::calculateRemainingVolume(m_maximumVolume, m_currentVolume);

    emit currentHeightChanged();
    emit currentVolumeChanged();
    emit fillPercentageChanged();
    emit emptyPercentageChanged();
    emit remainingVolumeChanged();

    deriveCapacityRank();
    deriveAlarmLevel();
}

void TankModel::deriveCapacityRank()
{
    // Purely descriptive quartile (docs/03-ui-ux-design-system.md,
    // Section 8) - never subject to hysteresis, never operationally
    // actionable on its own. Judged against the clamped display
    // percentage, unlike alarmLevel's Overflow case below.
    QString newRank;
    if (m_fillPercentage < 25.0) {
        newRank = QStringLiteral("Low");
    } else if (m_fillPercentage < 50.0) {
        newRank = QStringLiteral("Moderate");
    } else if (m_fillPercentage < 75.0) {
        newRank = QStringLiteral("Good");
    } else {
        newRank = QStringLiteral("High");
    }

    if (m_capacityRank == newRank) {
        return;
    }
    m_capacityRank = newRank;
    emit capacityRankChanged();
}

void TankModel::deriveAlarmLevel()
{
    // Only evaluate water-level alarms from valid measurements
    if (!m_hasValidData ||
        m_connectionState == QStringLiteral("Offline") ||
        m_sensorStatus == QStringLiteral("Disconnected") ||
        m_measurementState == QStringLiteral("TELEMETRY_UNAVAILABLE") ||
        m_measurementState == QStringLiteral("DISCONNECTED") ||
        m_measurementState == QStringLiteral("NO_MEASUREMENT")) {
        if (m_alarmLevel != QStringLiteral("Offline")) {
            m_alarmLevel = QStringLiteral("Offline");
            emit alarmLevelChanged();
        }
        return;
    }

    if (!m_alarmEvaluationEnabled) {
        if (m_alarmLevel != QStringLiteral("Normal")) {
            m_alarmLevel = QStringLiteral("Normal");
            emit alarmLevelChanged();
        }
        return;
    }

    // Evaluate authoritative state using single central calculation
    double evalLevel = m_fillPercentage;
    if (m_fillPercentageRaw > m_highThresholdPercent || (m_tankHeight > 0.0 && m_currentHeight >= m_tankHeight)) {
        evalLevel = std::max(evalLevel, m_fillPercentageRaw);
    }

    QString state = evaluateWaterLevelAlarm(evalLevel, m_criticalThresholdPercent, m_warningThresholdPercent, m_highThresholdPercent);

    QString newLevel;
    if (state == QStringLiteral("HIGH")) {
        newLevel = (m_fillPercentageRaw >= 100.0) ? QStringLiteral("Overflow") : QStringLiteral("High");
    } else if (state == QStringLiteral("CRITICAL")) {
        newLevel = QStringLiteral("Critical");
    } else if (state == QStringLiteral("WARNING")) {
        newLevel = QStringLiteral("Warning");
    } else {
        newLevel = QStringLiteral("Normal");
    }

    if (m_alarmLevel != newLevel) {
        m_alarmLevel = newLevel;
        emit alarmLevelChanged();
    }

    // Process state transition and history
    processAlarmTransition(state, m_fillPercentage);
}

void TankModel::touchLastUpdated()
{
    // 12-hour clock with AM/PM (e.g. "10:42:11 AM"), matching the
    // dashboard redesign spec's examples. Same property, same type -
    // only the display format changed.
    m_lastUpdated = QDateTime::currentDateTime().toString(QStringLiteral("h:mm:ss AP"));
    emit lastUpdatedChanged();
}

void TankModel::applyReading(bool hasHeight, double heightMeters, bool hasVolume, double volumeLiters,
                              bool hasPressureVal, double pressureVal, const QString &sensorStatus)
{
    if (hasHeight) {
        recalculateFromHeight(heightMeters);
    } else if (hasVolume) {
        recalculateFromVolume(volumeLiters);
    }



    if (hasPressureVal) {
        if (!m_hasPressure || !qFuzzyCompare(m_pressure + 1.0, pressureVal + 1.0)) {
            m_pressure = pressureVal;
            emit pressureChanged();
        }
        if (!m_hasPressure) {
            m_hasPressure = true;
            emit hasPressureChanged();
        }
    }

    if (!sensorStatus.isEmpty() && sensorStatus != m_sensorStatus) {
        const QString prevSensor = m_sensorStatus;
        m_sensorStatus = sensorStatus;
        emit sensorStatusChanged();

        const QString nowStr = QDateTime::currentDateTime().toString(QStringLiteral("yyyy-MM-dd HH:mm:ss"));
        const QString name = m_tankName.isEmpty() ? QStringLiteral("Tank") : m_tankName;
        if (sensorStatus == QStringLiteral("Disconnected") || sensorStatus == QStringLiteral("Fault")) {
            qCritical().noquote() << QStringLiteral("[%1] [CRITICAL] [SENSOR_FAULT] - Sensor fault / probe disconnected for %2 (%3)").arg(nowStr, name, sensorStatus);
        } else if (sensorStatus == QStringLiteral("Connected") && (prevSensor == QStringLiteral("Disconnected") || prevSensor == QStringLiteral("Fault"))) {
            qInfo().noquote() << QStringLiteral("[%1] [NORMAL] [SENSOR_RECOVERED] - Sensor connectivity restored for %2").arg(nowStr, name);
        }
    }

    if (!m_hasValidData) {
        m_hasValidData = true;
        emit hasValidDataChanged();
    }

    touchLastUpdated();
}

void TankModel::applyAuthoritativeReading(double waterLevelCm, double levelPercent, double volumeLiters,
                                          double tankHeightCm, double capacityLiters, double pressureVal,
                                          const QString &sensorStatus, const QString &alarmLevel,
                                          const QString &measurementState,
                                          bool measurementValid)
{
    Q_UNUSED(alarmLevel);
    if (tankHeightCm > 0.0 && !qFuzzyCompare(m_tankHeight * 100.0, tankHeightCm)) {
        m_tankHeight = tankHeightCm / 100.0;
        emit tankHeightChanged();
    }
    if (capacityLiters > 0.0 && !qFuzzyCompare(m_maximumVolume, capacityLiters)) {
        m_maximumVolume = capacityLiters;
        emit maximumVolumeChanged();
    }

    m_currentHeight = waterLevelCm / 100.0;
    m_currentVolume = volumeLiters;
    m_fillPercentageRaw = levelPercent;
    m_fillPercentage = std::clamp(levelPercent, 0.0, 100.0);
    m_emptyPercentage = 100.0 - m_fillPercentage;
    m_remainingVolume = std::max(0.0, m_maximumVolume - m_currentVolume);

    emit currentHeightChanged();
    emit currentVolumeChanged();
    emit fillPercentageChanged();
    emit emptyPercentageChanged();
    emit remainingVolumeChanged();

    deriveCapacityRank();

    if (!m_hasPressure || !qFuzzyCompare(m_pressure + 1.0, pressureVal + 1.0)) {
        m_pressure = pressureVal;
        emit pressureChanged();
    }
    if (!m_hasPressure) {
        m_hasPressure = true;
        emit hasPressureChanged();
    }

    if (!sensorStatus.isEmpty() && sensorStatus != m_sensorStatus) {
        const QString prevSensor = m_sensorStatus;
        m_sensorStatus = sensorStatus;
        emit sensorStatusChanged();

        const QString nowStr = QDateTime::currentDateTime().toString(QStringLiteral("yyyy-MM-dd HH:mm:ss"));
        const QString name = m_tankName.isEmpty() ? QStringLiteral("Tank") : m_tankName;
        if (sensorStatus == QStringLiteral("Disconnected") || sensorStatus == QStringLiteral("Fault")) {
            qCritical().noquote() << QStringLiteral("[%1] [CRITICAL] [SENSOR_FAULT] - Sensor fault / probe disconnected for %2 (%3)").arg(nowStr, name, sensorStatus);
        } else if (sensorStatus == QStringLiteral("Connected") && (prevSensor == QStringLiteral("Disconnected") || prevSensor == QStringLiteral("Fault"))) {
            qInfo().noquote() << QStringLiteral("[%1] [NORMAL] [SENSOR_RECOVERED] - Sensor connectivity restored for %2").arg(nowStr, name);
        }
    }

    if (m_measurementState != measurementState) {
        m_measurementState = measurementState;
        emit measurementStateChanged();
    }
    if (m_measurementValid != measurementValid) {
        m_measurementValid = measurementValid;
        emit measurementValidChanged();
    }

    bool isValidTelemetry = m_measurementValid && (m_measurementState == QStringLiteral("VALID") || m_measurementState.isEmpty());
    if (isValidTelemetry) {
        m_lastValidWaterHeightCm = waterLevelCm;
        m_lastValidFillPercentage = m_fillPercentage;
        emit lastValidMeasurementChanged();

        if (!m_hasValidData) {
            m_hasValidData = true;
            emit hasValidDataChanged();
        }
    }
    emit telemetryHealthStateChanged();

    // Process authoritative or derived alarm level
    if (!alarmLevel.isEmpty() && alarmLevel != QStringLiteral("Offline")) {
        QString newLevel = alarmLevel;
        if (newLevel.compare(QStringLiteral("Warning"), Qt::CaseInsensitive) == 0) newLevel = QStringLiteral("Warning");
        else if (newLevel.compare(QStringLiteral("Critical"), Qt::CaseInsensitive) == 0) newLevel = QStringLiteral("Critical");
        else if (newLevel.compare(QStringLiteral("Normal"), Qt::CaseInsensitive) == 0) newLevel = QStringLiteral("Normal");
        else if (newLevel.compare(QStringLiteral("High"), Qt::CaseInsensitive) == 0) newLevel = QStringLiteral("High");
        else if (newLevel.compare(QStringLiteral("Overflow"), Qt::CaseInsensitive) == 0) newLevel = QStringLiteral("Overflow");

        if (m_alarmLevel != newLevel) {
            m_alarmLevel = newLevel;
            emit alarmLevelChanged();
        }
        processAlarmTransition(newLevel.toUpper(), m_fillPercentage);
    } else {
        deriveAlarmLevel();
    }

    composeTrendHistory();
    touchLastUpdated();

    qDebug().noquote() << QStringLiteral("[TankModel][LIVE] height = %1 cm, percentage = %2%, volume = %3 L, state = %4")
        .arg(m_currentHeight * 100.0, 0, 'f', 2)
        .arg(m_fillPercentage, 0, 'f', 2)
        .arg(m_currentVolume, 0, 'f', 2)
        .arg(m_measurementState);
}

void TankModel::setMeasurementState(const QString &state, bool valid)
{
    bool changed = false;
    if (m_measurementState != state) {
        m_measurementState = state;
        changed = true;
        emit measurementStateChanged();
    }
    if (m_measurementValid != valid) {
        m_measurementValid = valid;
        changed = true;
        emit measurementValidChanged();
    }
    if (changed) {
        emit telemetryHealthStateChanged();
        composeTrendHistory();
        touchLastUpdated();
    }
}

void TankModel::setLastUpdated(const QString &time)
{
    if (m_lastUpdated != time) {
        m_lastUpdated = time;
        emit lastUpdatedChanged();
    }
}

void TankModel::applyOfflineState(double maxHeightCm, double capacityLiters, const QString &lastSeenTime)
{
    if (maxHeightCm > 0.0 && !qFuzzyCompare(m_tankHeight * 100.0, maxHeightCm)) {
        m_tankHeight = maxHeightCm / 100.0;
        emit tankHeightChanged();
    }
    if (capacityLiters > 0.0 && !qFuzzyCompare(m_maximumVolume, capacityLiters)) {
        m_maximumVolume = capacityLiters;
        emit maximumVolumeChanged();
    }

    if (m_connectionState != QStringLiteral("Offline")) {
        m_connectionState = QStringLiteral("Offline");
        emit connectionStateChanged();
    }
    if (m_alarmLevel != QStringLiteral("Offline")) {
        m_alarmLevel = QStringLiteral("Offline");
        emit alarmLevelChanged();
    }
    if (m_sensorStatus != QStringLiteral("Disconnected")) {
        m_sensorStatus = QStringLiteral("Disconnected");
        emit sensorStatusChanged();
    }
    m_currentAlarmState = QStringLiteral("OFFLINE");
    removeActiveWaterLevelAlert();
    updateAlertCounts();

    if (m_hasValidData) {
        m_hasValidData = false;
        emit hasValidDataChanged();
    }
    if (m_measurementValid) {
        m_measurementValid = false;
        emit measurementValidChanged();
    }
    if (m_measurementState != QStringLiteral("TELEMETRY_UNAVAILABLE")) {
        m_measurementState = QStringLiteral("TELEMETRY_UNAVAILABLE");
        emit measurementStateChanged();
    }


    if (m_hasPressure) {
        m_hasPressure = false;
        emit hasPressureChanged();
    }

    // For unassigned/offline tanks, reset physical height and volume to 0.0
    m_currentHeight = 0.0;
    m_currentVolume = 0.0;
    m_fillPercentage = 0.0;
    
    emit currentHeightChanged();
    emit currentVolumeChanged();
    emit fillPercentageChanged();
    emit emptyPercentageChanged();
    emit remainingVolumeChanged();

    if (m_capacityRank != QStringLiteral("Unavailable")) {
        m_capacityRank = QStringLiteral("Unavailable");
        emit capacityRankChanged();
    }

    m_lastUpdated = lastSeenTime.isEmpty() ? QStringLiteral("--") : lastSeenTime;
    emit lastUpdatedChanged();

    m_trendHistory.clear();
    m_composedTrendHistory.clear();
    emit trendHistoryChanged();
    emit composedTrendHistoryChanged();

    qDebug().noquote() << QStringLiteral("[TankModel][OFFLINE] Authoritative offline state applied for %1. Last seen: %2")
        .arg(m_tankName, m_lastUpdated);
}

void TankModel::composeTrendHistory()
{
    QList<QVariantMap> validPoints;
    const qint64 nowMs = QDateTime::currentMSecsSinceEpoch();

    // 1. Process all historical points from m_trendHistory
    for (const QVariant &item : m_trendHistory) {
        if (!item.isValid() || item.isNull()) continue;
        QVariantMap m = item.toMap();
        qint64 ts = m.value(QStringLiteral("timestampMs")).toLongLong();
        if (ts <= 0) ts = m.value(QStringLiteral("timestamp")).toLongLong();
        if (ts > 0 && ts < 100000000000LL) ts *= 1000LL;

        bool okVal = false;
        double val = m.value(QStringLiteral("value")).toDouble(&okVal);
        if (!okVal || std::isnan(val) || std::isinf(val) || ts <= 0) continue;

        // Skip historical points in the future relative to nowMs
        if (ts > nowMs) continue;

        double cmVal = m.value(QStringLiteral("waterLevelCm")).toDouble();
        if (cmVal <= 0.0 && tankHeightCm() > 0.0) {
            cmVal = (val / 100.0) * tankHeightCm();
        }

        m[QStringLiteral("timestampMs")] = ts;
        m[QStringLiteral("timestamp")] = ts;
        m[QStringLiteral("value")] = std::clamp(val, 0.0, 100.0);
        m[QStringLiteral("waterLevelCm")] = cmVal;
        m[QStringLiteral("source")] = QStringLiteral("HISTORICAL");
        m[QStringLiteral("isAuthoritative")] = false;
        m[QStringLiteral("isHistorical")] = true;
        validPoints.append(m);
    }

    // 2. Sort historical points chronologically ascending
    std::sort(validPoints.begin(), validPoints.end(), [](const QVariantMap &a, const QVariantMap &b) {
        return a.value(QStringLiteral("timestampMs")).toLongLong() < b.value(QStringLiteral("timestampMs")).toLongLong();
    });

    // 3. Compose with authoritative live measurement according to measurement state
    if (m_hasValidData) {
        if (m_measurementState == QStringLiteral("VALID") || (m_measurementValid && m_measurementState != QStringLiteral("SENSOR_ERROR") && m_measurementState != QStringLiteral("REJECTED") && m_measurementState != QStringLiteral("NO_MEASUREMENT"))) {
            // Live point is valid: append current authoritative point at nowMs
            QVariantMap livePoint;
            livePoint[QStringLiteral("timestampMs")] = nowMs;
            livePoint[QStringLiteral("timestamp")] = nowMs;
            livePoint[QStringLiteral("value")] = m_fillPercentage;
            livePoint[QStringLiteral("waterLevelCm")] = waterHeightCm();
            livePoint[QStringLiteral("source")] = QStringLiteral("LIVE");
            livePoint[QStringLiteral("measurementState")] = QStringLiteral("VALID");
            livePoint[QStringLiteral("isAuthoritative")] = true;
            livePoint[QStringLiteral("isHistorical")] = false;

            validPoints.append(livePoint);
        } else if (m_measurementState == QStringLiteral("HOLDING_LAST_VALID") || m_measurementState == QStringLiteral("REJECTED") || m_measurementState == QStringLiteral("SENSOR_ERROR")) {
            // Held point: append last valid value at nowMs, DO NOT append false 0% or spike
            double heldPct = (m_lastValidFillPercentage > 0.0) ? m_lastValidFillPercentage : m_fillPercentage;
            double heldHeightCm = (m_lastValidWaterHeightCm > 0.0) ? m_lastValidWaterHeightCm : waterHeightCm();

            QVariantMap heldPoint;
            heldPoint[QStringLiteral("timestampMs")] = nowMs;
            heldPoint[QStringLiteral("timestamp")] = nowMs;
            heldPoint[QStringLiteral("value")] = heldPct;
            heldPoint[QStringLiteral("waterLevelCm")] = heldHeightCm;
            heldPoint[QStringLiteral("source")] = QStringLiteral("HELD");
            heldPoint[QStringLiteral("measurementState")] = m_measurementState;
            heldPoint[QStringLiteral("isAuthoritative")] = true;
            heldPoint[QStringLiteral("isHistorical")] = false;

            validPoints.append(heldPoint);
        }
        // If NO_MEASUREMENT: DO NOT invent a zero value, retain existing valid points if any
    }

    QVariantList result;
    result.reserve(validPoints.size());
    for (const auto &p : validPoints) {
        result.append(p);
    }

    m_composedTrendHistory = result;
    emit composedTrendHistoryChanged();
}

void TankModel::setTrendHistory(const QVariantList &history)
{
    m_trendHistory = history;
    emit trendHistoryChanged();
    composeTrendHistory();
}

void TankModel::appendTrendHistory(const QVariantList &history)
{
    if (history.isEmpty()) return;

    QList<QVariantMap> merged;
    for (const QVariant& v : m_trendHistory) {
        merged.append(v.toMap());
    }
    for (const QVariant& v : history) {
        merged.append(v.toMap());
    }

    std::sort(merged.begin(), merged.end(), [](const QVariantMap& a, const QVariantMap& b) {
        return a.value(QStringLiteral("timestampMs")).toLongLong() < b.value(QStringLiteral("timestampMs")).toLongLong();
    });

    QVariantList finalList;
    QSet<uint> seenSeqs;
    QSet<qint64> seenTs;

    for (const QVariantMap& map : merged) {
        if (map.contains(QStringLiteral("sequence"))) {
            uint seq = map.value(QStringLiteral("sequence")).toUInt();
            if (seenSeqs.contains(seq)) continue;
            seenSeqs.insert(seq);
        } else {
            qint64 ts = map.value(QStringLiteral("timestampMs")).toLongLong();
            if (seenTs.contains(ts)) continue;
            seenTs.insert(ts);
        }
        finalList.append(map);
    }

    m_trendHistory = finalList;
    emit trendHistoryChanged();
    composeTrendHistory();
}

void TankModel::setLastSyncedSequence(uint seq)
{
    if (m_lastSyncedSequence != seq) {
        m_lastSyncedSequence = seq;
        emit lastSyncedSequenceChanged();
    }
}

void TankModel::setIsSyncing(bool syncing)
{
    if (m_isSyncing != syncing) {
        m_isSyncing = syncing;
        emit isSyncingChanged();
    }
}


void TankModel::setHistoryRangeHours(int hours)
{
    if (hours <= 0) hours = 12;
    if (m_historyRangeHours != hours) {
        m_historyRangeHours = hours;
        emit historyRangeHoursChanged(hours);
    }
}

void TankModel::refreshTrend()
{
    emit trendRefreshRequested();
}

QVariantMap TankModel::exportHistoryCsv(const QString &filePath, int rangeHours)
{
    const int effectiveHours = (rangeHours > 0) ? rangeHours : m_historyRangeHours;
    HistoryExporter::ExportResult result = HistoryExporter::exportToFile(
        filePath,
        m_trendHistory,
        effectiveHours,
        tankHeightCm(),
        capacityLiters(),
        100 // Target ~100 representative points
    );

    QVariantMap map;
    map[QStringLiteral("success")] = result.success;
    map[QStringLiteral("count")] = result.pointCount;
    map[QStringLiteral("filePath")] = result.filePath;
    map[QStringLiteral("fileName")] = result.fileName;
    map[QStringLiteral("message")] = result.success
        ? QStringLiteral("Successfully exported %1 historical data points to %2").arg(QString::number(result.pointCount), result.fileName)
        : result.errorMessage;
    return map;
}

QString TankModel::defaultCsvFilename(int rangeHours) const
{
    const int effectiveHours = (rangeHours > 0) ? rangeHours : m_historyRangeHours;
    return HistoryExporter::defaultFilename(effectiveHours);
}

bool TankModel::hasHistoricalData(int rangeHours) const
{
    const int effectiveHours = (rangeHours > 0) ? rangeHours : m_historyRangeHours;
    const auto points = HistoryExporter::processHistoricalData(
        m_trendHistory,
        effectiveHours,
        tankHeightCm(),
        capacityLiters(),
        100
    );
    return !points.isEmpty();
}

QString TankModel::getCsvPreview(int rangeHours) const
{
    const int effectiveHours = (rangeHours > 0) ? rangeHours : m_historyRangeHours;
    const auto points = HistoryExporter::processHistoricalData(
        m_trendHistory,
        effectiveHours,
        tankHeightCm(),
        capacityLiters(),
        100
    );
    return HistoryExporter::formatCsv(points);
}

QString TankModel::authoritativeAlarmState() const
{
    if (m_connectionState == QStringLiteral("Offline") ||
        m_sensorStatus == QStringLiteral("Disconnected") ||
        m_measurementState == QStringLiteral("TELEMETRY_UNAVAILABLE") ||
        m_measurementState == QStringLiteral("DISCONNECTED") ||
        !m_hasValidData) {
        return QStringLiteral("DISCONNECTED");
    }
    if (m_measurementState == QStringLiteral("SENSOR_ERROR") || m_sensorStatus == QStringLiteral("Fault")) {
        return QStringLiteral("SENSOR_ERROR");
    }
    if (m_measurementState == QStringLiteral("STALE") || m_sensorStatus == QStringLiteral("Stale")) {
        return QStringLiteral("STALE");
    }
    if (!m_alarmEvaluationEnabled) {
        return QStringLiteral("DISABLED");
    }
    if (m_currentAlarmState.isEmpty() || m_currentAlarmState == QStringLiteral("NONE")) {
        return evaluateWaterLevelAlarm(m_fillPercentage, m_criticalThresholdPercent, m_warningThresholdPercent, m_highThresholdPercent);
    }
    return m_currentAlarmState;
}

QString TankModel::telemetryHealthState() const
{
    if (m_connectionState != QStringLiteral("Connected")) {
        return QStringLiteral("DEVICE_OFFLINE");
    }
    if (m_sensorStatus == QStringLiteral("Fault") || m_measurementState == QStringLiteral("SENSOR_ERROR")) {
        return QStringLiteral("SENSOR_ERROR");
    }
    if (!m_hasValidData || !m_measurementValid) {
        return QStringLiteral("WAITING_FOR_DATA");
    }
    if (m_sensorStatus == QStringLiteral("Stale") || m_measurementState == QStringLiteral("STALE")) {
        return QStringLiteral("DATA_STALE");
    }
    return QStringLiteral("VALID");
}

void TankModel::setAlarmEvaluationEnabled(bool enabled)
{
    if (m_alarmEvaluationEnabled != enabled) {
        m_alarmEvaluationEnabled = enabled;
        emit alarmEvaluationEnabledChanged();
        deriveAlarmLevel();
    }
}

QString TankModel::evaluateWaterLevelAlarm(double level, double critical, double warning, double high)
{
    if (std::isnan(level) || std::isinf(level)) {
        return QStringLiteral("INVALID");
    }

    // Deterministic boundary conditions:
    // 0–9.99%: CRITICAL (level < critical)
    // 10.00–19.99%: WARNING (critical <= level < warning)
    // 20.00–90.00%: NORMAL (warning <= level <= high)
    // Above 90.00%: HIGH (level > high)
    if (level < (critical - 1e-9)) {
        return QStringLiteral("CRITICAL");
    }
    if (level < (warning - 1e-9)) {
        return QStringLiteral("WARNING");
    }
    if (level <= (high + 1e-9)) {
        return QStringLiteral("NORMAL");
    }
    return QStringLiteral("HIGH");
}

QString TankModel::evaluateWaterLevelAlarm(double level) const
{
    return evaluateWaterLevelAlarm(level, m_criticalThresholdPercent, m_warningThresholdPercent, m_highThresholdPercent);
}

bool TankModel::validateThresholdValues(double crit, double warn, double high, QString *errorMessage)
{
    if (std::isnan(crit) || std::isnan(warn) || std::isnan(high) ||
        std::isinf(crit) || std::isinf(warn) || std::isinf(high)) {
        if (errorMessage) *errorMessage = QStringLiteral("Threshold values must be valid numbers.");
        return false;
    }
    if (crit < 0.0) {
        if (errorMessage) *errorMessage = QStringLiteral("Critical threshold cannot be negative (< 0%).");
        return false;
    }
    if (high > 100.0) {
        if (errorMessage) *errorMessage = QStringLiteral("High threshold cannot exceed 100%.");
        return false;
    }
    if (crit >= warn) {
        if (errorMessage) *errorMessage = QStringLiteral("Critical threshold must be strictly less than Warning threshold.");
        return false;
    }
    if (warn >= high) {
        if (errorMessage) *errorMessage = QStringLiteral("Warning threshold must be strictly less than High threshold.");
        return false;
    }
    return true;
}

bool TankModel::validateThresholds(double crit, double warn, double high) const
{
    return validateThresholdValues(crit, warn, high, nullptr);
}

QString TankModel::getThresholdValidationError(double crit, double warn, double high) const
{
    QString err;
    validateThresholdValues(crit, warn, high, &err);
    return err;
}

void TankModel::processAlarmTransition(const QString &newState, double level)
{
    if (!m_hasReceivedFirstReading) {
        // INITIALIZATION RULE:
        // First valid telemetry reading immediately establishes current state.
        // Do NOT generate a historical alarm event merely because the application started.
        m_hasReceivedFirstReading = true;
        m_currentAlarmState = newState;

        if (newState == QStringLiteral("CRITICAL") || newState == QStringLiteral("WARNING") || newState == QStringLiteral("HIGH")) {
            updateActiveAlert(newState, level, true);
        } else {
            removeActiveWaterLevelAlert();
        }
        updateAlertCounts();
        return;
    }

    if (newState == m_currentAlarmState) {
        // Same state: NO TRANSITION, NO NEW ALARM HISTORY EVENT!
        if (m_currentAlarmState != QStringLiteral("NORMAL")) {
            updateActiveAlert(m_currentAlarmState, level, false);
        }
        return;
    }

    // Actual state transition
    QString oldState = m_currentAlarmState;
    m_currentAlarmState = newState;
    const QString nowStr = QDateTime::currentDateTime().toString(QStringLiteral("yyyy-MM-dd HH:mm:ss"));
    const QString name = m_tankName.isEmpty() ? QStringLiteral("Tank") : m_tankName;

    if (newState == QStringLiteral("NORMAL")) {
        removeActiveWaterLevelAlert();
        recordAlarmHistoryEvent(
            QStringLiteral("Water Level Recovered to Normal"),
            QStringLiteral("NORMAL"),
            level,
            QStringLiteral(">= %1%").arg(m_warningThresholdPercent, 0, 'f', 1),
            QStringLiteral("Resolved")
        );
        qInfo().noquote() << QStringLiteral("[%1] [NORMAL] [WATER_LEVEL_RECOVERED] - Water level nominal (Level: %2% >= %3%) for %4")
            .arg(nowStr).arg(level, 0, 'f', 1).arg(m_warningThresholdPercent, 0, 'f', 1).arg(name);
    } else if (newState == QStringLiteral("WARNING")) {
        updateActiveAlert(QStringLiteral("WARNING"), level, true);
        recordAlarmHistoryEvent(
            QStringLiteral("Water Level Low Warning"),
            QStringLiteral("WARNING"),
            level,
            QStringLiteral("< %1%").arg(m_warningThresholdPercent, 0, 'f', 1),
            QStringLiteral("Active")
        );
        qWarning().noquote() << QStringLiteral("[%1] [WARNING] [WATER_LEVEL_WARNING] - Water level low warning (Level: %2% < %3%) for %4")
            .arg(nowStr).arg(level, 0, 'f', 1).arg(m_warningThresholdPercent, 0, 'f', 1).arg(name);
    } else if (newState == QStringLiteral("CRITICAL")) {
        updateActiveAlert(QStringLiteral("CRITICAL"), level, true);
        recordAlarmHistoryEvent(
            QStringLiteral("Water Level Critically Low"),
            QStringLiteral("CRITICAL"),
            level,
            QStringLiteral("< %1%").arg(m_criticalThresholdPercent, 0, 'f', 1),
            QStringLiteral("Active")
        );
        qCritical().noquote() << QStringLiteral("[%1] [CRITICAL] [WATER_LEVEL_CRITICAL] - Water level critically low (Level: %2% < %3%) for %4")
            .arg(nowStr).arg(level, 0, 'f', 1).arg(m_criticalThresholdPercent, 0, 'f', 1).arg(name);
    } else if (newState == QStringLiteral("HIGH")) {
        updateActiveAlert(QStringLiteral("HIGH"), level, true);
        recordAlarmHistoryEvent(
            QStringLiteral("High Level / Overflow Warning"),
            QStringLiteral("HIGH"),
            level,
            QStringLiteral("> %1%").arg(m_highThresholdPercent, 0, 'f', 1),
            QStringLiteral("Active")
        );
        qWarning().noquote() << QStringLiteral("[%1] [WARNING] [OVERFLOW_WARNING] - Water level overflow (Level: %2% > %3%) for %4")
            .arg(nowStr).arg(level, 0, 'f', 1).arg(m_highThresholdPercent, 0, 'f', 1).arg(name);
    }

    updateAlertCounts();
}

void TankModel::updateActiveAlert(const QString &severity, double level, bool isNewTransition)
{
    QString alertId = (severity == QStringLiteral("CRITICAL")) ? QStringLiteral("ALT-WLI-CRIT")
                    : (severity == QStringLiteral("HIGH")) ? QStringLiteral("ALT-WLI-HIGH")
                    : QStringLiteral("ALT-WLI-WARN");

    QString title = (severity == QStringLiteral("CRITICAL")) ? QStringLiteral("Water Level Critically Low")
                  : (severity == QStringLiteral("HIGH")) ? QStringLiteral("High Level / Overflow Warning")
                  : QStringLiteral("Water Level Low Warning");

    QString description = (severity == QStringLiteral("CRITICAL"))
        ? QStringLiteral("Measured level is below the %1% critical threshold. Immediate refill required.")
            .arg(m_criticalThresholdPercent, 0, 'f', 1)
        : (severity == QStringLiteral("HIGH"))
            ? QStringLiteral("Measured water level exceeds the %1% high threshold.")
                .arg(m_highThresholdPercent, 0, 'f', 1)
            : QStringLiteral("Measured level is below the %1% warning threshold.")
                .arg(m_warningThresholdPercent, 0, 'f', 1);

    QString thresholdStr = (severity == QStringLiteral("CRITICAL"))
        ? QStringLiteral("< %1%").arg(m_criticalThresholdPercent, 0, 'f', 1)
        : (severity == QStringLiteral("HIGH"))
            ? QStringLiteral("> %1%").arg(m_highThresholdPercent, 0, 'f', 1)
            : QStringLiteral("< %1%").arg(m_warningThresholdPercent, 0, 'f', 1);

    QString nowTime = (m_lastUpdated.isEmpty() || m_lastUpdated == QStringLiteral("--"))
        ? QDateTime::currentDateTime().toString(QStringLiteral("hh:mm:ss AP"))
        : m_lastUpdated;

    int existingIdx = -1;
    for (int i = 0; i < m_activeAlerts.size(); ++i) {
        QVariantMap m = m_activeAlerts[i].toMap();
        if (m.value(QStringLiteral("type")).toString() == QStringLiteral("level")) {
            existingIdx = i;
            break;
        }
    }

    QVariantMap alert;
    bool wasAcked = false;
    if (existingIdx >= 0) {
        if (!isNewTransition) {
            wasAcked = m_activeAlerts[existingIdx].toMap().value(QStringLiteral("acknowledged")).toBool();
        }
    }

    alert[QStringLiteral("id")] = alertId;
    alert[QStringLiteral("tank")] = m_tankName;
    alert[QStringLiteral("severity")] = severity;
    alert[QStringLiteral("title")] = title;
    alert[QStringLiteral("alarm")] = title;
    alert[QStringLiteral("description")] = description;
    alert[QStringLiteral("currentValue")] = QStringLiteral("%1% (%2 cm)").arg(QString::number(level, 'f', 2), QString::number(m_currentHeight * 100.0, 'f', 1));
    alert[QStringLiteral("measuredValue")] = QStringLiteral("%1%").arg(QString::number(level, 'f', 2));
    alert[QStringLiteral("threshold")] = thresholdStr;
    alert[QStringLiteral("timestamp")] = nowTime;
    alert[QStringLiteral("acknowledged")] = wasAcked;
    alert[QStringLiteral("statusText")] = wasAcked ? QStringLiteral("Acknowledged") : (severity == QStringLiteral("CRITICAL") ? QStringLiteral("Active Alarm") : QStringLiteral("Active Warning"));
    alert[QStringLiteral("status")] = wasAcked ? QStringLiteral("Acknowledged") : QStringLiteral("Active");
    alert[QStringLiteral("type")] = QStringLiteral("level");

    if (severity == QStringLiteral("CRITICAL") || severity == QStringLiteral("HIGH")) {
        alert[QStringLiteral("badgeColor")] = QStringLiteral("#EF4444");
        alert[QStringLiteral("bgColor")] = QStringLiteral("#FEF2F2");
        alert[QStringLiteral("borderColor")] = QStringLiteral("#FECACA");
        alert[QStringLiteral("textColor")] = QStringLiteral("#991B1B");
    } else {
        alert[QStringLiteral("badgeColor")] = QStringLiteral("#F59E0B");
        alert[QStringLiteral("bgColor")] = QStringLiteral("#FFFBEB");
        alert[QStringLiteral("borderColor")] = QStringLiteral("#FDE68A");
        alert[QStringLiteral("textColor")] = QStringLiteral("#92400E");
    }

    if (existingIdx >= 0) {
        m_activeAlerts[existingIdx] = alert;
    } else {
        m_activeAlerts.prepend(alert);
    }
    emit activeAlertsChanged();
}

void TankModel::removeActiveWaterLevelAlert()
{
    bool removed = false;
    for (int i = m_activeAlerts.size() - 1; i >= 0; --i) {
        QVariantMap m = m_activeAlerts[i].toMap();
        if (m.value(QStringLiteral("type")).toString() == QStringLiteral("level")) {
            m_activeAlerts.removeAt(i);
            removed = true;
        }
    }
    if (removed) {
        emit activeAlertsChanged();
    }
}

void TankModel::recordAlarmHistoryEvent(const QString &title, const QString &severity, double level,
                                       const QString &thresholdStr, const QString &status)
{
    QString nowTime = (m_lastUpdated.isEmpty() || m_lastUpdated == QStringLiteral("--"))
        ? QDateTime::currentDateTime().toString(QStringLiteral("hh:mm:ss AP"))
        : m_lastUpdated;

    QVariantMap item;
    item[QStringLiteral("timestamp")] = nowTime;
    item[QStringLiteral("time")] = nowTime;
    item[QStringLiteral("tank")] = m_tankName;
    item[QStringLiteral("alarm")] = title;
    item[QStringLiteral("title")] = title;
    item[QStringLiteral("severity")] = severity;
    item[QStringLiteral("measuredValue")] = QStringLiteral("%1%").arg(QString::number(level, 'f', 2));
    item[QStringLiteral("value")] = item[QStringLiteral("measuredValue")];
    item[QStringLiteral("threshold")] = thresholdStr;
    item[QStringLiteral("status")] = status;

    m_alarmHistory.prepend(item);
    if (m_alarmHistory.size() > 50) {
        m_alarmHistory.removeLast();
    }
    emit alarmHistoryChanged();
}

void TankModel::updateAlertCounts()
{
    int active = 0;
    int crit = 0;
    int warn = 0;
    int high = 0;
    for (const auto &item : m_activeAlerts) {
        QVariantMap m = item.toMap();
        active++;
        QString sev = m.value(QStringLiteral("severity")).toString();
        if (sev == QStringLiteral("CRITICAL")) crit++;
        else if (sev == QStringLiteral("WARNING")) warn++;
        else if (sev == QStringLiteral("HIGH")) high++;
    }

    int resolved = 0;
    for (const auto &item : m_alarmHistory) {
        if (item.toMap().value(QStringLiteral("status")).toString() == QStringLiteral("Resolved")) {
            resolved++;
        }
    }

    bool changed = (m_activeAlertCount != active ||
                    m_criticalAlertCount != crit ||
                    m_warningAlertCount != warn ||
                    m_highAlertCount != high ||
                    m_resolvedAlertCount != resolved);

    m_activeAlertCount = active;
    m_criticalAlertCount = crit;
    m_warningAlertCount = warn;
    m_highAlertCount = high;
    m_resolvedAlertCount = resolved;

    if (changed) {
        emit alertCountsChanged();
    }
}

void TankModel::acknowledgeAlert(const QString &id)
{
    bool changed = false;
    for (int i = 0; i < m_activeAlerts.size(); ++i) {
        QVariantMap m = m_activeAlerts[i].toMap();
        if (m.value(QStringLiteral("id")).toString() == id) {
            m[QStringLiteral("acknowledged")] = true;
            m[QStringLiteral("statusText")] = QStringLiteral("Acknowledged");
            m[QStringLiteral("status")] = QStringLiteral("Acknowledged");
            m_activeAlerts[i] = m;
            changed = true;
            break;
        }
    }
    if (changed) {
        emit activeAlertsChanged();
    }
}

void TankModel::acknowledgeAllAlerts()
{
    bool changed = false;
    for (int i = 0; i < m_activeAlerts.size(); ++i) {
        QVariantMap m = m_activeAlerts[i].toMap();
        if (!m.value(QStringLiteral("acknowledged")).toBool()) {
            m[QStringLiteral("acknowledged")] = true;
            m[QStringLiteral("statusText")] = QStringLiteral("Acknowledged");
            m[QStringLiteral("status")] = QStringLiteral("Acknowledged");
            m_activeAlerts[i] = m;
            changed = true;
        }
    }
    if (changed) {
        emit activeAlertsChanged();
    }
}

void TankModel::clearResolvedAlerts()
{
    bool changed = false;
    for (int i = m_alarmHistory.size() - 1; i >= 0; --i) {
        if (m_alarmHistory[i].toMap().value(QStringLiteral("status")).toString() == QStringLiteral("Resolved")) {
            m_alarmHistory.removeAt(i);
            changed = true;
        }
    }
    if (changed) {
        emit alarmHistoryChanged();
        updateAlertCounts();
    }
}

} // namespace Panorama


