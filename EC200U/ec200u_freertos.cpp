#include "ec200u_freertos.h"
#include <string.h>

namespace WLI {
namespace EC200U {

FreeRtosCoordinator::FreeRtosCoordinator(
    ModemManager &modem,
    TlsManager &tls,
    HttpManager &http
) : m_modem(modem), m_tls(tls), m_http(http) {
    memset(&m_shared_snapshot, 0, sizeof(m_shared_snapshot));
}

void FreeRtosCoordinator::update_sensor_telemetry(const TelemetrySnapshot &snapshot) {
    // In production FreeRTOS, wrap in taskENTER_CRITICAL() / taskEXIT_CRITICAL() or xSemaphoreTake(xMutex)
    memcpy(&m_shared_snapshot, &snapshot, sizeof(TelemetrySnapshot));
    m_has_new_data = true;
}

bool FreeRtosCoordinator::get_telemetry_snapshot(TelemetrySnapshot &snapshot_out) {
    memcpy(&snapshot_out, &m_shared_snapshot, sizeof(TelemetrySnapshot));
    return m_has_new_data;
}

void FreeRtosCoordinator::task_step() {
    pet_watchdog();

    // 1. Ensure Modem is Powered and Initialized
    if (m_modem.get_state() == ModemState::MODEM_OFF) {
        if (m_modem.init() != Result::SUCCESS) {
            return;
        }
    }

    // 2. Ensure SIM Ready
    if (m_modem.get_state() == ModemState::SIM_CHECK) {
        if (m_modem.check_sim() != Result::SUCCESS) {
            return;
        }
    }

    // 3. Ensure Network Registered
    if (m_modem.get_state() == ModemState::NETWORK_SEARCH) {
        if (m_modem.check_network() != Result::SUCCESS) {
            return;
        }
    }

    // 4. Ensure PDP Context Active
    if (m_modem.get_state() == ModemState::NETWORK_REGISTERED) {
        if (m_modem.activate_pdp() != Result::SUCCESS) {
            return;
        }
    }

    // 5. Ensure TLS Engine Configured
    if (m_modem.get_state() == ModemState::DATA_CONNECTED) {
        if (m_tls.configure_tls() == Result::SUCCESS && m_http.init_http() == Result::SUCCESS) {
            m_modem.set_state(ModemState::HTTPS_READY);
        } else {
            m_modem.trigger_recovery("TLS/HTTP configuration failure");
            return;
        }
    }

    // 6. Check if Upload Interval Elapsed
    if (m_modem.get_state() == ModemState::HTTPS_READY) {
        TelemetrySnapshot local_snapshot;
        if (!get_telemetry_snapshot(local_snapshot)) {
            // No telemetry acquired yet from ADC task
            return;
        }

        pet_watchdog();
        m_modem.set_state(ModemState::UPLOADING);

        HttpResponse resp;
        m_modem.get_diagnostics_mut().total_uploads_attempted++;

        Result res = m_http.post_telemetry(
            local_snapshot,
            HTTPS_SERVER_HOST,
            HTTPS_API_POST_PATH,
            DEFAULT_API_TOKEN,
            &resp
        );

        m_modem.get_diagnostics_mut().last_http_status = resp.http_status;
        m_modem.get_diagnostics_mut().last_quectel_err = resp.quectel_err;

        if (res == Result::SUCCESS && resp.http_status == 200) {
            m_modem.get_diagnostics_mut().total_uploads_succeeded++;
            m_modem.set_state(ModemState::HTTPS_READY);
        } else {
            m_modem.get_diagnostics_mut().total_uploads_failed++;
            if (res == Result::AUTH_REJECTED) {
                // Permanent failure; do not retry immediately in tight loop
                m_modem.set_state(ModemState::ERROR_STATE);
            } else {
                m_modem.trigger_recovery("Upload failed");
            }
        }

        pet_watchdog();
    }
}

} // namespace EC200U
} // namespace WLI
