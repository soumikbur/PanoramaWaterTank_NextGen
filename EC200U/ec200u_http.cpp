#include "ec200u_http.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace WLI {
namespace EC200U {

HttpManager::HttpManager(UartDriver &uart) : m_uart(uart) {}

Result HttpManager::init_http(uint8_t context_id, uint8_t ssl_ctx_id) {
    char cmd[64];

    // 1. Bind to active PDP context
    snprintf(cmd, sizeof(cmd), "AT+QHTTPCFG=\"contextid\",%d", context_id);
    if (m_uart.send_and_wait(cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    // 2. Bind to SSL context
    snprintf(cmd, sizeof(cmd), "AT+QHTTPCFG=\"sslctxid\",%d", ssl_ctx_id);
    if (m_uart.send_and_wait(cmd, "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    // 3. Enable response header output
    if (m_uart.send_and_wait("AT+QHTTPCFG=\"responseheader\",1", "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    // 4. Enable custom request headers (Authorization: Bearer <token>)
    if (m_uart.send_and_wait("AT+QHTTPCFG=\"requestheader\",1", "OK", nullptr, 0, 1000) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    return Result::SUCCESS;
}

size_t HttpManager::format_json_telemetry(
    const TelemetrySnapshot &data,
    char *json_out,
    size_t max_len
) {
    if (!json_out || max_len < 64) return 0;

    int written = snprintf(
        json_out, max_len,
        "{"
        "\"device_id\":\"%s\","
        "\"sequence_id\":%u,"
        "\"water_level_cm\":%.2f,"
        "\"water_percentage\":%.2f,"
        "\"raw_voltage\":%.3f,"
        "\"pressure_bar\":%.3f,"
        "\"battery_v\":%.2f,"
        "\"signal_csq\":%d,"
        "\"gps_lat\":%.6f,"
        "\"gps_lon\":%.6f,"
        "\"gps_valid\":%s,"
        "\"sensor_status\":\"%s\","
        "\"alarm_status\":\"%s\","
        "\"flow_rate_lpm\":%.2f,"
        "\"timestamp\":%u"
        "}",
        data.device_id[0] ? data.device_id : DEFAULT_DEVICE_ID,
        static_cast<unsigned int>(data.sequence_id),
        data.water_level_cm,
        data.water_percentage,
        data.raw_voltage,
        data.pressure_bar,
        data.battery_v,
        data.signal_csq,
        data.gps_lat,
        data.gps_lon,
        data.gps_valid ? "true" : "false",
        data.sensor_status[0] ? data.sensor_status : "NORMAL",
        data.alarm_status[0] ? data.alarm_status : "NONE",
        data.flow_rate_lpm,
        static_cast<unsigned int>(data.timestamp)
    );

    if (written > 0 && static_cast<size_t>(written) < max_len) {
        return static_cast<size_t>(written);
    }
    return 0;
}

Result HttpManager::set_url(const char *url, uint32_t timeout_s) {
    if (!url) return Result::INVALID_PARAM;
    size_t url_len = strlen(url);

    char cmd[64];
    snprintf(cmd, sizeof(cmd), "AT+QHTTPURL=%u,%u", static_cast<unsigned int>(url_len), static_cast<unsigned int>(timeout_s));

    if (m_uart.send_and_wait(cmd, "CONNECT", nullptr, 0, 3000) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    if (!m_uart.send_bytes(reinterpret_cast<const uint8_t *>(url), url_len)) {
        return Result::HTTP_FAILED;
    }

    if (m_uart.send_and_wait(nullptr, "OK", nullptr, 0, 3000) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    return Result::SUCCESS;
}

Result HttpManager::post_telemetry(
    const TelemetrySnapshot &data,
    const char *server_host,
    const char *post_path,
    const char *bearer_token,
    HttpResponse *resp_out
) {
    const char *host = server_host ? server_host : HTTPS_SERVER_HOST;
    const char *path = post_path ? post_path : HTTPS_API_POST_PATH;
    const char *token = bearer_token ? bearer_token : DEFAULT_API_TOKEN;

    // 1. Build Full Target URL
    char full_url[256];
    snprintf(full_url, sizeof(full_url), "https://%s%s", host, path);
    if (set_url(full_url, 30) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    // 2. Format Telemetry JSON Payload
    char json_body[HTTP_PAYLOAD_MAX_LEN];
    size_t body_len = format_json_telemetry(data, json_body, sizeof(json_body));
    if (body_len == 0) {
        return Result::INVALID_PARAM;
    }

    // 3. Assemble Full HTTP Request (Headers + Body for requestheader=1)
    char http_req[HTTP_PAYLOAD_MAX_LEN + 384];
    int req_len = snprintf(
        http_req, sizeof(http_req),
        "POST %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "Authorization: Bearer %s\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %u\r\n"
        "Connection: close\r\n"
        "\r\n"
        "%s",
        path,
        host,
        token,
        static_cast<unsigned int>(body_len),
        json_body
    );

    if (req_len <= 0 || static_cast<size_t>(req_len) >= sizeof(http_req)) {
        return Result::BUFFER_OVERFLOW;
    }

    // 4. Send AT+QHTTPPOST Command
    char post_cmd[64];
    snprintf(post_cmd, sizeof(post_cmd), "AT+QHTTPPOST=%d,20,60", req_len);
    if (m_uart.send_and_wait(post_cmd, "CONNECT", nullptr, 0, 5000) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    // 5. Transmit Request Stream
    if (!m_uart.send_bytes(reinterpret_cast<const uint8_t *>(http_req), req_len)) {
        return Result::HTTP_FAILED;
    }

    // 6. Await "OK" acknowledge
    if (m_uart.send_and_wait(nullptr, "OK", nullptr, 0, 5000) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    // 7. Await Asynchronous URC: +QHTTPPOST: <err>,<http_status>,<content_length>
    char urc_line[128];
    HttpResponse resp;
    bool urc_found = false;

    // Timeout: 60 seconds (accommodates free tier cold start)
    size_t n = 0;
    while ((n = m_uart.read_line(urc_line, sizeof(urc_line), TIMEOUT_HTTPS_POST_MS)) > 0) {
        if (strstr(urc_line, "+QHTTPPOST:") != nullptr) {
            if (parse_httppost_urc(urc_line, resp)) {
                urc_found = true;
                break;
            }
        }
    }

    if (!urc_found) {
        abort_session();
        return Result::TIMEOUT;
    }

    if (resp_out) {
        *resp_out = resp;
    }

    // 8. If content was returned, read response to clear buffer
    if (resp.content_length > 0) {
        m_uart.send_and_wait("AT+QHTTPREAD=30", "+QHTTPREAD: 0", nullptr, 0, 30000);
    }

    // 9. Classify Status Code
    if (resp.http_status == 200 || resp.http_status == 201) {
        return Result::SUCCESS;
    } else if (resp.http_status == 401 || resp.http_status == 403) {
        return Result::AUTH_REJECTED;
    } else if (resp.quectel_err == 714) {
        return Result::TLS_FAILED;
    }

    return Result::HTTP_FAILED;
}

bool HttpManager::parse_httppost_urc(const char *urc_line, HttpResponse &resp) {
    const char *p = strstr(urc_line, "+QHTTPPOST:");
    if (!p) return false;

    int err = 0, status_code = 0;
    unsigned int content_len = 0;

    if (sscanf(p, "+QHTTPPOST: %d,%d,%u", &err, &status_code, &content_len) >= 2) {
        resp.quectel_err = static_cast<int16_t>(err);
        resp.http_status = static_cast<uint16_t>(status_code);
        resp.content_length = content_len;
        resp.success = (err == 0 && (status_code == 200 || status_code == 201));
        return true;
    }
    return false;
}

Result HttpManager::check_service_health(
    const char *server_host,
    const char *health_path,
    HttpResponse *resp_out
) {
    const char *host = server_host ? server_host : HTTPS_SERVER_HOST;
    const char *path = health_path ? health_path : HTTPS_API_HEALTH_PATH;

    char full_url[256];
    snprintf(full_url, sizeof(full_url), "https://%s%s", host, path);
    if (set_url(full_url, 30) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    if (m_uart.send_and_wait("AT+QHTTPGET=60", "OK", nullptr, 0, 5000) != Result::SUCCESS) {
        return Result::HTTP_FAILED;
    }

    char urc_line[128];
    bool urc_found = false;
    HttpResponse resp;

    while (m_uart.read_line(urc_line, sizeof(urc_line), 60000) > 0) {
        if (strstr(urc_line, "+QHTTPGET:") != nullptr) {
            int err = 0, status_code = 0;
            unsigned int len = 0;
            if (sscanf(urc_line, "+QHTTPGET: %d,%d,%u", &err, &status_code, &len) >= 2) {
                resp.quectel_err = static_cast<int16_t>(err);
                resp.http_status = static_cast<uint16_t>(status_code);
                resp.content_length = len;
                resp.success = (err == 0 && status_code == 200);
                urc_found = true;
                break;
            }
        }
    }

    if (resp_out) {
        *resp_out = resp;
    }

    if (resp.content_length > 0) {
        m_uart.send_and_wait("AT+QHTTPREAD=30", "+QHTTPREAD: 0", nullptr, 0, 30000);
    }

    return (urc_found && resp.success) ? Result::SUCCESS : Result::HTTP_FAILED;
}

void HttpManager::abort_session() {
    m_uart.send_and_wait("AT+QHTTPSTOP", "OK", nullptr, 0, 3000);
}

} // namespace EC200U
} // namespace WLI
