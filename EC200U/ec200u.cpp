#include "ec200u.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace WLI {
namespace EC200U {

ModemManager::ModemManager(UartDriver &uart) : m_uart(uart) {
    m_state = ModemState::MODEM_OFF;
}

Result ModemManager::init() {
    m_state = ModemState::MODEM_INITIALIZING;

    // 1. Sync AT Autobaud (Try up to 5 times)
    bool at_ok = false;
    for (int i = 0; i < 5; ++i) {
        if (m_uart.send_and_wait("AT", "OK", nullptr, 0, 500) == Result::SUCCESS) {
            at_ok = true;
            break;
        }
    }
    if (!at_ok) {
        m_state = ModemState::ERROR_STATE;
        return Result::TIMEOUT;
    }

    // 2. Disable echo to simplify parsing
    m_uart.send_and_wait("ATE0", "OK", nullptr, 0, 500);

    // 3. Enable verbose error reporting
    m_uart.send_and_wait("AT+CMEE=2", "OK", nullptr, 0, 500);

    // 4. Read Product Identification & Firmware Revision
    char info_resp[256];
    if (m_uart.send_and_wait("ATI", "OK", info_resp, sizeof(info_resp), 1000) == Result::SUCCESS) {
        const char *rev_str = strstr(info_resp, "Revision:");
        if (rev_str) {
            sscanf(rev_str, "Revision: %31s", m_diag.firmware_revision);
        }
    }

    // 5. Read IMEI
    char imei_resp[128];
    if (m_uart.send_and_wait("AT+GSN", "OK", imei_resp, sizeof(imei_resp), 1000) == Result::SUCCESS) {
        char *line = strtok(imei_resp, "\r\n");
        while (line) {
            if (strlen(line) >= 14 && line[0] >= '0' && line[0] <= '9') {
                snprintf(m_diag.imei, sizeof(m_diag.imei), "%s", line);
                break;
            }
            line = strtok(nullptr, "\r\n");
        }
    }

    m_state = ModemState::SIM_CHECK;
    return Result::SUCCESS;
}

Result ModemManager::check_sim() {
    char resp[128];
    Result res = m_uart.send_and_wait("AT+CPIN?", "OK", resp, sizeof(resp), TIMEOUT_SIM_CHECK_MS);
    if (res != Result::SUCCESS) {
        return Result::TIMEOUT;
    }

    if (strstr(resp, "+CPIN: READY") != nullptr) {
        m_state = ModemState::NETWORK_SEARCH;
        return Result::SUCCESS;
    }

    if (strstr(resp, "+CPIN: SIM NOT INSERTED") != nullptr) {
        return Result::NO_SIM;
    }

    return Result::ERROR_GENERAL;
}

Result ModemManager::query_signal(SignalQuality &signal_out) {
    char resp[64];
    Result res = m_uart.send_and_wait("AT+CSQ", "OK", resp, sizeof(resp), 500);
    if (res != Result::SUCCESS) {
        return res;
    }

    if (parse_csq_response(resp, signal_out)) {
        m_signal = signal_out;
        return Result::SUCCESS;
    }
    return Result::ERROR_GENERAL;
}

bool ModemManager::parse_csq_response(const char *resp, SignalQuality &sig) {
    const char *p = strstr(resp, "+CSQ:");
    if (!p) return false;

    int csq = 99, ber = 99;
    if (sscanf(p, "+CSQ: %d,%d", &csq, &ber) >= 1) {
        sig.csq = static_cast<int8_t>(csq);
        sig.ber = static_cast<uint8_t>(ber);
        if (csq >= 0 && csq <= 31) {
            sig.rssi_dbm = static_cast<int16_t>(-113 + (csq * 2));
            sig.is_usable = (csq >= 10);
        } else {
            sig.rssi_dbm = -113;
            sig.is_usable = false;
        }
        return true;
    }
    return false;
}

Result ModemManager::check_network() {
    // 1. Update signal metrics
    query_signal(m_signal);

    // 2. Query EPS registration status
    char resp[128];
    Result res = m_uart.send_and_wait("AT+CEREG?", "OK", resp, sizeof(resp), 1000);
    if (res != Result::SUCCESS) {
        return res;
    }

    NetworkStatus status = NetworkStatus::UNKNOWN;
    if (!parse_cereg_response(resp, status)) {
        return Result::ERROR_GENERAL;
    }

    if (status == NetworkStatus::REGISTERED_HOME || status == NetworkStatus::REGISTERED_ROAMING) {
        // Verify EPS packet attachment
        char att_resp[64];
        if (m_uart.send_and_wait("AT+CGATT?", "OK", att_resp, sizeof(att_resp), 1000) == Result::SUCCESS) {
            if (strstr(att_resp, "+CGATT: 1") != nullptr) {
                // Query serving operator
                char cops_resp[128];
                if (m_uart.send_and_wait("AT+COPS?", "OK", cops_resp, sizeof(cops_resp), 1000) == Result::SUCCESS) {
                    const char *op_start = strchr(cops_resp, '"');
                    if (op_start) {
                        const char *op_end = strchr(op_start + 1, '"');
                        if (op_end) {
                            size_t op_len = op_end - (op_start + 1);
                            if (op_len < sizeof(m_diag.operator_name)) {
                                memcpy(m_diag.operator_name, op_start + 1, op_len);
                                m_diag.operator_name[op_len] = '\0';
                            }
                        }
                    }
                }

                m_state = ModemState::NETWORK_REGISTERED;
                return Result::SUCCESS;
            }
        }
    }

    return Result::NO_NETWORK;
}

bool ModemManager::parse_cereg_response(const char *resp, NetworkStatus &stat) {
    const char *p = strstr(resp, "+CEREG:");
    if (!p) return false;

    int n = 0, s = 0;
    if (sscanf(p, "+CEREG: %d,%d", &n, &s) == 2) {
        stat = static_cast<NetworkStatus>(s);
        return true;
    } else if (sscanf(p, "+CEREG: %d", &s) == 1) {
        stat = static_cast<NetworkStatus>(s);
        return true;
    }
    return false;
}

Result ModemManager::activate_pdp(const char *apn) {
    m_state = ModemState::PDP_ACTIVATION;

    // 1. Check if PDP Context 1 is already active
    char act_query[128];
    if (m_uart.send_and_wait("AT+QIACT?", "OK", act_query, sizeof(act_query), 1000) == Result::SUCCESS) {
        if (parse_qiact_response(act_query, m_diag.assigned_ip, sizeof(m_diag.assigned_ip))) {
            m_state = ModemState::DATA_CONNECTED;
            return Result::SUCCESS;
        }
    }

    // 2. Configure APN profile for Context 1
    char apn_cmd[128];
    snprintf(apn_cmd, sizeof(apn_cmd), "AT+QICSGP=1,1,\"%s\",\"\",\"\",%d", apn ? apn : DEFAULT_APN, APN_AUTH_TYPE);
    if (m_uart.send_and_wait(apn_cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::PDP_FAILED;
    }

    // 3. Activate Context 1
    if (m_uart.send_and_wait("AT+QIACT=1", "OK", nullptr, 0, TIMEOUT_PDP_ACTIVATE_MS) != Result::SUCCESS) {
        m_diag.total_pdp_reconnections++;
        return Result::PDP_FAILED;
    }

    // 4. Confirm assigned IP address
    if (m_uart.send_and_wait("AT+QIACT?", "OK", act_query, sizeof(act_query), 1000) == Result::SUCCESS) {
        if (parse_qiact_response(act_query, m_diag.assigned_ip, sizeof(m_diag.assigned_ip))) {
            m_state = ModemState::DATA_CONNECTED;
            return Result::SUCCESS;
        }
    }

    return Result::PDP_FAILED;
}

bool ModemManager::parse_qiact_response(const char *resp, char *ip_out, size_t max_ip_len) {
    const char *p = strstr(resp, "+QIACT: 1,1,");
    if (!p) {
        p = strstr(resp, "+QIACT:");
    }
    if (!p) return false;

    const char *ip_start = strchr(p, '"');
    if (ip_start) {
        const char *ip_end = strchr(ip_start + 1, '"');
        if (ip_end) {
            size_t len = ip_end - (ip_start + 1);
            if (len > 0 && len < max_ip_len) {
                memcpy(ip_out, ip_start + 1, len);
                ip_out[len] = '\0';
                return (strcmp(ip_out, "0.0.0.0") != 0);
            }
        }
    }
    return false;
}

Result ModemManager::deactivate_pdp() {
    Result res = m_uart.send_and_wait("AT+QIDEACT=1", "OK", nullptr, 0, 15000);
    m_diag.assigned_ip[0] = '\0';
    if (m_state == ModemState::DATA_CONNECTED || m_state == ModemState::HTTPS_READY) {
        m_state = ModemState::NETWORK_REGISTERED;
    }
    return res;
}

void ModemManager::trigger_recovery(const char *reason) {
    (void)reason;
    m_state = ModemState::RECOVERY;
    m_retry_count++;

    if (m_retry_count > MAX_RETRY_COUNT) {
        m_retry_count = 0;
        m_diag.total_modem_resets++;
        m_state = ModemState::MODEM_INITIALIZING;
    }
}

void ModemManager::step_state_machine() {
    switch (m_state) {
        case ModemState::MODEM_OFF:
            init();
            break;

        case ModemState::MODEM_INITIALIZING:
            if (check_sim() == Result::SUCCESS) {
                m_state = ModemState::NETWORK_SEARCH;
            }
            break;

        case ModemState::SIM_CHECK:
            check_sim();
            break;

        case ModemState::NETWORK_SEARCH:
            if (check_network() == Result::SUCCESS) {
                m_state = ModemState::NETWORK_REGISTERED;
            }
            break;

        case ModemState::NETWORK_REGISTERED:
            if (activate_pdp(DEFAULT_APN) == Result::SUCCESS) {
                m_state = ModemState::DATA_CONNECTED;
            }
            break;

        case ModemState::DATA_CONNECTED:
            // Ready for TLS / HTTPS configuration
            break;

        case ModemState::RECOVERY:
            // Deactivate and re-establish connection
            deactivate_pdp();
            m_state = ModemState::NETWORK_SEARCH;
            break;

        default:
            break;
    }
}

} // namespace EC200U
} // namespace WLI
