// MqttService.cpp - Dedicated MQTT-over-TLS service implementation
#include "MqttService.h"
#include "Logger.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QDateTime>
#include <QUrl>
#include <algorithm>

namespace Panorama {

namespace {
    const std::vector<int> kBackoffDelays = {1000, 2000, 5000, 10000, 30000};
}

MqttService::MqttService(Logger &logger, QObject *parent)
    : QObject(parent)
    , m_logger(logger)
    , m_reconnectTimer(new QTimer(this))
    , m_testTimer(new QTimer(this))
{
    m_reconnectTimer->setSingleShot(true);
    connect(m_reconnectTimer, &QTimer::timeout, this, &MqttService::onReconnectTimeout);

    m_testTimer->setSingleShot(true);
    connect(m_testTimer, &QTimer::timeout, this, &MqttService::onTestTimeout);

    // Default unique Client ID if empty
    if (m_config.clientId.isEmpty()) {
        m_config.clientId = MqttConfig::generateDefaultClientId();
    }
}

MqttService::~MqttService()
{
    stopReconnect();
    cleanClient();
    if (m_testClient) {
        m_testClient->disconnectFromHost();
        m_testClient->deleteLater();
        m_testClient = nullptr;
    }
}

void MqttService::configure(const MqttConfig &config)
{
    m_config = config;
    if (m_config.clientId.trimmed().isEmpty()) {
        m_config.clientId = MqttConfig::generateDefaultClientId();
    }
    emit configChanged();

    m_logger.logApplication(
        Logger::LogLevel::Info,
        QStringLiteral("[MQTT] Loading configuration: Broker=%1, Port=%2, Topic=%3, TLS=%4, VerifyCert=%5, ClientID=%6")
            .arg(m_config.broker)
            .arg(m_config.port)
            .arg(m_config.topic)
            .arg(m_config.tlsEnabled ? QStringLiteral("ON") : QStringLiteral("OFF"))
            .arg(m_config.verifyCertificate ? QStringLiteral("ON") : QStringLiteral("OFF"))
            .arg(m_config.clientId)
    );
}

QString MqttService::connectionState() const
{
    switch (m_state) {
    case State::Disconnected: return QStringLiteral("Disconnected");
    case State::Connecting: return QStringLiteral("Connecting");
    case State::TlsHandshake: return QStringLiteral("TLS Handshake");
    case State::MqttConnecting: return QStringLiteral("MQTT Connecting");
    case State::Connected: return QStringLiteral("Connected");
    case State::Reconnecting: return QStringLiteral("Reconnecting");
    case State::Error:
        if (m_errorMessage.contains(QStringLiteral("TLS"), Qt::CaseInsensitive)) {
            return QStringLiteral("TLS Error");
        }
        return QStringLiteral("Error");
    }
    return QStringLiteral("Disconnected");
}

void MqttService::setState(State newState, const QString &errorDetail)
{
    if (m_state == newState && m_errorMessage == errorDetail) return;

    m_state = newState;
    if (!errorDetail.isEmpty()) {
        m_errorMessage = errorDetail;
        emit errorMessageChanged(m_errorMessage);
    } else if (newState == State::Connected || newState == State::Connecting) {
        m_errorMessage.clear();
        emit errorMessageChanged(m_errorMessage);
    }

    emit connectionStateChanged(connectionState());
    emit connectedChanged(isConnected());
}

void MqttService::setupClient()
{
    cleanClient();

    m_client = new QMqttClient(this);
    m_client->setHostname(m_config.broker.trimmed());
    m_client->setPort(static_cast<quint16>(m_config.port));
    m_client->setClientId(m_config.clientId.trimmed());
    m_client->setProtocolVersion(QMqttClient::MQTT_3_1_1);

    if (!m_config.username.trimmed().isEmpty()) {
        m_client->setUsername(m_config.username.trimmed());
    }
    if (!m_config.password.trimmed().isEmpty()) {
        m_client->setPassword(m_config.password);
    }

    connect(m_client, &QMqttClient::stateChanged, this, &MqttService::onClientStateChanged);
    connect(m_client, &QMqttClient::errorChanged, this, &MqttService::onClientErrorChanged);
    connect(m_client, &QMqttClient::connected, this, &MqttService::onClientConnected);
    connect(m_client, &QMqttClient::disconnected, this, &MqttService::onClientDisconnected);
    connect(m_client, &QMqttClient::messageReceived, this, &MqttService::onMessageReceived);
}

void MqttService::cleanClient()
{
    if (m_client) {
        m_client->disconnect(this);
        m_client->disconnectFromHost();
        m_client->deleteLater();
        m_client = nullptr;
        m_subscription = nullptr;
    }
}

void MqttService::connectToBroker()
{
    m_userDisconnected = false;
    stopReconnect();

    QString errorMsg;
    if (!m_config.isValid(&errorMsg)) {
        m_logger.logError(Logger::LogLevel::Critical, QStringLiteral("[MQTT] Configuration validation error: %1").arg(errorMsg));
        setState(State::Error, errorMsg);
        return;
    }

    setupClient();

    m_logger.logApplication(
        Logger::LogLevel::Info,
        QStringLiteral("[MQTT] Connecting to broker %1:%2 (TLS: %3)")
            .arg(m_config.broker)
            .arg(m_config.port)
            .arg(m_config.tlsEnabled ? QStringLiteral("ON") : QStringLiteral("OFF"))
    );

    if (m_config.tlsEnabled) {
        setState(State::TlsHandshake);
        m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] TLS handshake started"));

        QSslConfiguration sslConfig = QSslConfiguration::defaultConfiguration();
        sslConfig.setProtocol(QSsl::TlsV1_2);

        if (m_config.verifyCertificate) {
            sslConfig.setPeerVerifyMode(QSslSocket::VerifyPeer);
        } else {
            sslConfig.setPeerVerifyMode(QSslSocket::VerifyNone);
        }
        m_client->connectToHostEncrypted(sslConfig);

        auto *sslSocket = qobject_cast<QSslSocket*>(m_client->transport());
        if (sslSocket) {
            sslSocket->setPeerVerifyName(m_config.broker.trimmed());
            connect(sslSocket, &QSslSocket::encrypted, this, [this]() {
                m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] TLS handshake successful"));
                if (m_state != State::Connected) {
                    setState(State::MqttConnecting);
                }
            });

            connect(sslSocket, &QSslSocket::sslErrors, this, [this](const QList<QSslError> &errors) {
                QStringList errorStrings;
                for (const auto &err : errors) {
                    errorStrings << err.errorString();
                }
                const QString allErrors = errorStrings.join(QStringLiteral("; "));
                m_logger.logError(Logger::LogLevel::Critical, QStringLiteral("[MQTT] TLS error: %1").arg(allErrors));
                setState(State::Error, QStringLiteral("TLS Error: %1").arg(allErrors));
                scheduleReconnect();
            });
        }
    } else {
        setState(State::Connecting);
        m_client->connectToHost();
    }
}

void MqttService::disconnectFromBroker()
{
    m_userDisconnected = true;
    stopReconnect();

    if (m_client && m_client->state() != QMqttClient::Disconnected) {
        m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] User initiated disconnect."));
        m_client->disconnectFromHost();
    } else {
        setState(State::Disconnected);
    }
}

void MqttService::applyConfiguration(const QString &broker, int port, const QString &topic,
                                     bool tls, bool verifyCert, const QString &username,
                                     const QString &password, const QString &clientId)
{
    MqttConfig newConfig;
    newConfig.enabled = true;
    newConfig.broker = broker.trimmed();
    newConfig.port = port;
    newConfig.topic = topic.trimmed();
    newConfig.tlsEnabled = tls;
    newConfig.verifyCertificate = verifyCert;
    newConfig.username = username.trimmed();
    newConfig.password = password;
    newConfig.clientId = clientId.trimmed().isEmpty() ? MqttConfig::generateDefaultClientId() : clientId.trimmed();

    QString error;
    if (!newConfig.isValid(&error)) {
        m_logger.logError(Logger::LogLevel::Critical, QStringLiteral("[MQTT] Apply configuration rejected: %1").arg(error));
        setState(State::Error, error);
        return;
    }

    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Applying updated MQTT configuration. Reconnecting..."));
    configure(newConfig);

    // Gracefully disconnect and reconnect
    cleanClient();
    connectToBroker();
}

void MqttService::onClientStateChanged(QMqttClient::ClientState state)
{
    switch (state) {
    case QMqttClient::Disconnected:
        if (m_state != State::Error && m_state != State::Reconnecting) {
            setState(m_userDisconnected ? State::Disconnected : State::Reconnecting);
        }
        break;
    case QMqttClient::Connecting:
        if (m_state != State::TlsHandshake) {
            setState(State::MqttConnecting);
        }
        break;
    case QMqttClient::Connected:
        setState(State::Connected);
        break;
    }
}

void MqttService::onClientErrorChanged(QMqttClient::ClientError error)
{
    if (error == QMqttClient::NoError) return;

    QString errorStr;
    switch (error) {
    case QMqttClient::InvalidProtocolVersion:
        errorStr = QStringLiteral("Invalid MQTT protocol version.");
        break;
    case QMqttClient::NotAuthorized:
        errorStr = QStringLiteral("MQTT authorization failed. Check username/password.");
        break;
    case QMqttClient::TransportInvalid:
        errorStr = QStringLiteral("MQTT Transport error or socket disconnected.");
        break;
    case QMqttClient::ProtocolViolation:
        errorStr = QStringLiteral("MQTT Protocol violation.");
        break;
    default:
        errorStr = QStringLiteral("MQTT Unknown error occurred (%1).").arg(static_cast<int>(error));
        break;
    }

    m_logger.logError(Logger::LogLevel::Critical, QStringLiteral("[MQTT] %1").arg(errorStr));
    setState(State::Error, errorStr);

    if (!m_userDisconnected) {
        scheduleReconnect();
    }
}

void MqttService::onClientConnected()
{
    m_reconnectAttempt = 0;
    setState(State::Connected);
    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] MQTT connection established"));

    if (m_client && !m_config.topic.trimmed().isEmpty()) {
        m_subscription = m_client->subscribe(QMqttTopicFilter(m_config.topic.trimmed()), 0);
        if (m_subscription) {
            m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Subscribed to topic: %1").arg(m_config.topic));
        } else {
            m_logger.logError(Logger::LogLevel::Warning, QStringLiteral("[MQTT] Failed to subscribe to topic: %1").arg(m_config.topic));
        }
    }
}

void MqttService::onClientDisconnected()
{
    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Disconnected"));
    if (!m_userDisconnected) {
        scheduleReconnect();
    } else {
        setState(State::Disconnected);
    }
}

void MqttService::scheduleReconnect()
{
    if (m_userDisconnected) return;

    setState(State::Reconnecting);
    const size_t index = std::min(m_reconnectAttempt, kBackoffDelays.size() - 1);
    const int delayMs = kBackoffDelays[index];
    m_reconnectAttempt++;

    m_logger.logApplication(
        Logger::LogLevel::Info,
        QStringLiteral("[MQTT] Reconnecting in %1 ms (attempt %2)").arg(delayMs).arg(m_reconnectAttempt)
    );

    m_reconnectTimer->start(delayMs);
}

void MqttService::stopReconnect()
{
    if (m_reconnectTimer && m_reconnectTimer->isActive()) {
        m_reconnectTimer->stop();
    }
}

void MqttService::onReconnectTimeout()
{
    if (m_userDisconnected) return;
    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Attempting reconnect now..."));
    connectToBroker();
}

void MqttService::onMessageReceived(const QByteArray &message, const QMqttTopicName &topic)
{
    m_logger.logApplication(
        Logger::LogLevel::Debug,
        QStringLiteral("[MQTT] Telemetry received: topic=%1, length=%2 bytes").arg(topic.name()).arg(message.size())
    );
    processPayload(message, topic.name());
}

void MqttService::processPayload(const QByteArray &payload, const QString &topic)
{
    Q_UNUSED(topic);

    QJsonParseError parseError;
    QJsonDocument doc = QJsonDocument::fromJson(payload, &parseError);
    if (parseError.error != QJsonParseError::NoError || !doc.isObject()) {
        m_logger.logError(
            Logger::LogLevel::Warning,
            QStringLiteral("[MQTT] MQTT JSON parse error: %1").arg(parseError.errorString())
        );
        return;
    }

    QJsonObject obj = doc.object();
    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] JSON parsed"));

    // Supported fields
    const QString uid = obj.value(QStringLiteral("uid")).toString();
    const double lat = obj.value(QStringLiteral("lat")).toDouble(0.0);
    double lon = obj.value(QStringLiteral("long")).toDouble(0.0);
    if (lon == 0.0 && obj.contains(QStringLiteral("lon"))) {
        lon = obj.value(QStringLiteral("lon")).toDouble(0.0);
    }
    const double alt = obj.value(QStringLiteral("alt")).toDouble(0.0);
    const double speed = obj.value(QStringLiteral("speed")).toDouble(0.0);
    const QString dt = obj.value(QStringLiteral("dt")).toString();
    const QString time = obj.value(QStringLiteral("time")).toString();
    const double wlp1 = obj.value(QStringLiteral("wlp1")).toDouble(0.0);
    const double wlp2 = obj.value(QStringLiteral("wlp2")).toDouble(0.0);
    const bool wlv1 = obj.value(QStringLiteral("wlv1")).toBool(false);
    const bool wlv2 = obj.value(QStringLiteral("wlv2")).toBool(false);
    const QString chno = obj.value(QStringLiteral("chno")).toString();

    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Device UID: %1").arg(uid));
    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Coach: %1").arg(chno));
    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Water Level 1: %1%").arg(wlp1, 0, 'f', 1));
    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Water Level 2: %1%").arg(wlp2, 0, 'f', 1));
    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Sensor 1 Valid: %1").arg(wlv1 ? "true" : "false"));
    m_logger.logApplication(Logger::LogLevel::Info, QStringLiteral("[MQTT] Sensor 2 Valid: %1").arg(wlv2 ? "true" : "false"));

    // Update telemetry state
    m_sensor1LevelPercent = wlp1;
    m_sensor2LevelPercent = wlp2;
    m_sensor1Valid = wlv1;
    m_sensor2Valid = wlv2;
    m_lastUid = uid;
    m_lastCoachNumber = chno;
    m_lastMessageTime = time.isEmpty() ? QDateTime::currentDateTime().toString(QStringLiteral("hh:mm:ss")) : time;

    emit telemetryChanged();
    emit lastMessageTimeChanged(m_lastMessageTime);

    // Build adapter status object to feed into existing application models:
    // (TankRepository::processEsp32Status, TrainManager::processEsp32Status, LocationManager::processEsp32Status)
    QJsonObject statusObj;

    // Water level evaluation:
    // wlp1/wlp2 are percentages. Sensor 1 is primary. If Sensor 1 invalid, fall back to Sensor 2.
    double chosenPercent = 0.0;
    bool anySensorValid = false;
    if (wlv1) {
        chosenPercent = wlp1;
        anySensorValid = true;
    } else if (wlv2) {
        chosenPercent = wlp2;
        anySensorValid = true;
    }

    constexpr double kAssumedTankHeightCm = 50.0;
    constexpr double kAssumedTankCapacityL = 60.0;
    const double waterLevelCm = (chosenPercent / 100.0) * kAssumedTankHeightCm;
    const double volumeL = (chosenPercent / 100.0) * kAssumedTankCapacityL;

    statusObj[QStringLiteral("water_level_cm")] = waterLevelCm;
    statusObj[QStringLiteral("waterLevelCm")] = waterLevelCm;
    statusObj[QStringLiteral("level_percent")] = chosenPercent;
    statusObj[QStringLiteral("levelPercent")] = chosenPercent;
    statusObj[QStringLiteral("water_level_percent")] = chosenPercent;
    statusObj[QStringLiteral("tank_height_cm")] = kAssumedTankHeightCm;
    statusObj[QStringLiteral("tank_capacity_l")] = kAssumedTankCapacityL;
    statusObj[QStringLiteral("tank_volume_l")] = volumeL;
    statusObj[QStringLiteral("volume_liters")] = volumeL;

    statusObj[QStringLiteral("sensor_status")] = anySensorValid ? 1 : 0;
    statusObj[QStringLiteral("measurement_valid")] = anySensorValid;
    statusObj[QStringLiteral("measurement_state")] = anySensorValid ? QStringLiteral("VALID") : QStringLiteral("SENSOR_ERROR");
    statusObj[QStringLiteral("alarm_state")] = anySensorValid ? QStringLiteral("Normal") : QStringLiteral("Fault");

    // Dual-sensor specific details
    statusObj[QStringLiteral("wlp1")] = wlp1;
    statusObj[QStringLiteral("wlp2")] = wlp2;
    statusObj[QStringLiteral("wlv1")] = wlv1;
    statusObj[QStringLiteral("wlv2")] = wlv2;

    // Device / Coach Identity
    statusObj[QStringLiteral("uid")] = uid;
    statusObj[QStringLiteral("chno")] = chno;
    statusObj[QStringLiteral("coach_number")] = chno;

    // GNSS Fields
    statusObj[QStringLiteral("latitude")] = lat;
    statusObj[QStringLiteral("lat")] = lat;
    statusObj[QStringLiteral("longitude")] = lon;
    statusObj[QStringLiteral("long")] = lon;
    statusObj[QStringLiteral("lon")] = lon;
    statusObj[QStringLiteral("altitude")] = alt;
    statusObj[QStringLiteral("alt")] = alt;
    statusObj[QStringLiteral("speed_kmh")] = speed;
    statusObj[QStringLiteral("speed")] = speed;
    statusObj[QStringLiteral("has_valid_fix")] = (lat != 0.0 || lon != 0.0);
    statusObj[QStringLiteral("gps_valid")] = (lat != 0.0 || lon != 0.0);

    // Timestamp parsing
    QDateTime parsedDt = QDateTime::fromString(dt + QStringLiteral(" ") + time, QStringLiteral("yyyy-MM-dd HH:mm:ss"));
    if (parsedDt.isValid()) {
        statusObj[QStringLiteral("timestamp")] = parsedDt.toSecsSinceEpoch();
        statusObj[QStringLiteral("sensor_measurement_timestamp")] = parsedDt.toMSecsSinceEpoch();
    } else {
        statusObj[QStringLiteral("timestamp")] = QDateTime::currentSecsSinceEpoch();
        statusObj[QStringLiteral("sensor_measurement_timestamp")] = QDateTime::currentMSecsSinceEpoch();
    }

    emit statusReceived(statusObj);
    emit telemetryReceived(obj);
}

void MqttService::testConnection(const QString &broker, int port, const QString &topic,
                                 bool tls, bool verifyCert, const QString &username,
                                 const QString &password, const QString &clientId)
{
    if (m_testInProgress) {
        return;
    }

    if (broker.trimmed().isEmpty()) {
        finishTest(false, QStringLiteral("Validation Error: MQTT Broker hostname/IP cannot be empty."));
        return;
    }
    if (port < 1 || port > 65535) {
        finishTest(false, QStringLiteral("Validation Error: MQTT Port must be between 1 and 65535."));
        return;
    }
    if (topic.trimmed().isEmpty()) {
        finishTest(false, QStringLiteral("Validation Error: MQTT Topic cannot be empty."));
        return;
    }

    m_testInProgress = true;
    m_testStatusIsError = false;
    m_testStatusMessage = QStringLiteral("Connecting to %1:%2 (TLS: %3)...")
        .arg(broker).arg(port).arg(tls ? QStringLiteral("ON") : QStringLiteral("OFF"));
    emit testInProgressChanged(true);
    emit testStatusMessageChanged();

    m_testTopic = topic.trimmed();

    if (m_testClient) {
        m_testClient->disconnect(this);
        m_testClient->disconnectFromHost();
        m_testClient->deleteLater();
        m_testClient = nullptr;
    }

    m_testClient = new QMqttClient(this);
    m_testClient->setHostname(broker.trimmed());
    m_testClient->setPort(static_cast<quint16>(port));
    m_testClient->setClientId(clientId.trimmed().isEmpty() ? MqttConfig::generateDefaultClientId() : clientId.trimmed());
    m_testClient->setProtocolVersion(QMqttClient::MQTT_3_1_1);

    if (!username.trimmed().isEmpty()) {
        m_testClient->setUsername(username.trimmed());
    }
    if (!password.trimmed().isEmpty()) {
        m_testClient->setPassword(password);
    }

    connect(m_testClient, &QMqttClient::connected, this, &MqttService::onTestClientConnected);
    connect(m_testClient, &QMqttClient::disconnected, this, &MqttService::onTestClientDisconnected);
    connect(m_testClient, &QMqttClient::errorChanged, this, &MqttService::onTestClientError);

    // Watchdog timer (10 seconds timeout)
    m_testTimer->start(10000);

    if (tls) {
        QSslConfiguration sslConfig = QSslConfiguration::defaultConfiguration();
        sslConfig.setProtocol(QSsl::TlsV1_2);
        if (verifyCert) {
            sslConfig.setPeerVerifyMode(QSslSocket::VerifyPeer);
        } else {
            sslConfig.setPeerVerifyMode(QSslSocket::VerifyNone);
        }
        m_testClient->connectToHostEncrypted(sslConfig);

        auto *sslSock = qobject_cast<QSslSocket*>(m_testClient->transport());
        if (sslSock) {
            sslSock->setPeerVerifyName(broker.trimmed());
            connect(sslSock, &QSslSocket::sslErrors, this, [this](const QList<QSslError> &errors) {
                QStringList errs;
                for (const auto &e : errors) errs << e.errorString();
                finishTest(false, QStringLiteral("TLS Certificate Error: %1").arg(errs.join(QStringLiteral("; "))));
            });
        }
    } else {
        m_testClient->connectToHost();
    }
}

void MqttService::onTestClientConnected()
{
    if (!m_testInProgress || !m_testClient) return;

    m_testStatusMessage = QStringLiteral("MQTT Connected. Subscribing to topic '%1'...").arg(m_testTopic);
    emit testStatusMessageChanged();

    auto *sub = m_testClient->subscribe(QMqttTopicFilter(m_testTopic), 0);
    if (sub) {
        finishTest(true, QStringLiteral("MQTT Connection SUCCESS: Connected to %1:%2 and subscribed to '%3'.")
            .arg(m_testClient->hostname()).arg(m_testClient->port()).arg(m_testTopic));
    } else {
        finishTest(false, QStringLiteral("Connected to broker, but failed to subscribe to topic '%1'.").arg(m_testTopic));
    }
}

void MqttService::onTestClientDisconnected()
{
    if (m_testInProgress) {
        finishTest(false, QStringLiteral("MQTT Broker closed the connection unexpectedly."));
    }
}

void MqttService::onTestClientError(QMqttClient::ClientError error)
{
    if (!m_testInProgress || error == QMqttClient::NoError) return;

    QString desc;
    switch (error) {
    case QMqttClient::InvalidProtocolVersion: desc = QStringLiteral("Invalid MQTT protocol version."); break;
    case QMqttClient::NotAuthorized: desc = QStringLiteral("Authorization failed (check credentials)."); break;
    case QMqttClient::TransportInvalid: desc = QStringLiteral("Network/Socket transport failure."); break;
    case QMqttClient::ProtocolViolation: desc = QStringLiteral("Protocol violation."); break;
    default: desc = QStringLiteral("MQTT Error code %1.").arg(static_cast<int>(error)); break;
    }
    finishTest(false, desc);
}

void MqttService::onTestTimeout()
{
    if (m_testInProgress) {
        finishTest(false, QStringLiteral("Connection timed out after 10 seconds. Check broker hostname and network connectivity."));
    }
}

void MqttService::finishTest(bool success, const QString &message)
{
    m_testTimer->stop();
    m_testInProgress = false;
    m_testStatusIsError = !success;
    m_testStatusMessage = message;

    if (m_testClient) {
        m_testClient->disconnect(this);
        m_testClient->disconnectFromHost();
        m_testClient->deleteLater();
        m_testClient = nullptr;
    }

    emit testInProgressChanged(false);
    emit testStatusMessageChanged();
    emit testResultReady(success, message);
}

} // namespace Panorama
