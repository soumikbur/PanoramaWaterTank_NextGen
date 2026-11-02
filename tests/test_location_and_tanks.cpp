#include <QCoreApplication>
#include <QDebug>
#include <QDateTime>
#include <QJsonObject>
#include <cassert>
#include <iostream>
#include <cmath>

#include "Logger.h"
#include "SettingsManager.h"
#include "TrainManager.h"
#include "TankModel.h"
#include "LocationManager.h"

int main(int argc, char *argv[])
{
    QCoreApplication app(argc, argv);

    std::cout << "=======================================================" << std::endl;
    std::cout << "  === Running Location & All Tanks Unit Tests ===" << std::endl;
    std::cout << "=======================================================" << std::endl;

    Panorama::Logger logger;
    Panorama::SettingsManager settings(logger);
    Panorama::TrainManager trainManager;
    Panorama::LocationManager locationManager;
    locationManager.setTrainManager(&trainManager);
    locationManager.setSettingsManager(&settings);

    // -------------------------------------------------------------
    // Test 1: All Tanks Dynamic Counts & Total Train Configuration
    // -------------------------------------------------------------
    std::cout << "\n[Test 1] All Tanks Dynamic Counts..." << std::endl;
    {
        int total = trainManager.totalTanks();
        int online = trainManager.onlineTanks();
        int offline = trainManager.offlineTanks();
        int lowLevel = trainManager.lowLevelCount();
        int alerts = trainManager.alertCount();

        std::cout << "  - Total Tanks: " << total << std::endl;
        std::cout << "  - Online: " << online << ", Offline: " << offline 
                  << ", Low Level: " << lowLevel << ", Alerts: " << alerts << std::endl;

        assert(total > 0);
        assert(online + offline == total);
        assert(online >= 0);
        assert(offline >= 0);
        assert(lowLevel >= 0);
        assert(alerts >= 0);
        std::cout << "  [PASS] Dynamic tank counts and state partitioning verified." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 2: Search & Status Filtering
    // -------------------------------------------------------------
    std::cout << "\n[Test 2] Filter Bar & Search Behavior..." << std::endl;
    {
        // "all" filter
        QVariantList allList = trainManager.getTanksFiltered(QString(), QStringLiteral("all"));
        assert(allList.size() == trainManager.totalTanks());
        std::cout << "  - Filter 'all': " << allList.size() << " tanks." << std::endl;

        // "online" filter
        QVariantList onlineList = trainManager.getTanksFiltered(QString(), QStringLiteral("online"));
        assert(onlineList.size() == trainManager.onlineTanks());
        for (const auto &item : onlineList) {
            assert(item.toMap().value("isOnline").toBool() == true);
        }
        std::cout << "  - Filter 'online': " << onlineList.size() << " tanks." << std::endl;

        // "offline" filter
        QVariantList offlineList = trainManager.getTanksFiltered(QString(), QStringLiteral("offline"));
        assert(offlineList.size() == trainManager.offlineTanks());
        for (const auto &item : offlineList) {
            assert(item.toMap().value("isOnline").toBool() == false);
        }
        std::cout << "  - Filter 'offline': " << offlineList.size() << " tanks." << std::endl;

        // "low_level" filter
        QVariantList lowLevelList = trainManager.getTanksFiltered(QString(), QStringLiteral("low_level"));
        assert(lowLevelList.size() == trainManager.lowLevelCount());
        std::cout << "  - Filter 'low_level': " << lowLevelList.size() << " tanks." << std::endl;

        // Search by Tank ID
        QVariantList search001 = trainManager.getTanksFiltered(QStringLiteral("001"), QStringLiteral("all"));
        assert(search001.size() >= 1);
        std::cout << "  - Search '001': " << search001.size() << " tanks." << std::endl;

        // Search by Coach
        QVariantList searchCoach = trainManager.getTanksFiltered(QStringLiteral("Coach A"), QStringLiteral("all"));
        assert(searchCoach.size() >= 1);
        std::cout << "  - Search 'Coach A': " << searchCoach.size() << " tanks." << std::endl;

        // Search non-existent
        QVariantList searchEmpty = trainManager.getTanksFiltered(QStringLiteral("NonExistentTankXYZ"), QStringLiteral("all"));
        assert(searchEmpty.isEmpty());
        std::cout << "  - Search 'NonExistentTankXYZ': 0 tanks." << std::endl;

        std::cout << "  [PASS] Search and category filtering strictly verified." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 3: Offline Tanks Data Format & Value Guarding
    // -------------------------------------------------------------
    std::cout << "\n[Test 3] Offline Tanks Structure & Unavailable Values..." << std::endl;
    {
        QVariantList offlineList = trainManager.getTanksFiltered(QString(), QStringLiteral("offline"));
        for (const auto &item : offlineList) {
            QVariantMap map = item.toMap();
            assert(map.value("isOnline").toBool() == false);
            QString state = map.value("connectionState").toString();
            assert(state == QStringLiteral("Offline") || state == QStringLiteral("NOT CONNECTED") || state == QStringLiteral("Disconnected"));
            // Capacity and maxHeight must be preserved for geometry
            assert(map.value("maxHeightCm").toDouble() > 0.0);
            assert(map.value("capacityLiters").toDouble() > 0.0);
        }
        std::cout << "  [PASS] Offline tanks preserve geometric spec without fake readings." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 4: Location Intelligence & Refill Station Mapping
    // -------------------------------------------------------------
    std::cout << "\n[Test 4] Railway Route, Stations, & Real GNSS Processing..." << std::endl;
    {
        // 4.1: Verify default state has NO mock data and fix is unavailable
        QVariantMap trainLocInit = locationManager.trainLocation();
        std::cout << "  - Default Fix State: " << (trainLocInit.value("hasValidFix").toBool() ? "FIXED" : "UNAVAILABLE")
                  << " | GPS Status: " << locationManager.gpsStatus().toStdString() << std::endl;
        assert(trainLocInit.value("hasValidFix").toBool() == false);
        assert(locationManager.hasValidFix() == false);
        assert(locationManager.gpsStatus() == QStringLiteral("GPS STATUS: NO FIX"));

        QVariantList stations = locationManager.stations();
        std::cout << "  - Route Stations count: " << stations.size() << std::endl;
        assert(!stations.isEmpty());

        QVariantList facilities = locationManager.waterFacilities();
        std::cout << "  - Verified Water Refill Facilities count: " << facilities.size() << std::endl;
        assert(!facilities.isEmpty());

        // 4.2: Ingest real GNSS telemetry packet via processEsp32Status
        QJsonObject gpsObj;
        gpsObj["latitude"] = 22.8500;
        gpsObj["longitude"] = 88.1500;
        gpsObj["speedKmh"] = 68.5;
        gpsObj["heading"] = 285.0;
        gpsObj["satellites"] = 9;
        gpsObj["altitude"] = 38.0;
        gpsObj["valid"] = true;
        gpsObj["timestamp"] = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);

        QJsonObject statusObj;
        statusObj["gps"] = gpsObj;

        locationManager.processEsp32Status(statusObj);

        QVariantMap trainLoc = locationManager.trainLocation();
        std::cout << "  - Updated Train ID: " << trainLoc.value("trainId").toString().toStdString()
                  << " | Lat: " << trainLoc.value("latitude").toDouble()
                  << ", Lon: " << trainLoc.value("longitude").toDouble()
                  << " | Speed: " << locationManager.trainSpeed() << " km/h"
                  << " | Heading: " << locationManager.trainHeading().toStdString()
                  << " | Satellites: " << trainLoc.value("satellites").toInt()
                  << " | Status: " << locationManager.gpsStatus().toStdString() << std::endl;

        assert(trainLoc.value("hasValidFix").toBool() == true);
        assert(locationManager.hasValidFix() == true);
        assert(locationManager.gpsStatus() == QStringLiteral("GPS STATUS: FIXED"));
        assert(std::abs(trainLoc.value("latitude").toDouble() - 22.8500) < 0.0001);
        assert(std::abs(trainLoc.value("longitude").toDouble() - 88.1500) < 0.0001);
        assert(std::abs(locationManager.trainSpeed() - 68.5) < 0.1);

        QVariantMap nextRefill = locationManager.nextRefillStation();
        std::cout << "  - Next Refill Station: " << nextRefill.value("name").toString().toStdString()
                  << " (" << nextRefill.value("code").toString().toStdString() << ")"
                  << " | Distance: " << nextRefill.value("distanceKm").toDouble() << " km"
                  << " | ETA: " << nextRefill.value("etaMinutes").toInt() << " min"
                  << " | Capacity: " << nextRefill.value("capacityLiters").toDouble() << " L"
                  << " | Status: " << nextRefill.value("facilityStatus").toString().toStdString() << std::endl;

        assert(nextRefill.contains("name"));
        assert(nextRefill.contains("code"));
        assert(nextRefill.value("waterFillingAvailable").toBool() == true);
        assert(nextRefill.value("distanceKm").toDouble() > 0.0);

        // 4.3: Reject invalid GPS coordinates (e.g. lat > 90)
        locationManager.updateGpsCoordinates(120.0, 87.0, 50.0, 0.0, true, QStringLiteral("INVALID_TEST"));
        assert(locationManager.isGpsLive() == false);
        assert(locationManager.gpsStatus() == QStringLiteral("GPS STATUS: STALE"));
        // Position was NOT corrupted to invalid 120.0, 87.0
        assert(std::abs(locationManager.trainLocation().value("latitude").toDouble() - 22.8500) < 0.0001);
        std::cout << "  - Out-of-bounds coordinates (120.0, 87.0) rejected correctly; marked stale." << std::endl;

        // Restore valid live fix for subsequent calculations
        locationManager.processEsp32Status(statusObj);
        assert(locationManager.hasValidFix() == true);
        assert(locationManager.isGpsLive() == true);
        assert(locationManager.gpsStatus() == QStringLiteral("GPS STATUS: FIXED"));

        std::cout << "  [PASS] Railway stations, facilities, and real GNSS validation verified." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 5: Water Endurance & Refill Decision Calculations
    // -------------------------------------------------------------
    std::cout << "\n[Test 5] Water Endurance & Refill Decision..." << std::endl;
    {
        locationManager.recalculateEnduranceAndDecision();

        QVariantMap endurance = locationManager.waterEndurance();
        double totalMeasurable = endurance.value("totalMeasurableWaterLiters").toDouble();
        double totalCapacity = endurance.value("totalCapacityLiters").toDouble();
        double consumptionRate = endurance.value("consumptionRateLph").toDouble();
        double criticalReserve = endurance.value("criticalReserveLiters").toDouble();
        double usableWater = endurance.value("usableWaterLiters").toDouble();
        QString timeUntilCritical = endurance.value("timeUntilCriticalString").toString();
        QString margin = endurance.value("marginString").toString();
        QString decision = locationManager.refillDecision();
        QString dataQuality = endurance.value("dataQuality").toString();

        std::cout << "  - Total Measurable Water: " << totalMeasurable << " L / " << totalCapacity << " L" << std::endl;
        std::cout << "  - Consumption Rate: " << consumptionRate << " L/h" << std::endl;
        std::cout << "  - Critical Reserve: " << criticalReserve << " L" << std::endl;
        std::cout << "  - Usable Water: " << usableWater << " L" << std::endl;
        std::cout << "  - Time Until Critical: " << timeUntilCritical.toStdString() << std::endl;
        std::cout << "  - Destination Safety Margin: " << margin.toStdString() << std::endl;
        std::cout << "  - Refill Decision: " << decision.toStdString() << std::endl;
        std::cout << "  - Data Quality: " << dataQuality.toStdString() << std::endl;

        assert(totalCapacity > 0.0);
        assert(totalMeasurable <= totalCapacity);
        assert(consumptionRate > 0.0);
        assert(criticalReserve > 0.0);
        assert(usableWater >= 0.0);
        assert(!timeUntilCritical.isEmpty());
        assert(!decision.isEmpty());
        assert(!dataQuality.isEmpty());

        std::cout << "  [PASS] Water endurance and refill decision calculated correctly." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 6: Google Maps API Key Handling (Zero Commit, Secure Config)
    // -------------------------------------------------------------
    std::cout << "\n[Test 6] Google Maps API Key Handling..." << std::endl;
    {
        locationManager.setGoogleMapsApiKey(QString());
        assert(locationManager.googleMapsApiKey().isEmpty());
        std::cout << "  - Verified: Empty API key results in clean unconfigured state." << std::endl;

        locationManager.setGoogleMapsApiKey(QStringLiteral("AIzaSyTestValidKey123"));
        assert(locationManager.googleMapsApiKey() == QStringLiteral("AIzaSyTestValidKey123"));
        std::cout << "  - Verified: API key dynamically set." << std::endl;

        locationManager.setGoogleMapsApiKey(QString());
        assert(locationManager.googleMapsApiKey().isEmpty());
        std::cout << "  [PASS] Google Maps API key state machine verified." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 7: Single Source of Truth & Offline State Propagation
    // -------------------------------------------------------------
    std::cout << "\n[Test 7] Single Source of Truth & Offline State Propagation..." << std::endl;
    {
        Panorama::TankModel tankModel;
        trainManager.setTankModel(&tankModel);

        // 7.1: Select Offline Tank 010 (Coach B3)
        std::cout << "  - Selecting offline tank 'tank-010'..." << std::endl;
        trainManager.selectTank(QStringLiteral("tank-010"));

        QVariantMap selectedMap = trainManager.selectedTank();
        std::cout << "  - Selected Tank: " << selectedMap.value("tankName").toString().toStdString()
                  << " (" << selectedMap.value("coachName").toString().toStdString() << ")"
                  << " | isOnline: " << (selectedMap.value("isOnline").toBool() ? "true" : "false")
                  << " | connectionState: " << selectedMap.value("connectionState").toString().toStdString() << std::endl;

        assert(selectedMap.value("isOnline").toBool() == false);
        assert(selectedMap.value("connectionState").toString() == QStringLiteral("Offline") ||
               selectedMap.value("connectionState").toString() == QStringLiteral("NOT CONNECTED"));

        // Verify TankModel received exact authoritative offline state
        std::cout << "  - TankModel state: connection=" << tankModel.connectionState().toStdString()
                  << ", hasValidData=" << (tankModel.hasValidData() ? "true" : "false")
                  << ", alarmLevel=" << tankModel.alarmLevel().toStdString()
                  << ", sensorStatus=" << tankModel.sensorStatus().toStdString()
                  << ", height=" << tankModel.waterHeightCm()
                  << ", volume=" << tankModel.waterVolumeLiters()
                  << ", lastUpdated=" << tankModel.lastUpdated().toStdString() << std::endl;

        assert(tankModel.connectionState() == QStringLiteral("Offline") ||
               tankModel.connectionState() == QStringLiteral("Not Connected"));
        assert(tankModel.hasValidData() == false);
        assert(tankModel.alarmLevel() == QStringLiteral("Offline"));
        assert(tankModel.sensorStatus() == QStringLiteral("Disconnected"));
        assert(tankModel.waterHeightCm() == 0.0);
        assert(tankModel.waterVolumeLiters() == 0.0);
        assert(tankModel.fillPercentage() == 0.0);
        assert(tankModel.tankHeightCm() > 0.0); // Geometric configuration preserved
        assert(tankModel.capacityLiters() > 0.0); // Geometric configuration preserved
        assert(!tankModel.lastUpdated().isEmpty());
        assert(tankModel.lastUpdated() != QStringLiteral("--")); // Authoritative last-seen timestamp

        // 7.2: Select Online Tank 001 (Coach S1)
        std::cout << "  - Switching to online tank 'tank-001'..." << std::endl;
        trainManager.processReading(35.0, 1013.25, QStringLiteral("Healthy"), QDateTime::currentMSecsSinceEpoch(), true);
        trainManager.selectTank(QStringLiteral("tank-001"));

        QVariantMap onlineMap = trainManager.selectedTank();
        std::cout << "  - onlineMap id: " << onlineMap.value("id").toString().toStdString()
                  << " devId: " << onlineMap.value("deviceId").toString().toStdString()
                  << " conn: " << onlineMap.value("connectionState").toString().toStdString()
                  << " isOnline: " << (onlineMap.value("isOnline").toBool() ? "true" : "false") << std::endl;
        assert(onlineMap.value("isOnline").toBool() == true);
        assert(onlineMap.value("connectionState").toString() == QStringLiteral("Online"));

        assert(tankModel.connectionState() == QStringLiteral("Connected"));
        assert(tankModel.hasValidData() == true);
        assert(tankModel.waterHeightCm() > 0.0);
        assert(tankModel.waterVolumeLiters() > 0.0);
        assert(tankModel.fillPercentage() > 0.0);

        // 7.3: Switch back to another Offline Tank 018
        std::cout << "  - Switching to offline tank 'tank-018'..." << std::endl;
        trainManager.selectTank(QStringLiteral("tank-018"));
        assert(tankModel.connectionState() == QStringLiteral("Offline"));
        assert(tankModel.hasValidData() == false);
        assert(tankModel.alarmLevel() == QStringLiteral("Offline"));
        assert(tankModel.waterHeightCm() == 0.0);

        std::cout << "  [PASS] Single Source of Truth authoritative offline state propagation verified." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 8: Sidebar Collapsed State & Persistence
    // -------------------------------------------------------------
    std::cout << "\n[Test 8] Sidebar Collapsed State & Persistence..." << std::endl;
    {
        // Default initial state
        bool initial = settings.sidebarCollapsed();
        std::cout << "  - Initial sidebarCollapsed: " << (initial ? "true" : "false") << std::endl;

        // Toggle to true
        settings.setSidebarCollapsed(true);
        assert(settings.sidebarCollapsed() == true);
        std::cout << "  - Set to true -> sidebarCollapsed: " << (settings.sidebarCollapsed() ? "true" : "false") << std::endl;

        // Verify new SettingsManager instance reloads persisted state
        {
            Panorama::SettingsManager persistedSettings(logger);
            assert(persistedSettings.sidebarCollapsed() == true);
            std::cout << "  - New instance verified persisted sidebarCollapsed: true" << std::endl;
        }

        // Toggle back to false
        settings.setSidebarCollapsed(false);
        assert(settings.sidebarCollapsed() == false);
        {
            Panorama::SettingsManager persistedSettings(logger);
            assert(persistedSettings.sidebarCollapsed() == false);
            std::cout << "  - New instance verified persisted sidebarCollapsed: false" << std::endl;
        }

        std::cout << "  [PASS] Sidebar collapsed state and QSettings persistence verified." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 9: Authoritative Alarm Evaluation & Deterministic Boundaries
    // -------------------------------------------------------------
    std::cout << "\n[Test 9] Authoritative Alarm Evaluation & Deterministic Boundaries..." << std::endl;
    {
        double crit = 10.0;
        double warn = 20.0;
        double high = 90.0;

        // Level = 5% -> CRITICAL
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(5.0, crit, warn, high) == QStringLiteral("CRITICAL"));
        // Level = 9.99% -> CRITICAL
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(9.99, crit, warn, high) == QStringLiteral("CRITICAL"));
        // Level = 10.00% -> WARNING
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(10.00, crit, warn, high) == QStringLiteral("WARNING"));
        // Level = 15.0% -> WARNING
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(15.0, crit, warn, high) == QStringLiteral("WARNING"));
        // Level = 19.99% -> WARNING
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(19.99, crit, warn, high) == QStringLiteral("WARNING"));
        // Level = 20.00% -> NORMAL
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(20.00, crit, warn, high) == QStringLiteral("NORMAL"));
        // Level = 28.9% -> NORMAL
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(28.9, crit, warn, high) == QStringLiteral("NORMAL"));
        // Level = 90.00% -> NORMAL
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(90.00, crit, warn, high) == QStringLiteral("NORMAL"));
        // Level = 90.01% -> HIGH
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(90.01, crit, warn, high) == QStringLiteral("HIGH"));
        // Level = 95.0% -> HIGH
        assert(Panorama::TankModel::evaluateWaterLevelAlarm(95.0, crit, warn, high) == QStringLiteral("HIGH"));

        std::cout << "  [PASS] Deterministic boundary condition evaluation verified." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 10: State Transitions, Alert Engine, Startup Rule & Stale/Disconnect Protection
    // -------------------------------------------------------------
    std::cout << "\n[Test 10] Live Telemetry Transitions, Alarm Engine & History..." << std::endl;
    {
        Panorama::TankModel tm;
        tm.updateTankConfiguration(0, 50.0, 22.56, 0.0, 0.0, 20.0, 20.0, 10.0, 90.0);

        // Scenario 1: Initial telemetry reading at 28.9% (Normal)
        // INITIALIZATION RULE: Must display NORMAL immediately with 0 active alerts, and NOT create a historical recovery event!
        tm.applyAuthoritativeReading(14.45, 28.9, 5.78, 50.0, 20.0, 1.0, QStringLiteral("Healthy"), QStringLiteral("Normal"), QStringLiteral("VALID"), true);
        assert(tm.authoritativeAlarmState() == QStringLiteral("NORMAL"));
        assert(tm.activeAlertCount() == 0);
        assert(tm.criticalAlertCount() == 0);
        assert(tm.warningAlertCount() == 0);
        assert(tm.alarmHistory().size() == 0); // No startup event
        std::cout << "  - First reading (28.9%): State NORMAL, Active=0, History=0 (no spurious recovery on startup)." << std::endl;

        // Scenario 2: Sequence of normal samples (28.9 -> 28.8 -> 29.0 -> 28.7)
        // Must remain NORMAL, and generate ZERO alarm history events!
        tm.applyAuthoritativeReading(14.40, 28.8, 5.76, 50.0, 20.0, 1.0, QStringLiteral("Healthy"), QStringLiteral("Normal"), QStringLiteral("VALID"), true);
        tm.applyAuthoritativeReading(14.50, 29.0, 5.80, 50.0, 20.0, 1.0, QStringLiteral("Healthy"), QStringLiteral("Normal"), QStringLiteral("VALID"), true);
        tm.applyAuthoritativeReading(14.35, 28.7, 5.74, 50.0, 20.0, 1.0, QStringLiteral("Healthy"), QStringLiteral("Normal"), QStringLiteral("VALID"), true);
        assert(tm.authoritativeAlarmState() == QStringLiteral("NORMAL"));
        assert(tm.activeAlertCount() == 0);
        assert(tm.alarmHistory().size() == 0); // Still 0
        std::cout << "  - Repeated normal telemetry sequence (28.9, 28.8, 29.0, 28.7): History remains 0." << std::endl;

        // Scenario 3: Transition NORMAL -> WARNING (15.0%)
        // Create ONE WARNING event
        tm.applyAuthoritativeReading(7.5, 15.0, 3.0, 50.0, 20.0, 1.0, QStringLiteral("Healthy"), QStringLiteral("Warning"), QStringLiteral("VALID"), true);
        assert(tm.authoritativeAlarmState() == QStringLiteral("WARNING"));
        assert(tm.activeAlertCount() == 1);
        assert(tm.warningAlertCount() == 1);
        assert(tm.criticalAlertCount() == 0);
        assert(tm.alarmHistory().size() == 1);
        assert(tm.alarmHistory().first().toMap().value("severity").toString() == QStringLiteral("WARNING"));
        std::cout << "  - Transition 28.9 -> 15.0%: State WARNING, 1 Warning event created." << std::endl;

        // Scenario 4: Sequence WARNING -> WARNING (15.0 -> 12.0)
        // Must NOT create extra event
        tm.applyAuthoritativeReading(6.0, 12.0, 2.4, 50.0, 20.0, 1.0, QStringLiteral("Healthy"), QStringLiteral("Warning"), QStringLiteral("VALID"), true);
        assert(tm.authoritativeAlarmState() == QStringLiteral("WARNING"));
        assert(tm.alarmHistory().size() == 1);

        // Scenario 5: Transition WARNING -> CRITICAL (12.0 -> 8.0%)
        // Create ONE CRITICAL event
        tm.applyAuthoritativeReading(4.0, 8.0, 1.6, 50.0, 20.0, 1.0, QStringLiteral("Healthy"), QStringLiteral("Critical"), QStringLiteral("VALID"), true);
        assert(tm.authoritativeAlarmState() == QStringLiteral("CRITICAL"));
        assert(tm.activeAlertCount() == 1);
        assert(tm.criticalAlertCount() == 1);
        assert(tm.warningAlertCount() == 0);
        assert(tm.alarmHistory().size() == 2);
        assert(tm.alarmHistory().first().toMap().value("severity").toString() == QStringLiteral("CRITICAL"));
        std::cout << "  - Transition 12.0 -> 8.0%: State CRITICAL, 1 Critical event created (total history=2)." << std::endl;

        // Scenario 6: Transition CRITICAL -> NORMAL (8.0 -> 28.9%)
        // Create ONE recovery event
        tm.applyAuthoritativeReading(14.45, 28.9, 5.78, 50.0, 20.0, 1.0, QStringLiteral("Healthy"), QStringLiteral("Normal"), QStringLiteral("VALID"), true);
        assert(tm.authoritativeAlarmState() == QStringLiteral("NORMAL"));
        assert(tm.activeAlertCount() == 0);
        assert(tm.criticalAlertCount() == 0);
        assert(tm.warningAlertCount() == 0);
        assert(tm.resolvedAlertCount() == 1);
        assert(tm.alarmHistory().size() == 3);
        assert(tm.alarmHistory().first().toMap().value("status").toString() == QStringLiteral("Resolved"));
        std::cout << "  - Transition 8.0 -> 28.9%: State NORMAL, 1 Recovery event created (total history=3, active=0)." << std::endl;

        // Scenario 7: Telemetry stops / Device Disconnected
        // DO NOT set waterLevel to 0%; preserve last valid level and do not trigger false critical alarm!
        tm.setConnectionState(QStringLiteral("Offline"));
        tm.setMeasurementState(QStringLiteral("DISCONNECTED"), false);
        assert(tm.connectionState() == QStringLiteral("Offline"));
        assert(tm.lastValidFillPercentage() > 28.0); // Preserved
        assert(tm.criticalAlertCount() == 0); // No false critical alert
        assert(tm.activeAlertCount() == 0);
        assert(tm.authoritativeAlarmState() == QStringLiteral("DISCONNECTED"));
        std::cout << "  - Telemetry stopped: Device marked Offline (" << tm.authoritativeAlarmState().toStdString()
                  << "), last valid level preserved (" 
                  << tm.lastValidFillPercentage() << "%), no false critical alarm." << std::endl;

        std::cout << "  [PASS] All live telemetry transitions and alert engine rules verified." << std::endl;
    }

    // -------------------------------------------------------------
    // Test 11: Threshold Validation Rule (0 <= Critical < Warning < High <= 100)
    // -------------------------------------------------------------
    std::cout << "\n[Test 11] Threshold Validation & Rejection of Invalid Configurations..." << std::endl;
    {
        QString error;
        // Valid configuration
        assert(Panorama::TankModel::validateThresholdValues(10.0, 20.0, 90.0, &error) == true);
        assert(error.isEmpty());

        // Invalid: Critical >= Warning (20, 10, 90)
        assert(Panorama::TankModel::validateThresholdValues(20.0, 10.0, 90.0, &error) == false);
        assert(!error.isEmpty());

        // Invalid: Warning >= High (10, 20, 5)
        assert(Panorama::TankModel::validateThresholdValues(10.0, 20.0, 5.0, &error) == false);

        // Invalid: Critical < 0 (-5, 20, 90)
        assert(Panorama::TankModel::validateThresholdValues(-5.0, 20.0, 90.0, &error) == false);

        // Invalid: High > 100 (10, 20, 110)
        assert(Panorama::TankModel::validateThresholdValues(10.0, 20.0, 110.0, &error) == false);

        // Invalid: Equal boundary (10, 10, 90)
        assert(Panorama::TankModel::validateThresholdValues(10.0, 10.0, 90.0, &error) == false);

        // Retention of last valid configuration in TankModel
        Panorama::TankModel tm;
        tm.updateTankConfiguration(0, 50.0, 22.56, 0.0, 0.0, 20.0, 20.0, 10.0, 90.0);
        assert(tm.criticalThresholdPercent() == 10.0);
        assert(tm.warningThresholdPercent() == 20.0);
        assert(tm.highThresholdPercent() == 90.0);

        // Attempt partially invalid configuration: crit=25, warn=20
        tm.updateTankConfiguration(0, 50.0, 22.56, 0.0, 0.0, 20.0, 20.0, 25.0, 90.0);
        // Must retain last valid:
        assert(tm.criticalThresholdPercent() == 10.0);
        assert(tm.warningThresholdPercent() == 20.0);

        std::cout << "  [PASS] Threshold validation and invalid configuration rejection verified." << std::endl;
    }

    std::cout << "\n=======================================================" << std::endl;
    std::cout << "  === ALL LOCATION & ALL TANKS TESTS PASSED! ===" << std::endl;
    std::cout << "=======================================================" << std::endl;

    return 0;
}
