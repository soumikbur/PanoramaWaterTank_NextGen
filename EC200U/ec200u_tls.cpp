#include "ec200u_tls.h"
#include <stdio.h>
#include <string.h>

namespace WLI {
namespace EC200U {

TlsManager::TlsManager(UartDriver &uart) : m_uart(uart) {}

Result TlsManager::configure_tls(uint8_t ssl_ctx_id, const char *ca_filename) {
    char cmd[128];

    // 1. Set TLS Protocol to TLS 1.2 / TLS 1.3 (Auto-negotiate)
    snprintf(cmd, sizeof(cmd), "AT+QSSLCFG=\"sslversion\",%d,4", ssl_ctx_id);
    if (m_uart.send_and_wait(cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::TLS_FAILED;
    }

    // 2. Enable modern secure ciphers (AES-GCM, ChaCha20)
    snprintf(cmd, sizeof(cmd), "AT+QSSLCFG=\"ciphersuite\",%d,0xFFFF", ssl_ctx_id);
    if (m_uart.send_and_wait(cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::TLS_FAILED;
    }

    // 3. Enforce Server Authentication (Validates server certificate against Root CA)
    // CRITICAL: seclevel must NEVER be 0 in production.
    snprintf(cmd, sizeof(cmd), "AT+QSSLCFG=\"seclevel\",%d,1", ssl_ctx_id);
    if (m_uart.send_and_wait(cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::TLS_FAILED;
    }

    // 4. Bind Trusted CA Certificate (ISRG Root X1)
    if (ca_filename && strlen(ca_filename) > 0) {
        snprintf(cmd, sizeof(cmd), "AT+QSSLCFG=\"cacert\",%d,\"%s\"", ssl_ctx_id, ca_filename);
        if (m_uart.send_and_wait(cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
            return Result::TLS_FAILED;
        }
    }

    // 5. Enforce Certificate Validity Dates (Check expiration)
    snprintf(cmd, sizeof(cmd), "AT+QSSLCFG=\"checkcert\",%d,1", ssl_ctx_id);
    if (m_uart.send_and_wait(cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::TLS_FAILED;
    }

    // 6. Enable Server Name Indication (SNI) - MANDATORY for Cloudflare / Render
    snprintf(cmd, sizeof(cmd), "AT+QSSLCFG=\"sni\",%d,1", ssl_ctx_id);
    if (m_uart.send_and_wait(cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::TLS_FAILED;
    }

    // 7. Ignore Local RTC Time during initial handshake (prevents abort prior to NITZ sync)
    snprintf(cmd, sizeof(cmd), "AT+QSSLCFG=\"ignorelocaltime\",%d,1", ssl_ctx_id);
    if (m_uart.send_and_wait(cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::TLS_FAILED;
    }

    return Result::SUCCESS;
}

bool TlsManager::is_certificate_present(const char *ca_filename) {
    if (!ca_filename || strlen(ca_filename) == 0) return false;

    char list_resp[512];
    if (m_uart.send_and_wait("AT+QFLST=\"*\"", "OK", list_resp, sizeof(list_resp), 2000) == Result::SUCCESS) {
        char target_entry[64];
        snprintf(target_entry, sizeof(target_entry), "\"%s\"", ca_filename);
        return (strstr(list_resp, target_entry) != nullptr);
    }
    return false;
}

Result TlsManager::upload_certificate(
    const char *filename,
    const uint8_t *cert_bytes,
    size_t cert_len
) {
    if (!filename || !cert_bytes || cert_len == 0) {
        return Result::INVALID_PARAM;
    }

    // Prepare upload command
    char cmd[128];
    snprintf(cmd, sizeof(cmd), "AT+QFUPL=\"%s\",%u,30", filename, static_cast<unsigned int>(cert_len));

    // Send command and await "CONNECT" token
    if (m_uart.send_and_wait(cmd, "CONNECT", nullptr, 0, 3000) != Result::SUCCESS) {
        return Result::ERROR_GENERAL;
    }

    // Write raw certificate stream
    if (!m_uart.send_bytes(cert_bytes, cert_len)) {
        return Result::ERROR_GENERAL;
    }

    // Await upload confirmation (+QFUPL: <size>,<checksum> and OK)
    char resp[128];
    Result res = m_uart.send_and_wait(nullptr, "OK", resp, sizeof(resp), 5000);
    if (res == Result::SUCCESS && strstr(resp, "+QFUPL:") != nullptr) {
        return Result::SUCCESS;
    }

    return Result::ERROR_GENERAL;
}

Result TlsManager::delete_file(const char *filename) {
    if (!filename) return Result::INVALID_PARAM;
    char cmd[128];
    snprintf(cmd, sizeof(cmd), "AT+QFDEL=\"%s\"", filename);
    return m_uart.send_and_wait(cmd, "OK", nullptr, 0, 2000);
}

} // namespace EC200U
} // namespace WLI
