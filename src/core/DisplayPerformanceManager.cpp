#include "DisplayPerformanceManager.h"

#include <QGuiApplication>
#include <QQuickWindow>
#include <QScreen>
#include <QSettings>

#include <cmath>

namespace Panorama {

// -----------------------------------------------------------------------
// Construction
// -----------------------------------------------------------------------

DisplayPerformanceManager::DisplayPerformanceManager(QObject *parent)
    : QObject(parent)
{
    // Restore persisted reduced-motion preference.
    QSettings settings;
    m_reducedMotion = settings.value(
        QStringLiteral("display/reducedMotion"), false).toBool();

    // Initial seed from primary screen until attached to a specific window.
    if (qGuiApp) {
        updateFromScreen(QGuiApplication::primaryScreen());
    }
}

// -----------------------------------------------------------------------
// Window attachment — called once from main.cpp
// -----------------------------------------------------------------------

void DisplayPerformanceManager::attachToWindow(QQuickWindow *window)
{
    if (!window)
        return;

    m_window = window;

    // React to the window moving between monitors.
    connect(window, &QWindow::screenChanged,
            this,   &DisplayPerformanceManager::onScreenChanged);

    // Some Windows display configurations update window->screen() upon position
    // changes during multi-monitor dragging before screenChanged is delivered.
    connect(window, &QWindow::xChanged, this, [this]() {
        if (m_window && m_window->screen() && m_window->screen() != m_currentScreen) {
            updateFromScreen(m_window->screen());
        }
    });
    connect(window, &QWindow::yChanged, this, [this]() {
        if (m_window && m_window->screen() && m_window->screen() != m_currentScreen) {
            updateFromScreen(m_window->screen());
        }
    });

    // Handle monitor hot-unplugging while the window is on it.
    if (qGuiApp) {
        connect(qGuiApp, &QGuiApplication::screenRemoved, this, [this](QScreen *screen) {
            if (m_currentScreen == screen) {
                if (m_window && m_window->screen())
                    updateFromScreen(m_window->screen());
                else
                    updateFromScreen(nullptr);
            }
        });
    }

    // Seed with the current screen.
    updateFromScreen(window->screen());
}

// -----------------------------------------------------------------------
// Screen-change handling
// -----------------------------------------------------------------------

void DisplayPerformanceManager::onScreenChanged(QScreen *screen)
{
    updateFromScreen(screen);
}

void DisplayPerformanceManager::onScreenRefreshRateChanged(qreal rate)
{
    Q_UNUSED(rate)
    // Re-read from the screen object to handle any rounding the platform
    // layer may have applied.
    updateFromScreen(m_currentScreen.data());
}

void DisplayPerformanceManager::updateFromScreen(QScreen *screen)
{
    // Disconnect from the previous screen (if any) so we don't get
    // stale signals after the screen object is destroyed.
    if (m_currentScreen && m_currentScreen != screen) {
        disconnect(m_currentScreen, &QScreen::refreshRateChanged,
                   this, &DisplayPerformanceManager::onScreenRefreshRateChanged);
    }

    m_currentScreen = screen;

    if (!screen) {
        if (m_window && m_window->screen()) {
            updateFromScreen(m_window->screen());
            return;
        }
        QScreen *primary = QGuiApplication::primaryScreen();
        if (primary) {
            updateFromScreen(primary);
            return;
        }
        // No screen available (extremely rare — e.g. headless test).
        // Fall back to a safe default.
        if (!qFuzzyCompare(m_refreshRate, 60.0)) {
            const QString oldMode = performanceMode();
            m_refreshRate = 60.0;
            emit refreshRateChanged();
            if (performanceMode() != oldMode)
                emit performanceModeChanged();
        }
        return;
    }

    // Listen for runtime changes to this screen's refresh rate (e.g.
    // the user changes their display settings while the app is running).
    connect(screen, &QScreen::refreshRateChanged,
            this,   &DisplayPerformanceManager::onScreenRefreshRateChanged,
            Qt::UniqueConnection);

    qreal rate = screen->refreshRate();

    // Guard against invalid / unknown values.
    if (rate <= 0.0 || !std::isfinite(rate))
        rate = 60.0;

    if (qFuzzyCompare(rate, m_refreshRate))
        return;

    const QString oldMode = performanceMode();
    m_refreshRate = rate;
    emit refreshRateChanged();
    if (performanceMode() != oldMode)
        emit performanceModeChanged();
}

// -----------------------------------------------------------------------
// Derived read-only properties
// -----------------------------------------------------------------------

qreal DisplayPerformanceManager::frameIntervalMs() const
{
    return 1000.0 / m_refreshRate;
}

QString DisplayPerformanceManager::performanceMode() const
{
    if (m_refreshRate >= 120.0)
        return QStringLiteral("high");
    if (m_refreshRate >= 50.0)
        return QStringLiteral("normal");
    return QStringLiteral("low");
}

qreal DisplayPerformanceManager::animationScale() const
{
    // 1.0 at 60 Hz; proportionally smaller for higher rates so that
    // frame-count-proportional durations feel equally fast.  Clamped
    // to [0.5, 1.0] to avoid excessively fast or slow animation.
    const qreal scale = 60.0 / m_refreshRate;
    return qBound(0.5, scale, 1.0);
}

// -----------------------------------------------------------------------
// Reduced-motion preference
// -----------------------------------------------------------------------

void DisplayPerformanceManager::setReducedMotion(bool reduced)
{
    if (m_reducedMotion == reduced)
        return;

    m_reducedMotion = reduced;

    // Persist so the preference survives restarts.
    QSettings settings;
    settings.setValue(QStringLiteral("display/reducedMotion"), reduced);

    emit reducedMotionChanged();
}

} // namespace Panorama
