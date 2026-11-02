// TankRepository.h
#ifndef PANORAMA_TANKREPOSITORY_H
#define PANORAMA_TANKREPOSITORY_H

#include <QObject>
#include <QString>
#include <QJsonObject>

namespace Panorama {

class TankModel;
class Logger;

class TankRepository : public QObject
{
    Q_OBJECT

public:
    explicit TankRepository(Logger &logger, QObject *parent = nullptr);

    void setTankModel(TankModel *model);

public slots:
    void processReading(double waterLevel, double pressure, const QString &sensorStatus, qint64 timestampMs = 0, bool isFresh = true);
    void processEsp32Status(const QJsonObject &statusObj);

private:
    [[nodiscard]] bool validateWaterLevel(double value) const;
    [[nodiscard]] bool validatePressure(double value) const;

    Logger &m_logger;
    TankModel *m_tankModel{nullptr};

    double m_cachedWaterLevel{0.0};
    double m_cachedPressure{0.0};
    bool m_hasPressure{false};
    QString m_cachedSensorStatus;
    qint64 m_lastMeasurementTimestamp{0};
    qint64 m_lastMeasurementReceivedMs{0};
};


} // namespace Panorama

#endif // PANORAMA_TANKREPOSITORY_H