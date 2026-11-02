#include <QCoreApplication>
#include <QDebug>
#include <QDateTime>
#include <QFile>
#include <QFileInfo>
#include <cassert>
#include <iostream>

#include "HistoryExporter.h"

int main(int argc, char *argv[])
{
    QCoreApplication app(argc, argv);

    std::cout << "=== Running HistoryExporter Unit Tests ===" << std::endl;

    const double tankHeightCm = 50.0;
    const double tankCapacityLiters = 20.0;
    const qint64 nowMs = QDateTime::currentMSecsSinceEpoch();

    // -------------------------------------------------------------
    // Test 1: Test with 480 points across 12 hours (sampling every ~90s)
    // -------------------------------------------------------------
    {
        std::cout << "[Test 1] 12-Hour Dataset (480 points) -> Target ~100 downsampled points..." << std::endl;
        QVariantList rawList;
        const qint64 twelveHoursMs = 12LL * 3600LL * 1000LL;
        const int pointCount = 480;

        for (int i = 0; i < pointCount; ++i) {
            QVariantMap map;
            qint64 ts = (nowMs - twelveHoursMs) + (i * (twelveHoursMs / pointCount));
            // Sinusoidal level variation between 10 cm and 48 cm
            double heightCm = 29.0 + 18.0 * std::sin(static_cast<double>(i) * 0.1);
            map[QStringLiteral("timestampMs")] = ts;
            map[QStringLiteral("value")] = heightCm;
            rawList.append(map);
        }

        auto points = Panorama::HistoryExporter::processHistoricalData(
            rawList, 12, tankHeightCm, tankCapacityLiters, 100
        );

        assert(points.size() == 100);
        std::cout << "  - Downsampled count: " << points.size() << " (Expected: 100)" << std::endl;

        // Verify chronological order
        for (int i = 1; i < points.size(); ++i) {
            assert(points[i].timestampMs > points[i - 1].timestampMs);
        }
        std::cout << "  - Chronological ordering strictly verified." << std::endl;

        // Verify calculations on first point
        assert(std::abs(points[0].levelPercentage - (points[0].heightCm / 50.0 * 100.0)) < 0.01);
        assert(std::abs(points[0].volumeLiters - (points[0].levelPercentage / 100.0 * 20.0)) < 0.01);
        std::cout << "  - Tank geometry math verified (50 cm -> 100%, 20 L max capacity)." << std::endl;

        // Test export to file
        QString testFile = "test_export_12h.csv";
        auto res = Panorama::HistoryExporter::exportToFile(testFile, rawList, 12, tankHeightCm, tankCapacityLiters, 100);
        assert(res.success);
        assert(res.pointCount == 100);

        QFile file(testFile);
        assert(file.open(QIODevice::ReadOnly | QIODevice::Text));
        QString header = file.readLine().trimmed();
        assert(header == "Timestamp,Water Level (%),Water Height (cm),Estimated Volume (L),Status");
        int lineCount = 0;
        while (!file.atEnd()) {
            QString line = file.readLine().trimmed();
            if (!line.isEmpty()) lineCount++;
        }
        file.close();
        assert(lineCount == 100);
        std::cout << "  - CSV file format and 100 data rows verified: " << testFile.toStdString() << std::endl;
        QFile::remove(testFile);
    }

    // -------------------------------------------------------------
    // Test 2: Dataset with fewer than 100 points (e.g. 45 points)
    // -------------------------------------------------------------
    {
        std::cout << "[Test 2] Small Dataset (45 points < 100) -> Must export all 45 points..." << std::endl;
        QVariantList rawList;
        for (int i = 0; i < 45; ++i) {
            QVariantMap map;
            map[QStringLiteral("timestampMs")] = nowMs - (45 - i) * 60000LL;
            map[QStringLiteral("value")] = 25.0; // 25 cm -> 50% -> 10 L
            rawList.append(map);
        }

        auto points = Panorama::HistoryExporter::processHistoricalData(
            rawList, 12, tankHeightCm, tankCapacityLiters, 100
        );
        assert(points.size() == 45);
        assert(std::abs(points[0].levelPercentage - 50.0) < 0.001);
        assert(std::abs(points[0].volumeLiters - 10.0) < 0.001);
        assert(points[0].status == "Normal");
        std::cout << "  - Small dataset points preserved without downsampling: " << points.size() << std::endl;
    }

    // -------------------------------------------------------------
    // Test 3: Status thresholds test (Critical < 10%, Warning < 20%, Normal, Overflow >= 100%)
    // -------------------------------------------------------------
    {
        std::cout << "[Test 3] Alarm Status Classification..." << std::endl;
        QVariantList rawList;
        // Point 1: 2.0 cm -> 4% -> Critical
        QVariantMap p1; p1[QStringLiteral("timestampMs")] = nowMs - 4000; p1[QStringLiteral("value")] = 2.0; rawList.append(p1);
        // Point 2: 7.5 cm -> 15% -> Warning
        QVariantMap p2; p2[QStringLiteral("timestampMs")] = nowMs - 3000; p2[QStringLiteral("value")] = 7.5; rawList.append(p2);
        // Point 3: 35.0 cm -> 70% -> Normal
        QVariantMap p3; p3[QStringLiteral("timestampMs")] = nowMs - 2000; p3[QStringLiteral("value")] = 35.0; rawList.append(p3);
        // Point 4: 50.0 cm -> 100% -> Overflow
        QVariantMap p4; p4[QStringLiteral("timestampMs")] = nowMs - 1000; p4[QStringLiteral("value")] = 50.0; rawList.append(p4);

        auto points = Panorama::HistoryExporter::processHistoricalData(
            rawList, 12, tankHeightCm, tankCapacityLiters, 100
        );
        assert(points.size() == 4);
        assert(points[0].status == "Critical");
        assert(points[1].status == "Warning");
        assert(points[2].status == "Normal");
        assert(points[3].status == "Overflow");
        std::cout << "  - All status levels (Critical, Warning, Normal, Overflow) verified." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 4: Empty / No Data behavior
    // -------------------------------------------------------------
    {
        std::cout << "[Test 4] Empty Dataset handling..." << std::endl;
        QVariantList emptyList;
        auto res = Panorama::HistoryExporter::exportToFile("empty.csv", emptyList, 12, tankHeightCm, tankCapacityLiters, 100);
        assert(!res.success);
        assert(res.pointCount == 0);
        assert(res.errorMessage == "No historical data available for the selected time range.");
        assert(!QFile::exists("empty.csv"));
        std::cout << "  - Empty dataset error handling verified (no corrupt file created)." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 5: Default filenames
    // -------------------------------------------------------------
    {
        std::cout << "[Test 5] Default Filename Generation..." << std::endl;
        QString fn12 = Panorama::HistoryExporter::defaultFilename(12);
        QString fn24 = Panorama::HistoryExporter::defaultFilename(24);
        QString fn7d = Panorama::HistoryExporter::defaultFilename(168);
        assert(fn12.contains("water_level_history_12h_"));
        assert(fn24.contains("water_level_history_24h_"));
        assert(fn7d.contains("water_level_history_7d_"));
        std::cout << "  - 12h: " << fn12.toStdString() << std::endl;
        std::cout << "  - 24h: " << fn24.toStdString() << std::endl;
        std::cout << "  - 7d : " << fn7d.toStdString() << std::endl;
    }

    std::cout << "=== ALL TESTS PASSED SUCCESSFULLY! ===" << std::endl;
    return 0;
}
