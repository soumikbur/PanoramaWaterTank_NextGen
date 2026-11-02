#pragma once

#include <QObject>
#include <QString>
#include <QJsonObject>
#include <QJsonDocument>
#include <qqml.h>

namespace Panorama {

/*!
 * \brief QML-facing single source of truth for tank geometry and current
 *        derived state (docs/05-implementation-blueprint.md, Section 1
 *        and Section 2).
 *
 * Exposed as a QML singleton. Fully implemented here (ahead of its
 * nominal Milestone 4 slot) because the dashboard redesign (docs/07)
 * requires real, bindable properties rather than hardcoded values - this
 * is a direct transcription of docs/05, Section 2's already-approved
 * property catalog, not new design.
 *
 * Every property is technically settable at the C++ level (needed for a
 * future SettingsManager/TankRepository to push values in) but is
 * read-only from QML by convention (docs/05, Section 2's resolution): a
 * future Settings page writes through SettingsManager, never directly
 * through TankModel.
 *
 * ApiClient/TankRepository are not wired to this class yet (that is
 * Milestone 5's networking work), so connectionState/fillPercentage/etc.
 * currently hold their documented defaults rather than live sensor
 * values - the bindings are real, the data just has nothing feeding it
 * yet.
 */
class TankModel : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

           // Geometry & Configuration Model
    Q_PROPERTY(QString tankName READ tankName WRITE setTankName NOTIFY tankNameChanged)
    Q_PROPERTY(QString deviceLabel READ deviceLabel WRITE setDeviceLabel NOTIFY deviceLabelChanged)
    Q_PROPERTY(QString tankShape READ tankShape NOTIFY tankShapeChanged)
    Q_PROPERTY(int tankShapeId READ tankShapeId NOTIFY tankShapeChanged)
    Q_PROPERTY(double tankRadius READ tankRadius NOTIFY tankRadiusChanged)
    Q_PROPERTY(double tankHeight READ tankHeight NOTIFY tankHeightChanged)
    Q_PROPERTY(double tankDiameterCm READ tankDiameterCm NOTIFY tankDiameterChanged)
    Q_PROPERTY(double tankWidthCm READ tankWidthCm NOTIFY tankDimensionsChanged)
    Q_PROPERTY(double tankLengthCm READ tankLengthCm NOTIFY tankDimensionsChanged)
    Q_PROPERTY(double warningThresholdPercent READ warningThresholdPercent NOTIFY alarmThresholdsChanged)
    Q_PROPERTY(double criticalThresholdPercent READ criticalThresholdPercent NOTIFY alarmThresholdsChanged)
    Q_PROPERTY(double highThresholdPercent READ highThresholdPercent NOTIFY alarmThresholdsChanged)

           // Engineering
    Q_PROPERTY(double tankArea READ tankArea NOTIFY tankAreaChanged)
    Q_PROPERTY(double maximumVolume READ maximumVolume NOTIFY maximumVolumeChanged)
    Q_PROPERTY(double currentHeight READ currentHeight NOTIFY currentHeightChanged)
    Q_PROPERTY(double currentVolume READ currentVolume NOTIFY currentVolumeChanged)
    Q_PROPERTY(double waterHeightCm READ waterHeightCm NOTIFY currentHeightChanged)
    Q_PROPERTY(double tankHeightCm READ tankHeightCm NOTIFY tankHeightChanged)
    Q_PROPERTY(double waterVolumeLiters READ waterVolumeLiters NOTIFY currentVolumeChanged)
    Q_PROPERTY(double capacityLiters READ capacityLiters NOTIFY maximumVolumeChanged)
    Q_PROPERTY(double fillPercentage READ fillPercentage NOTIFY fillPercentageChanged)
    Q_PROPERTY(double rawFillPercentage READ rawFillPercentage NOTIFY fillPercentageChanged)
    Q_PROPERTY(double tankRadiusCm READ tankRadiusCm NOTIFY tankRadiusChanged)
    Q_PROPERTY(double emptyPercentage READ emptyPercentage NOTIFY emptyPercentageChanged)
    Q_PROPERTY(double remainingVolume READ remainingVolume NOTIFY remainingVolumeChanged)
    Q_PROPERTY(QString capacityRank READ capacityRank NOTIFY capacityRankChanged)

           // Status & alarm
    Q_PROPERTY(QString alarmLevel READ alarmLevel NOTIFY alarmLevelChanged)
    Q_PROPERTY(QString authoritativeAlarmState READ authoritativeAlarmState NOTIFY alarmLevelChanged)
    Q_PROPERTY(QString sensorStatus READ sensorStatus NOTIFY sensorStatusChanged)
    Q_PROPERTY(bool alarmEvaluationEnabled READ alarmEvaluationEnabled WRITE setAlarmEvaluationEnabled NOTIFY alarmEvaluationEnabledChanged)
    Q_PROPERTY(QVariantList activeAlerts READ activeAlerts NOTIFY activeAlertsChanged)
    Q_PROPERTY(QVariantList alarmHistory READ alarmHistory NOTIFY alarmHistoryChanged)
    Q_PROPERTY(int activeAlertCount READ activeAlertCount NOTIFY alertCountsChanged)
    Q_PROPERTY(int criticalAlertCount READ criticalAlertCount NOTIFY alertCountsChanged)
    Q_PROPERTY(int warningAlertCount READ warningAlertCount NOTIFY alertCountsChanged)
    Q_PROPERTY(int highAlertCount READ highAlertCount NOTIFY alertCountsChanged)
    Q_PROPERTY(int resolvedAlertCount READ resolvedAlertCount NOTIFY alertCountsChanged)

           // API-sourced
    Q_PROPERTY(double pressure READ pressure NOTIFY pressureChanged)
    Q_PROPERTY(bool hasPressure READ hasPressure NOTIFY hasPressureChanged)

           // Connection
    Q_PROPERTY(QString connectionState READ connectionState NOTIFY connectionStateChanged)
    Q_PROPERTY(uint lastSyncedSequence READ lastSyncedSequence WRITE setLastSyncedSequence NOTIFY lastSyncedSequenceChanged)
    Q_PROPERTY(bool isSyncing READ isSyncing WRITE setIsSyncing NOTIFY isSyncingChanged)

           // Display / time / trend
    Q_PROPERTY(QString lastUpdated READ lastUpdated NOTIFY lastUpdatedChanged)
    Q_PROPERTY(QVariantList trendHistory READ trendHistory NOTIFY trendHistoryChanged)
    Q_PROPERTY(QVariantList composedTrendHistory READ composedTrendHistory NOTIFY composedTrendHistoryChanged)
    Q_PROPERTY(QString measurementState READ measurementState NOTIFY measurementStateChanged)
    Q_PROPERTY(bool measurementValid READ measurementValid NOTIFY measurementValidChanged)
    Q_PROPERTY(double lastValidWaterHeightCm READ lastValidWaterHeightCm NOTIFY lastValidMeasurementChanged)
    Q_PROPERTY(double lastValidFillPercentage READ lastValidFillPercentage NOTIFY lastValidMeasurementChanged)
    Q_PROPERTY(int historyRangeHours READ historyRangeHours WRITE setHistoryRangeHours NOTIFY historyRangeHoursChanged)
    Q_PROPERTY(bool hasValidData READ hasValidData NOTIFY hasValidDataChanged)
    Q_PROPERTY(bool dataAvailable READ hasValidData NOTIFY hasValidDataChanged)
    Q_PROPERTY(QString telemetryHealthState READ telemetryHealthState NOTIFY telemetryHealthStateChanged)

public:
    explicit TankModel(QObject *parent = nullptr);

    QString tankName() const { return m_tankName; }
    QString deviceLabel() const { return m_deviceLabel; }
    QString tankShape() const { return m_tankShape; }
    int tankShapeId() const { return m_tankShapeId; }
    double tankRadius() const { return m_tankRadius; }
    double tankRadiusCm() const { return m_tankRadius * 100.0; }
    double tankDiameterCm() const { return m_tankDiameterCm; }
    double tankWidthCm() const { return m_tankWidthCm; }
    double tankLengthCm() const { return m_tankLengthCm; }
    double tankHeight() const { return m_tankHeight; }
    double warningThresholdPercent() const { return m_warningThresholdPercent; }
    double criticalThresholdPercent() const { return m_criticalThresholdPercent; }
    double highThresholdPercent() const { return m_highThresholdPercent; }

    double tankArea() const { return m_tankArea; }
    double maximumVolume() const { return m_maximumVolume; }
    double currentHeight() const { return m_currentHeight; }
    double currentVolume() const { return m_currentVolume; }
    double waterHeightCm() const { return m_currentHeight * 100.0; }
    double tankHeightCm() const { return m_tankHeight * 100.0; }
    double waterVolumeLiters() const { return m_currentVolume; }
    double capacityLiters() const { return m_maximumVolume; }
    double fillPercentage() const { return m_fillPercentage; }
    double rawFillPercentage() const { return m_fillPercentageRaw; }
    double emptyPercentage() const { return m_emptyPercentage; }
    double remainingVolume() const { return m_remainingVolume; }
    QString capacityRank() const { return m_capacityRank; }

    QString alarmLevel() const { return m_alarmLevel; }
    QString authoritativeAlarmState() const;
    QString telemetryHealthState() const;
    QString sensorStatus() const { return m_sensorStatus; }
    bool alarmEvaluationEnabled() const { return m_alarmEvaluationEnabled; }
    QVariantList activeAlerts() const { return m_activeAlerts; }
    QVariantList alarmHistory() const { return m_alarmHistory; }
    int activeAlertCount() const { return m_activeAlertCount; }
    int criticalAlertCount() const { return m_criticalAlertCount; }
    int warningAlertCount() const { return m_warningAlertCount; }
    int highAlertCount() const { return m_highAlertCount; }
    int resolvedAlertCount() const { return m_resolvedAlertCount; }

    double pressure() const { return m_pressure; }
    bool hasPressure() const { return m_hasPressure; }

    QString connectionState() const { return m_connectionState; }

    QString lastUpdated() const { return m_lastUpdated; }
    QVariantList trendHistory() const { return m_trendHistory; }
    QVariantList composedTrendHistory() const { return m_composedTrendHistory.isEmpty() ? m_trendHistory : m_composedTrendHistory; }
    QString measurementState() const { return m_measurementState; }
    bool measurementValid() const { return m_measurementValid; }
    double lastValidWaterHeightCm() const { return m_lastValidWaterHeightCm; }
    double lastValidFillPercentage() const { return m_lastValidFillPercentage; }
    int historyRangeHours() const { return m_historyRangeHours; }
    bool hasValidData() const { return m_hasValidData; }
    uint lastSyncedSequence() const { return m_lastSyncedSequence; }
    bool isSyncing() const { return m_isSyncing; }

    void setTankName(const QString &name);
    void setDeviceLabel(const QString &label);
    void setTankRadius(double radiusMeters);
    void setTankHeight(double heightMeters);
    void setConnectionState(const QString &state);
    void setTrendHistory(const QVariantList &history);
    void appendTrendHistory(const QVariantList &history);
    void setLastSyncedSequence(uint seq);
    void setIsSyncing(bool syncing);
    void setHistoryRangeHours(int hours);
    void setMeasurementState(const QString &state, bool valid);
    void composeTrendHistory();

    Q_INVOKABLE void updateTankConfiguration(int shapeId, double heightCm, double diameterCm,
                                            double widthCm, double lengthCm, double capacityL,
                                            double warnPct, double critPct, double highPct);
    Q_INVOKABLE void applyConfigJson(const QJsonObject &configObj);

    Q_INVOKABLE void refreshTrend();
    Q_INVOKABLE QVariantMap exportHistoryCsv(const QString &filePath, int rangeHours = 0);
    Q_INVOKABLE QString defaultCsvFilename(int rangeHours = 0) const;
    Q_INVOKABLE bool hasHistoricalData(int rangeHours = 0) const;
    Q_INVOKABLE QString getCsvPreview(int rangeHours = 0) const;

    void applyReading(bool hasWaterLevelVal, double waterLevelVal, bool hasHeightVal, double heightVal,
                      bool hasPressureVal, double pressureVal, const QString &sensorStatus);

    void setSensorStatus(const QString &status) {
        if (!status.isEmpty() && status != m_sensorStatus) {
            m_sensorStatus = status;
            emit sensorStatusChanged();
            touchLastUpdated();
        }
    }

    void applyAuthoritativeReading(double waterLevelCm, double levelPercentage, double volumeLiters,
                                  double tankHeightCm, double capacityLiters, double pressureVal,
                                  const QString &sensorStatus, const QString &alarmLevel,
                                  const QString &measurementState = QStringLiteral("VALID"),
                                  bool measurementValid = true);

    void setLastUpdated(const QString &time);
    void applyOfflineState(double maxHeightCm, double capacityLiters, const QString &lastSeenTime);

    void setAlarmEvaluationEnabled(bool enabled);

    static QString evaluateWaterLevelAlarm(double level, double critical, double warning, double high);
    Q_INVOKABLE QString evaluateWaterLevelAlarm(double level) const;

    static bool validateThresholdValues(double crit, double warn, double high, QString *errorMessage = nullptr);
    Q_INVOKABLE bool validateThresholds(double crit, double warn, double high) const;
    Q_INVOKABLE QString getThresholdValidationError(double crit, double warn, double high) const;

    Q_INVOKABLE void acknowledgeAlert(const QString &id);
    Q_INVOKABLE void acknowledgeAllAlerts();
    Q_INVOKABLE void clearResolvedAlerts();

signals:
    void tankNameChanged();
    void deviceLabelChanged();
    void tankShapeChanged();
    void tankDiameterChanged();
    void tankDimensionsChanged();
    void alarmThresholdsChanged();
    void alarmEvaluationEnabledChanged();
    void activeAlertsChanged();
    void alarmHistoryChanged();
    void alertCountsChanged();
    void tankRadiusChanged();
    void tankHeightChanged();
    void tankAreaChanged();
    void maximumVolumeChanged();
    void currentHeightChanged();
    void currentVolumeChanged();
    void fillPercentageChanged();
    void emptyPercentageChanged();
    void remainingVolumeChanged();
    void capacityRankChanged();
    void alarmLevelChanged();
    void sensorStatusChanged();
    void pressureChanged();
    void hasPressureChanged();
    void connectionStateChanged();
    void lastUpdatedChanged();
    void trendHistoryChanged();
    void composedTrendHistoryChanged();
    void measurementStateChanged();
    void measurementValidChanged();
    void lastValidMeasurementChanged();
    void historyRangeHoursChanged(int hours);
    void trendRefreshRequested();
    void hasValidDataChanged();
    void telemetryHealthStateChanged();
    void lastSyncedSequenceChanged();
    void isSyncingChanged();


private:
    void recalculateGeometry();
    void recalculateFromHeight(double heightMeters);
    void recalculateFromVolume(double volumeLiters);
    void deriveCapacityRank();
    void deriveAlarmLevel();
    void touchLastUpdated();
    void processAlarmTransition(const QString &newState, double level);
    void updateActiveAlert(const QString &severity, double level, bool isNewTransition = false);
    void removeActiveWaterLevelAlert();
    void recordAlarmHistoryEvent(const QString &title, const QString &severity, double level,
                                const QString &thresholdStr, const QString &status);
    void updateAlertCounts();

    QString m_tankName = QStringLiteral("Panorama Water Tank");
    QString m_deviceLabel = QStringLiteral("esp32s3");
    QString m_tankShape = QStringLiteral("CYLINDER");
    int m_tankShapeId = 0; // 0=Cylinder, 1=Rectangle, 2=Custom
    double m_tankRadius = 0.11283791670955126; // meters
    double m_tankDiameterCm = 22.5676; // cm
    double m_tankWidthCm = 0.0; // cm
    double m_tankLengthCm = 0.0; // cm
    double m_tankHeight = 0.50; // Physical tank height = 50 cm (0.50 m)
    double m_warningThresholdPercent = 20.0;
    double m_criticalThresholdPercent = 10.0;
    double m_highThresholdPercent = 90.0;


    double m_tankArea = 0.0;
    double m_maximumVolume = 0.0;
    double m_currentHeight = 0.0;
    double m_currentVolume = 0.0;
    double m_fillPercentage = 0.0;
    double m_fillPercentageRaw = 0.0;
    double m_emptyPercentage = 100.0;
    double m_remainingVolume = 0.0;
    QString m_capacityRank = QStringLiteral("Empty");

    QString m_alarmLevel;
    QString m_sensorStatus;
    QString m_measurementState = QStringLiteral("NO_MEASUREMENT");
    bool m_measurementValid = false;
    double m_lastValidWaterHeightCm = 0.0;
    double m_lastValidFillPercentage = 0.0;

    double m_pressure = 0.0;
    bool m_hasPressure = false;

    QString m_connectionState = QStringLiteral("Connecting");

    QString m_lastUpdated = QStringLiteral("--");
    QVariantList m_trendHistory;
    QVariantList m_composedTrendHistory;
    int m_historyRangeHours{12};
    bool m_hasValidData{false};
    uint m_lastSyncedSequence{0};
    bool m_isSyncing{false};

    bool m_alarmEvaluationEnabled = true;
    bool m_hasReceivedFirstReading = false;
    QString m_currentAlarmState = QStringLiteral("NONE");
    QVariantList m_activeAlerts;
    QVariantList m_alarmHistory;
    int m_activeAlertCount = 0;
    int m_criticalAlertCount = 0;
    int m_warningAlertCount = 0;
    int m_highAlertCount = 0;
    int m_resolvedAlertCount = 0;
};


} // namespace Panorama
