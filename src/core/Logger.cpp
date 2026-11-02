#include "Logger.h"

#include <QDateTime>
#include <QDebug>
#include <QDir>
#include <QMutexLocker>
#include <QStandardPaths>
#include <QTextStream>

#include <algorithm>

namespace Panorama {

Q_LOGGING_CATEGORY(lcApplication, "panorama.application")
Q_LOGGING_CATEGORY(lcApi, "panorama.api")
Q_LOGGING_CATEGORY(lcNetwork, "panorama.network")
Q_LOGGING_CATEGORY(lcCalculation, "panorama.calculation")
Q_LOGGING_CATEGORY(lcError, "panorama.error")

namespace {
constexpr int kLogFilePrefixLength = 9; // length of "panorama-"
constexpr int kLogFileDateLength = 10;  // length of "YYYY-MM-DD"
} // namespace

Logger::Logger(QObject *parent)
    : QObject(parent)
{
#ifdef PANORAMA_DEBUG_BUILD
    m_currentLogLevel = LogLevel::Trace;
    m_consoleMirrorEnabled = true;
#else
    m_currentLogLevel = LogLevel::Info;
    m_consoleMirrorEnabled = false;
#endif

    m_logDirectory = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)
                     + QStringLiteral("/logs");
    QDir().mkpath(m_logDirectory);

    pruneOldLogs();
    ensureLogFileForToday();

    logApplication(LogLevel::Info,
                   QStringLiteral("Logger initialized (level=%1, retentionDays=%2, directory=%3)")
                       .arg(levelToLabel(m_currentLogLevel.load()))
                       .arg(m_retentionDays.load())
                       .arg(m_logDirectory));
}

Logger::~Logger()
{
    QMutexLocker locker(&m_mutex);
    if (m_logFile.isOpen()) {
        m_logFile.flush();
        m_logFile.close();
    }
}

Logger::LogLevel Logger::currentLogLevel() const
{
    return m_currentLogLevel.load();
}

void Logger::setCurrentLogLevel(LogLevel level)
{
    if (m_currentLogLevel.load() == level) {
        return;
    }

    m_currentLogLevel.store(level);
    emit currentLogLevelChanged();
}

int Logger::retentionDays() const
{
    return m_retentionDays.load();
}

void Logger::setRetentionDays(int days)
{
    const int clamped = std::max(1, days);

    if (m_retentionDays.load() == clamped) {
        return;
    }

    m_retentionDays.store(clamped);
    emit retentionDaysChanged();

    QMutexLocker locker(&m_mutex);
    pruneOldLogs();
}

QString Logger::logDirectory() const
{
    return m_logDirectory;
}

void Logger::log(LogLevel level, const QString &categoryName, const QString &message)
{
    // Level check happens first, before any formatting or I/O - a
    // suppressed call costs a single enum comparison
    // (docs/05-implementation-blueprint.md, Section 7's performance
    // requirement). Callers pass an already-built QString, so this does
    // not eliminate the cost of assembling that string at the call site -
    // at this project's current log volume (short, infrequent messages,
    // not per-frame telemetry) that cost is negligible, so a
    // lazy-evaluation macro layer isn't justified yet.
    if (level < m_currentLogLevel.load()) {
        return;
    }

    const QString line = formatEntry(level, categoryName, message);

    QMutexLocker locker(&m_mutex);
    ensureLogFileForToday();
    writeLine(line);

    if (m_consoleMirrorEnabled) {
        qDebug().noquote() << line;
    }
}

void Logger::logApplication(LogLevel level, const QString &message)
{
    log(level, QString::fromUtf8(lcApplication().categoryName()), message);
}

void Logger::logApi(LogLevel level, const QString &message)
{
    log(level, QString::fromUtf8(lcApi().categoryName()), message);
}

void Logger::logNetwork(LogLevel level, const QString &message)
{
    log(level, QString::fromUtf8(lcNetwork().categoryName()), message);
}

void Logger::logCalculation(LogLevel level, const QString &message)
{
    log(level, QString::fromUtf8(lcCalculation().categoryName()), message);
}

void Logger::logError(LogLevel level, const QString &message)
{
    log(level, QString::fromUtf8(lcError().categoryName()), message);
}

void Logger::ensureLogFileForToday()
{
    const QDate today = QDate::currentDate();
    if (m_logFile.isOpen() && m_openLogDate == today) {
        return;
    }

    if (m_logFile.isOpen()) {
        m_logFile.flush();
        m_logFile.close();
    }

    const QString path = m_logDirectory + QLatin1Char('/') + logFileNameForDate(today);
    m_logFile.setFileName(path);
    if (m_logFile.open(QIODevice::Append | QIODevice::Text)) {
        m_openLogDate = today;
    } else {
        // A logging failure (disk full, permissions) must never take
        // down a 24/7 monitoring application - fall back to console
        // only if available, but never throw or crash.
        qWarning().noquote() << QStringLiteral("Logger: failed to open log file at %1").arg(path);
    }

    pruneOldLogs();
}

void Logger::pruneOldLogs()
{
    QDir dir(m_logDirectory);
    if (!dir.exists()) {
        return;
    }

    const QStringList entries = dir.entryList(QStringList() << QStringLiteral("panorama-*.log"), QDir::Files);
    const QDate cutoff = QDate::currentDate().addDays(-m_retentionDays.load());

    for (const QString &fileName : entries) {
        const QString datePart = fileName.mid(kLogFilePrefixLength, kLogFileDateLength);
        const QDate fileDate = QDate::fromString(datePart, QStringLiteral("yyyy-MM-dd"));
        if (fileDate.isValid() && fileDate < cutoff) {
            dir.remove(fileName);
        }
    }
}

void Logger::writeLine(const QString &line)
{
    if (!m_logFile.isOpen()) {
        return;
    }
    QTextStream stream(&m_logFile);
    stream << line << Qt::endl;
    stream.flush();
}

QString Logger::formatEntry(LogLevel level, const QString &categoryName, const QString &message) const
{
    const QString timestamp = QDateTime::currentDateTime().toString(Qt::ISODateWithMs);
    return QStringLiteral("[%1] [%2] [%3] %4")
        .arg(timestamp, levelToLabel(level).toUpper(), categoryName, message);
}

Logger::LogLevel Logger::levelFromLabel(const QString &label)
{
    if (label == QStringLiteral("Trace")) return LogLevel::Trace;
    if (label == QStringLiteral("Debug")) return LogLevel::Debug;
    if (label == QStringLiteral("Warning")) return LogLevel::Warning;
    if (label == QStringLiteral("Error")) return LogLevel::Error;
    if (label == QStringLiteral("Critical")) return LogLevel::Critical;
    return LogLevel::Info; // unrecognized input defaults to Info, not silently to an extreme
}

QString Logger::levelToLabel(LogLevel level)
{
    switch (level) {
        case LogLevel::Trace: return QStringLiteral("Trace");
        case LogLevel::Debug: return QStringLiteral("Debug");
        case LogLevel::Info: return QStringLiteral("Info");
        case LogLevel::Warning: return QStringLiteral("Warning");
        case LogLevel::Error: return QStringLiteral("Error");
        case LogLevel::Critical: return QStringLiteral("Critical");
    }
    return QStringLiteral("Unknown");
}

QString Logger::logFileNameForDate(const QDate &date)
{
    return QStringLiteral("panorama-%1.log").arg(date.toString(QStringLiteral("yyyy-MM-dd")));
}

} // namespace Panorama