// TankRepository.cpp
#include "TankRepository.h"
#include "TankModel.h"
#include "Logger.h"
#include <QDateTime>
#include <cmath>

namespace Panorama {

namespace {
constexpr double MIN_WATER_LEVEL_METERS = 0.0;
constexpr double MAX_REASONABLE_WATER_LEVEL_METERS = 100.0;

constexpr double MIN_PRESSURE = 0.0;
}

TankRepository::TankRepository(Logger &logger, QObject *parent)
    : QObject(parent)
      , m_logger(logger)
{
}

void TankRepository::setTankModel(TankModel *model)
{
    m_tankModel = model;
}

void TankRepository::processReading(double waterLevel, double pressure, const QString &sensorStatus, qint64 timestampMs, bool isFresh)
{
    if (!isFresh) {
        if (m_tankModel) {
            const QString lastSeen = (m_lastMeasurementTimestamp > 0)
                ? QDateTime::fromMSecsSinceEpoch(m_lastMeasurementTimestamp).toLocalTime().toString(QStringLiteral("h:mm:ss AP"))
                : m_tankModel->lastUpdated();
            m_tankModel->applyOfflineState(m_tankModel->tankHeightCm(), m_tankModel->capacityLiters(), lastSeen);
        }
        return;
    }

    bool hasWaterLevel = false;

    if (validateWaterLevel(waterLevel)) {
        const double tankH = m_tankModel ? m_tankModel->tankHeight() : 0.0;
        m_cachedWaterLevel = ((tankH > 0.0 && waterLevel > tankH) || waterLevel > 2.0) ? (waterLevel / 100.0) : waterLevel;
        hasWaterLevel = true;
    } else {
        m_logger.logError(Logger::LogLevel::Warning, QStringLiteral("TankRepository: Rejected invalid water level: %1").arg(waterLevel));
    }

    if (validatePressure(pressure)) {
        m_cachedPressure = pressure;
        m_hasPressure = true;
    } else {
        m_logger.logError(Logger::LogLevel::Warning, QStringLiteral("TankRepository: Rejected invalid pressure: %1").arg(pressure));
    }

    if (sensorStatus == QStringLiteral("Healthy") ||
        sensorStatus == QStringLiteral("Fault") ||
        sensorStatus == QStringLiteral("Unknown")) {
        m_cachedSensorStatus = sensorStatus;
    } else {
        m_logger.logError(Logger::LogLevel::Warning, QStringLiteral("TankRepository: Rejected invalid sensor status: %1").arg(sensorStatus));
    }

    if (timestampMs > 0) {
        m_lastMeasurementTimestamp = timestampMs;
        m_lastMeasurementReceivedMs = QDateTime::currentMSecsSinceEpoch();
    }

    if (hasWaterLevel && m_tankModel) {
        m_tankModel->applyReading(
            true,
            m_cachedWaterLevel,
            false,
            0.0,
            m_hasPressure,
            m_cachedPressure,
            m_cachedSensorStatus
        );

        if (timestampMs > 0) {
            const QString timeStr = QDateTime::fromMSecsSinceEpoch(timestampMs).toLocalTime().toString(QStringLiteral("h:mm:ss AP"));
            m_tankModel->setLastUpdated(timeStr);
        }

        m_logger.logApplication(
            Logger::LogLevel::Debug,
            QStringLiteral("TankRepository: Water Height = %1 cm, Tank Height = %2 cm, Fill % = %3%, Volume = %4 L, Capacity = %5 L")
                .arg(m_tankModel->waterHeightCm(), 0, 'f', 2)
                .arg(m_tankModel->tankHeightCm(), 0, 'f', 2)
                .arg(m_tankModel->fillPercentage(), 0, 'f', 2)
                .arg(m_tankModel->waterVolumeLiters(), 0, 'f', 2)
                .arg(m_tankModel->capacityLiters(), 0, 'f', 2)
        );
    }
}

void TankRepository::processEsp32Status(const QJsonObject &statusObj)
{
    if (!m_tankModel) return;

    double waterLevelCm = 0.0;
    if (statusObj.contains(QStringLiteral("water_level_cm"))) {
        waterLevelCm = statusObj.value(QStringLiteral("water_level_cm")).toDouble();
    } else if (statusObj.contains(QStringLiteral("waterLevelCm"))) {
        waterLevelCm = statusObj.value(QStringLiteral("waterLevelCm")).toDouble();
    } else {
        // This payload lacks tank telemetry (e.g. it is a GNSS-only status emission from Ubidots fallback).
        return;
    }

    double levelPercent = 0.0;
    if (statusObj.contains(QStringLiteral("level_percent"))) {
        levelPercent = statusObj.value(QStringLiteral("level_percent")).toDouble();
    } else if (statusObj.contains(QStringLiteral("levelPercent"))) {
        levelPercent = statusObj.value(QStringLiteral("levelPercent")).toDouble();
    } else if (statusObj.contains(QStringLiteral("water_level_percent"))) {
        levelPercent = statusObj.value(QStringLiteral("water_level_percent")).toDouble();
    } else {
        m_logger.logError(Logger::LogLevel::Warning, QStringLiteral("[TankRepository][ERROR] Missing JSON field: level_percent"));
    }

    double volumeL = 0.0;
    if (statusObj.contains(QStringLiteral("tank_volume_l"))) {
        volumeL = statusObj.value(QStringLiteral("tank_volume_l")).toDouble();
    } else if (statusObj.contains(QStringLiteral("volume_l"))) {
        volumeL = statusObj.value(QStringLiteral("volume_l")).toDouble();
    } else if (statusObj.contains(QStringLiteral("volume_liters"))) {
        volumeL = statusObj.value(QStringLiteral("volume_liters")).toDouble();
    } else if (statusObj.contains(QStringLiteral("waterVolumeLiters"))) {
        volumeL = statusObj.value(QStringLiteral("waterVolumeLiters")).toDouble();
    }

    double tankHeightCm = (m_tankModel && m_tankModel->tankHeightCm() > 0.0)
                              ? m_tankModel->tankHeightCm()
                              : 50.0;
    if (statusObj.contains(QStringLiteral("tank_height_cm"))) {
        double h = statusObj.value(QStringLiteral("tank_height_cm")).toDouble(0.0);
        if (h > 0.0) tankHeightCm = h;
    } else if (statusObj.contains(QStringLiteral("tankHeightCm"))) {
        double h = statusObj.value(QStringLiteral("tankHeightCm")).toDouble(0.0);
        if (h > 0.0) tankHeightCm = h;
    }

    double capacityL = (m_tankModel && m_tankModel->capacityLiters() > 0.0)
                           ? m_tankModel->capacityLiters()
                           : 60.0;
    if (statusObj.contains(QStringLiteral("tank_capacity_l"))) {
        double c = statusObj.value(QStringLiteral("tank_capacity_l")).toDouble(0.0);
        if (c > 0.0) capacityL = c;
    } else if (statusObj.contains(QStringLiteral("tankCapacityL"))) {
        double c = statusObj.value(QStringLiteral("tankCapacityL")).toDouble(0.0);
        if (c > 0.0) capacityL = c;
    } else if (statusObj.contains(QStringLiteral("capacity_liters"))) {
        double c = statusObj.value(QStringLiteral("capacity_liters")).toDouble(0.0);
        if (c > 0.0) capacityL = c;
    }

    // Ensure volume is consistent with authoritative configured capacity
    if (volumeL <= 0.0 || (statusObj.contains(QStringLiteral("tank_capacity_l")) &&
                           std::abs(statusObj.value(QStringLiteral("tank_capacity_l")).toDouble(0.0) - capacityL) > 0.1)) {
        volumeL = (levelPercent / 100.0) * capacityL;
    }

    double pressureHpa = statusObj.value(QStringLiteral("pressure_hpa")).toDouble(1013.25);
    int statusInt = statusObj.value(QStringLiteral("sensor_status")).toInt(1);
    QString statusStr = (statusInt == 1) ? QStringLiteral("Healthy") : QStringLiteral("Fault");
    QString alarmState = statusObj.value(QStringLiteral("alarm_state")).toString(QStringLiteral("Normal"));

    // Defensive physical validation against impossible transient spikes (e.g. 161 cm on a 50 cm tank)
    const double effectiveTankHeight = (tankHeightCm > 0.0) ? tankHeightCm : 50.0;
    const double maxAllowedCm = effectiveTankHeight + std::max(5.0, effectiveTankHeight * 0.05);

    if (std::isnan(waterLevelCm) || std::isinf(waterLevelCm) || waterLevelCm < 0.0 || waterLevelCm > maxAllowedCm) {
        m_logger.logError(
            Logger::LogLevel::Warning,
            QStringLiteral("TankRepository: Discarding physically impossible water level reading: %1 cm (Tank Height: %2 cm). Retaining previous valid state.")
                .arg(waterLevelCm, 0, 'f', 2)
                .arg(effectiveTankHeight, 0, 'f', 2)
        );
        return;
    }

    bool measurementValid = statusObj.value(QStringLiteral("measurement_valid")).toBool(true);
    QString measurementState = statusObj.value(QStringLiteral("measurement_state")).toString(QStringLiteral("VALID"));
    if (measurementState.isEmpty()) {
        measurementState = QStringLiteral("VALID");
    }

    // If sensor is in fault/error, preserve last valid reading if available, and NEVER overwrite with 0.00!
    if (statusInt == 0 || measurementState == QStringLiteral("SENSOR_ERROR") || !measurementValid) {
        m_tankModel->setSensorStatus(QStringLiteral("Fault"));
        m_tankModel->setMeasurementState(QStringLiteral("SENSOR_ERROR"), false);
        if (m_tankModel->hasValidData()) {
            m_logger.logApplication(
                Logger::LogLevel::Warning,
                QStringLiteral("TankRepository: Sensor fault or error detected. Preserving last valid water level: %1 cm.")
                    .arg(m_tankModel->waterHeightCm(), 0, 'f', 2)
            );
        } else {
            m_logger.logApplication(
                Logger::LogLevel::Warning,
                QStringLiteral("TankRepository: Sensor fault or error detected on initial acquisition. Waiting for valid sensor data.")
            );
        }
        return;
    }

    // Check Data Freshness:
    qint64 measurementTimestamp = static_cast<qint64>(statusObj.value(QStringLiteral("timestamp")).toDouble(0));
    if (statusObj.contains(QStringLiteral("sensor_measurement_timestamp"))) {
        measurementTimestamp = static_cast<qint64>(statusObj.value(QStringLiteral("sensor_measurement_timestamp")).toDouble(0));
    }

    const qint64 nowMs = QDateTime::currentMSecsSinceEpoch();
    if (m_lastMeasurementTimestamp != 0 && measurementTimestamp == m_lastMeasurementTimestamp) {
        if (nowMs - m_lastMeasurementReceivedMs > 5000) {
            statusStr = QStringLiteral("Stale");
        }
    } else {
        m_lastMeasurementTimestamp = measurementTimestamp;
        m_lastMeasurementReceivedMs = nowMs;
    }

    m_logger.logApplication(
        Logger::LogLevel::Info,
        QStringLiteral("[TankRepository][LIVE] Applying: height = %1 cm, percentage = %2%, volume = %3 L, state = %4")
            .arg(waterLevelCm, 0, 'f', 2)
            .arg(levelPercent, 0, 'f', 2)
            .arg(volumeL, 0, 'f', 2)
            .arg(measurementState)
    );

    m_tankModel->applyAuthoritativeReading(
        waterLevelCm,
        levelPercent,
        volumeL,
        tankHeightCm,
        capacityL,
        pressureHpa,
        statusStr,
        alarmState,
        measurementState,
        measurementValid
    );

    if (measurementTimestamp > 0) {
        qint64 tsMs = measurementTimestamp;
        if (tsMs < 10000000000LL) tsMs *= 1000LL;
        const QString timeStr = QDateTime::fromMSecsSinceEpoch(tsMs).toLocalTime().toString(QStringLiteral("h:mm:ss AP"));
        m_tankModel->setLastUpdated(timeStr);
    }

    m_logger.logApplication(
        Logger::LogLevel::Info,
        QStringLiteral("[LIVE] timestamp=%1 height=%2 cm level=%3% volume=%4 L state=%5 valid=%6")
            .arg(QDateTime::currentDateTime().toString(QStringLiteral("yyyy-MM-dd HH:mm:ss")))
            .arg(waterLevelCm, 0, 'f', 2)
            .arg(levelPercent, 0, 'f', 2)
            .arg(volumeL, 0, 'f', 2)
            .arg(measurementState)
            .arg(measurementValid ? QStringLiteral("true") : QStringLiteral("false"))
    );
}

bool TankRepository::validateWaterLevel(double value) const
{
    if (std::isnan(value) || std::isinf(value) || value < 0.0) {
        return false;
    }
    // Normalize cm to meters if reported in cm (> 2.0)
    double valueMeters = (value > 2.0) ? (value / 100.0) : value;

    double maxLimitMeters = MAX_REASONABLE_WATER_LEVEL_METERS;
    if (m_tankModel && m_tankModel->tankHeight() > 0.0) {
        maxLimitMeters = m_tankModel->tankHeight() + std::max(0.05, m_tankModel->tankHeight() * 0.05);
    }
    return (valueMeters <= maxLimitMeters);
}



bool TankRepository::validatePressure(double value) const
{
    if (std::isnan(value) || std::isinf(value)) {
        return false;
    }
    return (value >= MIN_PRESSURE);
}

} // namespace Panorama