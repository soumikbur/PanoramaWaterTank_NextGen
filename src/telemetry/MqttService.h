// MqttService.h - Dedicated MQTT-over-TLS service for Panorama Water Tank Monitor
#pragma once

#include <QObject>
#include <QString>
#include <QByteArray>
#include <QJsonObject>
#include <QTimer>
#include <QMqttClient>
#include <QMqttSubscription>
#include <QSslSocket>
#include <QSslConfiguration>
#include <QSslError>
#include <vector>

#include "MqttConfig.h"

namespace Panorama {

class Logger;

class MqttService : public QObject
{
    Q_OBJECT

    // QML-exposed status properties
    Q_PROPERTY(QString connectionState READ connectionState NOTIFY connectionStateChanged)
    Q_PROPERTY(bool connected READ isConnected NOTIFY connectedChanged)
    Q_PROPERTY(QString errorMessage READ errorMessage NOTIFY errorMessageChanged)
    Q_PROPERTY(QString lastMessageTime READ lastMessageTime NOTIFY lastMessageTimeChanged)
    Q_PROPERTY(QString broker READ broker NOTIFY configChanged)
    Q_PROPERTY(int port READ port NOTIFY configChanged)
    Q_PROPERTY(QString topic READ topic NOTIFY configChanged)
    Q_PROPERTY(bool tlsEnabled READ tlsEnabled NOTIFY configChanged)
    Q_PROPERTY(bool verifyCertificate READ verifyCertificate NOTIFY configChanged)
    Q_PROPERTY(QString tlsVersion READ tlsVersion CONSTANT)
    Q_PROPERTY(QString clientIdentifier READ clientIdentifier NOTIFY configChanged)

    // Telemetry properties
    Q_PROPERTY(double sensor1LevelPercent READ sensor1LevelPercent NOTIFY telemetryChanged)
    Q_PROPERTY(double sensor2LevelPercent READ sensor2LevelPercent NOTIFY telemetryChanged)
    Q_PROPERTY(bool sensor1Valid READ sensor1Valid NOTIFY telemetryChanged)
    Q_PROPERTY(bool sensor2Valid READ sensor2Valid NOTIFY telemetryChanged)
    Q_PROPERTY(QString lastUid READ lastUid NOTIFY telemetryChanged)
    Q_PROPERTY(QString lastCoachNumber READ lastCoachNumber NOTIFY telemetryChanged)

    // Test connection feedback
    Q_PROPERTY(bool testInProgress READ testInProgress NOTIFY testInProgressChanged)
    Q_PROPERTY(QString testStatusMessage READ testStatusMessage NOTIFY testStatusMessageChanged)
    Q_PROPERTY(bool testStatusIsError READ testStatusIsError NOTIFY testStatusMessageChanged)

public:
    enum class State {
        Disconnected,
        Connecting,
        TlsHandshake,
        MqttConnecting,
        Connected,
        Reconnecting,
        Error
    };
    Q_ENUM(State)

    explicit MqttService(Logger &logger, QObject *parent = nullptr);
    ~MqttService() override;

    // Configuration
    void configure(const MqttConfig &config);
    const MqttConfig& config() const { return m_config; }

    // Property Getters
    QString connectionState() const;
    bool isConnected() const { return m_state == State::Connected; }
    QString errorMessage() const { return m_errorMessage; }
    QString lastMessageTime() const { return m_lastMessageTime; }
    QString broker() const { return m_config.broker; }
    int port() const { return m_config.port; }
    QString topic() const { return m_config.topic; }
    bool tlsEnabled() const { return m_config.tlsEnabled; }
    bool verifyCertificate() const { return m_config.verifyCertificate; }
    QString tlsVersion() const { return QStringLiteral("TLS 1.2"); }
    QString clientIdentifier() const { return m_config.clientId; }

    double sensor1LevelPercent() const { return m_sensor1LevelPercent; }
    double sensor2LevelPercent() const { return m_sensor2LevelPercent; }
    bool sensor1Valid() const { return m_sensor1Valid; }
    bool sensor2Valid() const { return m_sensor2Valid; }
    QString lastUid() const { return m_lastUid; }
    QString lastCoachNumber() const { return m_lastCoachNumber; }

    bool testInProgress() const { return m_testInProgress; }
    QString testStatusMessage() const { return m_testStatusMessage; }
    bool testStatusIsError() const { return m_testStatusIsError; }

public slots:
    Q_INVOKABLE void connectToBroker();
    Q_INVOKABLE void disconnectFromBroker();
    Q_INVOKABLE void applyConfiguration(const QString &broker, int port, const QString &topic,
                                        bool tls, bool verifyCert, const QString &username,
                                        const QString &password, const QString &clientId);
    Q_INVOKABLE void testConnection(const QString &broker, int port, const QString &topic,
                                    bool tls, bool verifyCert, const QString &username,
                                    const QString &password, const QString &clientId);

    void processPayload(const QByteArray &payload, const QString &topic);

signals:
    void connectionStateChanged(const QString &state);
    void connectedChanged(bool connected);
    void errorMessageChanged(const QString &message);
    void lastMessageTimeChanged(const QString &time);
    void configChanged();
    void telemetryChanged();

    void testInProgressChanged(bool inProgress);
    void testStatusMessageChanged();
    void testResultReady(bool success, const QString &message);

    // Ingestion signals for application models
    void statusReceived(const QJsonObject &statusObj);
    void telemetryReceived(const QJsonObject &telemetry);

private slots:
    void onClientStateChanged(QMqttClient::ClientState state);
    void onClientErrorChanged(QMqttClient::ClientError error);
    void onClientConnected();
    void onClientDisconnected();
    void onMessageReceived(const QByteArray &message, const QMqttTopicName &topic);
    void onReconnectTimeout();

    // Test client slots
    void onTestClientConnected();
    void onTestClientDisconnected();
    void onTestClientError(QMqttClient::ClientError error);
    void onTestTimeout();

private:
    void setState(State newState, const QString &errorDetail = QString());
    void scheduleReconnect();
    void stopReconnect();
    void setupClient();
    void cleanClient();
    void finishTest(bool success, const QString &message);

    Logger &m_logger;
    MqttConfig m_config;
    State m_state{State::Disconnected};
    QString m_errorMessage;
    QString m_lastMessageTime{QStringLiteral("--")};

    QMqttClient *m_client{nullptr};
    QMqttSubscription *m_subscription{nullptr};

    // Reconnection backoff: 1s, 2s, 5s, 10s, 30s
    QTimer *m_reconnectTimer{nullptr};
    size_t m_reconnectAttempt{0};
    bool m_userDisconnected{false};

    // Telemetry state
    double m_sensor1LevelPercent{0.0};
    double m_sensor2LevelPercent{0.0};
    bool m_sensor1Valid{false};
    bool m_sensor2Valid{false};
    QString m_lastUid;
    QString m_lastCoachNumber;

    // Test connection subsystem
    QMqttClient *m_testClient{nullptr};
    QTimer *m_testTimer{nullptr};
    bool m_testInProgress{false};
    QString m_testStatusMessage;
    bool m_testStatusIsError{false};
    QString m_testTopic;
};

} // namespace Panorama
