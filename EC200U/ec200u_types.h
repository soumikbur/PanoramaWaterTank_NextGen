#ifndef EC200U_TYPES_H
#define EC200U_TYPES_H

#include <stdint.h>
#include <stddef.h>

/**
 * @file ec200u_types.h
 * @brief Common enums, status structures, and telemetry models for EC200U communication.
 */

namespace WLI {
namespace EC200U {

/**
 * @brief High-level operational state machine of the cellular modem subsystem.
 */
enum class ModemState : uint8_t {
    MODEM_OFF = 0,          ///< Modem power is off or module is unpowered
    MODEM_INITIALIZING,     ///< Power-on sequence running, autobaud syncing (AT, ATE0, CMEE=2)
    SIM_CHECK,              ///< Checking SIM card presence and PIN readiness (AT+CPIN?)
    NETWORK_SEARCH,         ///< Searching for EPS cellular network (AT+CEREG?, AT+CSQ)
    NETWORK_REGISTERED,     ///< Attached to home/roaming 4G LTE network
    PDP_ACTIVATION,         ///< Establishing packet data session with carrier APN (AT+QIACT)
    DATA_CONNECTED,         ///< Cellular IP address assigned and IP stack operational
    TLS_INITIALIZATION,     ///< Configuring TLS context, CA cert validation, SNI (AT+QSSLCFG)
    HTTPS_READY,            ///< SSL and HTTP client configured, ready for payload transmission
    UPLOADING,              ///< Constructing JSON and streaming request over UART (AT+QHTTPPOST)
    WAITING_RESPONSE,       ///< Awaiting remote server HTTP status line (+QHTTPPOST URC)
    RECOVERY,               ///< Controlled recovery after recoverable failure with backoff
    ERROR_STATE             ///< Unrecoverable error state requiring hardware reset
};

/**
 * @brief General result code returned by AT transaction functions.
 */
enum class Result : int8_t {
    SUCCESS = 0,
    ERROR_GENERAL = -1,
    TIMEOUT = -2,
    BUSY = -3,
    BUFFER_OVERFLOW = -4,
    INVALID_PARAM = -5,
    NO_SIM = -6,
    NO_NETWORK = -7,
    PDP_FAILED = -8,
    TLS_FAILED = -9,
    HTTP_FAILED = -10,
    AUTH_REJECTED = -11
};

/**
 * @brief Cellular network registration status (AT+CEREG / AT+CREG).
 */
enum class NetworkStatus : uint8_t {
    NOT_REGISTERED = 0,
    REGISTERED_HOME = 1,
    SEARCHING = 2,
    REGISTRATION_DENIED = 3,
    UNKNOWN = 4,
    REGISTERED_ROAMING = 5
};

/**
 * @brief RF signal metrics from AT+CSQ.
 */
struct SignalQuality {
    int8_t  csq = 99;           ///< CSQ raw index: 0-31, 99 = unknown
    int16_t rssi_dbm = -113;    ///< Calculated RSSI in dBm (-113 to -51)
    uint8_t ber = 99;           ///< Bit error rate: 0-7, 99 = unknown
    bool    is_usable = false;  ///< True if CSQ >= 10
};

/**
 * @brief HTTP transaction response metadata.
 */
struct HttpResponse {
    uint16_t http_status = 0;   ///< HTTP status code (200, 401, 413, 500, etc.)
    int16_t  quectel_err = 0;   ///< Quectel internal error code (0 = success)
    uint32_t content_length = 0;///< Byte count of response body
    bool     success = false;   ///< True if HTTP 200 or 201 received
};

/**
 * @brief Telemetry snapshot structure produced by STM32 sensor acquisition tasks.
 */
struct TelemetrySnapshot {
    char     device_id[32];     ///< Unique coach device identifier (e.g. "COACH-042")
    uint32_t sequence_id;       ///< Monotonically increasing sequence number
    float    water_level_cm;    ///< Calculated water level in centimeters
    float    water_percentage;  ///< Tank fill percentage (0.0 to 100.0%)
    float    raw_voltage;       ///< Analog transducer voltage reading (0.5 to 4.5V)
    float    pressure_bar;      ///< Calculated hydrostatic pressure (0.0 to 0.5 bar)
    float    battery_v;         ///< 12V/24V coach battery voltage
    int8_t   signal_csq;        ///< Current LTE signal strength CSQ (0-31)
    double   gps_lat;           ///< GNSS latitude (WGS84 degrees)
    double   gps_lon;           ///< GNSS longitude (WGS84 degrees)
    bool     gps_valid;         ///< True if satellite lock acquired
    char     sensor_status[16]; ///< "NORMAL", "FAULT", "DISCONNECTED"
    char     alarm_status[16];  ///< "NONE", "LOW_WARNING", "CRITICAL_LOW", "OVERFLOW"
    float    flow_rate_lpm;     ///< Optional pipe flow rate (liters/min)
    uint32_t timestamp;         ///< POSIX epoch timestamp (seconds)
};

/**
 * @brief Diagnostic statistics tracked by the modem manager.
 */
struct ModemDiagnostics {
    uint32_t total_uploads_attempted = 0;
    uint32_t total_uploads_succeeded = 0;
    uint32_t total_uploads_failed = 0;
    uint32_t total_pdp_reconnections = 0;
    uint32_t total_modem_resets = 0;
    uint16_t last_http_status = 0;
    uint32_t last_upload_latency_ms = 0;
    int16_t  last_quectel_err = 0;
    char     assigned_ip[32] = {0};
    char     operator_name[32] = {0};
    char     firmware_revision[32] = {0};
    char     imei[20] = {0};
};

} // namespace EC200U
} // namespace WLI

#endif // EC200U_TYPES_H
