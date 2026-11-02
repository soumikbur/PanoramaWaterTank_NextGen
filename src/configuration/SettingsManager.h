#pragma once

#include <QObject>
#include <QSettings>
#include <QString>

namespace Panorama {

class Logger;

class SettingsManager : public QObject
{
    Q_OBJECT

           // API
    Q_PROPERTY(QString apiBaseUrl READ apiBaseUrl WRITE setApiBaseUrl NOTIFY apiBaseUrlChanged)
    Q_PROPERTY(QString apiToken READ apiToken WRITE setApiToken NOTIFY apiTokenChanged)
    Q_PROPERTY(QString deviceLabel READ deviceLabel WRITE setDeviceLabel NOTIFY deviceLabelChanged)
    Q_PROPERTY(QString dataSourceId READ dataSourceId WRITE setDataSourceId NOTIFY dataSourceIdChanged)

           // ESP32 Direct REST API
    Q_PROPERTY(QString esp32Host READ esp32Host WRITE setEsp32Host NOTIFY esp32HostChanged)
    Q_PROPERTY(int esp32Port READ esp32Port WRITE setEsp32Port NOTIFY esp32PortChanged)
    Q_PROPERTY(bool useDirectEsp32 READ useDirectEsp32 WRITE setUseDirectEsp32 NOTIFY useDirectEsp32Changed)

           // MQTT Configuration
    Q_PROPERTY(bool mqttEnabled READ mqttEnabled WRITE setMqttEnabled NOTIFY mqttEnabledChanged)
    Q_PROPERTY(QString mqttBroker READ mqttBroker WRITE setMqttBroker NOTIFY mqttBrokerChanged)
    Q_PROPERTY(int mqttPort READ mqttPort WRITE setMqttPort NOTIFY mqttPortChanged)
    Q_PROPERTY(QString mqttTopic READ mqttTopic WRITE setMqttTopic NOTIFY mqttTopicChanged)
    Q_PROPERTY(bool mqttTlsEnabled READ mqttTlsEnabled WRITE setMqttTlsEnabled NOTIFY mqttTlsEnabledChanged)
    Q_PROPERTY(bool mqttVerifyCertificate READ mqttVerifyCertificate WRITE setMqttVerifyCertificate NOTIFY mqttVerifyCertificateChanged)
    Q_PROPERTY(QString mqttUsername READ mqttUsername WRITE setMqttUsername NOTIFY mqttUsernameChanged)
    Q_PROPERTY(QString mqttPassword READ mqttPassword WRITE setMqttPassword NOTIFY mqttPasswordChanged)
    Q_PROPERTY(QString mqttClientId READ mqttClientId WRITE setMqttClientId NOTIFY mqttClientIdChanged)

           // Telemetry Variables
    Q_PROPERTY(QString levelVariable READ levelVariable WRITE setLevelVariable NOTIFY levelVariableChanged)
    Q_PROPERTY(QString volumeVariable READ volumeVariable WRITE setVolumeVariable NOTIFY volumeVariableChanged)
    Q_PROPERTY(QString distanceVariable READ distanceVariable WRITE setDistanceVariable NOTIFY distanceVariableChanged)

    Q_PROPERTY(QString pressureVariable READ pressureVariable WRITE setPressureVariable NOTIFY pressureVariableChanged)
    Q_PROPERTY(QString statusVariable READ statusVariable WRITE setStatusVariable NOTIFY statusVariableChanged)

    Q_PROPERTY(QString readingType READ readingType WRITE setReadingType NOTIFY readingTypeChanged)
    Q_PROPERTY(double sensorMountingOffset READ sensorMountingOffset WRITE setSensorMountingOffset NOTIFY sensorMountingOffsetChanged)

    Q_PROPERTY(int refreshIntervalMs READ refreshIntervalMs WRITE setRefreshIntervalMs NOTIFY refreshIntervalMsChanged)
    Q_PROPERTY(int timeoutMs READ timeoutMs WRITE setTimeoutMs NOTIFY timeoutMsChanged)

           // Tank Configuration
    Q_PROPERTY(QString tankName READ tankName WRITE setTankName NOTIFY tankNameChanged)
    Q_PROPERTY(QString tankShape READ tankShape WRITE setTankShape NOTIFY tankShapeChanged)
    Q_PROPERTY(int tankShapeId READ tankShapeId WRITE setTankShapeId NOTIFY tankShapeChanged)
    Q_PROPERTY(double tankRadius READ tankRadius WRITE setTankRadius NOTIFY tankRadiusChanged)
    Q_PROPERTY(double tankHeight READ tankHeight WRITE setTankHeight NOTIFY tankHeightChanged)
    Q_PROPERTY(double tankDiameterCm READ tankDiameterCm WRITE setTankDiameterCm NOTIFY tankDiameterChanged)
    Q_PROPERTY(double tankWidthCm READ tankWidthCm WRITE setTankWidthCm NOTIFY tankDimensionsChanged)
    Q_PROPERTY(double tankLengthCm READ tankLengthCm WRITE setTankLengthCm NOTIFY tankDimensionsChanged)
    Q_PROPERTY(double tankCapacityLiters READ tankCapacityLiters WRITE setTankCapacityLiters NOTIFY tankCapacityChanged)
    Q_PROPERTY(double warningThresholdPercent READ warningThresholdPercent WRITE setWarningThresholdPercent NOTIFY alarmThresholdsChanged)
    Q_PROPERTY(double criticalThresholdPercent READ criticalThresholdPercent WRITE setCriticalThresholdPercent NOTIFY alarmThresholdsChanged)
    Q_PROPERTY(double highThresholdPercent READ highThresholdPercent WRITE setHighThresholdPercent NOTIFY alarmThresholdsChanged)

           // Logging
    Q_PROPERTY(QString logLevel READ logLevel WRITE setLogLevel NOTIFY logLevelChanged)
    Q_PROPERTY(int logRetentionDays READ logRetentionDays WRITE setLogRetentionDays NOTIFY logRetentionDaysChanged)

           // Theme
    Q_PROPERTY(QString theme READ theme WRITE setTheme NOTIFY themeChanged)
    Q_PROPERTY(bool sidebarCollapsed READ sidebarCollapsed WRITE setSidebarCollapsed NOTIFY sidebarCollapsedChanged)

           // Google Maps
    Q_PROPERTY(QString googleMapsApiKey READ googleMapsApiKey WRITE setGoogleMapsApiKey NOTIFY googleMapsApiKeyChanged)

public:
    explicit SettingsManager(Logger &logger, QObject *parent = nullptr);

    QString apiBaseUrl() const;
    QString apiToken() const { return m_apiToken; }
    QString deviceLabel() const { return m_deviceLabel; }
    QString dataSourceId() const { return m_dataSourceId; }

    QString esp32Host() const { return m_esp32Host; }
    int esp32Port() const { return m_esp32Port; }
    bool useDirectEsp32() const { return m_useDirectEsp32; }

    bool mqttEnabled() const { return m_mqttEnabled; }
    QString mqttBroker() const { return m_mqttBroker; }
    int mqttPort() const { return m_mqttPort; }
    QString mqttTopic() const { return m_mqttTopic; }
    bool mqttTlsEnabled() const { return m_mqttTlsEnabled; }
    bool mqttVerifyCertificate() const { return m_mqttVerifyCertificate; }
    QString mqttUsername() const { return m_mqttUsername; }
    QString mqttPassword() const { return m_mqttPassword; }
    QString mqttClientId() const { return m_mqttClientId; }

    QString levelVariable() const { return m_levelVariable; }
    QString volumeVariable() const { return m_volumeVariable; }
    QString distanceVariable() const { return m_distanceVariable; }

    QString pressureVariable() const { return m_pressureVariable; }
    QString statusVariable() const { return m_statusVariable; }

    QString readingType() const { return m_readingType; }
    double sensorMountingOffset() const { return m_sensorMountingOffset; }

    int refreshIntervalMs() const { return m_refreshIntervalMs; }
    int timeoutMs() const { return m_timeoutMs; }

    QString tankName() const { return m_tankName; }
    QString tankShape() const { return m_tankShape; }
    int tankShapeId() const { return m_tankShapeId; }
    double tankRadius() const { return m_tankRadius; }
    double tankHeight() const { return m_tankHeight; }
    double tankDiameterCm() const { return m_tankDiameterCm; }
    double tankWidthCm() const { return m_tankWidthCm; }
    double tankLengthCm() const { return m_tankLengthCm; }
    double tankCapacityLiters() const { return m_tankCapacityLiters; }
    double warningThresholdPercent() const { return m_warningThresholdPercent; }
    double criticalThresholdPercent() const { return m_criticalThresholdPercent; }
    double highThresholdPercent() const { return m_highThresholdPercent; }

    QString logLevel() const { return m_logLevel; }
    int logRetentionDays() const { return m_logRetentionDays; }

    QString theme() const { return m_theme; }
    bool sidebarCollapsed() const { return m_sidebarCollapsed; }
    QString googleMapsApiKey() const { return m_googleMapsApiKey; }

public slots:
    void setApiBaseUrl(const QString &url);
    void setApiToken(const QString &token);
    void setDeviceLabel(const QString &label);
    void setDataSourceId(const QString &id);

    void setEsp32Host(const QString &host);
    void setEsp32Port(int port);
    void setUseDirectEsp32(bool direct);

    void setMqttEnabled(bool enabled);
    void setMqttBroker(const QString &broker);
    void setMqttPort(int port);
    void setMqttTopic(const QString &topic);
    void setMqttTlsEnabled(bool enabled);
    void setMqttVerifyCertificate(bool verify);
    void setMqttUsername(const QString &username);
    void setMqttPassword(const QString &password);
    void setMqttClientId(const QString &id);

    void setLevelVariable(const QString &variable);
    void setVolumeVariable(const QString &variable);
    void setDistanceVariable(const QString &variable);

    void setPressureVariable(const QString &variable);
    void setStatusVariable(const QString &variable);

    void setReadingType(const QString &type);
    void setSensorMountingOffset(double offset);

    void setRefreshIntervalMs(int ms);
    void setTimeoutMs(int ms);

    void setTankName(const QString &name);
    void setTankShape(const QString &shape);
    void setTankShapeId(int id);
    void setTankRadius(double meters);
    void setTankHeight(double meters);
    void setTankDiameterCm(double cm);
    void setTankWidthCm(double cm);
    void setTankLengthCm(double cm);
    void setTankCapacityLiters(double liters);
    void setWarningThresholdPercent(double pct);
    void setCriticalThresholdPercent(double pct);
    void setHighThresholdPercent(double pct);

    void setLogLevel(const QString &level);
    void setLogRetentionDays(int days);

    void setTheme(const QString &theme);
    void setSidebarCollapsed(bool collapsed);
    void setGoogleMapsApiKey(const QString &key);

signals:
    void apiBaseUrlChanged();
    void apiTokenChanged();
    void deviceLabelChanged();
    void dataSourceIdChanged();
    void esp32HostChanged();
    void esp32PortChanged();
    void useDirectEsp32Changed();

    void mqttEnabledChanged();
    void mqttBrokerChanged();
    void mqttPortChanged();
    void mqttTopicChanged();
    void mqttTlsEnabledChanged();
    void mqttVerifyCertificateChanged();
    void mqttUsernameChanged();
    void mqttPasswordChanged();
    void mqttClientIdChanged();
    void levelVariableChanged();
    void volumeVariableChanged();
    void distanceVariableChanged();

    void pressureVariableChanged();
    void statusVariableChanged();
    void readingTypeChanged();
    void sensorMountingOffsetChanged();
    void refreshIntervalMsChanged();
    void timeoutMsChanged();
    void tankShapeChanged();
    void tankDiameterChanged();
    void tankDimensionsChanged();
    void tankCapacityChanged();
    void alarmThresholdsChanged();

    void tankNameChanged();
    void tankRadiusChanged();
    void tankHeightChanged();

    void logLevelChanged();
    void logRetentionDaysChanged();

    void themeChanged();
    void sidebarCollapsedChanged();
    void googleMapsApiKeyChanged();

private:
    void loadAll();
    void rejected(const QString &settingName, const QString &reason) const;
    void accepted(const QString &settingName) const;

    static bool isValidReadingType(const QString &value);
    static bool isValidLogLevel(const QString &value);
    static bool isValidTheme(const QString &value);

    Logger &m_logger;
    QSettings m_settings;

    QString m_apiBaseUrl;
    QString m_apiToken;
    QString m_deviceLabel;
    QString m_dataSourceId;

    QString m_esp32Host;
    int m_esp32Port = 80;
    bool m_useDirectEsp32 = true;

    bool m_mqttEnabled = true;
    QString m_mqttBroker;
    int m_mqttPort = 8883;
    QString m_mqttTopic;
    bool m_mqttTlsEnabled = true;
    bool m_mqttVerifyCertificate = true;
    QString m_mqttUsername;
    QString m_mqttPassword;
    QString m_mqttClientId;

    QString m_levelVariable;
    QString m_volumeVariable;
    QString m_distanceVariable;

    QString m_pressureVariable;
    QString m_statusVariable;

    QString m_readingType;
    double m_sensorMountingOffset = 0.0;

    int m_refreshIntervalMs = 1000;
    int m_timeoutMs = 10000;

    QString m_tankName;
    QString m_tankShape = QStringLiteral("CYLINDER");
    int m_tankShapeId = 0;
    double m_tankRadius = 0.11283791670955126;
    double m_tankHeight = 0.50;
    double m_tankDiameterCm = 22.5676;
    double m_tankWidthCm = 0.0;
    double m_tankLengthCm = 0.0;
    double m_tankCapacityLiters = 20.0;
    double m_warningThresholdPercent = 20.0;
    double m_criticalThresholdPercent = 10.0;
    double m_highThresholdPercent = 90.0;

    QString m_logLevel;
    int m_logRetentionDays = 30;

    QString m_theme;
    bool m_sidebarCollapsed = false;
    QString m_googleMapsApiKey;
};

} // namespace Panorama
