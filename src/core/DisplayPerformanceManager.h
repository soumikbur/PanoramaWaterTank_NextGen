#pragma once

#include <QObject>
#include <QPointer>
#include <qqml.h>

#include <QScreen>
#include <QQuickWindow>

namespace Panorama {

/*!
 * \brief Detects the refresh rate of the QScreen the application window
 *        currently occupies and exposes performance-related information
 *        to QML.
 *
 * This class does NOT create a Timer-based rendering loop.  Qt Quick's
 * scene graph render loop is responsible for frame presentation and
 * vsync synchronisation.  DisplayPerformanceManager merely provides
 * advisory information so that QML animation durations and decorative
 * effects can be tuned to the actual display.
 *
 * Typical usage in QML:
 * \code
 *   import PanoramaWaterTank
 *   Text { text: "Refresh rate: " + DisplayPerformanceManager.refreshRate + " Hz" }
 * \endcode
 *
 * The singleton is wired to the root QQuickWindow in main.cpp after
 * the engine loads.  When the window is dragged to a different monitor,
 * QWindow::screenChanged fires, and every exposed property updates
 * automatically — no application restart required.
 */
class DisplayPerformanceManager : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    /// Current monitor refresh rate in Hz (e.g. 60, 75, 120, 144).
    /// Falls back to 60 if the screen reports an invalid value.
    Q_PROPERTY(qreal refreshRate READ refreshRate NOTIFY refreshRateChanged)

    /// Target frame rate in FPS derived from the detected monitor refresh rate (e.g. 60, 75, 120, 144).
    Q_PROPERTY(int targetFrameRate READ targetFrameRate NOTIFY refreshRateChanged)

    /// Ideal frame interval in milliseconds derived from refreshRate.
    /// Provided for application-level timing decisions only; NOT for
    /// use as a Timer interval to emulate rendering.
    Q_PROPERTY(qreal frameIntervalMs READ frameIntervalMs NOTIFY refreshRateChanged)

    /// Advisory performance tier: "high" (≥ 120 Hz), "normal" (60–119 Hz),
    /// or "low" (fallback / constrained).
    Q_PROPERTY(QString performanceMode READ performanceMode NOTIFY performanceModeChanged)

    /// Active resolved dual-device performance profile: "high", "balanced", "low"
    Q_PROPERTY(QString performanceProfile READ performanceProfile NOTIFY performanceProfileChanged)

    /// Manual performance profile override: "auto" (default), "high", "balanced", "low"
    Q_PROPERTY(QString profileOverride READ profileOverride WRITE setProfileOverride NOTIFY profileOverrideChanged)

    /// Hardware diagnostics exposed to QML
    Q_PROPERTY(int cpuCores READ cpuCores CONSTANT)
    Q_PROPERTY(int totalMemoryMb READ totalMemoryMb CONSTANT)
    Q_PROPERTY(bool isAutoDetected READ isAutoDetected NOTIFY profileOverrideChanged)
    Q_PROPERTY(bool waveAnimationEnabled READ waveAnimationEnabled NOTIFY performanceProfileChanged)
    Q_PROPERTY(int chartMaxPoints READ chartMaxPoints NOTIFY performanceProfileChanged)
    Q_PROPERTY(int mqttBatchIntervalMs READ mqttBatchIntervalMs NOTIFY performanceProfileChanged)

    /// User-controlled reduced-motion preference.  When true, decorative
    /// animations (wave, looping effects) are disabled and transition
    /// durations are shortened, but functional feedback (switches,
    /// buttons, status indicators) is preserved.
    Q_PROPERTY(bool reducedMotion READ reducedMotion WRITE setReducedMotion NOTIFY reducedMotionChanged)

    /// Scale factor based on refresh rate.  1.0 at 60 Hz, proportionally
    /// higher for faster displays.  QML can use this for adaptive
    /// interpolation durations (slower updates on 60 Hz, snappier on 144 Hz).
    Q_PROPERTY(qreal animationScale READ animationScale NOTIFY refreshRateChanged)

public:
    explicit DisplayPerformanceManager(QObject *parent = nullptr);

    /// Call once from main.cpp after the engine has loaded and the root
    /// window is available.  Connects to the window's screenChanged
    /// signal to handle multi-monitor moves.
    Q_INVOKABLE void attachToWindow(QQuickWindow *window);

    qreal refreshRate()    const { return m_refreshRate; }
    int   targetFrameRate() const { return qRound(m_refreshRate); }
    qreal frameIntervalMs() const;
    QString performanceMode() const;
    bool  reducedMotion()  const { return m_reducedMotion; }
    qreal animationScale() const;

    QString performanceProfile() const;
    QString profileOverride() const { return m_profileOverride; }
    int cpuCores() const { return m_cpuCores; }
    int totalMemoryMb() const { return m_totalMemoryMb; }
    bool isAutoDetected() const { return m_profileOverride == QLatin1String("auto"); }
    bool waveAnimationEnabled() const;
    int chartMaxPoints() const;
    int mqttBatchIntervalMs() const;

public slots:
    void setReducedMotion(bool reduced);
    void setProfileOverride(const QString &override);

signals:
    void refreshRateChanged();
    void performanceModeChanged();
    void reducedMotionChanged();
    void performanceProfileChanged();
    void profileOverrideChanged();

private slots:
    void onScreenChanged(QScreen *screen);
    void onScreenRefreshRateChanged(qreal rate);

private:
    void updateFromScreen(QScreen *screen);
    void detectHardwareCapabilities();
    QString computeAutoProfile() const;

    QPointer<QQuickWindow> m_window;
    QPointer<QScreen>      m_currentScreen;
    qreal                  m_refreshRate{60.0};
    bool                   m_reducedMotion{false};
    QString                m_profileOverride{QStringLiteral("auto")};
    int                    m_cpuCores{4};
    int                    m_totalMemoryMb{4096};
    QString                m_cachedAutoProfile{QStringLiteral("high")};
};

} // namespace Panorama
