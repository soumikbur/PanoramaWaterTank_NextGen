#include "ApiClient.h"
#include <QUrlQuery>
#include <QDebug>
#include <QDateTime>
#include <QTimeZone>
#include <QElapsedTimer>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QJsonValue>
#include <QVariant>
#include <algorithm>
#include <cmath>

namespace Panorama {

ApiClient::ApiClient(QObject *parent)
    : QObject(parent)
{
    connect(&m_pollTimer, &QTimer::timeout, this, &ApiClient::fetchLatestData);
    connect(&m_historyTimer, &QTimer::timeout, this, &ApiClient::fetchHistoricalData);
    connect(&m_networkManager, &QNetworkAccessManager::finished, this, &ApiClient::onReplyFinished);
}

QString ApiClient::connectionStateString() const
{
    switch (m_connectionState) {
        case ConnectionState::Connecting: return QStringLiteral("Connecting");
        case ConnectionState::Connected: return QStringLiteral("Connected");
        case ConnectionState::Error: return QStringLiteral("Error");
        case ConnectionState::Disconnected:
        default: return QStringLiteral("Disconnected");
    }
}

void ApiClient::setConnectionState(ConnectionState state, const QString &reason)
{
    if (m_connectionState != state) {
        m_connectionState = state;
        const QString stateStr = connectionStateString();
        qDebug().noquote() << "[WLI HTTP] Connection state ->" << stateStr << (reason.isEmpty() ? QString() : QStringLiteral("(%1)").arg(reason));
        emit connectionStatusChanged(m_connectionState, stateStr);
        emit connectionStateChanged(m_connectionState == ConnectionState::Connected);
    }
}

void ApiClient::logHttpRequest(const QString &endpoint, const QString &fullUrl,
                              int httpStatus, int networkErrorVal,
                              const QString &errorStr, int responseSize,
                              const QString &responseBody, bool parsedSuccess,
                              double waterLevelCm, double levelPercent,
                              const QString &sensorStatus)
{
    Q_UNUSED(fullUrl);
    Q_UNUSED(errorStr);
    Q_UNUSED(responseSize);
    Q_UNUSED(responseBody);
    Q_UNUSED(parsedSuccess);

    static qint64 lastLogTime = 0;
    const qint64 now = QDateTime::currentMSecsSinceEpoch();

    // In production mode, log on error or periodically (every 10s) without spamming every second
    if (networkErrorVal != 0 || httpStatus >= 400 || (now - lastLogTime >= 10000)) {
        lastLogTime = now;
        qDebug().noquote() << "[WLI HTTP] GET" << endpoint << "status=" << httpStatus
                           << "| Level:" << QString::number(waterLevelCm, 'f', 2) << "cm ("
                           << QString::number(levelPercent, 'f', 2) << "%)"
                           << "| Sensor:" << sensorStatus;
    }
}

void ApiClient::setApiConfiguration(const QString &baseUrl,
                                    const QString &token,
                                    const QString &deviceLabel,
                                    int pollingIntervalMs,
                                    int transferTimeoutMs,
                                    const QString &levelVar,
                                    const QString &pressureVar,
                                    const QString &statusVar)
{
    m_apiBaseUrl = baseUrl.trimmed();
    m_authToken = token.trimmed();
    m_deviceLabel = deviceLabel.trimmed();

    m_pollingIntervalMs = (pollingIntervalMs > 0) ? pollingIntervalMs : 15000;
    m_transferTimeoutMs = (transferTimeoutMs > 0) ? transferTimeoutMs : 10000;

    m_levelVar = levelVar.trimmed();
    m_pressureVar = pressureVar.trimmed();
    m_statusVar = statusVar.trimmed();

    if (m_pollTimer.isActive() && m_pollTimer.interval() != m_pollingIntervalMs) {
        m_pollTimer.setInterval(m_pollingIntervalMs);
    }
}

void ApiClient::setEsp32Configuration(const QString &host,
                                     int port,
                                     bool useDirect,
                                     int pollingIntervalMs,
                                     int transferTimeoutMs)
{
    const bool hostChanged = (m_esp32Host != host.trimmed());
    m_esp32Host = host.trimmed();
    m_esp32Port = (port > 0) ? port : 80;
    m_useDirectEsp32 = useDirect;

    if (hostChanged) {
        m_hasVerifiedHealth = false;
        setConnectionState(ConnectionState::Disconnected, QStringLiteral("Host changed"));
    }

    m_pollingIntervalMs = (pollingIntervalMs > 0) ? pollingIntervalMs : 1000;
    m_transferTimeoutMs = (transferTimeoutMs > 0) ? transferTimeoutMs : 5000;

    if (m_pollTimer.isActive() && m_pollTimer.interval() != m_pollingIntervalMs) {
        m_pollTimer.setInterval(m_pollingIntervalMs);
    }
}

QUrl ApiClient::buildEsp32Url(const QString &endpoint) const
{
    QUrl url;
    url.setScheme(QStringLiteral("http"));
    url.setHost(m_esp32Host.trimmed());
    if (m_esp32Port > 0 && m_esp32Port != 80) {
        url.setPort(m_esp32Port);
    }
    QString p = endpoint.startsWith(QLatin1Char('/')) ? endpoint : (QLatin1Char('/') + endpoint);
    url.setPath(p);
    return url;
}

void ApiClient::getStatus()
{
    QUrl url = buildEsp32Url(QStringLiteral("/api/v1/status"));
    QNetworkRequest request(url);
    request.setRawHeader("Accept", "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);
    m_networkManager.get(request);
}

void ApiClient::getHealth()
{
    QUrl url = buildEsp32Url(QStringLiteral("/api/v1/health"));
    QNetworkRequest request(url);
    request.setRawHeader("Accept", "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);
    m_networkManager.get(request);
}

void ApiClient::getWaterLevel()
{
    QUrl url = buildEsp32Url(QStringLiteral("/api/v1/water-level"));
    QNetworkRequest request(url);
    request.setRawHeader("Accept", "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);
    m_networkManager.get(request);
}

void ApiClient::getSensors()
{
    QUrl url = buildEsp32Url(QStringLiteral("/api/v1/sensors"));
    QNetworkRequest request(url);
    request.setRawHeader("Accept", "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);
    m_networkManager.get(request);
}

void ApiClient::getConfig()
{
    QUrl url = buildEsp32Url(QStringLiteral("/api/v1/config"));
    QNetworkRequest request(url);
    request.setRawHeader("Accept", "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);
    m_networkManager.get(request);
}

void ApiClient::getHistory(int rangeHours)
{
    if (rangeHours <= 0) rangeHours = 12;
    m_historyRangeHours = rangeHours;

    if (m_useDirectEsp32) {
        QString rangeStr = QStringLiteral("12h");
        if (rangeHours == 24) rangeStr = QStringLiteral("24h");
        else if (rangeHours >= 168) rangeStr = QStringLiteral("7d");

        QUrl url = buildEsp32Url(QStringLiteral("/api/v1/history"));
        QUrlQuery query;
        query.addQueryItem(QStringLiteral("range"), rangeStr);
        url.setQuery(query);

        QNetworkRequest request(url);
        request.setRawHeader("Accept", "application/json");
        request.setTransferTimeout(m_transferTimeoutMs);
        m_networkManager.get(request);
    } else {
        fetchHistoricalData();
    }
}

void ApiClient::syncHistoricalData(uint32_t sinceSequence)
{
    if (m_useDirectEsp32) {
        QUrl url = buildEsp32Url(QStringLiteral("/api/v1/sync"));
        QUrlQuery query;
        query.addQueryItem(QStringLiteral("sinceSequence"), QString::number(sinceSequence));
        query.addQueryItem(QStringLiteral("limit"), QStringLiteral("100"));
        url.setQuery(query);

        QNetworkRequest request(url);
        request.setRawHeader("Accept", "application/json");
        request.setTransferTimeout(m_transferTimeoutMs);
        m_networkManager.get(request);
    }
}

void ApiClient::ackHistoricalData(uint32_t sequence)
{
    if (m_useDirectEsp32) {
        QUrl url = buildEsp32Url(QStringLiteral("/api/v1/sync/ack"));
        QNetworkRequest request(url);
        request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
        request.setTransferTimeout(m_transferTimeoutMs);

        QJsonObject obj;
        obj[QStringLiteral("lastSequence")] = static_cast<qint64>(sequence);

        m_networkManager.post(request, QJsonDocument(obj).toJson(QJsonDocument::Compact));
    }
}

void ApiClient::setAlarm(bool enabled)
{
    QUrl url = buildEsp32Url(QStringLiteral("/api/v1/alarm"));
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);

    QJsonObject obj;
    obj[QStringLiteral("alarm_enabled")] = enabled;

    m_networkManager.post(request, QJsonDocument(obj).toJson(QJsonDocument::Compact));
}

void ApiClient::setCalibration(float airAdc)
{
    QUrl url = buildEsp32Url(QStringLiteral("/api/v1/calibration"));
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);

    QJsonObject obj;
    obj[QStringLiteral("air_adc")] = airAdc;

    m_networkManager.post(request, QJsonDocument(obj).toJson(QJsonDocument::Compact));
}

void ApiClient::postConfig(double maxHeightCm, bool alarmEnabled)
{
    if (!m_useDirectEsp32 || m_connectionState != ConnectionState::Connected) {
        qWarning() << "[ApiClient] Remote configuration not supported via current firmware / cloud connection path.";
        emit configPostCompleted(false, QStringLiteral("Device configuration not supported by current firmware"));
        return;
    }

    QUrl url = buildEsp32Url(QStringLiteral("/api/v1/config"));
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);

    QJsonObject obj;
    obj[QStringLiteral("max_height_cm")] = maxHeightCm;
    obj[QStringLiteral("alarm_enabled")] = alarmEnabled;

    m_networkManager.post(request, QJsonDocument(obj).toJson(QJsonDocument::Compact));
}

void ApiClient::postTankConfig(const QJsonObject &configObj)
{
    if (!m_useDirectEsp32 || m_connectionState != ConnectionState::Connected) {
        qWarning() << "[ApiClient] Remote configuration not supported via current firmware / cloud connection path.";
        emit configPostCompleted(false, QStringLiteral("Device configuration not supported by current firmware"));
        return;
    }

    QUrl url = buildEsp32Url(QStringLiteral("/api/v1/config"));
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);

    QByteArray payload = QJsonDocument(configObj).toJson(QJsonDocument::Compact);
    qDebug().noquote() << "[CONFIG][REQUEST] method = POST endpoint = /api/v1/config payload =" << payload;
    m_networkManager.post(request, payload);
}

void ApiClient::factoryResetTankConfig()
{
    if (!m_useDirectEsp32 || m_connectionState != ConnectionState::Connected) {
        qWarning() << "[ApiClient] Remote configuration not supported via current firmware / cloud connection path.";
        emit configPostCompleted(false, QStringLiteral("Device configuration not supported by current firmware"));
        return;
    }

    QJsonObject resetObj;
    resetObj[QStringLiteral("reset")] = true;
    postTankConfig(resetObj);
}

void ApiClient::setHistoryRangeHours(int hours)
{
    if (hours <= 0) hours = 12;
    if (m_historyRangeHours != hours) {
        m_historyRangeHours = hours;
        qDebug() << "[Trend] History range changed to" << hours << "hours. Fetching new historical data.";
        fetchHistoricalData();
    }
}

void ApiClient::startPolling()
{
    m_pollTimerActive = true;
    m_pollTimer.setSingleShot(true);
    if (!m_pollTimer.isActive()) {
        fetchLatestData();
    }
    if (!m_historyTimer.isActive()) {
        m_historyTimer.start(60000); // 60s slow background history refresh
        fetchHistoricalData();
    }
}

void ApiClient::stopPolling()
{
    m_pollTimerActive = false;
    if (m_pollTimer.isActive()) {
        m_pollTimer.stop();
    }
    if (m_historyTimer.isActive()) {
        m_historyTimer.stop();
    }
}

void ApiClient::fetchLatestData()
{
    if (m_useDirectEsp32) {
        if (m_esp32Host.trimmed().isEmpty()) {
            setConnectionState(ConnectionState::Error, QStringLiteral("Missing ESP32 host"));
            emit networkError(QStringLiteral("Missing ESP32 IP address or hostname."));
            return;
        }

        if (m_requestInProgress) {
            return;
        }

        m_requestInProgress = true;
        if (!m_hasVerifiedHealth || m_connectionState != ConnectionState::Connected) {
            if (m_connectionState != ConnectionState::Disconnected && m_connectionState != ConnectionState::Error) {
                setConnectionState(ConnectionState::Connecting, QStringLiteral("Probing /api/v1/health"));
            }
            getHealth();
        } else {
            getStatus();
        }
        return;
    }

    if (m_authToken.isEmpty() || m_apiBaseUrl.isEmpty() || m_deviceLabel.isEmpty()) {
        setConnectionState(ConnectionState::Error, QStringLiteral("Missing API configuration"));
        emit networkError(QStringLiteral("Missing API configuration (Base URL, Token, or Device Label)."));
        return;
    }

    if (!m_requestInProgress) {
        m_requestInProgress = true;
        if (m_connectionState != ConnectionState::Disconnected && m_connectionState != ConnectionState::Error) {
            setConnectionState(ConnectionState::Connecting, QStringLiteral("Polling cloud"));
        }
        QNetworkRequest request = buildRequest();
        m_networkManager.get(request);
    }
}

void ApiClient::fetchHistoricalData()
{
    if (m_useDirectEsp32) {
        if (m_esp32Host.trimmed().isEmpty()) return;
        getHistory(m_historyRangeHours);
        return;
    }

    if (m_authToken.isEmpty() || m_apiBaseUrl.isEmpty() || m_deviceLabel.isEmpty()) {
        return;
    }

    QNetworkRequest request = buildHistoricalRequest();
    m_networkManager.get(request);
}

QNetworkRequest ApiClient::buildRequest() const
{
    QString urlStr = m_apiBaseUrl;
    if (!urlStr.endsWith(QLatin1Char('/'))) {
        urlStr += QLatin1Char('/');
    }

    QString deviceKey = m_deviceLabel.trimmed();
    if (!deviceKey.startsWith(QLatin1Char('~'))) {
        deviceKey = QLatin1Char('~') + deviceKey;
    }

    // Ubidots v2.0 endpoint for fetching all latest variable values by device API label:
    // /api/v2.0/devices/~{deviceLabel}/_/values/last
    urlStr += QStringLiteral("api/v2.0/devices/") + deviceKey + QStringLiteral("/_/values/last");

    QNetworkRequest request((QUrl(urlStr)));
    request.setRawHeader("X-Auth-Token", m_authToken.toUtf8());
    request.setRawHeader("Content-Type", "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);
    return request;
}

QNetworkRequest ApiClient::buildHistoricalRequest() const
{
    QString urlStr = m_apiBaseUrl;
    if (!urlStr.endsWith(QLatin1Char('/'))) {
        urlStr += QLatin1Char('/');
    }

    const QString levelVar = m_levelVar.isEmpty() ? QStringLiteral("waterlevel") : m_levelVar.trimmed();

    const qint64 endMs = QDateTime::currentMSecsSinceEpoch();
    const qint64 durationMs = static_cast<qint64>(m_historyRangeHours) * 60LL * 60LL * 1000LL;
    const qint64 startMs = endMs - durationMs;

    qDebug() << "[Trend] Building API historical request: Range Hours =" << m_historyRangeHours
             << "Duration Ms =" << durationMs << "startMs =" << startMs << "endMs =" << endMs;

    // Ubidots v1.6 endpoint for fetching historical waterlevel values over dynamic range:
    // /api/v1.6/devices/{deviceLabel}/{levelVar}/values?start={startMs}&end={endMs}&page_size=500
    urlStr += QStringLiteral("api/v1.6/devices/") + m_deviceLabel.trimmed() + QLatin1Char('/') + levelVar + QStringLiteral("/values?start=") + QString::number(startMs) + QStringLiteral("&end=") + QString::number(endMs) + QStringLiteral("&page_size=500");

    QNetworkRequest request((QUrl(urlStr)));
    request.setRawHeader("X-Auth-Token", m_authToken.toUtf8());
    request.setRawHeader("Content-Type", "application/json");
    request.setTransferTimeout(m_transferTimeoutMs);
    return request;
}

void ApiClient::onReplyFinished(QNetworkReply *reply)
{
    reply->deleteLater();

    const QUrl replyUrl = reply->request().url();
    const QString path = replyUrl.path();
    const QString urlStr = replyUrl.toString();

    // Check for HTTP errors
    if (reply->error() != QNetworkReply::NoError) {
        handleNetworkError(reply);
        return;
    }

    const QVariant statusCode = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute);
    if (statusCode.isValid()) {
        const int status = statusCode.toInt();
        if (status < 200 || status >= 300) {
            handleNetworkError(reply);
            return;
        }
    }

    // Direct ESP32 REST API routing
    if (path.endsWith(QStringLiteral("/status"))) {
        m_requestInProgress = false;
        parseStatusReply(reply->readAll());
        return;
    }
    if (path.endsWith(QStringLiteral("/health"))) {
        parseHealthReply(reply->readAll());
        return;
    }
    if (path.endsWith(QStringLiteral("/history"))) {
        parseEsp32HistoricalReply(reply->readAll());
        return;
    }
    if (path.endsWith(QStringLiteral("/sync"))) {
        parseEsp32SyncReply(reply->readAll());
        return;
    }
    if (path.endsWith(QStringLiteral("/sync/ack"))) {
        // Ack response, just ignore or log
        qDebug() << "[Sync] Ack accepted:" << reply->readAll();
        return;
    }
    if (path.endsWith(QStringLiteral("/config"))) {
        if (reply->operation() == QNetworkAccessManager::GetOperation) {
            parseConfigReply(reply->readAll());
        } else {
            parseConfigPostReply(reply->readAll());
        }
        return;
    }
    if (path.endsWith(QStringLiteral("/water-level")) || path.endsWith(QStringLiteral("/sensors"))) {
        m_requestInProgress = false;
        parseStatusReply(reply->readAll());
        return;
    }

    // Ubidots cloud fallback routing
    const bool isHistorical = urlStr.contains(QStringLiteral("/values")) && !urlStr.contains(QStringLiteral("/_/values/last"));
    if (isHistorical) {
        parseHistoricalReply(reply);
        return;
    }

    m_requestInProgress = false;
    parseReply(reply->readAll());
    if (m_pollTimerActive && !m_pollTimer.isActive()) {
        m_pollTimer.start(m_pollingIntervalMs);
    }
}

void ApiClient::parseHistoricalReply(QNetworkReply *reply)
{
    const QVariant statusCode = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute);
    const int status = statusCode.isValid() ? statusCode.toInt() : 0;

    // Safe Diagnostic Logging (NEVER log authentication token or header)
    qDebug() << "======================================";
    qDebug() << "Historical request URL:" << reply->request().url().toString();
    qDebug() << "HTTP status           :" << status;

    if (reply->error() != QNetworkReply::NoError || (status != 200 && status != 201)) {
        qDebug() << "Historical request failed:" << reply->errorString();
        qDebug() << "======================================";
        return;
    }

    const QByteArray data = reply->readAll();
    QJsonParseError parseError;
    QJsonDocument jsonDoc = QJsonDocument::fromJson(data, &parseError);

    if (parseError.error != QJsonParseError::NoError || !jsonDoc.isObject()) {
        qDebug() << "Failed to parse historical JSON response.";
        qDebug() << "======================================";
        return;
    }

    QJsonObject rootObj = jsonDoc.object();
    QJsonArray resultsArray;
    if (rootObj.contains(QStringLiteral("results")) && rootObj.value(QStringLiteral("results")).isArray()) {
        resultsArray = rootObj.value(QStringLiteral("results")).toArray();
    }

    struct HistoricalPoint {
        qint64 timestampMs;
        double value;
    };
    QList<HistoricalPoint> points;

    for (const QJsonValue &item : resultsArray) {
        if (!item.isObject()) continue;
        QJsonObject o = item.toObject();
        if (!o.contains(QStringLiteral("value")) || !o.contains(QStringLiteral("timestamp"))) continue;

        QJsonValue valObj = o.value(QStringLiteral("value"));
        QJsonValue tsObj = o.value(QStringLiteral("timestamp"));

        bool okVal = false;
        double val = 0.0;
        if (valObj.isDouble()) {
            val = valObj.toDouble();
            okVal = true;
        } else if (valObj.isString()) {
            val = valObj.toString().toDouble(&okVal);
        }

        qint64 ts = 0;
        if (tsObj.isDouble()) {
            ts = static_cast<qint64>(tsObj.toDouble());
        } else if (tsObj.isString()) {
            const QString tsStr = tsObj.toString();
            bool okNum = false;
            ts = tsStr.toLongLong(&okNum);
            if (!okNum) {
                // Try parsing ISO-8601 date string (e.g. "2026-08-18T06:00:00Z")
                QDateTime dt = QDateTime::fromString(tsStr, Qt::ISODateWithMs);
                if (!dt.isValid()) {
                    dt = QDateTime::fromString(tsStr, Qt::ISODate);
                }
                if (dt.isValid()) {
                    ts = dt.toMSecsSinceEpoch();
                }
            }
        }

        // Canonical normalization: Unix seconds (< 10^11) to milliseconds
        if (ts > 0 && ts < 100000000000LL) {
            ts *= 1000LL;
        }

        if (!okVal || std::isnan(val) || std::isinf(val) || ts <= 0) {
            qWarning() << "[Chart] Invalid timestamp or value rejected:" << ts << val;
            continue;
        }

        points.append({ts, val});
    }

    // Sort points chronologically: oldest -> newest
    std::sort(points.begin(), points.end(), [](const HistoricalPoint &a, const HistoricalPoint &b) {
        return a.timestampMs < b.timestampMs;
    });

    qDebug() << "[Chart] Historical points received:" << points.size();
    if (!points.isEmpty()) {
        const QString firstUtc = QDateTime::fromMSecsSinceEpoch(points.first().timestampMs, QTimeZone::UTC).toString(Qt::ISODate);
        const QString lastUtc = QDateTime::fromMSecsSinceEpoch(points.last().timestampMs, QTimeZone::UTC).toString(Qt::ISODate);
        qDebug() << "[Chart] First:" << firstUtc << "UTC | timestampMs:" << points.first().timestampMs << "val:" << points.first().value;
        qDebug() << "[Chart] Last :" << lastUtc << "UTC | timestampMs:" << points.last().timestampMs << "val:" << points.last().value;
        qDebug() << "[Chart] Range:" << m_historyRangeHours << "hours | Timestamp unit: epoch milliseconds";
    }
    qDebug() << "======================================";

    QVariantList historyList;
    historyList.reserve(points.size());
    for (const HistoricalPoint &pt : points) {
        QVariantMap map;
        map[QStringLiteral("timestampMs")] = pt.timestampMs;
        map[QStringLiteral("timestamp")] = pt.timestampMs;
        map[QStringLiteral("value")] = pt.value;
        historyList.append(map);
    }

    emit historicalDataReceived(historyList);
}

void ApiClient::parseStatusReply(const QByteArray &data)
{
    m_requestInProgress = false;

    QJsonParseError parseError;
    QJsonDocument jsonDoc = QJsonDocument::fromJson(data, &parseError);
    if (parseError.error != QJsonParseError::NoError || !jsonDoc.isObject()) {
        setConnectionState(ConnectionState::Error, QStringLiteral("Status JSON parse error"));
        qDebug().noquote() << "[WLI HTTP] JSON PARSE ERROR\nRaw Response:" << QString::fromUtf8(data);
        emit networkError(QStringLiteral("Failed to parse ESP32 status JSON: ") + parseError.errorString());
        return;
    }

    QJsonObject obj = jsonDoc.object();

    qDebug().noquote() << "[ApiClient][LIVE] HTTP 200 Raw JSON:" << QString::fromUtf8(data);

    m_hasVerifiedHealth = true;
    setConnectionState(ConnectionState::Connected, QStringLiteral("Status JSON parsed successfully"));

    double waterLevelCm = 0.0;
    if (obj.contains(QStringLiteral("water_level_cm"))) {
        waterLevelCm = obj.value(QStringLiteral("water_level_cm")).toDouble();
    } else if (obj.contains(QStringLiteral("waterLevelCm"))) {
        waterLevelCm = obj.value(QStringLiteral("waterLevelCm")).toDouble();
    } else {
        qWarning() << "[ApiClient][ERROR] Missing JSON field: water_level_cm";
    }

    double levelPercent = 0.0;
    if (obj.contains(QStringLiteral("level_percent"))) {
        levelPercent = obj.value(QStringLiteral("level_percent")).toDouble();
    } else if (obj.contains(QStringLiteral("levelPercent"))) {
        levelPercent = obj.value(QStringLiteral("levelPercent")).toDouble();
    } else if (obj.contains(QStringLiteral("water_level_percent"))) {
        levelPercent = obj.value(QStringLiteral("water_level_percent")).toDouble();
    } else {
        qWarning() << "[ApiClient][ERROR] Missing JSON field: level_percent";
    }

    double volumeL = 0.0;
    if (obj.contains(QStringLiteral("tank_volume_l"))) {
        volumeL = obj.value(QStringLiteral("tank_volume_l")).toDouble();
    } else if (obj.contains(QStringLiteral("volume_l"))) {
        volumeL = obj.value(QStringLiteral("volume_l")).toDouble();
    } else if (obj.contains(QStringLiteral("volume_liters"))) {
        volumeL = obj.value(QStringLiteral("volume_liters")).toDouble();
    } else if (obj.contains(QStringLiteral("waterVolumeLiters"))) {
        volumeL = obj.value(QStringLiteral("waterVolumeLiters")).toDouble();
    }

    double rawVoltage = obj.value(QStringLiteral("raw_voltage")).toDouble(0.0);
    double pressureHpa = obj.value(QStringLiteral("pressure_hpa")).toDouble(1013.25);
    double humidity = obj.value(QStringLiteral("humidity_percent")).toDouble(50.0);
    int statusInt = obj.value(QStringLiteral("sensor_status")).toInt(1);
    QString statusStr = (statusInt == 1) ? QStringLiteral("Healthy") : QStringLiteral("Fault");
    QString alarmState = obj.value(QStringLiteral("alarm_state")).toString(QStringLiteral("Normal"));
    bool alarmEnabled = obj.value(QStringLiteral("alarm_enabled")).toBool(true);
    bool calibrated = obj.value(QStringLiteral("calibrated")).toBool(false);
    qint64 timestamp = static_cast<qint64>(obj.value(QStringLiteral("timestamp")).toDouble(0.0));

    Q_UNUSED(rawVoltage);
    Q_UNUSED(humidity);
    Q_UNUSED(alarmState);
    Q_UNUSED(alarmEnabled);
    Q_UNUSED(calibrated);
    Q_UNUSED(timestamp);

    bool measurementValid = obj.value(QStringLiteral("measurement_valid")).toBool(true);
    QString measurementState = obj.value(QStringLiteral("measurement_state")).toString(QStringLiteral("VALID"));
    if (measurementState.isEmpty()) {
        measurementState = QStringLiteral("VALID");
    }

    qDebug().noquote() << "========================================";
    qDebug().noquote() << "[API RESPONSE]";
    qDebug().noquote() << "waterLevel =" << obj.value(QStringLiteral("level_percent")).toDouble();
    qDebug().noquote() << "waterHeight =" << obj.value(QStringLiteral("water_level_cm")).toDouble();
    qDebug().noquote() << "tankVolume =" << obj.value(QStringLiteral("tank_volume_l")).toDouble();
    qDebug().noquote() << "pressure =" << obj.value(QStringLiteral("pressure_hpa")).toDouble();
    qDebug().noquote() << "----------------------------------------";
    qDebug().noquote() << "[PARSED DATA]";
    qDebug().noquote() << "waterHeight =" << QString::number(waterLevelCm, 'f', 2);
    qDebug().noquote() << "waterLevel =" << QString::number(levelPercent, 'f', 2);
    qDebug().noquote() << "tankVolume =" << QString::number(volumeL, 'f', 2);
    qDebug().noquote() << "pressure =" << QString::number(pressureHpa, 'f', 1);
    qDebug().noquote() << "========================================";

    qDebug().noquote() << QStringLiteral("[ApiClient][LIVE] height = %1, percentage = %2, volume = %3, measurement_valid = %4, measurement_state = %5")
        .arg(waterLevelCm, 0, 'f', 2)
        .arg(levelPercent, 0, 'f', 2)
        .arg(volumeL, 0, 'f', 2)
        .arg(measurementValid ? QStringLiteral("true") : QStringLiteral("false"))
        .arg(measurementState);

    if (statusInt == 1 && measurementValid && measurementState != QStringLiteral("SENSOR_ERROR")) {
        m_lastValidWaterLevel = waterLevelCm;
        m_lastValidPressure = pressureHpa;
        m_lastValidSensorStatus = statusStr;
        m_hasReceivedFirstValidReading = true;
    } else {
        m_lastValidSensorStatus = statusStr;
    }

    logHttpRequest(QStringLiteral("/api/status"),
                   QStringLiteral("http://%1:%2/api/status").arg(m_esp32Host).arg(m_esp32Port),
                   200,
                   0,
                   QString(),
                   data.size(),
                   QString::fromUtf8(data),
                   true,
                   waterLevelCm,
                   levelPercent,
                   statusStr);

    emit statusReceived(obj);

    if (m_pollTimerActive && !m_pollTimer.isActive()) {
        m_pollTimer.start(m_pollingIntervalMs);
    }
}

void ApiClient::parseEsp32HistoricalReply(const QByteArray &data)
{
    QJsonParseError parseError;
    QJsonDocument jsonDoc = QJsonDocument::fromJson(data, &parseError);
    if (parseError.error != QJsonParseError::NoError || !jsonDoc.isObject()) {
        qWarning() << "[Chart] Failed to parse ESP32 historical JSON:" << parseError.errorString();
        return;
    }

    QJsonObject rootObj = jsonDoc.object();
    QJsonArray results = rootObj.value(QStringLiteral("results")).toArray();

    struct HistoricalPoint {
        qint64 timestampMs;
        double value;
        double waterLevelCm;
        double volumeL;
    };
    QList<HistoricalPoint> points;

    const qint64 nowMs = QDateTime::currentMSecsSinceEpoch();

    qint64 maxEspTimestamp = 0;
    for (const QJsonValue &v : results) {
        if (!v.isObject()) continue;
        QJsonObject o = v.toObject();
        qint64 t = static_cast<qint64>(o.value(QStringLiteral("timestamp")).toDouble(0));
        if (t > maxEspTimestamp) maxEspTimestamp = t;
    }

    for (const QJsonValue &v : results) {
        if (!v.isObject()) continue;
        QJsonObject o = v.toObject();

        qint64 tsRaw = static_cast<qint64>(o.value(QStringLiteral("timestamp")).toDouble(0));
        double levelCm = o.value(QStringLiteral("water_level_cm")).toDouble(0.0);
        double levelPct = o.value(QStringLiteral("level_percent")).toDouble(0.0);
        double volumeL = o.value(QStringLiteral("volume_l")).toDouble(0.0);

        qint64 finalTsMs = 0;
        if (tsRaw >= 1000000000000LL) {
            finalTsMs = tsRaw;
        } else if (tsRaw >= 1000000000LL && tsRaw < 100000000000LL) {
            finalTsMs = tsRaw * 1000LL;
        } else {
            qint64 ageMs = (maxEspTimestamp > tsRaw) ? (maxEspTimestamp - tsRaw) : 0;
            finalTsMs = nowMs - ageMs;
        }

        points.append({finalTsMs, levelPct, levelCm, volumeL});
    }

    std::sort(points.begin(), points.end(), [](const HistoricalPoint &a, const HistoricalPoint &b) {
        return a.timestampMs < b.timestampMs;
    });

    QVariantList historyList;
    historyList.reserve(points.size());
    for (const auto &pt : points) {
        QVariantMap map;
        map[QStringLiteral("timestampMs")] = pt.timestampMs;
        map[QStringLiteral("timestamp")] = pt.timestampMs;
        map[QStringLiteral("value")] = pt.value;
        map[QStringLiteral("water_level_cm")] = pt.waterLevelCm;
        map[QStringLiteral("waterLevelCm")] = pt.waterLevelCm;
        map[QStringLiteral("volume_l")] = pt.volumeL;
        map[QStringLiteral("volumeL")] = pt.volumeL;
        historyList.append(map);
    }

    qDebug() << "[Chart] ESP32 historical points processed:" << historyList.size();
    emit historicalDataReceived(historyList);
}

void ApiClient::parseEsp32SyncReply(const QByteArray &data)
{
    QJsonParseError parseError;
    QJsonDocument jsonDoc = QJsonDocument::fromJson(data, &parseError);
    if (parseError.error != QJsonParseError::NoError || !jsonDoc.isObject()) {
        qWarning() << "[Sync] Failed to parse ESP32 sync JSON:" << parseError.errorString();
        return;
    }

    QJsonObject rootObj = jsonDoc.object();
    QJsonArray records = rootObj.value(QStringLiteral("records")).toArray();
    uint32_t nextSequence = rootObj.value(QStringLiteral("nextSequence")).toDouble(0);
    bool hasMore = rootObj.value(QStringLiteral("hasMore")).toBool(false);

    QVariantList syncList;
    syncList.reserve(records.size());

    for (const QJsonValue &v : records) {
        if (!v.isObject()) continue;
        QJsonObject o = v.toObject();

        uint32_t seq = o.value(QStringLiteral("sequence")).toDouble(0);
        qint64 tsRaw = static_cast<qint64>(o.value(QStringLiteral("timestamp")).toDouble(0));
        double levelCm = o.value(QStringLiteral("waterLevel")).toDouble(0.0);
        double levelPct = 0.0;
        Q_UNUSED(levelPct);

        qint64 finalTsMs = 0;
        if (tsRaw >= 100000000000LL) {
            finalTsMs = tsRaw;
        } else if (tsRaw >= 1000000000LL) {
            finalTsMs = tsRaw * 1000LL;
        }

        if (finalTsMs > 0) {
            QVariantMap map;
            map[QStringLiteral("sequence")] = seq;
            map[QStringLiteral("timestampMs")] = finalTsMs;
            map[QStringLiteral("timestamp")] = finalTsMs;
            map[QStringLiteral("value")] = levelCm; // Trend chart uses value
            map[QStringLiteral("waterLevelCm")] = levelCm;
            syncList.append(map);
        }
    }

    qDebug() << "[Sync] Received" << syncList.size() << "records. nextSeq:" << nextSequence << "hasMore:" << hasMore;
    emit historicalSyncReceived(syncList, nextSequence, hasMore);
}


void ApiClient::parseHealthReply(const QByteArray &data)
{
    m_requestInProgress = false;
    QJsonParseError parseError;
    QJsonDocument jsonDoc = QJsonDocument::fromJson(data, &parseError);
    if (parseError.error == QJsonParseError::NoError && jsonDoc.isObject()) {
        QJsonObject obj = jsonDoc.object();
        emit healthReceived(obj);
        if (obj.value(QStringLiteral("status")).toString() == QStringLiteral("ok")) {
            qDebug().noquote() << "[ESP32] HTTP status: 200";
            qDebug().noquote() << "[ESP32] Response:" << QString::fromUtf8(data);
            m_hasVerifiedHealth = true;
            setConnectionState(ConnectionState::Connected, QStringLiteral("Health check verified ok"));
            // Immediately request live status now that connection is established
            m_requestInProgress = true;
            getStatus();
            return;
        }
    }
    setConnectionState(ConnectionState::Error, QStringLiteral("Health response not ok"));
    emit networkError(QStringLiteral("Health check returned invalid response."));
    if (m_pollTimerActive && !m_pollTimer.isActive()) {
        m_pollTimer.start(m_pollingIntervalMs);
    }
}

void ApiClient::parseConfigReply(const QByteArray &data)
{
    QJsonParseError parseError;
    QJsonDocument jsonDoc = QJsonDocument::fromJson(data, &parseError);
    if (parseError.error == QJsonParseError::NoError && jsonDoc.isObject()) {
        QJsonObject obj = jsonDoc.object();
        // Guard: Only emit configReceived if the object contains configuration payload fields
        // (not just a post acknowledgment with success/message)
        if (obj.contains(QStringLiteral("shape")) ||
            obj.contains(QStringLiteral("shape_id")) ||
            obj.contains(QStringLiteral("height_cm")) ||
            obj.contains(QStringLiteral("max_height_cm")) ||
            obj.contains(QStringLiteral("capacity_liters"))) {
            qDebug().noquote() << "[CONFIG][QT] parsed ="
                               << QJsonDocument(obj).toJson(QJsonDocument::Compact);
            emit configReceived(obj);
        } else {
            qWarning().noquote() << "[ApiClient] Received /config GET response without configuration fields:"
                                 << QJsonDocument(obj).toJson(QJsonDocument::Compact);
        }
    } else {
        qWarning() << "[ApiClient] Failed to parse /config JSON:" << parseError.errorString();
    }
}

void ApiClient::parseConfigPostReply(const QByteArray &data)
{
    QJsonParseError parseError;
    QJsonDocument jsonDoc = QJsonDocument::fromJson(data, &parseError);
    bool success = false;
    QString msg = QStringLiteral("Unknown response from ESP32");

    if (parseError.error == QJsonParseError::NoError && jsonDoc.isObject()) {
        QJsonObject obj = jsonDoc.object();
        success = obj.value(QStringLiteral("success")).toBool(true);
        msg = obj.value(QStringLiteral("message")).toString(
            obj.value(QStringLiteral("error")).toString(QStringLiteral("Configuration updated successfully")));
        qDebug().noquote() << "[CONFIG][ESP32] received ="
                           << "success =" << success << ", message =" << msg;
    } else {
        qWarning() << "[ApiClient] Malformed POST /config response:" << QString::fromUtf8(data);
        msg = QStringLiteral("Malformed response from ESP32");
    }

    emit configPostCompleted(success, msg);
}

void ApiClient::handleNetworkError(QNetworkReply *reply)
{
    m_requestInProgress = false;
    m_hasVerifiedHealth = false;

    const QUrl replyUrl = reply->url();
    const QString urlStr = replyUrl.toString();
    const QNetworkReply::NetworkError netErr = reply->error();
    const QString netErrStr = reply->errorString();
    const QVariant statusCode = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute);
    const int status = statusCode.isValid() ? statusCode.toInt() : 0;

    // Log complete networking failure according to diagnostics specification
    qWarning().noquote() << "[ESP32] GET" << urlStr;
    qWarning().noquote() << "[ESP32] Network error:" << netErr;
    qWarning().noquote() << "[ESP32] Error:" << netErrStr;
    if (status > 0) {
        qWarning().noquote() << "[ESP32] HTTP status:" << status;
    }

    if (status >= 400) {
        setConnectionState(ConnectionState::Error, QStringLiteral("HTTP %1").arg(status));
    } else {
        setConnectionState(ConnectionState::Disconnected, netErrStr);
    }

    QString errorMessage = netErrStr;
    if (statusCode.isValid()) {
        switch (status) {
            case 400: errorMessage = QStringLiteral("Bad request: check parameters"); break;
            case 401: errorMessage = QStringLiteral("Authentication failed"); break;
            case 404: errorMessage = QStringLiteral("Endpoint not found on ESP32 / server"); break;
            case 429: errorMessage = QStringLiteral("Rate limit exceeded"); break;
            case 500: errorMessage = QStringLiteral("ESP32 internal server error"); break;
            case 503: errorMessage = QStringLiteral("ESP32 sensor service busy"); break;
            default: errorMessage = QStringLiteral("HTTP Error %1").arg(status); break;
        }
    } else {
        if (m_useDirectEsp32) {
            switch (netErr) {
                case QNetworkReply::ConnectionRefusedError:
                    errorMessage = QStringLiteral("Connection refused (Port %1 closed or IP unreachable)").arg(replyUrl.port(80));
                    break;
                case QNetworkReply::TimeoutError:
                    errorMessage = QStringLiteral("Timeout (ESP32 did not respond within %1 ms)").arg(m_transferTimeoutMs);
                    break;
                case QNetworkReply::HostNotFoundError:
                    errorMessage = QStringLiteral("Host unreachable (Cannot resolve host %1)").arg(m_esp32Host);
                    break;
                default:
                    errorMessage = QStringLiteral("ESP32 server cannot be reached at %1:%2 (%3)").arg(m_esp32Host).arg(m_esp32Port).arg(netErrStr);
                    break;
            }
        } else {
            errorMessage = QStringLiteral("Cloud server cannot be reached.");
        }
    }

    logHttpRequest(replyUrl.path(),
                   urlStr,
                   status,
                   static_cast<int>(netErr),
                   netErrStr,
                   0,
                   QString(),
                   false,
                   0.0,
                   0.0,
                   QStringLiteral("Error"));

    if (replyUrl.path().endsWith(QStringLiteral("/config"))) {
        emit configPostCompleted(false, errorMessage);
    }

    emit networkError(errorMessage);

    if (m_pollTimerActive && !m_pollTimer.isActive()) {
        m_pollTimer.start(m_pollingIntervalMs);
    }
}

void ApiClient::testEsp32Connection(const QString &host, int port)
{
    QString h = host.trimmed();
    if (h.isEmpty()) {
        emit esp32ConnectionTested(false, QStringLiteral("ESP32 Connection: FAILED"), h, QString(), QStringLiteral("Host IP is required"));
        return;
    }
    int p = (port > 0) ? port : 80;
    QUrl url;
    url.setScheme(QStringLiteral("http"));
    url.setHost(h);
    if (p != 80) url.setPort(p);
    url.setPath(QStringLiteral("/api/v1/health"));

    QNetworkRequest request(url);
    request.setRawHeader("Accept", "application/json");
    request.setTransferTimeout(5000);

    qDebug().noquote() << "[ESP32] Testing connection -> GET" << url.toString();

    auto *timer = new QElapsedTimer();
    timer->start();

    QNetworkReply *reply = m_networkManager.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply, timer, h]() {
        reply->deleteLater();
        qint64 elapsed = timer->elapsed();
        delete timer;

        const QUrl replyUrl = reply->request().url();
        const QNetworkReply::NetworkError netErr = reply->error();
        const QVariant statusCode = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute);
        const int status = statusCode.isValid() ? statusCode.toInt() : 0;
        const QByteArray data = reply->readAll();

        qDebug().noquote() << "[ESP32] GET" << replyUrl.toString() << "(elapsed:" << elapsed << "ms)";

        if (netErr != QNetworkReply::NoError || status != 200) {
            QString reason;
            switch (netErr) {
                case QNetworkReply::ConnectionRefusedError:
                    reason = QStringLiteral("Connection refused (Port %1 closed or IP unreachable)").arg(replyUrl.port(80));
                    break;
                case QNetworkReply::TimeoutError:
                    reason = QStringLiteral("Timeout (ESP32 did not respond within 5000 ms)");
                    break;
                case QNetworkReply::HostNotFoundError:
                    reason = QStringLiteral("Host unreachable (Cannot resolve host %1)").arg(h);
                    break;
                default:
                    if (status > 0) {
                        reason = QStringLiteral("HTTP error %1").arg(status);
                    } else {
                        reason = reply->errorString();
                    }
                    break;
            }
            qWarning().noquote() << "[ESP32] Network error:" << netErr;
            qWarning().noquote() << "[ESP32] Error:" << reason;
            emit esp32ConnectionTested(false, QStringLiteral("ESP32 Connection: FAILED"), h, QString(), reason);
            return;
        }

        QJsonParseError parseErr;
        QJsonDocument doc = QJsonDocument::fromJson(data, &parseErr);
        if (parseErr.error != QJsonParseError::NoError || !doc.isObject()) {
            qWarning().noquote() << "[ESP32] JSON parse failure:" << parseErr.errorString();
            emit esp32ConnectionTested(false, QStringLiteral("ESP32 Connection: FAILED"), h, QString(), QStringLiteral("JSON parse failure"));
            return;
        }

        QJsonObject obj = doc.object();
        if (obj.value(QStringLiteral("status")).toString() == QStringLiteral("ok")) {
            qDebug().noquote() << "[ESP32] HTTP status: 200";
            qDebug().noquote() << "[ESP32] Response:" << QString::fromUtf8(data);
            emit esp32ConnectionTested(true, QStringLiteral("ESP32 Connection: SUCCESS"), h, QStringLiteral("Response: OK"), QString());
        } else {
            emit esp32ConnectionTested(false, QStringLiteral("ESP32 Connection: FAILED"), h, QString(), QStringLiteral("Invalid response (status != ok)"));
        }
    });
}

void ApiClient::parseReply(const QByteArray &data)
{
    QJsonParseError parseError;
    QJsonDocument jsonDoc = QJsonDocument::fromJson(data, &parseError);

    if (parseError.error != QJsonParseError::NoError) {
        emit networkError(QStringLiteral("Failed to parse JSON response: ") + parseError.errorString());
        return;
    }

    if (!jsonDoc.isObject() && !jsonDoc.isArray()) {
        emit networkError(QStringLiteral("Invalid JSON structure: Expected an object or array."));
        return;
    }

    extractVariables(jsonDoc);
}


void ApiClient::extractVariables(const QJsonDocument &doc)
{
    bool foundNewData = false;
    qint64 latestTimestampMs = 0;

    const QString targetLevel = (m_levelVar.isEmpty() ? QStringLiteral("waterlevel") : m_levelVar).trimmed().toLower();
    const QString targetPressure = (m_pressureVar.isEmpty() ? QStringLiteral("pressure") : m_pressureVar).trimmed().toLower();
    const QString targetStatus = (m_statusVar.isEmpty() ? QStringLiteral("sensorstatus") : m_statusVar).trimmed().toLower();

    double gpsLat = 0.0;
    double gpsLon = 0.0;
    double gpsAlt = 0.0;
    int gpsSats = 0;
    bool hasGpsLat = false;
    bool hasGpsLon = false;
    bool gpsValidFlag = false;
    bool hasGpsValidFlag = false;

    auto processPair = [&](const QString &rawLabel, const QJsonValue &rawVal) {
        const QString label = rawLabel.trimmed().toLower();
        QJsonValue val = rawVal;

        if (rawVal.isObject()) {
            QJsonObject o = rawVal.toObject();
            if (o.contains(QStringLiteral("timestamp"))) {
                qint64 ts = static_cast<qint64>(o.value(QStringLiteral("timestamp")).toDouble(0.0));
                if (ts > 0 && ts < 100000000000LL) ts *= 1000LL;
                if (ts > latestTimestampMs) latestTimestampMs = ts;
            }
            if (o.contains(QStringLiteral("created_at"))) {
                qint64 ts = static_cast<qint64>(o.value(QStringLiteral("created_at")).toDouble(0.0));
                if (ts > 0 && ts < 100000000000LL) ts *= 1000LL;
                if (ts > latestTimestampMs) latestTimestampMs = ts;
            }

            if (o.contains(QStringLiteral("value"))) {
                val = o.value(QStringLiteral("value"));
            } else if (o.contains(QStringLiteral("last_value")) && o.value(QStringLiteral("last_value")).isObject()) {
                val = o.value(QStringLiteral("last_value")).toObject().value(QStringLiteral("value"));
            }

            // Check if context contains lat/lng (Ubidots position variable)
            if (o.contains(QStringLiteral("context")) && o.value(QStringLiteral("context")).isObject()) {
                QJsonObject ctx = o.value(QStringLiteral("context")).toObject();
                if (ctx.contains(QStringLiteral("lat")) && ctx.contains(QStringLiteral("lng"))) {
                    gpsLat = ctx.value(QStringLiteral("lat")).toDouble(0.0);
                    gpsLon = ctx.value(QStringLiteral("lng")).toDouble(0.0);
                    hasGpsLat = true;
                    hasGpsLon = true;
                    gpsValidFlag = true;
                    hasGpsValidFlag = true;
                }
            }
        }

        if (label == targetLevel) {
            if (val.isDouble()) {
                const double parsed = val.toDouble();
                if (!std::isnan(parsed) && !std::isinf(parsed) && parsed >= 0.0) {
                    m_lastValidWaterLevel = parsed;
                    foundNewData = true;
                }
            }
        } else if (!targetPressure.isEmpty() && label == targetPressure) {
            bool ok = false;
            double parsed = 0.0;
            if (val.isDouble()) {
                parsed = val.toDouble();
                ok = true;
            } else if (val.isString()) {
                parsed = val.toString().toDouble(&ok);
            }
            if (ok && !std::isnan(parsed) && !std::isinf(parsed) && parsed >= 0.0) {
                m_lastValidPressure = parsed;
                foundNewData = true;
            }
        } else if (label == targetStatus) {
            if (val.isDouble()) {
                switch (val.toInt()) {
                    case 1: m_lastValidSensorStatus = QStringLiteral("Healthy"); break;
                    case 0: m_lastValidSensorStatus = QStringLiteral("Fault"); break;
                    default: m_lastValidSensorStatus = QStringLiteral("Unknown"); break;
                }
                foundNewData = true;
            } else if (val.isString()) {
                m_lastValidSensorStatus = val.toString();
                foundNewData = true;
            }
        } else if (label == QStringLiteral("latitude") || label == QStringLiteral("lat")) {
            gpsLat = val.toDouble(0.0);
            hasGpsLat = true;
        } else if (label == QStringLiteral("longitude") || label == QStringLiteral("lon") || label == QStringLiteral("lng")) {
            gpsLon = val.toDouble(0.0);
            hasGpsLon = true;
        } else if (label == QStringLiteral("altitude") || label == QStringLiteral("alt")) {
            gpsAlt = val.toDouble(0.0);
        } else if (label == QStringLiteral("satellites") || label == QStringLiteral("sat")) {
            gpsSats = val.toInt(0);
        } else if (label == QStringLiteral("gpsvalid") || label == QStringLiteral("gps_valid") || label == QStringLiteral("locationvalid")) {
            hasGpsValidFlag = true;
            gpsValidFlag = (val.toInt(0) != 0 || val.toBool(false));
        }
    };

    if (doc.isObject()) {
        QJsonObject rootObj = doc.object();
        if (rootObj.contains(QStringLiteral("results")) && rootObj.value(QStringLiteral("results")).isArray()) {
            QJsonArray arr = rootObj.value(QStringLiteral("results")).toArray();
            for (const QJsonValue &item : arr) {
                if (item.isObject()) {
                    QJsonObject o = item.toObject();
                    QString label = o.value(QStringLiteral("label")).toString();
                    QJsonValue val = o.value(QStringLiteral("last_value"));
                    processPair(label, val.isObject() ? val : item);
                }
            }
        } else {
            // v2.0 dictionary mapping: {"waterlevel": {"value": 21.12, "timestamp": 1789111910000}, ...}
            for (auto it = rootObj.constBegin(); it != rootObj.constEnd(); ++it) {
                processPair(it.key(), it.value());
            }
        }
    } else if (doc.isArray()) {
        QJsonArray arr = doc.array();

        for (const QJsonValue &item : arr) {
            if (item.isObject()) {
                QJsonObject o = item.toObject();
                QString label = o.contains(QStringLiteral("label")) ? o.value(QStringLiteral("label")).toString() : (o.contains(QStringLiteral("variable")) ? o.value(QStringLiteral("variable")).toObject().value(QStringLiteral("label")).toString() : QString());
                QJsonValue val = o.contains(QStringLiteral("value")) ? o.value(QStringLiteral("value")) : o.value(QStringLiteral("last_value"));
                processPair(label, val.isObject() ? val : item);
            }
        }
    }

    const qint64 nowMs = QDateTime::currentMSecsSinceEpoch();
    bool isFresh = false;
    if (latestTimestampMs > 0) {
        qint64 ageMs = nowMs - latestTimestampMs;
        // Documented upload task operates at 90s interval. Allow 300s (5 min) for retry/jitter.
        isFresh = (ageMs >= 0 && ageMs <= 300000LL);
    }

    if (foundNewData || m_hasReceivedFirstValidReading) {
        m_hasReceivedFirstValidReading = true;

        if (isFresh) {
            setConnectionState(ConnectionState::Connected, QStringLiteral("Fresh cloud data"));
        } else {
            setConnectionState(ConnectionState::Disconnected, QStringLiteral("Stale cloud data"));
        }

        // Safe Diagnostic Logging (NEVER log authentication token or header)
        qDebug() << "[Ubidots] waterlevel  =" << m_lastValidWaterLevel;
        qDebug() << "[Ubidots] pressure    =" << m_lastValidPressure;
        qDebug() << "[Ubidots] sensorstatus=" << m_lastValidSensorStatus;
        qDebug() << "[Ubidots] timestampMs =" << latestTimestampMs << "isFresh =" << isFresh;

        emit readingReceived(
            m_lastValidWaterLevel,
            m_lastValidPressure,
            m_lastValidSensorStatus,
            latestTimestampMs,
            isFresh);
    }

    // Forward real GNSS telemetry to LocationManager if present in Ubidots payload
    if ((hasGpsLat && hasGpsLon) || hasGpsValidFlag) {
        bool isValidFix = hasGpsValidFlag ? gpsValidFlag : (hasGpsLat && hasGpsLon && (gpsLat != 0.0 || gpsLon != 0.0));
        QJsonObject statusObj;
        statusObj[QStringLiteral("latitude")] = gpsLat;
        statusObj[QStringLiteral("longitude")] = gpsLon;
        statusObj[QStringLiteral("altitude")] = gpsAlt;
        statusObj[QStringLiteral("satellites")] = gpsSats;
        statusObj[QStringLiteral("gps_valid")] = isValidFix;
        statusObj[QStringLiteral("has_valid_fix")] = isValidFix;
        statusObj[QStringLiteral("timestamp")] = static_cast<double>(latestTimestampMs);

        emit statusReceived(statusObj);
    }
}



} // namespace Panorama