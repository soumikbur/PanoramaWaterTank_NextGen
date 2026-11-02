// ApiClient.h
#ifndef PANORAMA_APICLIENT_H
#define PANORAMA_APICLIENT_H

#include <QObject>
#include <QByteArray>
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QNetworkReply>
#include <QTimer>
#include <QUrl>
#include <QString>
#include <QJsonArray>

namespace Panorama {

enum class ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error
};

class ApiClient : public QObject
{
    Q_OBJECT
    Q_PROPERTY(ConnectionState connectionState READ connectionState NOTIFY connectionStatusChanged)
    Q_PROPERTY(QString connectionStateString READ connectionStateString NOTIFY connectionStatusChanged)
    Q_PROPERTY(bool isConnected READ isConnected NOTIFY connectionStatusChanged)

public:
    explicit ApiClient(QObject *parent = nullptr);
    ~ApiClient() override = default;

    ConnectionState connectionState() const { return m_connectionState; }
    QString connectionStateString() const;
    void setConnectionState(ConnectionState state, const QString &reason = QString());

    void setApiConfiguration(const QString &baseUrl,
                             const QString &token,
                             const QString &deviceLabel,
                             int pollingIntervalMs,
                             int transferTimeoutMs,
                             const QString &levelVar,
                             const QString &pressureVar,
                             const QString &statusVar);

    void setEsp32Configuration(const QString &host,
                               int port,
                               bool useDirect,
                               int pollingIntervalMs,
                               int transferTimeoutMs);

    bool useDirectEsp32() const { return m_useDirectEsp32; }
    int historyRangeHours() const { return m_historyRangeHours; }
    Q_INVOKABLE bool isConnected() const { return m_connectionState == ConnectionState::Connected; }

    // Direct REST API Endpoint Invocation Methods (Exposed to QML and C++)
    Q_INVOKABLE void getStatus();
    Q_INVOKABLE void getHealth();
    Q_INVOKABLE void getWaterLevel();
    Q_INVOKABLE void getSensors();
    Q_INVOKABLE void getConfig();
    Q_INVOKABLE void getHistory(int rangeHours);
    Q_INVOKABLE void syncHistoricalData(uint32_t sinceSequence);
    Q_INVOKABLE void ackHistoricalData(uint32_t sequence);
    Q_INVOKABLE void setAlarm(bool enabled);
    Q_INVOKABLE void setCalibration(float airAdc);
    Q_INVOKABLE void postConfig(double maxHeightCm, bool alarmEnabled);
    Q_INVOKABLE void postTankConfig(const QJsonObject &configObj);
    Q_INVOKABLE void factoryResetTankConfig();
    Q_INVOKABLE void testEsp32Connection(const QString &host, int port);

public slots:
    void startPolling();
    void stopPolling();
    void setHistoryRangeHours(int hours);
    void fetchHistoricalData();

signals:
    void readingReceived(double waterLevel, double pressure, const QString &sensorStatus, qint64 timestampMs = 0, bool isFresh = true);
    void historicalDataReceived(const QVariantList &history);
    void historicalSyncReceived(const QVariantList &history, uint32_t nextSequence, bool hasMore);
    void networkError(QString error);
    void connectionStateChanged(bool connected);
    void connectionStatusChanged(ConnectionState state, const QString &stateStr);
    void statusReceived(const QJsonObject &statusObj);
    void configReceived(const QJsonObject &configObj);
    void configPostCompleted(bool success, const QString &message);
    void healthReceived(const QJsonObject &healthObj);
    void esp32ConnectionTested(bool success, const QString &statusTitle, const QString &ip, const QString &responseDetail, const QString &errorMessage);

private slots:
    void fetchLatestData();
    void onReplyFinished(QNetworkReply *reply);

private:
    [[nodiscard]] QUrl buildEsp32Url(const QString &endpoint) const;
    [[nodiscard]] QNetworkRequest buildRequest() const;
    [[nodiscard]] QNetworkRequest buildHistoricalRequest() const;
    void handleNetworkError(QNetworkReply *reply);
    void parseReply(const QByteArray &data);
    void parseStatusReply(const QByteArray &data);
    void parseEsp32HistoricalReply(const QByteArray &data);
    void parseEsp32SyncReply(const QByteArray &data);
    void parseHealthReply(const QByteArray &data);
    void parseConfigReply(const QByteArray &data);
    void parseConfigPostReply(const QByteArray &data);
    void parseHistoricalReply(QNetworkReply *reply);
    void extractVariables(const QJsonDocument &doc);
    void logHttpRequest(const QString &endpoint, const QString &fullUrl,
                        int httpStatus, int networkErrorVal,
                        const QString &errorStr, int responseSize,
                        const QString &responseBody, bool parsedSuccess,
                        double waterLevelCm, double levelPercent,
                        const QString &sensorStatus);

    QNetworkAccessManager m_networkManager;
    QTimer m_pollTimer;
    QTimer m_historyTimer;
    int m_historyRangeHours{12};

    QString m_apiBaseUrl;
    QString m_authToken;
    QString m_deviceLabel;

    QString m_esp32Host{QStringLiteral("192.168.1.219")};
    int m_esp32Port{80};
    bool m_useDirectEsp32{true};

    int m_pollingIntervalMs{1000};
    int m_transferTimeoutMs{5000};

    QString m_levelVar;
    QString m_pressureVar;
    QString m_statusVar;
    ConnectionState m_connectionState{ConnectionState::Disconnected};
    bool m_hasVerifiedHealth{false};
    bool m_requestInProgress{false};
    bool m_pollTimerActive{false};

           // Cached last valid values for partial/missing variable tolerance
    double m_lastValidWaterLevel{0.0};
    double m_lastValidPressure{1013.2};
    QString m_lastValidSensorStatus{QStringLiteral("Healthy")};
    bool m_hasReceivedFirstValidReading{false};
};

} // namespace Panorama

#endif // PANORAMA_APICLIENT_H