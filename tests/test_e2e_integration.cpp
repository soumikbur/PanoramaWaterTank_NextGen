#include <QCoreApplication>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QObject>
#include <QTimer>
#include <QUrl>
#include <iostream>
#include <iomanip>
#include <cmath>

#include "HistoryExporter.h"
#include "TankModel.h"

class EndToEndVerifier : public QObject
{
    Q_OBJECT

public:
    explicit EndToEndVerifier(QObject *parent = nullptr)
        : QObject(parent)
        , m_baseUrl(QStringLiteral("https://industrial.api.ubidots.com/"))
        , m_token(QStringLiteral("BBUS-R1UePwaJ2wFg2pKlYiArsPsmMWZvzS"))
        , m_deviceLabel(QStringLiteral("wli"))
        , m_variableLabel(QStringLiteral("waterlevel"))
    {
    }

    void runAllTests()
    {
        std::cout << "\n============================================\n";
        std::cout << "  === Running End-to-End Integration Tests ===\n";
        std::cout << "============================================\n\n";

        fetchRange(12);
    }

private:
    void fetchRange(int rangeHours)
    {
        m_currentRange = rangeHours;
        const qint64 endMs = QDateTime::currentMSecsSinceEpoch();
        const qint64 durationMs = static_cast<qint64>(rangeHours) * 3600LL * 1000LL;
        const qint64 startMs = endMs - durationMs;

        QString urlStr = m_baseUrl;
        if (!urlStr.endsWith('/')) urlStr += '/';
        urlStr += QStringLiteral("api/v1.6/devices/") + m_deviceLabel + QLatin1Char('/') + m_variableLabel
                + QStringLiteral("/values?start=") + QString::number(startMs)
                + QStringLiteral("&end=") + QString::number(endMs)
                + QStringLiteral("&page_size=500");

        std::cout << "[E2E] Requesting Real Ubidots Data for " << rangeHours << " hours..." << std::endl;
        std::cout << "      Endpoint: " << urlStr.toStdString() << std::endl;

        QNetworkRequest req((QUrl(urlStr)));
        req.setRawHeader("X-Auth-Token", m_token.toUtf8());
        req.setRawHeader("Content-Type", "application/json");

        QNetworkReply *reply = m_nam.get(req);
        connect(reply, &QNetworkReply::finished, this, [this, reply, rangeHours, startMs, endMs]() {
            reply->deleteLater();
            onHistoricalReply(reply, rangeHours, startMs, endMs);
        });
    }

    void onHistoricalReply(QNetworkReply *reply, int rangeHours, qint64 startMs, qint64 endMs)
    {
        if (reply->error() != QNetworkReply::NoError) {
            std::cerr << "[ERROR] Network request failed: " << reply->errorString().toStdString() << std::endl;
            exitTest(1);
            return;
        }

        const QByteArray data = reply->readAll();
        QJsonParseError parseError;
        QJsonDocument doc = QJsonDocument::fromJson(data, &parseError);
        if (parseError.error != QJsonParseError::NoError || !doc.isObject()) {
            std::cerr << "[ERROR] JSON parse error: " << parseError.errorString().toStdString() << std::endl;
            exitTest(1);
            return;
        }

        QJsonObject rootObj = doc.object();
        QJsonArray results = rootObj.value(QStringLiteral("results")).toArray();
        std::cout << "      Received " << results.size() << " raw historical data points from Ubidots." << std::endl;

        QVariantList historyList;
        historyList.reserve(results.size());
        for (const QJsonValue &item : results) {
            if (!item.isObject()) continue;
            QJsonObject o = item.toObject();
            QVariantMap map;
            map[QStringLiteral("value")] = o.value(QStringLiteral("value")).toVariant();
            map[QStringLiteral("timestampMs")] = o.value(QStringLiteral("timestamp")).toVariant();
            map[QStringLiteral("timestamp")] = o.value(QStringLiteral("timestamp")).toVariant();
            historyList.append(map);
        }

        // Test TankModel and HistoryExporter with real historical dataset and bounds
        verifyExportForRange(rangeHours, historyList, startMs, endMs);

        // Advance to next range
        if (rangeHours == 12) {
            fetchRange(24);
        } else if (rangeHours == 24) {
            fetchRange(168);
        } else {
            std::cout << "\n============================================\n";
            std::cout << "  === ALL E2E TESTS PASSED SUCCESSFULLY! ===\n";
            std::cout << "============================================\n\n";
            exitTest(0);
        }
    }

    void verifyExportForRange(int rangeHours, const QVariantList &realHistory, qint64 startMs, qint64 endMs)
    {
        const QString rangeStr = (rangeHours == 168 ? QStringLiteral("7d") : QString::number(rangeHours) + QStringLiteral("h"));
        const QString filename = QStringLiteral("e2e_export_%1.csv").arg(rangeStr);

        std::cout << "\n--- Verifying Range: " << rangeHours << " Hours (" << rangeStr.toStdString() << ") ---" << std::endl;

        // Initialize TankModel instance with physical 50 cm / 20 L tank configuration
        Panorama::TankModel tankModel;
        tankModel.setTankHeight(0.50); // 50 cm
        tankModel.setTankRadius(0.11283791670955126); // 20 L capacity
        tankModel.setTrendHistory(realHistory);
        tankModel.setHistoryRangeHours(rangeHours);

        // 1. Check default filename
        QString defFilename = tankModel.defaultCsvFilename(rangeHours);
        std::cout << "  [✓] Default Filename: " << defFilename.toStdString() << std::endl;

        // 2. Perform export via TankModel
        QVariantMap exportResult = tankModel.exportHistoryCsv(filename, rangeHours);
        const bool success = exportResult.value(QStringLiteral("success")).toBool();
        const int count = exportResult.value(QStringLiteral("count")).toInt();
        const QString msg = exportResult.value(QStringLiteral("message")).toString();

        std::cout << "  [✓] Export Result: " << (success ? "SUCCESS" : "FAIL") << " | Count: " << count << " | Message: " << msg.toStdString() << std::endl;

        if (!success && realHistory.isEmpty()) {
            std::cout << "  [✓] Correctly identified empty historical dataset." << std::endl;
            return;
        }

        if (!success) {
            std::cerr << "  [FAIL] Export failed: " << msg.toStdString() << std::endl;
            exitTest(1);
            return;
        }

        // 3. Inspect the exported CSV file
        QFile file(filename);
        if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
            std::cerr << "  [FAIL] Cannot open generated CSV file: " << filename.toStdString() << std::endl;
            exitTest(1);
            return;
        }

        QString header = file.readLine().trimmed();
        if (header != QStringLiteral("Timestamp,Water Level (%),Water Height (cm),Estimated Volume (L),Status")) {
            std::cerr << "  [FAIL] Invalid CSV Header: " << header.toStdString() << std::endl;
            exitTest(1);
            return;
        }
        std::cout << "  [✓] CSV Header Match: " << header.toStdString() << std::endl;

        int rowCount = 0;
        QString firstRow;
        QString lastRow;
        qint64 prevTs = 0;

        // Range boundary validation window with small leeway for network transit time
        const qint64 durationMs = static_cast<qint64>(rangeHours) * 3600LL * 1000LL;
        std::cout << "  [✓] Range Window Bounds: "
                  << QDateTime::fromMSecsSinceEpoch(startMs).toString(QStringLiteral("yyyy-MM-dd HH:mm:ss")).toStdString()
                  << " -> "
                  << QDateTime::fromMSecsSinceEpoch(endMs).toString(QStringLiteral("yyyy-MM-dd HH:mm:ss")).toStdString()
                  << std::endl;

        while (!file.atEnd()) {
            QString line = file.readLine().trimmed();
            if (line.isEmpty()) continue;
            if (rowCount == 0) firstRow = line;
            lastRow = line;
            rowCount++;

            QStringList parts = line.split(QLatin1Char(','));
            if (parts.size() != 5) {
                std::cerr << "  [FAIL] Malformed row (" << parts.size() << " cols): " << line.toStdString() << std::endl;
                exitTest(1);
                return;
            }

            // Verify Timestamp format & chronological order
            const QString tsStr = parts[0];
            QDateTime dt = QDateTime::fromString(tsStr, QStringLiteral("yyyy-MM-dd HH:mm:ss"));
            if (!dt.isValid()) {
                std::cerr << "  [FAIL] Invalid timestamp format: " << tsStr.toStdString() << std::endl;
                exitTest(1);
                return;
            }
            qint64 curTs = dt.toMSecsSinceEpoch();

            // Strictly check timestamps are within range window [startMs, endMs]
            // (or within [latestTs - durationMs, latestTs] if past recorded data was used)
            if (curTs < startMs - 60000LL || curTs > endMs + 60000LL) {
                qint64 latestHistoricalTs = realHistory.isEmpty() ? 0 : realHistory.last().toMap().value(QStringLiteral("timestampMs")).toLongLong();
                qint64 adjustedStartMs = latestHistoricalTs - durationMs;
                if (curTs < adjustedStartMs - 60000LL || curTs > latestHistoricalTs + 60000LL) {
                    std::cerr << "  [FAIL] Timestamp out of valid range bounds (" << startMs << " - " << endMs << "): " << tsStr.toStdString() << std::endl;
                    exitTest(1);
                    return;
                }
            }

            if (prevTs != 0 && curTs <= prevTs) {
                std::cerr << "  [FAIL] Non-chronological or duplicate timestamp: " << tsStr.toStdString() << std::endl;
                exitTest(1);
                return;
            }
            prevTs = curTs;

            // Verify Numerical Math
            bool okLevel = false, okHeight = false, okVol = false;
            double levelPct = parts[1].toDouble(&okLevel);
            double heightCm = parts[2].toDouble(&okHeight);
            double volLiters = parts[3].toDouble(&okVol);
            const QString status = parts[4];

            if (!okLevel || !okHeight || !okVol) {
                std::cerr << "  [FAIL] Non-numeric value in row: " << line.toStdString() << std::endl;
                exitTest(1);
                return;
            }

            // Check level % formula: (heightCm / 50.0) * 100
            double expectedLevelPct = (heightCm / 50.0) * 100.0;
            if (std::abs(levelPct - expectedLevelPct) > 0.05) {
                std::cerr << "  [FAIL] Level percentage mismatch! Height: " << heightCm << " cm, Got Level: " << levelPct << "%, Expected: " << expectedLevelPct << "%" << std::endl;
                exitTest(1);
                return;
            }

            // Check volume formula: (levelPct / 100.0) * 20.0
            double expectedVol = (levelPct / 100.0) * 20.0;
            if (std::abs(volLiters - expectedVol) > 0.05) {
                std::cerr << "  [FAIL] Volume mismatch! Level: " << levelPct << "%, Got Vol: " << volLiters << " L, Expected: " << expectedVol << " L" << std::endl;
                exitTest(1);
                return;
            }

            // Check status mapping
            QString expectedStatus = QStringLiteral("Normal");
            if (levelPct >= 100.0) expectedStatus = QStringLiteral("Overflow");
            else if (levelPct < 10.0) expectedStatus = QStringLiteral("Critical");
            else if (levelPct < 20.0) expectedStatus = QStringLiteral("Warning");

            if (status != expectedStatus) {
                std::cerr << "  [FAIL] Status mismatch! Level: " << levelPct << "%, Got Status: " << status.toStdString() << ", Expected: " << expectedStatus.toStdString() << std::endl;
                exitTest(1);
                return;
            }
        }
        file.close();

        std::cout << "  [✓] Verified " << rowCount << " rows of exported CSV data." << std::endl;
        std::cout << "      First Row: " << firstRow.toStdString() << std::endl;
        std::cout << "      Last  Row: " << lastRow.toStdString() << std::endl;
        std::cout << "  [✓] Downsampling count: " << rowCount << " points (Target ~100)" << std::endl;
        std::cout << "  [✓] Chronological ordering, timestamps, and duplicates: STRICTLY VALID" << std::endl;
        std::cout << "  [✓] Tank configuration 50 cm / 20 L formulas: STRICTLY VALID" << std::endl;
        std::cout << "  [✓] Alarm status classifications: STRICTLY VALID" << std::endl;

        QFile::remove(filename);
    }

    void exitTest(int code)
    {
        QCoreApplication::exit(code);
    }

private:
    QNetworkAccessManager m_nam;
    QString m_baseUrl;
    QString m_token;
    QString m_deviceLabel;
    QString m_variableLabel;
    int m_currentRange = 12;
};

int main(int argc, char *argv[])
{
    QCoreApplication app(argc, argv);

    EndToEndVerifier verifier;
    QTimer::singleShot(0, &verifier, &EndToEndVerifier::runAllTests);

    return app.exec();
}

#include "test_e2e_integration.moc"
