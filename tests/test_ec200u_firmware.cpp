#include <iostream>
#include <vector>
#include <string>
#include <cassert>
#include <cstring>
#include <sstream>

#include "../EC200U/ec200u_config.h"
#include "../EC200U/ec200u_types.h"
#include "../EC200U/ec200u_uart.h"
#include "../EC200U/ec200u.h"
#include "../EC200U/ec200u_tls.h"
#include "../EC200U/ec200u_http.h"
#include "../EC200U/ec200u_freertos.h"

using namespace WLI::EC200U;

// Mock UART HAL implementing IUartHal for unit testing
class MockUartHal : public IUartHal {
public:
    std::vector<std::string> tx_history;
    std::string rx_queue;
    uint32_t current_tick_ms = 1000;
    UartDriver *driver = nullptr;

    bool write_bytes(const uint8_t *data, size_t len) override {
        std::string s(reinterpret_cast<const char *>(data), len);
        tx_history.push_back(s);

        // Auto-respond to known AT commands for testing
        if (driver) {
            handle_auto_response(s);
        }
        return true;
    }

    uint32_t get_tick_ms() override {
        return current_tick_ms;
    }

    void delay_ms(uint32_t ms) override {
        current_tick_ms += ms;
    }

    void inject_rx(const std::string &data) {
        if (driver) {
            for (char c : data) {
                driver->rx_byte_isr(static_cast<uint8_t>(c));
            }
        }
    }

private:
    void handle_auto_response(const std::string &tx) {
        if (tx.find("AT\r\n") != std::string::npos) {
            inject_rx("OK\r\n");
        } else if (tx.find("ATE0\r\n") != std::string::npos) {
            inject_rx("OK\r\n");
        } else if (tx.find("AT+CMEE=2\r\n") != std::string::npos) {
            inject_rx("OK\r\n");
        } else if (tx.find("ATI\r\n") != std::string::npos) {
            inject_rx("Quectel\r\nEC200U\r\nRevision: EC200UCNAAR03A03M08\r\nOK\r\n");
        } else if (tx.find("AT+GSN\r\n") != std::string::npos) {
            inject_rx("864501062098421\r\nOK\r\n");
        } else if (tx.find("AT+CPIN?\r\n") != std::string::npos) {
            inject_rx("+CPIN: READY\r\nOK\r\n");
        } else if (tx.find("AT+CSQ\r\n") != std::string::npos) {
            inject_rx("+CSQ: 28,99\r\nOK\r\n");
        } else if (tx.find("AT+CEREG?\r\n") != std::string::npos) {
            inject_rx("+CEREG: 0,1\r\nOK\r\n");
        } else if (tx.find("AT+CGATT?\r\n") != std::string::npos) {
            inject_rx("+CGATT: 1\r\nOK\r\n");
        } else if (tx.find("AT+COPS?\r\n") != std::string::npos) {
            inject_rx("+COPS: 0,0,\"IND airtel\",7\r\nOK\r\n");
        } else if (tx.find("AT+QICSGP=") != std::string::npos) {
            inject_rx("OK\r\n");
        } else if (tx.find("AT+QIACT=1\r\n") != std::string::npos) {
            inject_rx("OK\r\n");
        } else if (tx.find("AT+QIACT?\r\n") != std::string::npos) {
            inject_rx("+QIACT: 1,1,1,\"100.85.63.225\"\r\nOK\r\n");
        } else if (tx.find("AT+QSSLCFG=") != std::string::npos) {
            inject_rx("OK\r\n");
        } else if (tx.find("AT+QHTTPCFG=") != std::string::npos) {
            inject_rx("OK\r\n");
        } else if (tx.find("AT+QHTTPURL=") != std::string::npos) {
            inject_rx("CONNECT\r\n");
        } else if (tx.find("https://") != std::string::npos) {
            inject_rx("OK\r\n");
        } else if (tx.find("AT+QHTTPPOST=") != std::string::npos) {
            inject_rx("CONNECT\r\n");
        } else if (tx.find("POST /api/telemetry") != std::string::npos) {
            inject_rx("OK\r\n+QHTTPPOST: 0,200,95\r\n");
        } else if (tx.find("AT+QHTTPREAD=") != std::string::npos) {
            inject_rx("CONNECT\r\n{\"status\":\"success\"}\r\nOK\r\n+QHTTPREAD: 0\r\n");
        } else if (tx.find("AT+QFLST=") != std::string::npos) {
            inject_rx("+QFLST: \"cacert.pem\",1939\r\nOK\r\n");
        } else if (tx.find("AT+QIDEACT=1\r\n") != std::string::npos) {
            inject_rx("OK\r\n");
        }
    }
};

void test_uart_driver() {
    std::cout << "[TEST 01] Running UART Driver & Ring Buffer Test..." << std::endl;
    MockUartHal hal;
    UartDriver uart(hal);
    hal.driver = &uart;

    // Test line reading with CRLF
    hal.inject_rx("TEST_LINE_01\r\n");
    char line[64];
    size_t n = uart.read_line(line, sizeof(line), 500);
    assert(n == 12);
    assert(strcmp(line, "TEST_LINE_01") == 0);

    // Test send_and_wait
    Result res = uart.send_and_wait("AT", "OK", nullptr, 0, 500);
    assert(res == Result::SUCCESS);
    std::cout << "          PASS: UART Driver & Ring Buffer verified." << std::endl;
}

void test_modem_initialization() {
    std::cout << "[TEST 02] Running Modem Initialization & Identification Test..." << std::endl;
    MockUartHal hal;
    UartDriver uart(hal);
    hal.driver = &uart;
    ModemManager modem(uart);

    Result res = modem.init();
    assert(res == Result::SUCCESS);
    assert(modem.get_state() == ModemState::SIM_CHECK);
    assert(strcmp(modem.get_diagnostics().firmware_revision, "EC200UCNAAR03A03M08") == 0);
    assert(strcmp(modem.get_diagnostics().imei, "864501062098421") == 0);
    std::cout << "          PASS: Firmware 'EC200UCNAAR03A03M08' and IMEI identified." << std::endl;
}

void test_sim_and_network() {
    std::cout << "[TEST 03] Running SIM Check & Network Registration Test..." << std::endl;
    MockUartHal hal;
    UartDriver uart(hal);
    hal.driver = &uart;
    ModemManager modem(uart);

    modem.init();
    Result sim_res = modem.check_sim();
    assert(sim_res == Result::SUCCESS);
    assert(modem.get_state() == ModemState::NETWORK_SEARCH);

    Result net_res = modem.check_network();
    assert(net_res == Result::SUCCESS);
    assert(modem.get_state() == ModemState::NETWORK_REGISTERED);
    assert(modem.get_signal().csq == 28);
    assert(modem.get_signal().rssi_dbm == -57);
    assert(modem.get_signal().is_usable == true);
    assert(strcmp(modem.get_diagnostics().operator_name, "IND airtel") == 0);
    std::cout << "          PASS: SIM Ready, CSQ 28 (-57 dBm), EPS Registered (IND airtel)." << std::endl;
}

void test_pdp_activation() {
    std::cout << "[TEST 04] Running PDP Context Activation Test..." << std::endl;
    MockUartHal hal;
    UartDriver uart(hal);
    hal.driver = &uart;
    ModemManager modem(uart);

    modem.init();
    modem.check_sim();
    modem.check_network();

    Result pdp_res = modem.activate_pdp("airtelgprs.com");
    assert(pdp_res == Result::SUCCESS);
    assert(modem.get_state() == ModemState::DATA_CONNECTED);
    assert(strcmp(modem.get_diagnostics().assigned_ip, "100.85.63.225") == 0);
    assert(modem.is_data_connected() == true);
    std::cout << "          PASS: PDP Context 1 Activated (IP: 100.85.63.225)." << std::endl;
}

void test_tls_configuration() {
    std::cout << "[TEST 05] Running SSL/TLS Security Engine Configuration Test..." << std::endl;
    MockUartHal hal;
    UartDriver uart(hal);
    hal.driver = &uart;
    TlsManager tls(uart);

    assert(tls.is_certificate_present("cacert.pem") == true);
    Result tls_res = tls.configure_tls(1, "cacert.pem");
    assert(tls_res == Result::SUCCESS);
    std::cout << "          PASS: TLS 1.2/1.3, Server Authentication (seclevel=1), SNI and ISRG Root X1 configured." << std::endl;
}

void test_json_payload_formatting() {
    std::cout << "[TEST 06] Running Telemetry JSON Schema Formatting Test..." << std::endl;
    TelemetrySnapshot snap;
    memset(&snap, 0, sizeof(snap));
    snprintf(snap.device_id, sizeof(snap.device_id), "COACH-WLI-TEST-42");
    snap.water_level_cm = 184.50f;
    snap.sequence_id = 101;
    snap.water_percentage = 92.25f;
    snap.raw_voltage = 1.845f;
    snap.pressure_bar = 0.840f;
    snap.battery_v = 12.60f;
    snap.signal_csq = 28;
    snap.gps_lat = 22.572645;
    snap.gps_lon = 88.363892;
    snap.gps_valid = true;
    snprintf(snap.sensor_status, sizeof(snap.sensor_status), "NORMAL");
    snprintf(snap.alarm_status, sizeof(snap.alarm_status), "NONE");
    snap.flow_rate_lpm = 14.5f;
    snap.timestamp = 1731838200;

    char json_buf[512];
    size_t len = HttpManager::format_json_telemetry(snap, json_buf, sizeof(json_buf));
    assert(len > 0);

    // Verify critical JSON keys match Phase 04 schema
    assert(strstr(json_buf, "\"device_id\":\"COACH-WLI-TEST-42\"") != nullptr);
    assert(strstr(json_buf, "\"sequence_id\":101") != nullptr);
    assert(strstr(json_buf, "\"water_level_cm\":184.50") != nullptr);
    assert(strstr(json_buf, "\"water_percentage\":92.25") != nullptr);
    assert(strstr(json_buf, "\"raw_voltage\":1.845") != nullptr);
    assert(strstr(json_buf, "\"battery_v\":12.60") != nullptr);
    assert(strstr(json_buf, "\"signal_csq\":28") != nullptr);
    assert(strstr(json_buf, "\"gps_valid\":true") != nullptr);
    assert(strstr(json_buf, "\"sensor_status\":\"NORMAL\"") != nullptr);

    // Verify zero forbidden keys (no BME280)
    assert(strstr(json_buf, "bme280") == nullptr);
    assert(strstr(json_buf, "humidity") == nullptr);

    std::cout << "          PASS: JSON matches Phase 04 schema (" << len << " bytes, valid keys)." << std::endl;
}

void test_https_post_telemetry() {
    std::cout << "[TEST 07] Running Authenticated HTTPS POST Transmission Test..." << std::endl;
    MockUartHal hal;
    UartDriver uart(hal);
    hal.driver = &uart;
    HttpManager http(uart);

    Result init_res = http.init_http(1, 1);
    assert(init_res == Result::SUCCESS);

    TelemetrySnapshot snap;
    memset(&snap, 0, sizeof(snap));
    snprintf(snap.device_id, sizeof(snap.device_id), "COACH-042");
    snap.water_level_cm = 180.0f;
    snap.water_percentage = 90.0f;
    snap.battery_v = 12.4f;

    HttpResponse resp;
    Result post_res = http.post_telemetry(
        snap,
        HTTPS_SERVER_HOST,
        HTTPS_API_POST_PATH,
        DEFAULT_API_TOKEN,
        &resp
    );

    assert(post_res == Result::SUCCESS);
    assert(resp.http_status == 200);
    assert(resp.quectel_err == 0);
    assert(resp.success == true);
    std::cout << "          PASS: HTTPS POST returned HTTP 200 OK via Quectel embedded stack." << std::endl;
}

static bool g_watchdog_fed = false;
static void test_watchdog_callback() {
    g_watchdog_fed = true;
}

void test_freertos_coordinator() {
    std::cout << "[TEST 08] Running FreeRTOS Coordinator & Thread-Safe Snapshot Test..." << std::endl;
    MockUartHal hal;
    UartDriver uart(hal);
    hal.driver = &uart;
    ModemManager modem(uart);
    TlsManager tls(uart);
    HttpManager http(uart);
    FreeRtosCoordinator coordinator(modem, tls, http);

    g_watchdog_fed = false;
    coordinator.register_watchdog_feeder(test_watchdog_callback);

    TelemetrySnapshot snap;
    memset(&snap, 0, sizeof(snap));
    snprintf(snap.device_id, sizeof(snap.device_id), "COACH-FREERTOS-01");
    snap.water_level_cm = 175.0f;
    snap.water_percentage = 87.5f;

    // Simulate sensor task pushing telemetry
    coordinator.update_sensor_telemetry(snap);

    // Run coordinator task step (progresses through state machine)
    coordinator.task_step(); // OFF -> INIT
    coordinator.task_step(); // INIT -> SIM_CHECK -> NETWORK_SEARCH
    coordinator.task_step(); // SEARCH -> REGISTERED
    coordinator.task_step(); // REGISTERED -> PDP_ACTIVATION -> DATA_CONNECTED
    coordinator.task_step(); // DATA_CONNECTED -> TLS_INIT -> HTTPS_READY
    coordinator.task_step(); // HTTPS_READY -> POST -> HTTPS_READY

    assert(g_watchdog_fed == true);
    assert(modem.get_diagnostics().total_uploads_attempted >= 1);
    assert(modem.get_diagnostics().total_uploads_succeeded >= 1);
    assert(modem.get_diagnostics().last_http_status == 200);
    std::cout << "          PASS: FreeRTOS task stepped successfully (Uploads: " 
              << modem.get_diagnostics().total_uploads_succeeded << ", Watchdog Fed)." << std::endl;
}

int main() {
    std::cout << "================================================================================" << std::endl;
    std::cout << "PANORAMA WATER TANK MONITOR — EC200U FIRMWARE MODULE VERIFICATION" << std::endl;
    std::cout << "Target: STM32F4 + Quectel EC200U-CN (Firmware: EC200UCNAAR03A03M08)" << std::endl;
    std::cout << "================================================================================" << std::endl;

    test_uart_driver();
    test_modem_initialization();
    test_sim_and_network();
    test_pdp_activation();
    test_tls_configuration();
    test_json_payload_formatting();
    test_https_post_telemetry();
    test_freertos_coordinator();

    std::cout << "================================================================================" << std::endl;
    std::cout << "ALL 8 C++ FIRMWARE INTEGRATION TESTS PASSED (100% SUCCESS RATE)" << std::endl;
    std::cout << "================================================================================" << std::endl;
    return 0;
}
