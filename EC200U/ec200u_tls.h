#ifndef EC200U_TLS_H
#define EC200U_TLS_H

#include "ec200u_config.h"
#include "ec200u_types.h"
#include "ec200u_uart.h"

/**
 * @file ec200u_tls.h
 * @brief SSL/TLS security engine configuration and Root CA certificate management.
 */

namespace WLI {
namespace EC200U {

class TlsManager {
public:
    explicit TlsManager(UartDriver &uart);

    /**
     * @brief Configure hardware SSL/TLS context parameters for authenticated HTTPS communication.
     * @param ssl_ctx_id Context ID (1 to 5).
     * @param ca_filename CA certificate filename in UFS storage (e.g. "cacert.pem").
     * @return Result::SUCCESS if all SSL configuration commands succeed.
     */
    Result configure_tls(
        uint8_t ssl_ctx_id = SSL_CONTEXT_ID,
        const char *ca_filename = TLS_CA_CERT_FILENAME
    );

    /**
     * @brief Verify whether the trusted Root CA certificate is present in modem UFS storage.
     * @param ca_filename Filename to search for.
     */
    bool is_certificate_present(const char *ca_filename = TLS_CA_CERT_FILENAME);

    /**
     * @brief Upload an X.509 PEM certificate file into modem non-volatile UFS storage.
     * @param filename Target filename in modem flash.
     * @param cert_bytes Raw ASCII PEM certificate data.
     * @param cert_len Length of certificate data in bytes.
     */
    Result upload_certificate(
        const char *filename,
        const uint8_t *cert_bytes,
        size_t cert_len
    );

    /**
     * @brief Delete a certificate or file from modem UFS storage.
     */
    Result delete_file(const char *filename);

private:
    UartDriver &m_uart;
};

} // namespace EC200U
} // namespace WLI

#endif // EC200U_TLS_H
