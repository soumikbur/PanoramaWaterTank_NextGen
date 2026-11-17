#ifndef EC200U_UART_H
#define EC200U_UART_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include "ec200u_config.h"
#include "ec200u_types.h"

/**
 * @file ec200u_uart.h
 * @brief Thread-safe non-blocking circular ring buffer and UART driver for AT command communication.
 */

namespace WLI {
namespace EC200U {

/**
 * @brief Platform UART Hardware Abstraction Interface.
 * Allows easy binding to STM32 HAL (HAL_UART_Transmit/Receive_IT) or native testing mocks.
 */
class IUartHal {
public:
    virtual ~IUartHal() = default;
    virtual bool write_bytes(const uint8_t *data, size_t len) = 0;
    virtual uint32_t get_tick_ms() = 0;
    virtual void delay_ms(uint32_t ms) = 0;
};

class UartDriver {
public:
    explicit UartDriver(IUartHal &hal);

    /**
     * @brief Feed incoming raw UART byte (called from UART RX interrupt or DMA callback).
     */
    void rx_byte_isr(uint8_t byte);

    /**
     * @brief Transmit raw bytes over UART.
     */
    bool send_bytes(const uint8_t *data, size_t len);

    /**
     * @brief Transmit an AT command string with \r\n terminator.
     */
    bool send_command(const char *cmd);

    /**
     * @brief Read a single line from the RX ring buffer until \n or timeout.
     * @param buffer Target destination.
     * @param max_len Maximum bytes to store.
     * @param timeout_ms Maximum time to wait for a full line.
     * @return Number of bytes read (0 if timeout).
     */
    size_t read_line(char *buffer, size_t max_len, uint32_t timeout_ms);

    /**
     * @brief Send an AT command and wait for a specific terminating token (e.g. "OK", "ERROR", "CONNECT").
     * @param cmd AT command string to transmit.
     * @param expected_token Terminating token to match.
     * @param response_out Buffer to collect full response text (optional).
     * @param max_response_len Buffer size for response text.
     * @param timeout_ms Maximum time to wait.
     * @return Result::SUCCESS if expected token matched, Result::ERROR_GENERAL on ERROR, or Result::TIMEOUT.
     */
    Result send_and_wait(
        const char *cmd,
        const char *expected_token,
        char *response_out = nullptr,
        size_t max_response_len = 0,
        uint32_t timeout_ms = TIMEOUT_AT_DEFAULT_MS
    );

    /**
     * @brief Flush and clear the RX ring buffer.
     */
    void flush_rx();

    /**
     * @brief Check how many bytes are currently waiting in the RX ring buffer.
     */
    size_t bytes_available() const;

private:
    IUartHal &m_hal;

    uint8_t  m_rx_buffer[UART_RX_BUFFER_SIZE];
    volatile size_t m_rx_head = 0;
    volatile size_t m_rx_tail = 0;
};

} // namespace EC200U
} // namespace WLI

#endif // EC200U_UART_H
