#include "TimeManager.h"

namespace Panorama {

namespace {
constexpr int kTickIntervalMs = 1000;
} // namespace

TimeManager::TimeManager(QObject *parent)
    : QObject(parent)
    , m_timeFormat(QStringLiteral("h:mm:ss AP"))
    , m_dateFormat(QStringLiteral("dd MMMM yyyy"))
{
    m_timer.setInterval(kTickIntervalMs);
    m_timer.setTimerType(Qt::CoarseTimer);
    connect(&m_timer, &QTimer::timeout, this, &TimeManager::tick);

    tick(); // populate immediately so the first rendered frame isn't blank
    m_timer.start();
}

TimeManager::~TimeManager()
{
    m_timer.stop();
}

void TimeManager::setTimeFormat(const QString &format)
{
    if (format.isEmpty() || m_timeFormat == format) {
        return;
    }
    m_timeFormat = format;
    emit timeFormatChanged();
    tick(); // reflect the new format immediately, not on the next tick
}

void TimeManager::setDateFormat(const QString &format)
{
    if (format.isEmpty() || m_dateFormat == format) {
        return;
    }
    m_dateFormat = format;
    emit dateFormatChanged();
    tick();
}

void TimeManager::tick()
{
    const QDateTime now = QDateTime::currentDateTime();

    const QString newTime = now.toString(m_timeFormat);
    if (m_currentTime != newTime) {
        m_currentTime = newTime;
        emit currentTimeChanged();
    }

    const QString newDate = now.toString(m_dateFormat);
    if (m_currentDate != newDate) {
        m_currentDate = newDate;
        emit currentDateChanged();
    }
}

QString TimeManager::relativeTime(const QDateTime &timestamp) const
{
    if (!timestamp.isValid()) {
        return QStringLiteral("--");
    }

    const qint64 secondsAgo = timestamp.secsTo(QDateTime::currentDateTime());

    if (secondsAgo < 5) {
        return QStringLiteral("just now"); // also absorbs a future timestamp (e.g. clock skew) safely
    }
    if (secondsAgo < 60) {
        return QStringLiteral("%1 sec ago").arg(secondsAgo);
    }
    if (secondsAgo < 3600) {
        return QStringLiteral("%1 min ago").arg(secondsAgo / 60);
    }
    if (secondsAgo < 86400) {
        return QStringLiteral("%1 hr ago").arg(secondsAgo / 3600);
    }

    const qint64 daysAgo = secondsAgo / 86400;
    if (daysAgo == 1) {
        return QStringLiteral("yesterday");
    }
    if (daysAgo < 7) {
        return QStringLiteral("%1 days ago").arg(daysAgo);
    }
    return timestamp.toString(QStringLiteral("dd MMM yyyy"));
}

} // namespace Panorama
