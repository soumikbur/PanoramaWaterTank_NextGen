#pragma once

#include <QList>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

namespace Panorama::HistoryExporter {

struct ExportPoint {
    qint64 timestampMs = 0;
    double levelPercentage = 0.0;
    double heightCm = 0.0;
    double volumeLiters = 0.0;
    QString status;
};

struct ExportResult {
    bool success = false;
    int pointCount = 0;
    QString filePath;
    QString fileName;
    QString errorMessage;
};

/*!
 * \brief Filters, sorts, deduplicates, and downsamples raw historical telemetry
 *        to approximately targetPointCount (default 100) representative chronological points.
 */
QList<ExportPoint> processHistoricalData(
    const QVariantList &rawHistory,
    int rangeHours,
    double tankHeightCm,
    double tankCapacityLiters,
    int targetPointCount = 100
);

/*!
 * \brief Applies Largest-Triangle-Three-Buckets (LTTB) downsampling on a list
 *        of chronological data points.
 */
QList<ExportPoint> downsampleLTTB(const QList<ExportPoint> &points, int targetCount);

/*!
 * \brief Formats a list of ExportPoints into standard CSV format.
 */
QString formatCsv(const QList<ExportPoint> &points);

/*!
 * \brief Exports processed telemetry for the given range to a target CSV file path.
 *        Accepts either native file paths or file:// QUrl strings.
 */
ExportResult exportToFile(
    const QString &fileUrlOrPath,
    const QVariantList &rawHistory,
    int rangeHours,
    double tankHeightCm,
    double tankCapacityLiters,
    int targetPointCount = 100
);

/*!
 * \brief Generates a recommended default filename based on selected range and current date
 *        (e.g., "water_level_history_12h_2026-08-19.csv").
 */
QString defaultFilename(int rangeHours);

} // namespace Panorama::HistoryExporter
