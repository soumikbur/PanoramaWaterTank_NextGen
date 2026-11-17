#ifndef EC200U_HTTP_H
#define EC200U_HTTP_H

#include "ec200u_config.h"
#include "ec200u_types.h"
#include "ec200u_uart.h"

/**
 * @file ec200u_http.h
 * @brief Quectel embedded HTTPS client for authenticated JSON telemetry transmission.
 */

namespace WLI {
namespace EC200U {

class HttpManager {
public:
    explicit HttpManager(UartDriver &uart);

    /**
     * @brief Initialize the embedded HTTP(S) stack and bind to PDP and SSL contexts.
     */
    Result init_http(
        uint8_t context_id = PDP_CONTEXT_ID,
        uint8_t ssl_ctx_id = SSL_CONTEXT_ID
    );

    /**
     * @brief Format a TelemetrySnapshot into canonical JSON matching Phase 04 schema.
     * @param data Sensor snapshot.
     * @param json_out Output buffer.
     * @param max_len Buffer capacity.
     * @return Number of characters written.
     */
    static size_t format_json_telemetry(
        const TelemetrySnapshot &data,
        char *json_out,
        size_t max_len
    );

    /**
     * @brief Execute authenticated HTTPS POST transmitting telemetry data to remote backend.
     * @param data Telemetry snapshot.
     * @param server_host Target hostname (e.g. "panorama-wli-https-receiver.onrender.com").
     * @param post_path API route (e.g. "/api/telemetry").
     * @param bearer_token Bearer authentication token.
     * @param resp_out Output structure capturing HTTP status code and latency.
     */
    Result post_telemetry(
        const TelemetrySnapshot &data,
        const char *server_host = HTTPS_SERVER_HOST,
        const char *post_path = HTTPS_API_POST_PATH,
        const char *bearer_token = DEFAULT_API_TOKEN,
        HttpResponse *resp_out = nullptr
    );

    /**
     * @brief Test service health via GET /api/health over HTTPS.
     */
    Result check_service_health(
        const char *server_host = HTTPS_SERVER_HOST,
        const char *health_path = HTTPS_API_HEALTH_PATH,
        HttpResponse *resp_out = nullptr
    );

    /**
     * @brief Abort any active HTTP socket session.
     */
    void abort_session();

private:
    UartDriver &m_uart;

    Result set_url(const char *url, uint32_t timeout_s = 30);
    bool parse_httppost_urc(const char *urc_line, HttpResponse &resp);
};

} // namespace EC200U
} // namespace WLI

#endif // EC200U_HTTP_H
