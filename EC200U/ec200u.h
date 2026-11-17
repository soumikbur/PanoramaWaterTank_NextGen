#ifndef EC200U_H
#define EC200U_H

#include "ec200u_config.h"
#include "ec200u_types.h"
#include "ec200u_uart.h"

/**
 * @file ec200u.h
 * @brief Core Quectel EC200U modem controller, state machine, and network manager.
 */

namespace WLI {
namespace EC200U {

class ModemManager {
public:
    explicit ModemManager(UartDriver &uart);

    /**
     * @brief Initialize modem communication, sync baud rate, and configure error reporting.
     */
    Result init();

    /**
     * @brief Verify SIM card status and unlock if required.
     */
    Result check_sim();

    /**
     * @brief Query cellular registration and EPS packet attachment status.
     */
    Result check_network();

    /**
     * @brief Read current RF signal metrics (CSQ, RSSI dBm).
     */
    Result query_signal(SignalQuality &signal_out);

    /**
     * @brief Configure APN profile and activate embedded TCP/IP PDP context (Context 1).
     */
    Result activate_pdp(const char *apn = DEFAULT_APN);

    /**
     * @brief Deactivate TCP/IP PDP context.
     */
    Result deactivate_pdp();

    /**
     * @brief Advance the internal modem state machine.
     * Can be invoked periodically from a FreeRTOS task or superloop.
     */
    void step_state_machine();

    /**
     * @brief Force state machine into recovery mode with backoff.
     */
    void trigger_recovery(const char *reason = nullptr);

    /**
     * @brief Retrieve current operational state.
     */
    ModemState get_state() const { return m_state; }

    /**
     * @brief Check whether modem has an active data connection with valid IP.
     */
    bool is_data_connected() const {
        return m_state == ModemState::DATA_CONNECTED ||
               m_state == ModemState::TLS_INITIALIZATION ||
               m_state == ModemState::HTTPS_READY ||
               m_state == ModemState::UPLOADING ||
               m_state == ModemState::WAITING_RESPONSE;
    }

    /**
     * @brief Retrieve diagnostic telemetry statistics.
     */
    const ModemDiagnostics &get_diagnostics() const { return m_diag; }
    ModemDiagnostics &get_diagnostics_mut() { return m_diag; }

    /**
     * @brief Retrieve cached signal metrics.
     */
    const SignalQuality &get_signal() const { return m_signal; }

    /**
     * @brief Set operational state explicitly.
     */
    void set_state(ModemState new_state) { m_state = new_state; }

    /**
     * @brief Access low-level UART driver.
     */
    UartDriver &get_uart() { return m_uart; }

private:
    UartDriver &m_uart;
    ModemState m_state = ModemState::MODEM_OFF;
    SignalQuality m_signal;
    ModemDiagnostics m_diag;

    uint32_t m_last_state_tick = 0;
    uint8_t  m_retry_count = 0;
    uint32_t m_backoff_delay_ms = RETRY_BACKOFF_BASE_MS;

    bool parse_csq_response(const char *resp, SignalQuality &sig);
    bool parse_cereg_response(const char *resp, NetworkStatus &stat);
    bool parse_qiact_response(const char *resp, char *ip_out, size_t max_ip_len);
};

} // namespace EC200U
} // namespace WLI

#endif // EC200U_H
