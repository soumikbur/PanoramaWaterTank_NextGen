#ifndef EC200U_CONFIG_H
#define EC200U_CONFIG_H

#include <stdint.h>

/**
 * @file ec200u_config.h
 * @brief Hardware pinout, baud rates, network parameters, and endpoint configuration
 *        for the Quectel EC200U LTE Cat-1 modem subsystem.
 */

namespace WLI {
namespace EC200U {

// ============================================================================
// 1. Hardware Interface & UART Configuration
// ============================================================================
constexpr uint32_t UART_BAUD_RATE            = 115200;      // Standard AT port baud rate
constexpr uint32_t UART_RX_BUFFER_SIZE       = 2048;        // Bytes for UART RX ring buffer
constexpr uint32_t UART_TX_BUFFER_SIZE       = 1024;        // Bytes for outgoing AT transmit buffer
constexpr uint32_t AT_COMMAND_MAX_LEN        = 512;         // Maximum length of single AT command
constexpr uint32_t AT_RESPONSE_MAX_LEN       = 1024;        // Maximum buffer for response line
constexpr uint32_t HTTP_PAYLOAD_MAX_LEN      = 1024;        // Max JSON telemetry payload size

// GPIO Pin Definitions (STM32F4 Target)
constexpr uint16_t PIN_MODEM_PWRKEY          = 0x0001;      // Pin to toggle modem power (active-low pulse)
constexpr uint16_t PIN_MODEM_RESET           = 0x0002;      // Pin to force hardware reset (active-low pulse)
constexpr uint16_t PIN_MODEM_STATUS          = 0x0004;      // Modem status indicator input (high when active)

// Timing Constants (milliseconds)
constexpr uint32_t TIMEOUT_AT_DEFAULT_MS     = 1000;        // Standard AT command timeout
constexpr uint32_t TIMEOUT_SIM_CHECK_MS      = 5000;        // SIM ready check timeout
constexpr uint32_t TIMEOUT_NETWORK_REG_MS    = 60000;       // Cellular network search timeout
constexpr uint32_t TIMEOUT_PDP_ACTIVATE_MS   = 30000;       // PDP context activation timeout
constexpr uint32_t TIMEOUT_HTTPS_POST_MS     = 60000;       // Full HTTPS transaction timeout (accommodates cold start)
constexpr uint32_t TIMEOUT_UART_CHUNK_MS     = 50;          // Inter-character UART chunk silence timeout

// ============================================================================
// 2. Cellular Network & APN Configuration
// ============================================================================
constexpr uint8_t  PDP_CONTEXT_ID            = 1;           // Primary PDP Context Identifier
constexpr char     DEFAULT_APN[]             = "airtelgprs.com"; // Primary Carrier APN (Airtel India)
constexpr char     DEFAULT_APN_USER[]        = "";          // APN Username (empty for Airtel)
constexpr char     DEFAULT_APN_PASS[]        = "";          // APN Password (empty for Airtel)
constexpr uint8_t  APN_AUTH_TYPE             = 0;           // 0: None, 1: PAP, 2: CHAP

// ============================================================================
// 3. Remote Public HTTPS Backend Configuration
// ============================================================================
// Target service hostname deployed on Render
constexpr char     HTTPS_SERVER_HOST[]       = "panorama-wli-https-receiver.onrender.com";
constexpr uint16_t HTTPS_SERVER_PORT         = 443;
constexpr char     HTTPS_API_POST_PATH[]     = "/api/telemetry";
constexpr char     HTTPS_API_HEALTH_PATH[]   = "/api/health";

// Default Production Device Identifier & Authentication Token Placeholder
// Note: Production token should be configured via persistent EEPROM/Flash storage.
constexpr char     DEFAULT_DEVICE_ID[]       = "COACH-WLI-001";
constexpr char     DEFAULT_API_TOKEN[]       = "dev_secret_token_123";

// TLS Configuration
constexpr uint8_t  SSL_CONTEXT_ID            = 1;           // SSL Context ID on EC200U
constexpr char     TLS_CA_CERT_FILENAME[]    = "cacert.pem";// Provisioned ISRG Root X1 CA in UFS

// ============================================================================
// 4. FreeRTOS & Periodic Transmission Configuration
// ============================================================================
constexpr uint32_t TELEMETRY_UPLOAD_INTERVAL_S = 90;        // Reference telemetry upload interval (seconds)
constexpr uint8_t  MAX_RETRY_COUNT             = 3;         // Maximum consecutive retries before backoff
constexpr uint32_t RETRY_BACKOFF_BASE_MS       = 5000;      // Initial exponential backoff delay (5 seconds)
constexpr uint32_t RETRY_BACKOFF_MAX_MS        = 60000;     // Maximum exponential backoff cap (60 seconds)

constexpr uint32_t FREERTOS_TASK_STACK_WORDS   = 1024;      // 4096 bytes stack for FreeRTOS HTTPS task
constexpr uint8_t  FREERTOS_TASK_PRIORITY      = 2;         // Normal priority (above background, below sensor ADC)

} // namespace EC200U
} // namespace WLI

#endif // EC200U_CONFIG_H
