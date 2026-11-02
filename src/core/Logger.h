#pragma once

#include <QDate>
#include <QFile>
#include <QLoggingCategory>
#include <QMutex>
#include <QObject>
#include <QString>

#include <atomic>

namespace Panorama {

Q_DECLARE_LOGGING_CATEGORY(lcApplication)
Q_DECLARE_LOGGING_CATEGORY(lcApi)
Q_DECLARE_LOGGING_CATEGORY(lcNetwork)
Q_DECLARE_LOGGING_CATEGORY(lcCalculation)
Q_DECLARE_LOGGING_CATEGORY(lcError)

/*!
 * \brief Centralized, categorized logging (docs/05-implementation-blueprint.md,
 * Section 1 and Section 7).
 *
 * Milestone 2 implementation. Logger is the first backend object
 * constructed at application startup (docs/05, Section 13) and has no
 * dependencies of its own - in particular, it never includes
 * SettingsManager. Configuration (the active log level, log retention)
 * is instead pushed into Logger from the outside, in main.cpp, once
 * SettingsManager has loaded, via setCurrentLogLevel()/setRetentionDays().
 * This keeps Logger a true leaf per docs/05, Section 15's directory
 * dependency rules ("backend/logging: Allowed dependencies: None").
 *
 * One file per calendar day (panorama-YYYY-MM-DD.log) under the
 * platform's standard app-data location, rotated automatically at
 * midnight and pruned on startup and whenever the retention window
 * shrinks. All file I/O is guarded by a mutex, so Logger is safe to call
 * from any thread even though nothing in the application does so yet.
 */
class Logger : public QObject
{
    Q_OBJECT
    Q_PROPERTY(LogLevel currentLogLevel READ currentLogLevel WRITE setCurrentLogLevel NOTIFY currentLogLevelChanged)
    Q_PROPERTY(int retentionDays READ retentionDays WRITE setRetentionDays NOTIFY retentionDaysChanged)

public:
    enum class LogLevel {
        Trace,
        Debug,
        Info,
        Warning,
        Error,
        Critical
    };
    Q_ENUM(LogLevel)

    explicit Logger(QObject *parent = nullptr);
    ~Logger() override;

    LogLevel currentLogLevel() const;
    void setCurrentLogLevel(LogLevel level);

    int retentionDays() const;
    void setRetentionDays(int days);

           //! Absolute path to the directory log files are written into.
    QString logDirectory() const;

           //! General-purpose entry point. categoryName is expected to match one
           //! of the five declared categories' names (panorama.application,
           //! panorama.api, panorama.network, panorama.calculation,
           //! panorama.error) for consistency, though any string is accepted -
           //! the five convenience wrappers below are the normal call site.
    void log(LogLevel level, const QString &categoryName, const QString &message);

    void logApplication(LogLevel level, const QString &message);
    void logApi(LogLevel level, const QString &message);
    void logNetwork(LogLevel level, const QString &message);
    void logCalculation(LogLevel level, const QString &message);
    void logError(LogLevel level, const QString &message);

           //! Converts a persisted setting value (e.g. SettingsManager::logLevel(),
           //! "Info") into the matching enum value. Unrecognized input maps to
           //! Info, never silently to Trace/Critical.
    static LogLevel levelFromLabel(const QString &label);
    static QString levelToLabel(LogLevel level);

signals:
    void currentLogLevelChanged();
    void retentionDaysChanged();

private:
    void ensureLogFileForToday();
    void pruneOldLogs();
    void writeLine(const QString &line);
    QString formatEntry(LogLevel level, const QString &categoryName, const QString &message) const;
    static QString logFileNameForDate(const QDate &date);

           // std::atomic rather than QMutex here specifically: these two scalars
           // are read on every single log() call (including calls that get
           // suppressed before any file I/O happens), so a full mutex lock for
           // every read would be needlessly expensive. The QMutex above is
           // reserved for the file I/O path (rotation + writing), which needs
           // several related operations to happen together as one atomic group,
           // not just a single scalar read/write.
    mutable QMutex m_mutex;
    std::atomic<LogLevel> m_currentLogLevel;
    std::atomic<int> m_retentionDays{14};
    QString m_logDirectory;
    QFile m_logFile;
    QDate m_openLogDate;
    bool m_consoleMirrorEnabled;
};

} // namespace Panorama