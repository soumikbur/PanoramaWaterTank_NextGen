#include "ec200u_uart.h"
#include <stdio.h>

namespace WLI {
namespace EC200U {

UartDriver::UartDriver(IUartHal &hal) : m_hal(hal) {
    flush_rx();
}

void UartDriver::rx_byte_isr(uint8_t byte) {
    size_t next_head = (m_rx_head + 1) % UART_RX_BUFFER_SIZE;
    if (next_head != m_rx_tail) {
        m_rx_buffer[m_rx_head] = byte;
        m_rx_head = next_head;
    }
    // If full, oldest byte is retained, newer byte dropped to avoid buffer corruption
}

bool UartDriver::send_bytes(const uint8_t *data, size_t len) {
    if (!data || len == 0) return false;
    return m_hal.write_bytes(data, len);
}

bool UartDriver::send_command(const char *cmd) {
    if (!cmd) return false;
    char buffer[AT_COMMAND_MAX_LEN + 4];
    int len = snprintf(buffer, sizeof(buffer), "%s\r\n", cmd);
    if (len <= 0 || static_cast<size_t>(len) >= sizeof(buffer)) return false;
    return send_bytes(reinterpret_cast<const uint8_t *>(buffer), static_cast<size_t>(len));
}

size_t UartDriver::bytes_available() const {
    if (m_rx_head >= m_rx_tail) {
        return m_rx_head - m_rx_tail;
    }
    return UART_RX_BUFFER_SIZE + m_rx_head - m_rx_tail;
}

void UartDriver::flush_rx() {
    m_rx_head = 0;
    m_rx_tail = 0;
}

size_t UartDriver::read_line(char *buffer, size_t max_len, uint32_t timeout_ms) {
    if (!buffer || max_len < 2) return 0;

    size_t count = 0;
    uint32_t start_time = m_hal.get_tick_ms();

    while ((m_hal.get_tick_ms() - start_time) < timeout_ms) {
        if (m_rx_head != m_rx_tail) {
            uint8_t b = m_rx_buffer[m_rx_tail];
            m_rx_tail = (m_rx_tail + 1) % UART_RX_BUFFER_SIZE;

            if (b == '\n') {
                // Terminating newline found
                buffer[count] = '\0';
                // Trim trailing \r if present
                if (count > 0 && buffer[count - 1] == '\r') {
                    buffer[count - 1] = '\0';
                    count--;
                }
                return count;
            } else if (b != '\r') {
                if (count < max_len - 1) {
                    buffer[count++] = static_cast<char>(b);
                }
            }
        } else {
            m_hal.delay_ms(1);
        }
    }

    // Timeout elapsed without newline
    buffer[count] = '\0';
    return count;
}

Result UartDriver::send_and_wait(
    const char *cmd,
    const char *expected_token,
    char *response_out,
    size_t max_response_len,
    uint32_t timeout_ms
) {
    if (cmd) {
        flush_rx();
        if (!send_command(cmd)) {
            return Result::ERROR_GENERAL;
        }
    }

    if (response_out && max_response_len > 0) {
        response_out[0] = '\0';
    }

    char line[256];
    uint32_t start_time = m_hal.get_tick_ms();
    size_t resp_len = 0;

    while ((m_hal.get_tick_ms() - start_time) < timeout_ms) {
        uint32_t elapsed = m_hal.get_tick_ms() - start_time;
        uint32_t remaining = (timeout_ms > elapsed) ? (timeout_ms - elapsed) : 0;
        if (remaining == 0) break;

        size_t n = read_line(line, sizeof(line), (remaining > 500) ? 500 : remaining);
        if (n == 0) continue;

        // Append line to response accumulator if requested
        if (response_out && max_response_len > 0 && resp_len + n + 2 < max_response_len) {
            if (resp_len > 0) {
                response_out[resp_len++] = '\n';
            }
            memcpy(response_out + resp_len, line, n);
            resp_len += n;
            response_out[resp_len] = '\0';
        }

        // Check for expected match
        if (expected_token && strstr(line, expected_token) != nullptr) {
            return Result::SUCCESS;
        }

        // Check for common error responses
        if (strcmp(line, "ERROR") == 0 || strstr(line, "+CME ERROR:") != nullptr || strstr(line, "+CMS ERROR:") != nullptr) {
            return Result::ERROR_GENERAL;
        }
    }

    return Result::TIMEOUT;
}

} // namespace EC200U
} // namespace WLI
