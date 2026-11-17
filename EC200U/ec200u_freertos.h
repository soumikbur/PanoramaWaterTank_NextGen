#ifndef EC200U_FREERTOS_H
#define EC200U_FREERTOS_H

#include "ec200u.h"
#include "ec200u_http.h"
#include "ec200u_tls.h"

/**
 * @file ec200u_freertos.h
 * @brief FreeRTOS task coordinator, thread-safe telemetry buffer, and watchdog integration.
 */

namespace WLI {
namespace EC200U {

typedef void (*WatchdogFeedCallback)();

class FreeRtosCoordinator {
public:
    FreeRtosCoordinator(
        ModemManager &modem,
        TlsManager &tls,
        HttpManager &http
    );

    /**
     * @brief Register optional external watchdog feed callback.
     */
    void register_watchdog_feeder(WatchdogFeedCallback cb) { m_watchdog_cb = cb; }

    /**
     * @brief Thread-safe update of current sensor telemetry from STM32 ADC task.
     * Takes mutex, copies data, and releases mutex immediately (< 1 microsecond).
     */
    void update_sensor_telemetry(const TelemetrySnapshot &snapshot);

    /**
     * @brief Thread-safe retrieval of latest telemetry snapshot.
     */
    bool get_telemetry_snapshot(TelemetrySnapshot &snapshot_out);

    /**
     * @brief Set telemetry upload interval in seconds (default: 90s).
     */
    void set_upload_interval(uint32_t interval_seconds) {
        m_upload_interval_s = interval_seconds;
    }

    uint32_t get_upload_interval() const { return m_upload_interval_s; }

    /**
     * @brief Main FreeRTOS task loop execution step.
     * Called from the body of HTTPSUploadTask.
     */
    void task_step();

private:
    ModemManager &m_modem;
    TlsManager   &m_tls;
    HttpManager  &m_http;

    TelemetrySnapshot m_shared_snapshot;
    bool m_has_new_data = false;
    uint32_t m_upload_interval_s = TELEMETRY_UPLOAD_INTERVAL_S;
    uint32_t m_last_upload_tick = 0;
    WatchdogFeedCallback m_watchdog_cb = nullptr;

    void pet_watchdog() {
        if (m_watchdog_cb) m_watchdog_cb();
    }
};

} // namespace EC200U
} // namespace WLI

#endif // EC200U_FREERTOS_H
