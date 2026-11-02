#include "SettingsManager.h"
#include "Logger.h"
#include <algorithm>
#include <cmath>
#include <QUuid>

namespace Panorama {

namespace {
constexpr auto kApiBaseUrl = "api/baseUrl";
constexpr auto kApiToken = "api/token";
constexpr auto kDeviceLabel = "api/deviceLabel";
constexpr auto kDataSourceId = "api/dataSourceId";
constexpr auto kEsp32Host = "esp32/host";
constexpr auto kEsp32Port = "esp32/port";
constexpr auto kUseDirectEsp32 = "esp32/useDirect";
constexpr auto kLevelVariable = "api/levelVariable";
constexpr auto kVolumeVariable = "api/volumeVariable";
constexpr auto kDistanceVariable = "api/distanceVariable";

constexpr auto kPressureVariable = "api/pressureVariable";
constexpr auto kStatusVariable = "api/statusVariable";
constexpr auto kReadingType = "api/readingType";
constexpr auto kSensorMountingOffset = "api/sensorMountingOffset";
constexpr auto kRefreshIntervalMs = "api/refreshIntervalMs";
constexpr auto kTimeoutMs = "api/timeoutMs";

constexpr auto kTankName = "tank/name";
constexpr auto kTankShape = "tank/shape";
constexpr auto kTankShapeId = "tank/shapeId";
constexpr auto kTankRadius = "tank/radius";
constexpr auto kTankHeight = "tank/height";
constexpr auto kTankDiameterCm = "tank/diameterCm";
constexpr auto kTankWidthCm = "tank/widthCm";
constexpr auto kTankLengthCm = "tank/lengthCm";
constexpr auto kTankCapacityLiters = "tank/capacityLiters";
constexpr auto kWarningThresholdPercent = "tank/warningThresholdPercent";
constexpr auto kCriticalThresholdPercent = "tank/criticalThresholdPercent";
constexpr auto kHighThresholdPercent = "tank/highThresholdPercent";

constexpr auto kLogLevel = "logging/level";
constexpr auto kLogRetentionDays = "logging/retentionDays";

constexpr auto kTheme = "theme/current";
constexpr auto kSidebarCollapsed = "ui/sidebarCollapsed";
constexpr auto kGoogleMapsApiKey = "location/googleMapsApiKey";

constexpr auto kMqttEnabled = "mqtt/enabled";
constexpr auto kMqttBroker = "mqtt/broker";
constexpr auto kMqttPort = "mqtt/port";
constexpr auto kMqttTopic = "mqtt/topic";
constexpr auto kMqttTlsEnabled = "mqtt/tlsEnabled";
constexpr auto kMqttVerifyCertificate = "mqtt/verifyCertificate";
constexpr auto kMqttUsername = "mqtt/username";
constexpr auto kMqttPassword = "mqtt/password";
constexpr auto kMqttClientId = "mqtt/clientId";
} // namespace

SettingsManager::SettingsManager(Logger &logger, QObject *parent)
    : QObject(parent)
      , m_logger(logger)
      , m_settings(QStringLiteral("Panorama Electronics"), QStringLiteral("Panorama Water Tank Monitor"))
{
    loadAll();
}

QString SettingsManager::apiBaseUrl() const
{
    if (m_useDirectEsp32 && !m_esp32Host.trimmed().isEmpty()) {
        return QStringLiteral("http://%1:%2").arg(m_esp32Host.trimmed()).arg(m_esp32Port);
    }
    return m_apiBaseUrl;
}

void SettingsManager::loadAll()
{
    m_apiBaseUrl = m_settings.value(kApiBaseUrl, QStringLiteral("https://industrial.api.ubidots.com/")).toString();
    m_apiToken = m_settings.value(kApiToken, QStringLiteral("BBUS-R1UePwaJ2wFg2pKlYiArsPsmMWZvzS")).toString();
    if (m_apiToken.trimmed().isEmpty()) {
        m_apiToken = QStringLiteral("BBUS-R1UePwaJ2wFg2pKlYiArsPsmMWZvzS");
    }
    m_deviceLabel = m_settings.value(kDeviceLabel, QStringLiteral("wli")).toString();
    m_dataSourceId = m_settings.value(kDataSourceId, QStringLiteral("6a3a275d4fd32b529b38a792")).toString();

    m_esp32Host = m_settings.value(kEsp32Host, QStringLiteral("192.168.1.219")).toString();
    if (m_esp32Host.trimmed().isEmpty() || m_esp32Host == QStringLiteral("192.168.1.50")) {
        m_esp32Host = QStringLiteral("192.168.1.219");
    }
    m_esp32Port = m_settings.value(kEsp32Port, 80).toInt();
    m_useDirectEsp32 = m_settings.value(kUseDirectEsp32, true).toBool();

    m_mqttEnabled = m_settings.value(kMqttEnabled, true).toBool();
    m_mqttBroker = m_settings.value(kMqttBroker, QStringLiteral("broker.hivemq.com")).toString();
    m_mqttPort = m_settings.value(kMqttPort, 8883).toInt();
    m_mqttTopic = m_settings.value(kMqttTopic, QStringLiteral("stm32f411/ec200u/telemetry")).toString();
    m_mqttTlsEnabled = m_settings.value(kMqttTlsEnabled, true).toBool();
    m_mqttVerifyCertificate = m_settings.value(kMqttVerifyCertificate, true).toBool();
    m_mqttUsername = m_settings.value(kMqttUsername, QString()).toString();
    m_mqttPassword = m_settings.value(kMqttPassword, QString()).toString();
    m_mqttClientId = m_settings.value(kMqttClientId, QString()).toString();
    if (m_mqttClientId.trimmed().isEmpty()) {
        m_mqttClientId = QStringLiteral("PanoramaWaterTankMonitor_%1")
            .arg(QUuid::createUuid().toString().remove(QLatin1Char('{')).remove(QLatin1Char('}')).remove(QLatin1Char('-')).left(8));
        m_settings.setValue(kMqttClientId, m_mqttClientId);
    }

    m_levelVariable = m_settings.value(kLevelVariable, QStringLiteral("waterlevel")).toString();
    m_volumeVariable = m_settings.value(kVolumeVariable, QStringLiteral("volume")).toString();
    m_distanceVariable = m_settings.value(kDistanceVariable, QStringLiteral("distance")).toString();

    m_pressureVariable = m_settings.value(kPressureVariable, QStringLiteral("pressure")).toString();
    m_statusVariable = m_settings.value(kStatusVariable, QStringLiteral("sensorstatus")).toString();

    m_readingType = m_settings.value(kReadingType, QStringLiteral("Level")).toString();
    m_sensorMountingOffset = m_settings.value(kSensorMountingOffset, 0.0).toDouble();

    m_refreshIntervalMs = m_settings.value(kRefreshIntervalMs, 1000).toInt();
    m_timeoutMs = m_settings.value(kTimeoutMs, 10000).toInt();


    constexpr double kDefaultTankRadius = 0.11283791670955126; // r for 20 L capacity with 50 cm height (Area = 0.04 m^2)
    constexpr double kDefaultTankHeight = 0.50;                // 50 cm (0.50 m)

    m_tankName = m_settings.value(kTankName, QStringLiteral("Panorama Water Tank")).toString();
    m_tankShape = m_settings.value(kTankShape, QStringLiteral("CYLINDER")).toString();
    m_tankShapeId = m_settings.value(kTankShapeId, 0).toInt();
    m_tankRadius = m_settings.value(kTankRadius, kDefaultTankRadius).toDouble();
    m_tankHeight = m_settings.value(kTankHeight, kDefaultTankHeight).toDouble();
    m_tankDiameterCm = m_settings.value(kTankDiameterCm, 22.5676).toDouble();
    m_tankWidthCm = m_settings.value(kTankWidthCm, 0.0).toDouble();
    m_tankLengthCm = m_settings.value(kTankLengthCm, 0.0).toDouble();
    m_tankCapacityLiters = m_settings.value(kTankCapacityLiters, 20.0).toDouble();
    m_warningThresholdPercent = m_settings.value(kWarningThresholdPercent, 20.0).toDouble();
    m_criticalThresholdPercent = m_settings.value(kCriticalThresholdPercent, 10.0).toDouble();
    m_highThresholdPercent = m_settings.value(kHighThresholdPercent, 90.0).toDouble();

    m_logLevel = m_settings.value(kLogLevel, QStringLiteral("Info")).toString();
    m_logRetentionDays = m_settings.value(kLogRetentionDays, 7).toInt();

    m_theme = m_settings.value(kTheme, QStringLiteral("Dark")).toString();
    m_sidebarCollapsed = m_settings.value(kSidebarCollapsed, false).toBool();
    m_googleMapsApiKey = m_settings.value(kGoogleMapsApiKey, QString()).toString();
}

void SettingsManager::rejected(const QString &settingName, const QString &reason) const
{
    m_logger.logError(Logger::LogLevel::Warning, QStringLiteral("Settings: Rejected update to %1 (%2)").arg(settingName, reason));
}

void SettingsManager::accepted(const QString &settingName) const
{
    m_logger.logApplication(Logger::LogLevel::Debug, QStringLiteral("Settings: Updated %1").arg(settingName));
}

bool SettingsManager::isValidReadingType(const QString &value)
{
    return value == QLatin1String("Level") ||
           value == QLatin1String("Volume") ||
           value == QLatin1String("Distance");
}

bool SettingsManager::isValidLogLevel(const QString &value)
{
    return value == QLatin1String("Debug") ||
           value == QLatin1String("Info") ||
           value == QLatin1String("Warning") ||
           value == QLatin1String("Error");
}

bool SettingsManager::isValidTheme(const QString &value)
{
    return value == QLatin1String("Light") || value == QLatin1String("Dark");
}

// --- API group ---------------------------------------------------------

void SettingsManager::setApiBaseUrl(const QString &url)
{
    const QString trimmed = url.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("apiBaseUrl"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_apiBaseUrl == trimmed) return;
    m_apiBaseUrl = trimmed;
    m_settings.setValue(kApiBaseUrl, trimmed);
    accepted(QStringLiteral("apiBaseUrl"));
    emit apiBaseUrlChanged();
}

void SettingsManager::setEsp32Host(const QString &host)
{
    const QString trimmed = host.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("esp32Host"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_esp32Host == trimmed) return;
    m_esp32Host = trimmed;
    m_settings.setValue(kEsp32Host, trimmed);
    accepted(QStringLiteral("esp32Host"));
    emit esp32HostChanged();
    emit apiBaseUrlChanged();
}

void SettingsManager::setEsp32Port(int port)
{
    if (port <= 0 || port > 65535) {
        rejected(QStringLiteral("esp32Port"), QStringLiteral("must be between 1 and 65535"));
        return;
    }
    if (m_esp32Port == port) return;
    m_esp32Port = port;
    m_settings.setValue(kEsp32Port, port);
    accepted(QStringLiteral("esp32Port"));
    emit esp32PortChanged();
    emit apiBaseUrlChanged();
}

void SettingsManager::setUseDirectEsp32(bool direct)
{
    if (m_useDirectEsp32 == direct) return;
    m_useDirectEsp32 = direct;
    m_settings.setValue(kUseDirectEsp32, direct);
    accepted(QStringLiteral("useDirectEsp32"));
    emit useDirectEsp32Changed();
    emit apiBaseUrlChanged();
}

void SettingsManager::setApiToken(const QString &token)
{
    const QString trimmed = token.trimmed();
    if (m_apiToken == trimmed) return;
    m_apiToken = trimmed;
    m_settings.setValue(kApiToken, trimmed);
    accepted(QStringLiteral("apiToken"));
    emit apiTokenChanged();
}

void SettingsManager::setDeviceLabel(const QString &label)
{
    const QString trimmed = label.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("deviceLabel"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_deviceLabel == trimmed) return;
    m_deviceLabel = trimmed;
    m_settings.setValue(kDeviceLabel, trimmed);
    accepted(QStringLiteral("deviceLabel"));
    emit deviceLabelChanged();
}

void SettingsManager::setDataSourceId(const QString &id)
{
    const QString trimmed = id.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("dataSourceId"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_dataSourceId == trimmed) return;
    m_dataSourceId = trimmed;
    m_settings.setValue(kDataSourceId, trimmed);
    accepted(QStringLiteral("dataSourceId"));
    emit dataSourceIdChanged();
}

void SettingsManager::setLevelVariable(const QString &variable)
{
    const QString trimmed = variable.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("levelVariable"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_levelVariable == trimmed) return;
    m_levelVariable = trimmed;
    m_settings.setValue(kLevelVariable, trimmed);
    accepted(QStringLiteral("levelVariable"));
    emit levelVariableChanged();
}

void SettingsManager::setVolumeVariable(const QString &variable)
{
    const QString trimmed = variable.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("volumeVariable"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_volumeVariable == trimmed) return;
    m_volumeVariable = trimmed;
    m_settings.setValue(kVolumeVariable, trimmed);
    accepted(QStringLiteral("volumeVariable"));
    emit volumeVariableChanged();
}

void SettingsManager::setDistanceVariable(const QString &variable)
{
    const QString trimmed = variable.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("distanceVariable"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_distanceVariable == trimmed) return;
    m_distanceVariable = trimmed;
    m_settings.setValue(kDistanceVariable, trimmed);
    accepted(QStringLiteral("distanceVariable"));
    emit distanceVariableChanged();
}

void SettingsManager::setPressureVariable(const QString &variable)
{
    const QString trimmed = variable.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("pressureVariable"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_pressureVariable == trimmed) return;
    m_pressureVariable = trimmed;
    m_settings.setValue(kPressureVariable, trimmed);
    accepted(QStringLiteral("pressureVariable"));
    emit pressureVariableChanged();
}

void SettingsManager::setStatusVariable(const QString &variable)
{
    const QString trimmed = variable.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("statusVariable"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_statusVariable == trimmed) return;
    m_statusVariable = trimmed;
    m_settings.setValue(kStatusVariable, trimmed);
    accepted(QStringLiteral("statusVariable"));
    emit statusVariableChanged();
}

void SettingsManager::setReadingType(const QString &type)
{
    const QString trimmed = type.trimmed();
    if (!isValidReadingType(trimmed)) {
        rejected(QStringLiteral("readingType"), QStringLiteral("must be Level, Volume, or Distance"));
        return;
    }
    if (m_readingType == trimmed) return;
    m_readingType = trimmed;
    m_settings.setValue(kReadingType, trimmed);
    accepted(QStringLiteral("readingType"));
    emit readingTypeChanged();
}

void SettingsManager::setSensorMountingOffset(double offset)
{
    if (!std::isfinite(offset)) {
        rejected(QStringLiteral("sensorMountingOffset"), QStringLiteral("must be a finite number"));
        return;
    }
    if (qFuzzyCompare(m_sensorMountingOffset + 1.0, offset + 1.0)) return;
    m_sensorMountingOffset = offset;
    m_settings.setValue(kSensorMountingOffset, offset);
    accepted(QStringLiteral("sensorMountingOffset"));
    emit sensorMountingOffsetChanged();
}

void SettingsManager::setRefreshIntervalMs(int ms)
{
    if (ms < 1000) {
        rejected(QStringLiteral("refreshIntervalMs"), QStringLiteral("must be >= 1000"));
        return;
    }
    if (m_refreshIntervalMs == ms) return;
    m_refreshIntervalMs = ms;
    m_settings.setValue(kRefreshIntervalMs, ms);
    accepted(QStringLiteral("refreshIntervalMs"));
    emit refreshIntervalMsChanged();
}

void SettingsManager::setTimeoutMs(int ms)
{
    if (ms < 1000) {
        rejected(QStringLiteral("timeoutMs"), QStringLiteral("must be >= 1000"));
        return;
    }
    if (m_timeoutMs == ms) return;
    m_timeoutMs = ms;
    m_settings.setValue(kTimeoutMs, ms);
    accepted(QStringLiteral("timeoutMs"));
    emit timeoutMsChanged();
}

// --- Tank group --------------------------------------------------------

void SettingsManager::setTankName(const QString &name)
{
    const QString trimmed = name.trimmed();
    if (trimmed.isEmpty()) {
        rejected(QStringLiteral("tankName"), QStringLiteral("cannot be empty"));
        return;
    }
    if (m_tankName == trimmed) return;
    m_tankName = trimmed;
    m_settings.setValue(kTankName, trimmed);
    accepted(QStringLiteral("tankName"));
    emit tankNameChanged();
}

void SettingsManager::setTankRadius(double meters)
{
    if (!std::isfinite(meters)) {
        rejected(QStringLiteral("tankRadius"), QStringLiteral("must be a finite number"));
        return;
    }
    if (meters <= 0.0) {
        rejected(QStringLiteral("tankRadius"), QStringLiteral("must be positive"));
        return;
    }
    if (qFuzzyCompare(m_tankRadius + 1.0, meters + 1.0)) return;
    m_tankRadius = meters;
    m_settings.setValue(kTankRadius, meters);
    accepted(QStringLiteral("tankRadius"));
    emit tankRadiusChanged();
}

void SettingsManager::setTankHeight(double meters)
{
    if (!std::isfinite(meters)) {
        rejected(QStringLiteral("tankHeight"), QStringLiteral("must be a finite number"));
        return;
    }
    if (meters <= 0.0) {
        rejected(QStringLiteral("tankHeight"), QStringLiteral("must be positive"));
        return;
    }
    if (qFuzzyCompare(m_tankHeight + 1.0, meters + 1.0)) return;
    m_tankHeight = meters;
    m_settings.setValue(kTankHeight, meters);
    accepted(QStringLiteral("tankHeight"));
    emit tankHeightChanged();
}

void SettingsManager::setTankShape(const QString &shape)
{
    const QString trimmed = shape.trimmed().toUpper();
    if (m_tankShape == trimmed) return;
    m_tankShape = trimmed;
    if (trimmed == QStringLiteral("RECTANGLE") || trimmed == QStringLiteral("RECTANGULAR")) m_tankShapeId = 1;
    else if (trimmed == QStringLiteral("CUSTOM")) m_tankShapeId = 2;
    else m_tankShapeId = 0;
    m_settings.setValue(kTankShape, trimmed);
    m_settings.setValue(kTankShapeId, m_tankShapeId);
    accepted(QStringLiteral("tankShape"));
    emit tankShapeChanged();
}

void SettingsManager::setTankShapeId(int id)
{
    int clamped = std::clamp(id, 0, 2);
    if (m_tankShapeId == clamped) return;
    m_tankShapeId = clamped;
    if (clamped == 1) m_tankShape = QStringLiteral("RECTANGLE");
    else if (clamped == 2) m_tankShape = QStringLiteral("CUSTOM");
    else m_tankShape = QStringLiteral("CYLINDER");
    m_settings.setValue(kTankShapeId, clamped);
    m_settings.setValue(kTankShape, m_tankShape);
    accepted(QStringLiteral("tankShapeId"));
    emit tankShapeChanged();
}

void SettingsManager::setTankDiameterCm(double cm)
{
    if (!std::isfinite(cm) || cm < 0.0) return;
    if (qFuzzyCompare(m_tankDiameterCm + 1.0, cm + 1.0)) return;
    m_tankDiameterCm = cm;
    m_tankRadius = (cm / 100.0) / 2.0;
    m_settings.setValue(kTankDiameterCm, cm);
    m_settings.setValue(kTankRadius, m_tankRadius);
    accepted(QStringLiteral("tankDiameterCm"));
    emit tankDiameterChanged();
    emit tankRadiusChanged();
}

void SettingsManager::setTankWidthCm(double cm)
{
    if (!std::isfinite(cm) || cm < 0.0) return;
    if (qFuzzyCompare(m_tankWidthCm + 1.0, cm + 1.0)) return;
    m_tankWidthCm = cm;
    m_settings.setValue(kTankWidthCm, cm);
    accepted(QStringLiteral("tankWidthCm"));
    emit tankDimensionsChanged();
}

void SettingsManager::setTankLengthCm(double cm)
{
    if (!std::isfinite(cm) || cm < 0.0) return;
    if (qFuzzyCompare(m_tankLengthCm + 1.0, cm + 1.0)) return;
    m_tankLengthCm = cm;
    m_settings.setValue(kTankLengthCm, cm);
    accepted(QStringLiteral("tankLengthCm"));
    emit tankDimensionsChanged();
}

void SettingsManager::setTankCapacityLiters(double liters)
{
    if (!std::isfinite(liters) || liters <= 0.0) return;
    if (qFuzzyCompare(m_tankCapacityLiters + 1.0, liters + 1.0)) return;
    m_tankCapacityLiters = liters;
    m_settings.setValue(kTankCapacityLiters, liters);
    accepted(QStringLiteral("tankCapacityLiters"));
    emit tankCapacityChanged();
}

void SettingsManager::setWarningThresholdPercent(double pct)
{
    if (!std::isfinite(pct) || pct <= 0.0 || pct >= 100.0) return;
    if (qFuzzyCompare(m_warningThresholdPercent + 1.0, pct + 1.0)) return;
    m_warningThresholdPercent = pct;
    m_settings.setValue(kWarningThresholdPercent, pct);
    accepted(QStringLiteral("warningThresholdPercent"));
    emit alarmThresholdsChanged();
}

void SettingsManager::setCriticalThresholdPercent(double pct)
{
    if (!std::isfinite(pct) || pct <= 0.0 || pct >= 100.0) return;
    if (qFuzzyCompare(m_criticalThresholdPercent + 1.0, pct + 1.0)) return;
    m_criticalThresholdPercent = pct;
    m_settings.setValue(kCriticalThresholdPercent, pct);
    accepted(QStringLiteral("criticalThresholdPercent"));
    emit alarmThresholdsChanged();
}

void SettingsManager::setHighThresholdPercent(double pct)
{
    if (!std::isfinite(pct) || pct <= 0.0 || pct > 100.0) return;
    if (qFuzzyCompare(m_highThresholdPercent + 1.0, pct + 1.0)) return;
    m_highThresholdPercent = pct;
    m_settings.setValue(kHighThresholdPercent, pct);
    accepted(QStringLiteral("highThresholdPercent"));
    emit alarmThresholdsChanged();
}

// --- Logging group -----------------------------------------------------

void SettingsManager::setLogLevel(const QString &level)
{
    const QString trimmed = level.trimmed();
    if (!isValidLogLevel(trimmed)) {
        rejected(QStringLiteral("logLevel"), QStringLiteral("must be a recognized log level"));
        return;
    }
    if (m_logLevel == trimmed) return;
    m_logLevel = trimmed;
    m_settings.setValue(kLogLevel, trimmed);
    accepted(QStringLiteral("logLevel"));
    emit logLevelChanged();
}

void SettingsManager::setLogRetentionDays(int days)
{
    if (days < 1 || days > 90) {
        rejected(QStringLiteral("logRetentionDays"), QStringLiteral("must be between 1 and 90"));
        return;
    }
    if (m_logRetentionDays == days) return;
    m_logRetentionDays = days;
    m_settings.setValue(kLogRetentionDays, days);
    accepted(QStringLiteral("logRetentionDays"));
    emit logRetentionDaysChanged();
}

// --- Theme group -----------------------------------------------------------

void SettingsManager::setTheme(const QString &theme)
{
    const QString trimmed = theme.trimmed();
    if (!isValidTheme(trimmed)) {
        rejected(QStringLiteral("theme"), QStringLiteral("must be Light or Dark"));
        return;
    }
    if (m_theme == trimmed) return;
    m_theme = trimmed;
    m_settings.setValue(kTheme, trimmed);
    accepted(QStringLiteral("theme"));
    emit themeChanged();
}

void SettingsManager::setSidebarCollapsed(bool collapsed)
{
    if (m_sidebarCollapsed == collapsed) return;
    m_sidebarCollapsed = collapsed;
    m_settings.setValue(kSidebarCollapsed, collapsed);
    accepted(QStringLiteral("sidebarCollapsed"));
    emit sidebarCollapsedChanged();
}

void SettingsManager::setGoogleMapsApiKey(const QString &key)
{
    const QString trimmed = key.trimmed();
    if (m_googleMapsApiKey == trimmed) return;
    m_googleMapsApiKey = trimmed;
    m_settings.setValue(kGoogleMapsApiKey, trimmed);
    accepted(QStringLiteral("googleMapsApiKey"));
    emit googleMapsApiKeyChanged();
}

// --- MQTT group ------------------------------------------------------------

void SettingsManager::setMqttEnabled(bool enabled)
{
    if (m_mqttEnabled == enabled) return;
    m_mqttEnabled = enabled;
    m_settings.setValue(kMqttEnabled, m_mqttEnabled);
    accepted(QStringLiteral("mqttEnabled"));
    emit mqttEnabledChanged();
}

void SettingsManager::setMqttBroker(const QString &broker)
{
    const QString trimmed = broker.trimmed();
    if (m_mqttBroker == trimmed) return;
    m_mqttBroker = trimmed;
    m_settings.setValue(kMqttBroker, m_mqttBroker);
    accepted(QStringLiteral("mqttBroker"));
    emit mqttBrokerChanged();
}

void SettingsManager::setMqttPort(int port)
{
    if (port < 1 || port > 65535) {
        rejected(QStringLiteral("mqttPort"), QStringLiteral("must be between 1 and 65535"));
        return;
    }
    if (m_mqttPort == port) return;
    m_mqttPort = port;
    m_settings.setValue(kMqttPort, m_mqttPort);
    accepted(QStringLiteral("mqttPort"));
    emit mqttPortChanged();
}

void SettingsManager::setMqttTopic(const QString &topic)
{
    const QString trimmed = topic.trimmed();
    if (m_mqttTopic == trimmed) return;
    m_mqttTopic = trimmed;
    m_settings.setValue(kMqttTopic, m_mqttTopic);
    accepted(QStringLiteral("mqttTopic"));
    emit mqttTopicChanged();
}

void SettingsManager::setMqttTlsEnabled(bool enabled)
{
    if (m_mqttTlsEnabled == enabled) return;
    m_mqttTlsEnabled = enabled;
    m_settings.setValue(kMqttTlsEnabled, m_mqttTlsEnabled);
    accepted(QStringLiteral("mqttTlsEnabled"));
    emit mqttTlsEnabledChanged();
}

void SettingsManager::setMqttVerifyCertificate(bool verify)
{
    if (m_mqttVerifyCertificate == verify) return;
    m_mqttVerifyCertificate = verify;
    m_settings.setValue(kMqttVerifyCertificate, m_mqttVerifyCertificate);
    accepted(QStringLiteral("mqttVerifyCertificate"));
    emit mqttVerifyCertificateChanged();
}

void SettingsManager::setMqttUsername(const QString &username)
{
    const QString trimmed = username.trimmed();
    if (m_mqttUsername == trimmed) return;
    m_mqttUsername = trimmed;
    m_settings.setValue(kMqttUsername, m_mqttUsername);
    accepted(QStringLiteral("mqttUsername"));
    emit mqttUsernameChanged();
}

void SettingsManager::setMqttPassword(const QString &password)
{
    if (m_mqttPassword == password) return;
    m_mqttPassword = password;
    m_settings.setValue(kMqttPassword, m_mqttPassword);
    accepted(QStringLiteral("mqttPassword")); // Note: does NOT log password value
    emit mqttPasswordChanged();
}

void SettingsManager::setMqttClientId(const QString &id)
{
    const QString trimmed = id.trimmed();
    if (m_mqttClientId == trimmed) return;
    m_mqttClientId = trimmed;
    m_settings.setValue(kMqttClientId, m_mqttClientId);
    accepted(QStringLiteral("mqttClientId"));
    emit mqttClientIdChanged();
}

} // namespace Panorama
