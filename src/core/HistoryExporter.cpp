#include "HistoryExporter.h"

#include <QDate>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QTextStream>
#include <QTimeZone>
#include <QUrl>
#include <algorithm>
#include <cmath>

namespace Panorama::HistoryExporter {

namespace {

struct RawPoint {
    qint64 timestampMs = 0;
    double rawHeightCm = 0.0;
};

} // namespace

QList<ExportPoint> downsampleLTTB(const QList<ExportPoint> &points, int targetCount)
{
    const int count = points.size();
    if (count <= targetCount || targetCount <= 2) {
        return points;
    }

    QList<ExportPoint> sampled;
    sampled.reserve(targetCount);

    // Bucket size. Leave room for start and end data points.
    const double every = static_cast<double>(count - 2) / static_cast<double>(targetCount - 2);

    int a = 0; // Initially point index 0 is chosen
    sampled.append(points[0]);

    for (int i = 0; i < targetCount - 2; ++i) {
        // Calculate point average for next bucket (containing c)
        int nextBucketStart = static_cast<int>(std::floor((i + 1) * every)) + 1;
        int nextBucketEnd = static_cast<int>(std::floor((i + 2) * every)) + 1;
        nextBucketEnd = std::min(nextBucketEnd, count);

        double avgX = 0.0;
        double avgY = 0.0;
        const int nextBucketLength = nextBucketEnd - nextBucketStart;

        if (nextBucketLength > 0) {
            for (int k = nextBucketStart; k < nextBucketEnd; ++k) {
                avgX += static_cast<double>(points[k].timestampMs);
                avgY += points[k].levelPercentage;
            }
            avgX /= static_cast<double>(nextBucketLength);
            avgY /= static_cast<double>(nextBucketLength);
        } else if (nextBucketEnd < count) {
            avgX = static_cast<double>(points[nextBucketEnd].timestampMs);
            avgY = points[nextBucketEnd].levelPercentage;
        } else {
            avgX = static_cast<double>(points.last().timestampMs);
            avgY = points.last().levelPercentage;
        }

        // Get the range for this bucket
        int bucketStart = static_cast<int>(std::floor(i * every)) + 1;
        int bucketEnd = static_cast<int>(std::floor((i + 1) * every)) + 1;
        bucketEnd = std::min(bucketEnd, count);

        // Point a
        const double pointAX = static_cast<double>(points[a].timestampMs);
        const double pointAY = points[a].levelPercentage;

        double maxArea = -1.0;
        int maxAreaIndex = bucketStart;

        for (int k = bucketStart; k < bucketEnd; ++k) {
            // Calculate triangle area over points: (pointAX, pointAY), (points[k].timestampMs, points[k].levelPercentage), (avgX, avgY)
            const double curX = static_cast<double>(points[k].timestampMs);
            const double curY = points[k].levelPercentage;

            const double area = std::abs(
                (pointAX - avgX) * (curY - pointAY) - (pointAX - curX) * (avgY - pointAY)
            ) * 0.5;

            if (area > maxArea) {
                maxArea = area;
                maxAreaIndex = k;
            }
        }

        sampled.append(points[maxAreaIndex]);
        a = maxAreaIndex; // Next a is this bucket's chosen point
    }

    // Always include the last point
    sampled.append(points.last());

    return sampled;
}

QList<ExportPoint> processHistoricalData(
    const QVariantList &rawHistory,
    int rangeHours,
    double tankHeightCm,
    double tankCapacityLiters,
    int targetPointCount)
{
    if (rawHistory.isEmpty()) {
        return {};
    }

    if (tankHeightCm <= 0.0) {
        tankHeightCm = 50.0;
    }
    if (tankCapacityLiters <= 0.0) {
        tankCapacityLiters = 20.0;
    }
    if (rangeHours <= 0) {
        rangeHours = 12;
    }

    const qint64 nowMs = QDateTime::currentMSecsSinceEpoch();
    const qint64 durationMs = static_cast<qint64>(rangeHours) * 3600LL * 1000LL;

    // Step 1: Parse and normalize all valid raw readings
    QList<RawPoint> rawPoints;
    rawPoints.reserve(rawHistory.size());

    for (const QVariant &itemVar : rawHistory) {
        if (!itemVar.canConvert<QVariantMap>()) {
            continue;
        }
        const QVariantMap map = itemVar.toMap();
        if (!map.contains(QStringLiteral("value"))) {
            continue;
        }

        bool okVal = false;
        double val = map.value(QStringLiteral("value")).toDouble(&okVal);
        if (!okVal || std::isnan(val) || std::isinf(val)) {
            continue;
        }

        // Convert from meters to cm if reported in meters (e.g. <= 0.50 m when tankHeight is 50 cm)
        if (val <= (tankHeightCm / 100.0) && tankHeightCm >= 10.0 && val > 0.0) {
            val *= 100.0;
        }

        qint64 ts = 0;
        if (map.contains(QStringLiteral("timestampMs"))) {
            ts = map.value(QStringLiteral("timestampMs")).toLongLong();
        } else if (map.contains(QStringLiteral("timestamp"))) {
            ts = map.value(QStringLiteral("timestamp")).toLongLong();
        }

        // Normalize unix seconds to milliseconds
        if (ts > 0 && ts < 100000000000LL) {
            ts *= 1000LL;
        }

        if (ts <= 0) {
            continue;
        }

        rawPoints.append({ts, val});
    }

    if (rawPoints.isEmpty()) {
        return {};
    }

    // Step 2: Sort chronologically ascending
    std::sort(rawPoints.begin(), rawPoints.end(), [](const RawPoint &a, const RawPoint &b) {
        return a.timestampMs < b.timestampMs;
    });

    // Step 3: Deduplicate identical timestamps (retain the latest reading at duplicate ms)
    QList<RawPoint> uniquePoints;
    uniquePoints.reserve(rawPoints.size());
    for (int i = 0; i < rawPoints.size(); ++i) {
        if (uniquePoints.isEmpty() || uniquePoints.last().timestampMs != rawPoints[i].timestampMs) {
            uniquePoints.append(rawPoints[i]);
        } else {
            uniquePoints.last() = rawPoints[i]; // Update to latest reading for same timestamp
        }
    }

    if (uniquePoints.isEmpty()) {
        return {};
    }

    // Step 4: Filter points strictly within the active time window
    const qint64 latestTs = uniquePoints.last().timestampMs;
    qint64 windowEnd = std::max(nowMs, latestTs);
    qint64 windowStart = windowEnd - durationMs;

    QList<RawPoint> inWindowPoints;
    inWindowPoints.reserve(uniquePoints.size());
    for (const RawPoint &pt : uniquePoints) {
        if (pt.timestampMs >= windowStart && pt.timestampMs <= windowEnd) {
            inWindowPoints.append(pt);
        }
    }

    // If dataset is purely historic (e.g. mock or test recorded in past), shift window to end at latestTs
    if (inWindowPoints.isEmpty()) {
        windowEnd = latestTs;
        windowStart = std::max(0LL, latestTs - durationMs);
        for (const RawPoint &pt : uniquePoints) {
            if (pt.timestampMs >= windowStart && pt.timestampMs <= windowEnd) {
                inWindowPoints.append(pt);
            }
        }
    }

    if (inWindowPoints.isEmpty()) {
        inWindowPoints = uniquePoints;
    }

    // Step 5: Derive metrics (Percentage, Height, Volume, Status)
    QList<ExportPoint> exportPoints;
    exportPoints.reserve(inWindowPoints.size());

    for (const RawPoint &pt : inWindowPoints) {
        ExportPoint ep;
        ep.timestampMs = pt.timestampMs;
        ep.heightCm = std::max(0.0, pt.rawHeightCm);

        // Water level percentage against configured tank height: (heightCm / tankHeightCm) * 100
        ep.levelPercentage = (tankHeightCm > 0.0) ? (ep.heightCm / tankHeightCm) * 100.0 : 0.0;
        ep.levelPercentage = std::max(0.0, ep.levelPercentage);

        // Volume calculated strictly against tank capacity: (levelPercentage / 100.0) * tankCapacityLiters
        ep.volumeLiters = (ep.levelPercentage / 100.0) * tankCapacityLiters;

        // Status classification matching system alarms
        if (ep.levelPercentage >= 100.0) {
            ep.status = QStringLiteral("Overflow");
        } else if (ep.levelPercentage < 10.0) {
            ep.status = QStringLiteral("Critical");
        } else if (ep.levelPercentage < 20.0) {
            ep.status = QStringLiteral("Warning");
        } else {
            ep.status = QStringLiteral("Normal");
        }

        exportPoints.append(ep);
    }

    // Step 6: Downsample to ~100 points if dataset has more than targetPointCount
    if (exportPoints.size() > targetPointCount && targetPointCount > 2) {
        return downsampleLTTB(exportPoints, targetPointCount);
    }

    return exportPoints;
}

QString formatCsv(const QList<ExportPoint> &points)
{
    QString csv;
    QTextStream out(&csv);

    // CSV Header row
    out << "Timestamp,Water Level (%),Water Height (cm),Estimated Volume (L),Status\r\n";

    for (const ExportPoint &pt : points) {
        // Human-readable timestamp: YYYY-MM-DD HH:mm:ss
        const QString timeStr = QDateTime::fromMSecsSinceEpoch(pt.timestampMs, QTimeZone::systemTimeZone())
                                    .toString(QStringLiteral("yyyy-MM-dd HH:mm:ss"));

        out << timeStr << ','
            << QString::number(pt.levelPercentage, 'f', 2) << ','
            << QString::number(pt.heightCm, 'f', 2) << ','
            << QString::number(pt.volumeLiters, 'f', 2) << ','
            << pt.status << "\r\n";
    }

    return csv;
}

ExportResult exportToFile(
    const QString &fileUrlOrPath,
    const QVariantList &rawHistory,
    int rangeHours,
    double tankHeightCm,
    double tankCapacityLiters,
    int targetPointCount)
{
    ExportResult result;

    if (fileUrlOrPath.trimmed().isEmpty()) {
        result.errorMessage = QStringLiteral("File path cannot be empty.");
        return result;
    }

    QString localPath = fileUrlOrPath.trimmed();
    if (localPath.startsWith(QLatin1String("file:///"), Qt::CaseInsensitive)) {
        localPath = QUrl(localPath).toLocalFile();
    } else if (localPath.startsWith(QLatin1String("file://"), Qt::CaseInsensitive)) {
        localPath = QUrl(localPath).toLocalFile();
    }

    if (localPath.isEmpty()) {
        result.errorMessage = QStringLiteral("Invalid destination file path.");
        return result;
    }

    QFileInfo fileInfo(localPath);
    result.fileName = fileInfo.fileName();
    result.filePath = localPath;

    // Process & downsample data
    QList<ExportPoint> points = processHistoricalData(
        rawHistory,
        rangeHours,
        tankHeightCm,
        tankCapacityLiters,
        targetPointCount);

    if (points.isEmpty()) {
        result.errorMessage = QStringLiteral("No historical data available for the selected time range.");
        return result;
    }

    // Ensure target directory exists
    QDir().mkpath(fileInfo.absolutePath());

    QFile file(localPath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        result.errorMessage = QStringLiteral("Failed to open file for writing: %1").arg(file.errorString());
        return result;
    }

    const QString csvContent = formatCsv(points);
    const QByteArray utf8Bytes = csvContent.toUtf8();

    const qint64 written = file.write(utf8Bytes);
    file.flush();
    file.close();

    if (written < utf8Bytes.size()) {
        result.errorMessage = QStringLiteral("Failed to write complete CSV file.");
        return result;
    }

    result.success = true;
    result.pointCount = points.size();
    return result;
}

QString defaultFilename(int rangeHours)
{
    QString rangeTag;
    if (rangeHours == 12) {
        rangeTag = QStringLiteral("12h");
    } else if (rangeHours == 24) {
        rangeTag = QStringLiteral("24h");
    } else if (rangeHours == 168) {
        rangeTag = QStringLiteral("7d");
    } else {
        rangeTag = QString::number(rangeHours) + QStringLiteral("h");
    }

    const QString dateStr = QDate::currentDate().toString(QStringLiteral("yyyy-MM-dd"));
    return QStringLiteral("water_level_history_%1_%2.csv").arg(rangeTag, dateStr);
}

} // namespace Panorama::HistoryExporter
