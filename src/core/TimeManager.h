#pragma once

#include <QDateTime>
#include <QObject>
#include <QString>
#include <QTimer>
#include <qqml.h>

namespace Panorama {

/*!
 * \brief Single source of "now" for the QML layer
 *        (docs/05-implementation-blueprint.md, Section 1).
 *
 * Milestone 2 implementation. QML singleton, ticking once a second on a
 * coarse QTimer (appropriate precision for a UI clock - minimizes OS
 * wakeups compared to a precise timer, keeping CPU usage negligible at
 * idle). currentTime/currentDate only emit their change signal when the
 * formatted string actually differs from the previous tick -
 * currentDate in particular changes on roughly 1 tick in 86400, so this
 * avoids 86399 redundant QML binding re-evaluations per day for no
 * visible benefit.
 *
 * Thread safety: TimeManager is designed to be constructed and used
 * exclusively on the GUI/main thread, matching both its role as a QML
 * singleton and QTimer's own thread-affinity requirement (a QTimer must
 * be started/stopped from the thread that owns it). This is the
 * intentional single-threaded design established in
 * docs/02-software-architecture.md, Section 10, not an oversight - a
 * mutex here would protect nothing meaningful, since nothing outside
 * the GUI thread is expected to ever touch this class.
 */
class TimeManager : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(QString currentTime READ currentTime NOTIFY currentTimeChanged)
    Q_PROPERTY(QString currentDate READ currentDate NOTIFY currentDateChanged)
    Q_PROPERTY(QString timeFormat READ timeFormat WRITE setTimeFormat NOTIFY timeFormatChanged)
    Q_PROPERTY(QString dateFormat READ dateFormat WRITE setDateFormat NOTIFY dateFormatChanged)

public:
    explicit TimeManager(QObject *parent = nullptr);
    ~TimeManager() override;

    QString currentTime() const { return m_currentTime; }
    QString currentDate() const { return m_currentDate; }

    QString timeFormat() const { return m_timeFormat; }
    void setTimeFormat(const QString &format);

    QString dateFormat() const { return m_dateFormat; }
    void setDateFormat(const QString &format);

    //! Converts an arbitrary past QDateTime into a short, human-readable
    //! relative string ("just now", "5 sec ago", "3 min ago", "2 hr ago",
    //! "yesterday", "N days ago", or a calendar date once more than a
    //! week has passed). A future/invalid timestamp degrades safely to
    //! "just now" rather than a nonsensical negative duration.
    Q_INVOKABLE QString relativeTime(const QDateTime &timestamp) const;

signals:
    void currentTimeChanged();
    void currentDateChanged();
    void timeFormatChanged();
    void dateFormatChanged();

private slots:
    void tick();

private:
    QTimer m_timer;
    QString m_timeFormat;
    QString m_dateFormat;
    QString m_currentTime;
    QString m_currentDate;
};

} // namespace Panorama
