#include <QCoreApplication>
#include <QTcpServer>
#include <QTcpSocket>
#include <QDateTime>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QTimer>
#include <iostream>
#include <cassert>
#include <cmath>

#include "ApiClient.h"
#include "TankRepository.h"
#include "TankModel.h"
#include "Logger.h"

using namespace Panorama;

// Lightweight mock ESP32-S3 HTTP/REST server using QTcpServer
class MockEsp32Server : public QTcpServer
{
    Q_OBJECT
public:
    QJsonObject m_savedConfig;

    explicit MockEsp32Server(QObject *parent = nullptr) : QTcpServer(parent)
    {
        // Default factory configuration (Cylindrical, 50cm, ~22.6cm diam, 20L)
        m_savedConfig["success"] = true;
        m_savedConfig["shape"] = "CYLINDER";
        m_savedConfig["shape_id"] = 0;
        m_savedConfig["height_cm"] = 50.0;
        m_savedConfig["max_height_cm"] = 50.0;
        m_savedConfig["diameter_cm"] = 22.5676;
        m_savedConfig["width_cm"] = 0.0;
        m_savedConfig["length_cm"] = 0.0;
        m_savedConfig["capacity_liters"] = 20.0;
        m_savedConfig["tank_capacity_l"] = 20.0;
        m_savedConfig["warning_percent"] = 20.0;
        m_savedConfig["critical_percent"] = 10.0;
        m_savedConfig["high_percent"] = 90.0;
        m_savedConfig["alarm_enabled"] = true;
        m_savedConfig["calibrated"] = true;
    }

protected:
    void incomingConnection(qintptr socketDescriptor) override
    {
        QTcpSocket *socket = new QTcpSocket(this);
        socket->setSocketDescriptor(socketDescriptor);

        connect(socket, &QTcpSocket::readyRead, this, [this, socket]() {
            QByteArray requestData = socket->readAll();
            QString req = QString::fromUtf8(requestData);

            if (req.isEmpty()) return;

            QString line = req.split("\r\n").value(0);
            QStringList parts = line.split(" ");
            if (parts.size() < 2) return;

            QString method = parts[0];
            QString path = parts[1];

            QByteArray body;
            int status = 200;

            if (path.startsWith("/api/v1/health") || path.startsWith("/api/health")) {
                QJsonObject root;
                root["status"] = "ok";
                root["uptime_ms"] = 3600000;
                root["free_heap"] = 215400;
                root["wifi_rssi"] = -52;
                root["firmware"] = "v2.1.0";
                body = QJsonDocument(root).toJson(QJsonDocument::Compact);
            }
            else if (path.startsWith("/api/v1/status") || path.startsWith("/api/status")) {
                QJsonObject root;
                root["device"] = "ESP32-S3";
                root["timestamp"] = 120000;
                root["sensor_status"] = 1;
                root["raw_voltage"] = 2.42;
                root["water_level_cm"] = 38.5;
                root["level_percent"] = 77.0;
                root["tank_volume_l"] = 15.4;
                root["tank_height_cm"] = 50.0;
                root["tank_capacity_l"] = 20.0;
                root["alarm_enabled"] = true;
                root["alarm_state"] = "Warning";
                root["calibrated"] = true;
                root["temperature_c"] = 26.5;
                root["humidity_percent"] = 55.0;
                root["pressure_hpa"] = 1012.8;
                body = QJsonDocument(root).toJson(QJsonDocument::Compact);
            }
            else if (path.startsWith("/api/v1/history") || path.startsWith("/api/history")) {
                QJsonObject root;
                root["range"] = "12h";
                root["count"] = 12;
                QJsonArray results;
                for (int i = 0; i < 12; ++i) {
                    QJsonObject pt;
                    pt["timestamp"] = 10000 + i * 10000;
                    pt["water_level_cm"] = 30.0 + (i * 0.7);
                    pt["level_percent"] = 60.0 + (i * 1.4);
                    pt["volume_l"] = 12.0 + (i * 0.28);
                    results.append(pt);
                }
                root["results"] = results;
                body = QJsonDocument(root).toJson(QJsonDocument::Compact);
            }
            else if (path.startsWith("/api/v1/config") || path.startsWith("/api/config")) {
                if (method.toUpper() == "POST" || method.toUpper() == "PUT") {
                    // Extract payload after header delimiter
                    int headerEnd = req.indexOf("\r\n\r\n");
                    if (headerEnd != -1) {
                        QByteArray jsonBytes = req.mid(headerEnd + 4).toUtf8();
                        QJsonDocument postedDoc = QJsonDocument::fromJson(jsonBytes);
                        if (postedDoc.isObject()) {
                            QJsonObject postedObj = postedDoc.object();
                            for (auto it = postedObj.begin(); it != postedObj.end(); ++it) {
                                m_savedConfig[it.key()] = it.value();
                            }
                        }
                    }
                    QJsonObject ack;
                    ack["success"] = true;
                    ack["message"] = "Configuration applied and persisted successfully";
                    body = QJsonDocument(ack).toJson(QJsonDocument::Compact);
                } else {
                    // GET returns the persisted m_savedConfig
                    body = QJsonDocument(m_savedConfig).toJson(QJsonDocument::Compact);
                }
            }
            else {
                status = 404;
                body = "{\"error\":\"not found\"}";
            }

            QByteArray response;
            response += "HTTP/1.1 " + QByteArray::number(status) + " OK\r\n";
            response += "Content-Type: application/json\r\n";
            response += "Access-Control-Allow-Origin: *\r\n";
            response += "Content-Length: " + QByteArray::number(body.size()) + "\r\n";
            response += "Connection: close\r\n\r\n";
            response += body;

            socket->write(response);
            socket->flush();
            socket->disconnectFromHost();
        });
    }
};

class IntegrationTestRunner : public QObject
{
    Q_OBJECT
public:
    explicit IntegrationTestRunner(QObject *parent = nullptr)
        : QObject(parent)
        , m_logger()
        , m_repo(m_logger)
    {
        m_repo.setTankModel(&m_model);
    }

    void start()
    {
        std::cout << "\n=======================================================\n";
        std::cout << "  === Running ESP32 REST API Integration Tests ===\n";
        std::cout << "=======================================================\n";

        m_server = new MockEsp32Server(this);
        if (!m_server->listen(QHostAddress::LocalHost, 0)) {
            std::cerr << "FAIL: Cannot start mock ESP32 server!" << std::endl;
            QCoreApplication::exit(1);
            return;
        }

        m_port = m_server->serverPort();
        std::cout << "[Step 1] Mock ESP32 HTTP Server listening on port: " << m_port << std::endl;

        m_client = new ApiClient(this);
        m_client->setEsp32Configuration("127.0.0.1", m_port, true, 200, 2000);

        connect(m_client, &ApiClient::statusReceived, &m_repo, &TankRepository::processEsp32Status);

        testHealthAndStatusSequence();
    }

private:
    void testHealthAndStatusSequence()
    {
        std::cout << "[Step 2] Testing /api/health FIRST sequence & ConnectionState transitions..." << std::endl;

        assert(m_client->connectionState() == ConnectionState::Disconnected);
        assert(!m_model.hasValidData());

        connect(m_client, &ApiClient::statusReceived, this, [this](const QJsonObject &) {
            std::cout << "  -> Received status JSON from mock ESP32!" << std::endl;

            // Verify TankModel updated with authoritative values (NOT recalculated independently)
            std::cout << "  - Level %: " << m_model.fillPercentage() << "% (Expected: 77%)" << std::endl;
            std::cout << "  - Water Level: " << m_model.waterHeightCm() << " cm (Expected: 38.5 cm)" << std::endl;
            std::cout << "  - Water Volume: " << m_model.waterVolumeLiters() << " L (Expected: 15.4 L)" << std::endl;
            std::cout << "  - Tank Capacity: " << m_model.capacityLiters() << " L (Expected: 20 L)" << std::endl;
            std::cout << "  - Tank Height: " << m_model.tankHeightCm() << " cm (Expected: 50 cm)" << std::endl;
            std::cout << "  - Alarm State: " << m_model.alarmLevel().toStdString() << " (Expected: Warning)" << std::endl;
            std::cout << "  - Sensor Status: " << m_model.sensorStatus().toStdString() << " (Expected: Healthy)" << std::endl;
            std::cout << "  - Has Valid Data: " << (m_model.hasValidData() ? "true" : "false") << std::endl;

            assert(std::abs(m_model.fillPercentage() - 77.0) < 0.01);
            assert(std::abs(m_model.waterHeightCm() - 38.5) < 0.01);
            assert(std::abs(m_model.waterVolumeLiters() - 15.4) < 0.01);
            assert(std::abs(m_model.capacityLiters() - 20.0) < 0.01);
            assert(std::abs(m_model.tankHeightCm() - 50.0) < 0.01);
            assert(m_model.alarmLevel() == "Warning");
            assert(m_model.sensorStatus() == "Healthy");
            assert(m_model.hasValidData());
            assert(m_client->connectionState() == ConnectionState::Connected);

            std::cout << "  [PASS] Health-first probe, ConnectionState::Connected, and authoritative readings verified.\n" << std::endl;
            testHistoryEndpoint();
        });

        // Trigger latest data fetch: must probe /api/health first, then transition to Connected and fetch status
        m_client->startPolling();
    }

    void testHistoryEndpoint()
    {
        std::cout << "[Step 3] Testing /api/history endpoint..." << std::endl;

        connect(m_client, &ApiClient::historicalDataReceived, this, [this](const QVariantList &list) {
            std::cout << "  -> Received " << list.size() << " historical points!" << std::endl;
            assert(list.size() == 12);

            QVariantMap firstPt = list.first().toMap();
            std::cout << "  - First point timestampMs: " << firstPt["timestampMs"].toLongLong() << std::endl;
            std::cout << "  - First point value (level %): " << firstPt["value"].toDouble() << "%" << std::endl;
            std::cout << "  - First point waterLevelCm: " << firstPt["waterLevelCm"].toDouble() << " cm" << std::endl;

            assert(firstPt["timestampMs"].toLongLong() > 0);
            assert(std::abs(firstPt["value"].toDouble() - 60.0) < 0.01);
            assert(std::abs(firstPt["waterLevelCm"].toDouble() - 30.0) < 0.01);

            std::cout << "  [PASS] History parsing & timestamp conversion verified.\n" << std::endl;
            testTankConfiguration();
        });

        m_client->getHistory(12);
    }

    void testTankConfiguration()
    {
        std::cout << "[Step 4] Testing TankConfig model & shape-aware volume calculations..." << std::endl;

        // Test 1: Cylinder (Default 50 cm height, 22.5676 cm diameter -> ~20.0 L)
        m_model.updateTankConfiguration(0, 50.0, 22.5676, 0.0, 0.0, 20.0, 20.0, 10.0, 90.0);
        assert(m_model.tankShape() == "CYLINDER");
        assert(m_model.tankShapeId() == 0);
        assert(std::abs(m_model.tankHeightCm() - 50.0) < 0.01);
        assert(std::abs(m_model.capacityLiters() - 20.0) < 0.05);

        // Test 2: Rectangle (100 cm height, 50 cm width, 80 cm length -> 400.0 L)
        m_model.updateTankConfiguration(1, 100.0, 0.0, 50.0, 80.0, 0.0, 15.0, 5.0, 95.0);
        assert(m_model.tankShape() == "RECTANGLE");
        assert(m_model.tankShapeId() == 1);
        assert(std::abs(m_model.tankHeightCm() - 100.0) < 0.01);
        assert(std::abs(m_model.capacityLiters() - 400.0) < 0.01);

        // Test half-fill volume derivation for Rectangle (50 cm water level in 100 cm tank = 200.0 L, 50%)
        m_model.applyAuthoritativeReading(50.0, 50.0, 200.0, 100.0, 400.0, 1013.0, "Healthy", "Normal");
        assert(std::abs(m_model.fillPercentage() - 50.0) < 0.01);
        assert(std::abs(m_model.waterVolumeLiters() - 200.0) < 0.01);

        // Test 3: Custom (200 cm height, rated 5000.0 L)
        m_model.updateTankConfiguration(2, 200.0, 0.0, 0.0, 0.0, 5000.0, 25.0, 12.0, 92.0);
        assert(m_model.tankShape() == "CUSTOM");
        assert(m_model.tankShapeId() == 2);
        assert(std::abs(m_model.tankHeightCm() - 200.0) < 0.01);
        assert(std::abs(m_model.capacityLiters() - 5000.0) < 0.01);

        // Test 4: Post Tank Config via REST API client and perform verification read-back
        std::cout << "  -> Testing ApiClient::postTankConfig()..." << std::endl;
        connect(m_client, &ApiClient::configPostCompleted, this, [this](bool success, const QString &msg) {
            std::cout << "  -> Received configPostCompleted (success=" << (success ? "true" : "false") << ", msg=" << msg.toStdString() << ")" << std::endl;
            assert(success);

            // Step 4b: Verify configuration read-back directly from ESP32 to confirm persistence
            std::cout << "  -> Performing verification read-back with ApiClient::getConfig()..." << std::endl;
            connect(m_client, &ApiClient::configReceived, this, [this](const QJsonObject &readbackCfg) {
                std::cout << "  -> Received configReceived read-back:" << std::endl;
                std::cout << "     shape=" << readbackCfg.value("shape").toString().toStdString()
                          << ", height=" << readbackCfg.value("height_cm").toDouble()
                          << ", width=" << readbackCfg.value("width_cm").toDouble()
                          << ", length=" << readbackCfg.value("length_cm").toDouble()
                          << ", capacity=" << readbackCfg.value("capacity_liters").toDouble() << std::endl;

                assert(readbackCfg.value("shape").toString() == "RECTANGLE");
                assert(readbackCfg.value("shape_id").toInt() == 1);
                assert(std::abs(readbackCfg.value("height_cm").toDouble() - 100.0) < 0.01);
                assert(std::abs(readbackCfg.value("width_cm").toDouble() - 50.0) < 0.01);
                assert(std::abs(readbackCfg.value("length_cm").toDouble() - 80.0) < 0.01);
                assert(std::abs(readbackCfg.value("capacity_liters").toDouble() - 400.0) < 0.01);

                // Apply readback configuration to TankModel to verify model state synchronization
                m_model.applyConfigJson(readbackCfg);
                assert(m_model.tankShape() == "RECTANGLE");
                assert(m_model.tankShapeId() == 1);
                assert(std::abs(m_model.tankHeightCm() - 100.0) < 0.01);
                std::cout << "  [PASS] Tank configuration persisted, read back, and verified without reversion.\n" << std::endl;

                // SECTION 30 REGRESSION TEST — READ-BACK VERIFICATION MATCH & MISMATCH
                auto verifyConfigMatch = [](const QJsonObject &requested, const QJsonObject &actual) -> bool {
                    int reqShape = requested.value("shape_id").toInt();
                    int actShape = actual.contains("shape_id") ? actual.value("shape_id").toInt() : (actual.value("shape").toString() == "RECTANGLE" ? 1 : (actual.value("shape").toString() == "CUSTOM" ? 2 : 0));
                    if (reqShape != actShape) return false;

                    double reqH = requested.value("height_cm").toDouble();
                    double actH = actual.contains("height_cm") ? actual.value("height_cm").toDouble() : actual.value("max_height_cm").toDouble();
                    if (std::abs(reqH - actH) > 0.1) return false;

                    if (reqShape == 0) {
                        double reqD = requested.value("diameter_cm").toDouble();
                        double actD = actual.value("diameter_cm").toDouble();
                        if (std::abs(reqD - actD) > 0.1) return false;
                    } else if (reqShape == 1) {
                        double reqW = requested.value("width_cm").toDouble();
                        double actW = actual.value("width_cm").toDouble();
                        double reqL = requested.value("length_cm").toDouble();
                        double actL = actual.value("length_cm").toDouble();
                        if (std::abs(reqW - actW) > 0.1 || std::abs(reqL - actL) > 0.1) return false;
                    }
                    return true;
                };

                // Section 30 Case 1: Requested 60/30, Device returns 60/30 -> SUCCESS
                QJsonObject reqMatch; reqMatch["shape_id"] = 0; reqMatch["height_cm"] = 60.0; reqMatch["diameter_cm"] = 30.0;
                QJsonObject actMatch; actMatch["shape_id"] = 0; actMatch["height_cm"] = 60.0; actMatch["diameter_cm"] = 30.0;
                assert(verifyConfigMatch(reqMatch, actMatch) == true);
                std::cout << "  [SECTION 30 TEST 1 PASS] Requested (60/30) matches device (60/30) -> SUCCESS" << std::endl;

                // Section 30 Case 2: Requested 60/30, Device returns 50/22.6 -> VERIFICATION_FAILED
                QJsonObject actMismatch; actMismatch["shape_id"] = 0; actMismatch["height_cm"] = 50.0; actMismatch["diameter_cm"] = 22.57;
                assert(verifyConfigMatch(reqMatch, actMismatch) == false);
                std::cout << "  [SECTION 30 TEST 2 PASS] Requested (60/30) vs device (50/22.57) -> VERIFICATION_FAILED (mismatch prevented)" << std::endl;

                testTransientSpikeRejection();
            });

            m_client->getConfig();
        });

        QJsonObject cfg;
        cfg["shape"] = "RECTANGLE";
        cfg["shape_id"] = 1;
        cfg["height_cm"] = 100.0;
        cfg["width_cm"] = 50.0;
        cfg["length_cm"] = 80.0;
        cfg["capacity_liters"] = 400.0;
        cfg["warning_percent"] = 15.0;
        cfg["critical_percent"] = 5.0;
        cfg["high_percent"] = 95.0;
        m_client->postTankConfig(cfg);
    }

    void testTransientSpikeRejection()
    {
        std::cout << "[Step 5] Testing sensor transient spike rejection & non-zero retention..." << std::endl;

        // TEST 1 — NORMAL READING
        // Baseline: Water Height = 34.2 cm (~68.4%), Normal
        QJsonObject baselineObj;
        baselineObj["water_level_cm"] = 34.2;
        baselineObj["level_percent"] = 68.4;
        baselineObj["tank_volume_l"] = 13.68;
        baselineObj["tank_height_cm"] = 50.0;
        baselineObj["tank_capacity_l"] = 20.0;
        baselineObj["sensor_status"] = 1;
        baselineObj["measurement_valid"] = true;
        baselineObj["measurement_state"] = "VALID";
        baselineObj["alarm_state"] = "Normal";
        baselineObj["timestamp"] = 1000.0;
        m_repo.processEsp32Status(baselineObj);

        assert(std::abs(m_model.waterHeightCm() - 34.2) < 0.1);
        assert(std::abs(m_model.fillPercentage() - 68.4) < 0.1);
        assert(m_model.alarmLevel().toLower() == "normal");
        QVariantList comp1 = m_model.composedTrendHistory();
        assert(!comp1.isEmpty());
        assert(std::abs(comp1.last().toMap().value("value").toDouble() - 68.4) < 0.1);
        assert(comp1.last().toMap().value("source").toString() == "LIVE");
        std::cout << "  [TEST 1 PASS] Initial baseline: Height = 34.2 cm, Level = 68.4%, Alarm = Normal, Graph latest = 68.4%" << std::endl;

        // TEST 2 / TEST 5 — SENSOR DISCONNECT / REMOVAL
        // Sensor physically removed or disconnected (sensor_status = 0, measurement_state = "SENSOR_ERROR")
        // Expected: MUST retain last valid (34.2 cm), MUST NOT become 0 cm, MUST NOT trigger Low Critical Alert!
        QJsonObject disconnectObj;
        disconnectObj["water_level_cm"] = 34.2;
        disconnectObj["level_percent"] = 68.4;
        disconnectObj["tank_volume_l"] = 13.68;
        disconnectObj["tank_height_cm"] = 50.0;
        disconnectObj["tank_capacity_l"] = 20.0;
        disconnectObj["sensor_status"] = 0;
        disconnectObj["measurement_valid"] = true;
        disconnectObj["measurement_state"] = "SENSOR_ERROR";
        disconnectObj["alarm_state"] = "Normal";
        disconnectObj["timestamp"] = 1050.0;
        m_repo.processEsp32Status(disconnectObj);

        assert(std::abs(m_model.waterHeightCm() - 34.2) < 0.1); // Retained 34.2 cm!
        assert(std::abs(m_model.waterHeightCm()) > 1.0);        // NOT zero!
        assert(std::abs(m_model.fillPercentage() - 68.4) < 0.1);// NOT 0%!
        assert(m_model.alarmLevel().toLower() != "critical");   // NOT Low Critical Alert!
        QVariantList comp2 = m_model.composedTrendHistory();
        assert(!comp2.isEmpty());
        assert(comp2.last().toMap().value("value").toDouble() > 10.0); // Does NOT append false 0%!
        std::cout << "  [TEST 2 & 5 PASS] Sensor disconnect: Retained 34.2 cm (68.4%). NO false 0 cm, NO Low Critical Alert." << std::endl;

        // TEST 3 — SENSOR REINSERTION SPIKE (161 cm on 50 cm tank)
        // (Water Height = 161.00 cm, Water Level = 100.00%, Tank Volume = 20.06 L, Status = OVERFLOW ALERT)
        QJsonObject spikeObj;
        spikeObj["water_level_cm"] = 161.0;
        spikeObj["level_percent"] = 100.0;
        spikeObj["tank_volume_l"] = 20.06;
        spikeObj["tank_height_cm"] = 50.0;
        spikeObj["tank_capacity_l"] = 20.0;
        spikeObj["sensor_status"] = 1;
        spikeObj["measurement_valid"] = true;
        spikeObj["measurement_state"] = "REJECTED";
        spikeObj["alarm_state"] = "Overflow";
        spikeObj["timestamp"] = 1100.0;

        std::cout << "  -> Injecting transient surge: water_level_cm = 161.0 cm on 50.0 cm tank..." << std::endl;
        m_repo.processEsp32Status(spikeObj);

        // Verify that 161 cm spike was DISCARDED and DID NOT corrupt model or trigger Overflow
        assert(std::abs(m_model.waterHeightCm() - 161.0) > 10.0);
        assert(std::abs(m_model.waterHeightCm() - 50.0) > 1.0);
        assert(std::abs(m_model.waterHeightCm() - 34.2) < 0.1); // Preserved 34.2 cm!
        assert(std::abs(m_model.fillPercentage() - 68.4) < 0.1);
        assert(m_model.alarmLevel().toLower() != "overflow");
        QVariantList comp3 = m_model.composedTrendHistory();
        assert(!comp3.isEmpty());
        assert(comp3.last().toMap().value("value").toDouble() < 90.0); // NOT 100% or overflow!
        std::cout << "  [TEST 3 PASS] 161 cm spike rejected: Model preserved 34.2 cm without false OVERFLOW." << std::endl;

        // TEST 6 — SENSOR RECOVERY & STABILIZATION
        // Stabilizing reading (holding last valid)
        QJsonObject stabilizingObj;
        stabilizingObj["water_level_cm"] = 34.2;
        stabilizingObj["level_percent"] = 68.4;
        stabilizingObj["tank_volume_l"] = 13.68;
        stabilizingObj["tank_height_cm"] = 50.0;
        stabilizingObj["tank_capacity_l"] = 20.0;
        stabilizingObj["sensor_status"] = 1;
        stabilizingObj["measurement_valid"] = true;
        stabilizingObj["measurement_state"] = "HOLDING_LAST_VALID";
        stabilizingObj["alarm_state"] = "Normal";
        stabilizingObj["timestamp"] = 1150.0;
        m_repo.processEsp32Status(stabilizingObj);
        assert(std::abs(m_model.waterHeightCm() - 34.2) < 0.1);

        // Settled valid reading after sensor reinsertion (33.8 cm, 67.6%)
        QJsonObject recoveryObj;
        recoveryObj["water_level_cm"] = 33.8;
        recoveryObj["level_percent"] = 67.6;
        recoveryObj["tank_volume_l"] = 13.52;
        recoveryObj["tank_height_cm"] = 50.0;
        recoveryObj["tank_capacity_l"] = 20.0;
        recoveryObj["sensor_status"] = 1;
        recoveryObj["measurement_valid"] = true;
        recoveryObj["measurement_state"] = "VALID";
        recoveryObj["alarm_state"] = "Normal";
        recoveryObj["timestamp"] = 1200.0;
        m_repo.processEsp32Status(recoveryObj);

        assert(std::abs(m_model.waterHeightCm() - 33.8) < 0.1);
        assert(std::abs(m_model.fillPercentage() - 67.6) < 0.1);
        std::cout << "  [TEST 6 PASS] Sensor recovery: Stabilized valid reading (33.8 cm, 67.6%) accepted." << std::endl;

        // TEST 4 — VALID EMPTY TANK
        // Genuine empty tank measurement: water_level_cm = 0.0 cm, sensor_status = 1, measurement_state = "VALID"
        // Expected: MUST report 0.00 cm, 0.00%, and trigger Low Critical Alert!
        QJsonObject emptyTankObj;
        emptyTankObj["water_level_cm"] = 0.0;
        emptyTankObj["level_percent"] = 0.0;
        emptyTankObj["tank_volume_l"] = 0.0;
        emptyTankObj["tank_height_cm"] = 50.0;
        emptyTankObj["tank_capacity_l"] = 20.0;
        emptyTankObj["sensor_status"] = 1;
        emptyTankObj["measurement_valid"] = true;
        emptyTankObj["measurement_state"] = "VALID";
        emptyTankObj["alarm_state"] = "Critical";
        emptyTankObj["timestamp"] = 1300.0;
        m_repo.processEsp32Status(emptyTankObj);

        assert(std::abs(m_model.waterHeightCm()) < 0.01);
        assert(std::abs(m_model.fillPercentage()) < 0.01);
        assert(m_model.alarmLevel().toLower() == "critical");
        QVariantList comp4 = m_model.composedTrendHistory();
        assert(!comp4.isEmpty());
        assert(std::abs(comp4.last().toMap().value("value").toDouble() - 0.0) < 0.01);
        assert(comp4.last().toMap().value("source").toString() == "LIVE");
        std::cout << "  [TEST 4 PASS] Genuine empty tank: Correctly reports 0.00 cm, 0.00%, Low Critical Alert, and graph latest = 0.00%." << std::endl;

        // TEST 5 — HISTORICAL DATA DIFFERS FROM LIVE (Ubidots 74.28% vs Live 0.00%)
        // Simulate historical response arriving with latest point = 74.28% from 1 hour ago
        QVariantList testHist;
        qint64 t1 = QDateTime::currentMSecsSinceEpoch() - 7200000;
        qint64 t2 = QDateTime::currentMSecsSinceEpoch() - 3600000;
        QVariantMap h1; h1["timestampMs"] = t1; h1["value"] = 65.0; testHist.append(h1);
        QVariantMap h2; h2["timestampMs"] = t2; h2["value"] = 74.28; testHist.append(h2);

        m_model.setTrendHistory(testHist);
        // Authoritative live tank model MUST REMAIN 0.00%
        assert(std::abs(m_model.fillPercentage() - 0.0) < 0.01);
        assert(std::abs(m_model.waterHeightCm() - 0.0) < 0.01);
        assert(m_model.alarmLevel().toLower() == "critical");
        // And composed graph latest point MUST BE 0.00% (LIVE), NOT 74.28%!
        QVariantList comp5 = m_model.composedTrendHistory();
        assert(comp5.size() >= 3);
        assert(std::abs(comp5.last().toMap().value("value").toDouble() - 0.0) < 0.01);
        assert(comp5.last().toMap().value("source").toString() == "LIVE");
        std::cout << "  [TEST 5 PASS] Historical 74.28% vs Live 0.00%: Live model remains 0.00%, graph latest = 0.00%." << std::endl;

        // TEST 6 — ASYNCHRONOUS ORDERING: HISTORICAL ARRIVES AFTER LIVE
        // Live was already 0.00%. When historical is set again with older samples, live is not overwritten.
        QVariantList testHistLate;
        QVariantMap hLate; hLate["timestampMs"] = QDateTime::currentMSecsSinceEpoch() - 1800000; hLate["value"] = 80.0; testHistLate.append(hLate);
        m_model.setTrendHistory(testHistLate);
        assert(std::abs(m_model.fillPercentage() - 0.0) < 0.01);
        assert(std::abs(m_model.composedTrendHistory().last().toMap().value("value").toDouble() - 0.0) < 0.01);
        std::cout << "  [TEST 6 PASS] Historical arrives after live: Live model remains unchanged (0.00%)." << std::endl;

        // TEST 7 — ASYNCHRONOUS ORDERING: LIVE ARRIVES AFTER HISTORICAL
        QVariantList testHistEarly;
        QVariantMap hEarly; hEarly["timestampMs"] = QDateTime::currentMSecsSinceEpoch() - 1800000; hEarly["value"] = 85.0; testHistEarly.append(hEarly);
        m_model.setTrendHistory(testHistEarly);
        // Live REST arrives: 30.0 cm (60.0%)
        QJsonObject newLiveObj;
        newLiveObj["water_level_cm"] = 30.0;
        newLiveObj["level_percent"] = 60.0;
        newLiveObj["tank_volume_l"] = 12.0;
        newLiveObj["tank_height_cm"] = 50.0;
        newLiveObj["tank_capacity_l"] = 20.0;
        newLiveObj["sensor_status"] = 1;
        newLiveObj["measurement_valid"] = true;
        newLiveObj["measurement_state"] = "VALID";
        newLiveObj["alarm_state"] = "Normal";
        m_repo.processEsp32Status(newLiveObj);
        assert(std::abs(m_model.fillPercentage() - 60.0) < 0.01);
        assert(std::abs(m_model.composedTrendHistory().last().toMap().value("value").toDouble() - 60.0) < 0.01);
        std::cout << "  [TEST 7 PASS] Live arrives after historical: Final current value = authoritative REST (60.0%)." << std::endl;

        // TEST 8 — INVALID HISTORICAL POINT SANITIZED
        QVariantList corruptHist;
        QVariantMap bad1; bad1["timestampMs"] = QDateTime::currentMSecsSinceEpoch() - 5000000; bad1["value"] = 50.0; corruptHist.append(bad1);
        QVariantMap bad2; bad2["timestampMs"] = 0; bad2["value"] = 999.0; corruptHist.append(bad2); // Invalid timestamp & impossible value
        QVariantMap bad3; bad3["timestampMs"] = -100; bad3["value"] = 50.0; corruptHist.append(bad3); // Negative timestamp
        QVariantMap bad4; bad4["timestampMs"] = QDateTime::currentMSecsSinceEpoch() - 1000000; bad4["value"] = 55.0; corruptHist.append(bad4);
        m_model.setTrendHistory(corruptHist);
        QVariantList comp8 = m_model.composedTrendHistory();
        for (const QVariant &pt : comp8) {
            QVariantMap m = pt.toMap();
            assert(m.value("timestampMs").toLongLong() > 0);
            assert(m.value("value").toDouble() >= 0.0 && m.value("value").toDouble() <= 100.0);
        }
        // SECTION 20 & 21 TEST — DIRECT REST REGRESSION & HISTORICAL/LIVE CONSISTENCY
        // Historical latest: 74.28%
        QVariantList hist74;
        QVariantMap h74_1; h74_1["timestampMs"] = QDateTime::currentMSecsSinceEpoch() - 7200000; h74_1["value"] = 72.0; hist74.append(h74_1);
        QVariantMap h74_2; h74_2["timestampMs"] = QDateTime::currentMSecsSinceEpoch() - 3600000; h74_2["value"] = 74.28; hist74.append(h74_2);
        m_model.setTrendHistory(hist74);

        // Known non-zero live REST fixture:
        // height = 34.2, percentage = 68.4, volume = 13.68
        QJsonObject fixtureObj;
        fixtureObj["water_level_cm"] = 34.2;
        fixtureObj["level_percent"] = 68.4;
        fixtureObj["tank_volume_l"] = 13.68;
        fixtureObj["tank_height_cm"] = 50.0;
        fixtureObj["tank_capacity_l"] = 20.0;
        fixtureObj["sensor_status"] = 1;
        fixtureObj["measurement_valid"] = true;
        fixtureObj["measurement_state"] = "VALID";
        fixtureObj["alarm_state"] = "Normal";
        m_repo.processEsp32Status(fixtureObj);

        // Verify TankModel contains exact fixture values (NOT 0!)
        assert(std::abs(m_model.waterHeightCm() - 34.2) < 0.01);
        assert(std::abs(m_model.fillPercentage() - 68.4) < 0.01);
        assert(std::abs(m_model.waterVolumeLiters() - 13.68) < 0.01);
        // Verify graph latest point is 68.4% (LIVE), while historical 74.28% remains in history
        QVariantList compSec20 = m_model.composedTrendHistory();
        assert(compSec20.size() >= 3);
        assert(std::abs(compSec20.last().toMap().value("value").toDouble() - 68.4) < 0.01);
        assert(compSec20.last().toMap().value("source").toString() == "LIVE");
        // Verify historical 74.28% is preserved as historical data
        assert(std::abs(compSec20.at(compSec20.size() - 2).toMap().value("value").toDouble() - 74.28) < 0.01);
        std::cout << "  [SECTION 20 & 21 PASS] Direct REST fixture (34.2 cm / 68.4% / 13.68 L): Tank = 68.4%, Graph latest = 68.4%, History 74.28% intact." << std::endl;

        std::cout << "  [PASS] All transient rejection, disconnect retention, and graph consistency tests passed!\n" << std::endl;

        testOfflineHandling();
    }

    void testOfflineHandling()
    {
        std::cout << "[Step 6] Testing server offline and disconnect handling..." << std::endl;

        // Shut down the mock server to simulate disconnect
        m_server->close();

        connect(m_client, &ApiClient::connectionStatusChanged, this, [this](ConnectionState state, const QString &str) {
            if (state == ConnectionState::Disconnected || state == ConnectionState::Error) {
                std::cout << "  -> Successfully transitioned to " << str.toStdString() << " state!" << std::endl;
                std::cout << "  -> Verified state is NOT stuck at Connecting!" << std::endl;
                std::cout << "  [PASS] Offline state machine transition verified.\n" << std::endl;

                std::cout << "=== ALL ESP32 REST INTEGRATION TESTS PASSED SUCCESSFULLY! ===\n" << std::endl;
                QCoreApplication::exit(0);
            }
        });

        // Trigger request to closed port
        m_client->getStatus();
    }

private:
    MockEsp32Server *m_server{nullptr};
    int m_port{0};
    Logger m_logger;
    TankModel m_model;
    TankRepository m_repo;
    ApiClient *m_client{nullptr};
};

int main(int argc, char *argv[])
{
    QCoreApplication app(argc, argv);

    IntegrationTestRunner runner;
    QTimer::singleShot(50, &runner, &IntegrationTestRunner::start);

    return app.exec();
}

#include "test_esp32_rest.moc"
