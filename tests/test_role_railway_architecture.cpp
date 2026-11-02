#include <QCoreApplication>
#include <QDebug>
#include <QStandardPaths>
#include <cassert>
#include <iostream>
#include <cmath>

#include "AuthManager.h"
#include "PermissionManager.h"
#include "DatabaseManager.h"
#include "RailwayManager.h"
#include "SearchManager.h"

using namespace Panorama;

int main(int argc, char *argv[])
{
    QCoreApplication app(argc, argv);

    std::cout << "=======================================================" << std::endl;
    std::cout << "  === Panorama Role & Railway Architecture Tests ===" << std::endl;
    std::cout << "=======================================================" << std::endl;

    // Initialize Database
    DatabaseManager db;
    bool dbInit = db.initialize();
    assert(dbInit);
    std::cout << "[PASS] DatabaseManager initialized SQLite successfully." << std::endl;

    AuthManager auth;
    auth.setDatabaseManager(&db);

    PermissionManager permissions;
    permissions.setAuthManager(&auth);

    RailwayManager railway;
    railway.setDatabaseManager(&db);

    SearchManager search;
    search.setDatabaseManager(&db);

    // -------------------------------------------------------------
    // Test 1: Role Authentication & Security
    // -------------------------------------------------------------
    std::cout << "\n[Test 1] Testing Role Authentication & Security..." << std::endl;
    {
        // 1.1: Admin Authentication with fixed password
        assert(!auth.isAuthenticated());
        assert(auth.currentUserRole().isEmpty() || auth.currentUserRole() == QStringLiteral("Guest"));

        // Wrong password should fail
        bool failAdmin = auth.loginAdmin(QStringLiteral("WrongPassword123"));
        assert(!failAdmin);
        assert(!auth.isAuthenticated());

        // Correct fixed password (must be exactly "123")
        bool failOldAdmin = auth.loginAdmin(QStringLiteral("Admin@Panorama2026"));
        assert(!failOldAdmin);
        bool okAdmin = auth.loginAdmin(QStringLiteral("123"));
        assert(okAdmin);
        assert(auth.isAuthenticated());
        assert(auth.isAdmin());
        assert(auth.currentUserRole() == QStringLiteral("Admin"));
        std::cout << "  - Admin login with fixed salted SHA-256 password (123): PASS" << std::endl;

        // Admin cannot change Admin password (immutable)
        assert(!auth.changeUserPassword(QStringLiteral("admin"), QStringLiteral("456")));
        assert(!auth.changeUserPassword(QStringLiteral("administrator"), QStringLiteral("456")));
        std::cout << "  - Admin password immutable verification: PASS" << std::endl;

        // Verify Admin Permissions
        assert(permissions.canManageTrains());
        assert(permissions.canManageCoaches());
        assert(permissions.canConfigureTanks());
        assert(permissions.canConfigureDevice());
        assert(permissions.canConfigureNetwork());
        assert(permissions.canConfigureUbidots());
        assert(permissions.canConfigureMap());
        assert(permissions.canChangeUserPassword());
        assert(permissions.canAccessSystemSettings());
        std::cout << "  - Admin full permission verification: PASS" << std::endl;

        // Admin changes employee password
        bool pwdChanged = auth.changeUserPassword(QStringLiteral("employee"), QStringLiteral("newPass456!"));
        assert(pwdChanged);
        std::cout << "  - Admin changed employee password: PASS" << std::endl;

        // Logout
        auth.logout();
        assert(!auth.isAuthenticated());

        // 1.2: Employee Login
        // Old password should now fail
        assert(!auth.loginUser(QStringLiteral("employee"), QStringLiteral("panorama123")));
        // New password should succeed
        bool okUser = auth.loginUser(QStringLiteral("employee"), QStringLiteral("newPass456!"));
        assert(okUser);
        assert(auth.isAuthenticated());
        assert(auth.isUser());
        assert(!auth.isAdmin());
        assert(auth.currentUserRole() == QStringLiteral("User"));
        std::cout << "  - Employee login with updated credential: PASS" << std::endl;

        // Verify User Permissions (Access Control)
        assert(permissions.canManageTrains());
        assert(permissions.canManageCoaches());
        assert(permissions.canConfigureTanks());
        assert(permissions.canViewLiveData());
        assert(permissions.canViewHistory());

        // Strictly forbidden for User:
        assert(!permissions.canConfigureDevice());
        assert(!permissions.canConfigureNetwork());
        assert(!permissions.canConfigureUbidots());
        assert(!permissions.canConfigureMap());
        assert(!permissions.canChangeUserPassword());
        assert(!permissions.canAccessSystemSettings());
        std::cout << "  - Employee role-based permission boundaries strictly enforced: PASS" << std::endl;

        // Restore default password for employee
        auth.loginAdmin(QStringLiteral("123"));
        auth.changeUserPassword(QStringLiteral("employee"), QStringLiteral("panorama123"));
        auth.logout();

        // 1.3: User Management (Max 10 employees/operators, Add, Limit Enforcement, Access Revocation)
        std::cout << "  - Testing Employee/Operator Management & 10-User Limit..." << std::endl;
        auth.loginAdmin(QStringLiteral("123"));
        assert(auth.isAdmin());

        // Clean any leftover test users
        for (int i = 1; i <= 15; ++i) {
            auth.removeUser(QString("testuser%1").arg(i));
        }

        int initialOperators = auth.operatorCount();
        std::cout << "    Initial operator count: " << initialOperators << std::endl;

        // Add users until we hit the 10-operator limit
        int added = 0;
        while (auth.operatorCount() < 10) {
            added++;
            QString uname = QString("testuser%1").arg(added);
            bool okAdd = auth.addUser(QString("Test Operator %1").arg(added), uname, QStringLiteral("pass123!"), QStringLiteral("Operator"));
            assert(okAdd);
        }
        assert(auth.operatorCount() == 10);
        std::cout << "    Filled to 10 operators: PASS (Count = " << auth.operatorCount() << ")" << std::endl;

        // Test 11th operator MUST BE REJECTED
        bool reject11 = auth.addUser(QStringLiteral("Eleventh Operator"), QStringLiteral("testuser11"), QStringLiteral("pass123!"), QStringLiteral("Operator"));
        assert(!reject11);
        assert(auth.operatorCount() == 10);
        std::cout << "    11th Operator addition strictly rejected by backend: PASS" << std::endl;

        // Test created user can log in
        auth.logout();
        bool userCanLogin = auth.loginUser(QStringLiteral("testuser1"), QStringLiteral("pass123!"));
        assert(userCanLogin);
        assert(auth.isAuthenticated());
        assert(auth.currentUserName() == QStringLiteral("testuser1"));
        std::cout << "    Added operator authenticated successfully: PASS" << std::endl;

        // Admin logs back in to remove user
        auth.loginAdmin(QStringLiteral("123"));
        bool removed = auth.removeUser(QStringLiteral("testuser1"));
        assert(removed);
        assert(auth.operatorCount() == 9);
        std::cout << "    Removed operator and verified count decremented to 9: PASS" << std::endl;

        // Removed user MUST LOSE ACCESS (cannot log in anymore)
        auth.logout();
        bool removedUserLogin = auth.loginUser(QStringLiteral("testuser1"), QStringLiteral("pass123!"));
        assert(!removedUserLogin);
        assert(!auth.isAuthenticated());
        std::cout << "    Removed operator access revoked (authentication denied): PASS" << std::endl;

        // Clean up remaining test users
        auth.loginAdmin(QStringLiteral("123"));
        for (int i = 2; i <= added; ++i) {
            auth.removeUser(QString("testuser%1").arg(i));
        }
        auth.logout();
        std::cout << "  - Employee/Operator management suite passed: PASS" << std::endl;

        // 1.4: Comprehensive Admin Authorization & Role Consistency Tests
        std::cout << "  - Testing Admin Authorization & Role Consistency (Bug Fix Verification)..." << std::endl;
        // Test admin login via username "admin" + "123" on loginUser
        bool adminViaUserLogin = auth.loginUser(QStringLiteral("admin"), QStringLiteral("123"));
        assert(adminViaUserLogin);
        assert(auth.isAuthenticated());
        assert(auth.isAdmin());
        assert(!auth.isUser());
        assert(permissions.isAdmin());
        assert(permissions.canAccessSystemSettings());
        assert(permissions.canConfigureDevice());
        assert(permissions.canConfigureTanks());
        assert(permissions.canChangeUserPassword());
        auth.logout();

        // Test case-insensitive admin username
        bool adminViaUpper = auth.loginUser(QStringLiteral("ADMIN"), QStringLiteral("123"));
        assert(adminViaUpper);
        assert(auth.isAdmin());
        assert(permissions.canAccessSystemSettings());
        auth.logout();

        // Test user with custom role from DB (Technician)
        auth.loginAdmin(QStringLiteral("123"));
        auth.addUser(QStringLiteral("Chief Engineer"), QStringLiteral("tech_lead"), QStringLiteral("techpass123"), QStringLiteral("Technician"));
        auth.logout();

        bool techLogin = auth.loginUser(QStringLiteral("tech_lead"), QStringLiteral("techpass123"));
        assert(techLogin);
        assert(auth.isAuthenticated());
        assert(!auth.isAdmin());
        assert(auth.isUser());
        assert(auth.currentUserRole() == QStringLiteral("Technician"));
        assert(auth.currentUserName() == QStringLiteral("tech_lead"));
        assert(!permissions.canAccessSystemSettings());
        assert(!permissions.canConfigureDevice());
        assert(permissions.canConfigureTanks());
        auth.logout();

        // Cleanup
        auth.loginAdmin(QStringLiteral("123"));
        auth.removeUser(QStringLiteral("tech_lead"));
        auth.logout();
        std::cout << "    Admin dual-login, case-insensitivity & database role mapping: PASS" << std::endl;
    }

    // -------------------------------------------------------------
    // Test 2: Train, Coach, Tank CRUD & Persistence
    // -------------------------------------------------------------
    std::cout << "\n[Test 2] Testing Train, Coach, and Tank Hierarchy..." << std::endl;
    {
        // 2.1: Add Train (Clean pre-existing test data if any)
        railway.deleteTrain(QStringLiteral("99999"));
        int initialTrainCount = railway.getTrains().size();
        bool addedTrain = railway.addTrain(
            QStringLiteral("99999"),
            QStringLiteral("Superfast Test Express"),
            QStringLiteral("Western Railway"),
            QStringLiteral("Mumbai Central to Ahmedabad"),
            QStringLiteral("Mumbai Central")
        );
        assert(addedTrain);
        assert(railway.getTrains().size() == initialTrainCount + 1);

        QVariantMap train = railway.getTrain(QStringLiteral("99999"));
        assert(train.value("trainNumber").toString() == QStringLiteral("99999"));
        assert(train.value("trainName").toString() == QStringLiteral("Superfast Test Express"));
        std::cout << "  - Add Train (99999): PASS" << std::endl;

        // 2.2: Add Coach to Train 99999
        bool addedCoach = railway.addCoach(
            QStringLiteral("99999"),
            QStringLiteral("B1"),
            QStringLiteral("AC 3 Tier"),
            1,
            QStringLiteral("Standard AC 3 Tier Coach")
        );
        assert(addedCoach);
        QVariantList coaches = railway.getCoaches(QStringLiteral("99999"));
        assert(coaches.size() == 24);
        QVariantMap coachMap = coaches.first().toMap();
        assert(coachMap.value("assigned").toBool() == true);
        assert(coachMap.value("position").toInt() == 1);
        int coachId = coachMap.value("id").toInt();
        assert(coachId > 0);
        std::cout << "  - Add Coach (B1, id=" << coachId << ") in 24-coach consist: PASS" << std::endl;

        // 2.3: Configure Tank 1 with RECTANGULAR Geometry
        // Rectangular: L=40 cm, W=30 cm, H=50 cm -> Capacity = 40 * 30 * 50 / 1000 = 60.0 Liters
        double rectCap = railway.calculateCapacity(QStringLiteral("Rectangular"), 40.0, 30.0, 50.0, 0.0);
        assert(std::abs(rectCap - 60.0) < 0.01);
        std::cout << "  - Rectangular Capacity calculation (40x30x50 cm = 60 L): PASS" << std::endl;

        bool addedTankRect = railway.addTank(
            coachId,
            QStringLiteral("T01"),
            QStringLiteral("Tank T01"),
            QStringLiteral("Rectangular"),
            40.0,
            30.0,
            50.0,
            0.0,
            rectCap,
            50.0,
            QStringLiteral("") // No device assigned yet
        );
        assert(addedTankRect);

        // 2.4: Configure Tank 2 with CYLINDRICAL Geometry
        // Cylindrical: Diameter=30 cm (r=15 cm), H=50 cm -> Capacity = pi * 15^2 * 50 / 1000 = 35.3429 Liters
        double cylCap = railway.calculateCapacity(QStringLiteral("Cylindrical"), 0.0, 0.0, 50.0, 30.0);
        assert(std::abs(cylCap - 35.3) < 0.1);
        std::cout << "  - Cylindrical Capacity calculation (Dia 30, H 50 cm = 35.3 L): PASS" << std::endl;

        bool addedTankCyl = railway.addTank(
            coachId,
            QStringLiteral("T02"),
            QStringLiteral("Tank T02"),
            QStringLiteral("Cylindrical"),
            0.0,
            0.0,
            50.0,
            30.0,
            cylCap,
            50.0,
            QStringLiteral("ESP32-S3-099") // Device assigned
        );
        assert(addedTankCyl);

        // 2.5: Verify No Mock Data Guarantee
        QVariantList tanks = railway.getTanksForCoach(coachId);
        assert(tanks.size() == 2);

        QVariantMap t1 = tanks[0].toMap();
        assert(t1.value("tankNumber").toString() == QStringLiteral("T01"));
        assert(t1.value("geometryType").toString() == QStringLiteral("Rectangular"));
        assert(t1.value("deviceStatus").toString() == QStringLiteral("NOT CONNECTED"));
        assert(t1.value("deviceId").toString().isEmpty());

        QVariantMap t2 = tanks[1].toMap();
        assert(t2.value("tankNumber").toString() == QStringLiteral("T02"));
        assert(t2.value("geometryType").toString() == QStringLiteral("Cylindrical"));
        assert(t2.value("deviceId").toString() == QStringLiteral("ESP32-S3-099"));
        assert(t2.value("deviceStatus").toString() == QStringLiteral("Offline"));
        std::cout << "  - Independent Tank Geometries & Real Device States: PASS" << std::endl;

        // 2.6: Cascade Delete Safety
        bool delTrain = railway.deleteTrain(QStringLiteral("99999"));
        assert(delTrain);
        assert(railway.getTrain(QStringLiteral("99999")).isEmpty());
        assert(railway.getCoaches(QStringLiteral("99999")).isEmpty());
        std::cout << "  - Cascade Delete of Train, Coaches, and Tanks: PASS" << std::endl;
    }

    // -------------------------------------------------------------
    // Test 3: Global Search & Location Navigation
    // -------------------------------------------------------------
    std::cout << "\n[Test 3] Testing Global Search & Categorized Navigation..." << std::endl;
    {
        // 3.1: Search by Train Number "12301"
        search.searchImmediate(QStringLiteral("12301"));
        assert(search.hasResults());
        QVariantList trainResults = search.trainResults();
        assert(!trainResults.isEmpty());
        assert(trainResults.first().toMap().value("title").toString().contains("12301"));
        std::cout << "  - Search '12301' returns TrainResult: PASS" << std::endl;

        // 3.2: Search by Location "Wardha"
        search.searchImmediate(QStringLiteral("Wardha"));
        assert(search.hasResults());
        QVariantList locResults = search.locationResults();
        assert(!locResults.isEmpty());
        QVariantMap wardha = locResults.first().toMap();
        assert(wardha.value("title").toString() == QStringLiteral("Wardha Junction"));
        assert(std::abs(wardha.value("latitude").toDouble() - 20.7453) < 0.001);
        assert(std::abs(wardha.value("longitude").toDouble() - 78.6022) < 0.001);
        std::cout << "  - Search 'Wardha' returns LocationResult with GPS (20.7453, 78.6022): PASS" << std::endl;

        // 3.3: Empty search clears results
        search.clear();
        assert(!search.hasResults());
        assert(search.trainResults().isEmpty());
        assert(search.locationResults().isEmpty());
        std::cout << "  - Search clear: PASS" << std::endl;
    }

    // -------------------------------------------------------------
    // Test 4: Device Management & Cross-Hierarchy Assignment
    // -------------------------------------------------------------
    std::cout << "\n[Test 4] Testing Device Management & Tank Assignment..." << std::endl;
    {
        // 4.1: Primary Hardware Device 'wli'
        QVariantList initialDevices = railway.devices();
        assert(!initialDevices.isEmpty());
        bool foundWli = false;
        for (const auto &devVar : initialDevices) {
            QVariantMap d = devVar.toMap();
            if (d.value("id").toString() == QStringLiteral("wli")) {
                foundWli = true;
                assert(d.value("isPrimary").toBool() == true);
                break;
            }
        }
        assert(foundWli);
        std::cout << "  - Primary device 'wli' registered and identified as primary: PASS" << std::endl;

        // 4.2: Add Device without tank assignment
        railway.removeDevice(QStringLiteral("DEV-TEST-101"));
        bool addedDev = railway.addDevice(
            QStringLiteral("DEV-TEST-101"),
            QStringLiteral("Auxiliary Sensor Node"),
            QStringLiteral("ESP32-S3 Industrial Node"),
            QStringLiteral("LTE / Cellular"),
            QStringLiteral("Online"),
            QStringLiteral("Standby Depot Inventory")
        );
        assert(addedDev);
        bool foundNewDev = false;
        for (const auto &devVar : railway.devices()) {
            QVariantMap d = devVar.toMap();
            if (d.value("id").toString() == QStringLiteral("DEV-TEST-101")) {
                foundNewDev = true;
                assert(d.value("name").toString() == QStringLiteral("Auxiliary Sensor Node"));
                assert(d.value("status").toString() == QStringLiteral("Online"));
                assert(d.value("isPrimary").toBool() == false);
                break;
            }
        }
        assert(foundNewDev);
        std::cout << "  - Add Device (DEV-TEST-101) immediate reflection in device inventory: PASS" << std::endl;

        // 4.3: Add Device assigned to Train 12301 -> Coach S1 -> Tank T01
        bool assignDev = railway.addDevice(
            QStringLiteral("DEV-TEST-102"),
            QStringLiteral("Assigned Sensor Node"),
            QStringLiteral("Quectel EC200U-CN LTE Cat-1"),
            QStringLiteral("LTE / Cellular"),
            QStringLiteral("Online"),
            QStringLiteral("Coach S1 Assigned Sensor"),
            QStringLiteral("12301"),
            QStringLiteral("S1"),
            QStringLiteral("T01")
        );
        assert(assignDev);

        // Verify assignment reflected in tank data
        int s1CoachId = 0;
        for (const auto &cVar : railway.getCoaches(QStringLiteral("12301"))) {
            QVariantMap cm = cVar.toMap();
            if (cm.value("position").toInt() == 1 || cm.value("coachNumber").toString() == QStringLiteral("01") || cm.value("coachNumber").toString() == QStringLiteral("S1")) {
                s1CoachId = cm.value("id").toInt();
                break;
            }
        }
        assert(s1CoachId > 0);
        QVariantList coachTanks = railway.getTanksForCoach(s1CoachId);
        bool tankAssigned = false;
        for (const auto &tkVar : coachTanks) {
            QVariantMap tk = tkVar.toMap();
            if (tk.value("tankNumber").toString() == QStringLiteral("T01")) {
                assert(tk.value("deviceId").toString() == QStringLiteral("DEV-TEST-102"));
                assert(tk.value("deviceStatus").toString() == QStringLiteral("Online"));
                tankAssigned = true;
                break;
            }
        }
        assert(tankAssigned);
        std::cout << "  - Device assignment directly updates Coach -> Tank model: PASS" << std::endl;

        // 4.4: Remove Device unlinks tank assignment
        bool removed = railway.removeDevice(QStringLiteral("DEV-TEST-102"));
        assert(removed);
        coachTanks = railway.getTanksForCoach(s1CoachId);
        for (const auto &tkVar : coachTanks) {
            QVariantMap tk = tkVar.toMap();
            if (tk.value("tankNumber").toString() == QStringLiteral("T01")) {
                assert(tk.value("deviceId").toString().isEmpty());
                assert(tk.value("deviceStatus").toString() == QStringLiteral("NOT CONNECTED"));
                break;
            }
        }
        std::cout << "  - Remove Device unlinks tank and reverts state to NOT CONNECTED: PASS" << std::endl;

        // Restore primary device 'wli' on T01
        railway.addDevice(
            QStringLiteral("wli"),
            QStringLiteral("Water Level Sensor 01"),
            QStringLiteral("Quectel EC200U-CN LTE Cat-1"),
            QStringLiteral("LTE / Cellular"),
            QStringLiteral("Online"),
            QStringLiteral("Rajdhani Express - Coach 01 - Tank T01"),
            QStringLiteral("12301"),
            QStringLiteral("01"),
            QStringLiteral("T01")
        );
        railway.removeDevice(QStringLiteral("DEV-TEST-101"));
        std::cout << "  - Primary device 'wli' restored on Rajdhani Express T01: PASS" << std::endl;
    }

    // -------------------------------------------------------------
    // Test 5: 24-Coach Consist Grid & Limits (Requirements 19–38)
    // -------------------------------------------------------------
    std::cout << "\n[Test 5] Testing 24-Coach Consist Grid & Limits (Requirements 19-38)..." << std::endl;
    {
        // Ensure consist is clean of any leftovers from prior test runs
        QVariantList initialCheckCoaches = railway.getCoaches(QStringLiteral("12301"));
        for (int i = 1; i < initialCheckCoaches.size(); ++i) {
            QVariantMap cMap = initialCheckCoaches[i].toMap();
            if (cMap.value("assigned").toBool()) {
                int cId = cMap.value("id").toInt();
                if (cId > 0) railway.deleteCoach(cId);
            }
        }

        // 5.1: 24 Coach positions visible
        QVariantList rCoaches = railway.getCoaches(QStringLiteral("12301"));
        assert(rCoaches.size() == 24);
        std::cout << "  - Consist returns exactly 24 coach positions: PASS" << std::endl;

        // 5.2: Two-digit numbering 01-24
        assert(rCoaches[0].toMap().value("displayNumber").toString() == QStringLiteral("01"));
        assert(rCoaches[9].toMap().value("displayNumber").toString() == QStringLiteral("10"));
        assert(rCoaches[23].toMap().value("displayNumber").toString() == QStringLiteral("24"));
        std::cout << "  - Consistent two-digit formatting 01 through 24: PASS" << std::endl;

        // 5.3: Coach 01 contains T01 with device 'wli'
        QVariantMap coach01 = rCoaches[0].toMap();
        assert(coach01.value("assigned").toBool() == true);
        assert(coach01.value("tankCount").toInt() >= 1);
        std::cout << "  - Coach 01 is Assigned and contains real tank T01: PASS" << std::endl;

        // 5.4: Coach 02-24 do NOT contain fake tanks (Section 35)
        for (int i = 1; i < 24; ++i) {
            QVariantMap slot = rCoaches[i].toMap();
            assert(!slot.value("assigned").toBool());
            assert(slot.value("tankCount").toInt() == 0);
            assert(slot.value("tanks").toList().isEmpty());
        }
        std::cout << "  - Coach 02 through 24 are available slots with ZERO fake tanks: PASS" << std::endl;

        // 5.5: Assign real tank/device to Coach 10 -> updates Coach 10 and All Tanks (Section 31)
        bool addDev10 = railway.addDevice(
            QStringLiteral("DEV-TEST-COACH10"),
            QStringLiteral("Coach 10 Sensor"),
            QStringLiteral("Quectel EC200U-CN LTE Cat-1"),
            QStringLiteral("LTE / Cellular"),
            QStringLiteral("Online"),
            QStringLiteral("Rajdhani Express - Coach 10 - Tank T01"),
            QStringLiteral("12301"),
            QStringLiteral("10"),
            QStringLiteral("T01")
        );
        assert(addDev10);

        QVariantList updatedCoaches = railway.getCoaches(QStringLiteral("12301"));
        assert(updatedCoaches[9].toMap().value("assigned").toBool() == true);
        assert(updatedCoaches[9].toMap().value("tankCount").toInt() == 1);
        std::cout << "  - Assign device to Coach 10 immediately updates Coach 10 card: PASS" << std::endl;

        bool foundInAll = false;
        for (const auto &tk : railway.getAllTanks()) {
            if (tk.toMap().value("deviceId").toString() == QStringLiteral("DEV-TEST-COACH10")) {
                foundInAll = true;
                break;
            }
        }
        assert(foundInAll);
        std::cout << "  - Coach 10 tank immediately appears in All Tanks: PASS" << std::endl;

        // Unlink device from Coach 10
        railway.removeDevice(QStringLiteral("DEV-TEST-COACH10"));
        bool stillInAll = false;
        for (const auto &tk : railway.getAllTanks()) {
            if (tk.toMap().value("deviceId").toString() == QStringLiteral("DEV-TEST-COACH10")) {
                stillInAll = true;
                break;
            }
        }
        assert(!stillInAll);
        std::cout << "  - Remove device from Coach 10 immediately unlinks in All Tanks: PASS" << std::endl;

        // 5.6: Attempt to assign Coach 25 -> Rejected (Requirement 33)
        bool rejectPos25 = railway.addCoach(QStringLiteral("12301"), QStringLiteral("Coach 25"), QStringLiteral("General"), 25);
        assert(!rejectPos25);
        bool rejectNum25 = railway.addCoach(QStringLiteral("12301"), QStringLiteral("25"), QStringLiteral("General"), 20);
        assert(!rejectNum25);
        std::cout << "  - Attempt to assign Coach 25 or position > 24 rejected: PASS" << std::endl;

        // 5.7: Train Summary consistency
        assert(railway.maxCoachCapacity() == 24);
        std::cout << "  - Max coach capacity reports 24: PASS" << std::endl;
    }

    // -------------------------------------------------------------
    // Test 6: Bug 1 — Add Tank in Coach 02 & Duplicate Validation
    // -------------------------------------------------------------
    std::cout << "\n[Test 6] Testing Tank Creation in Coach 02 & Data Consistency (Bug 1)..." << std::endl;
    {
        // Find or ensure Coach 02 exists in Rajdhani Express (train 12301)
        QVariantList rCoaches = railway.getCoaches(QStringLiteral("12301"));
        assert(rCoaches.size() >= 2);
        int coach02Id = rCoaches[1].toMap().value("id").toInt();
        if (coach02Id <= 0) {
            coach02Id = railway.ensureCoach(QStringLiteral("12301"), 2);
        }
        assert(coach02Id > 0);

        // Initial check: get tanks for Coach 02
        QVariantList c2Tanks = railway.getTanksForCoach(coach02Id);
        int initialCount = c2Tanks.size();

        // Add Tank 2 with tag T2
        bool tankAdded = railway.addTank(coach02Id, QStringLiteral("Tank 2"), QStringLiteral("T2"), QStringLiteral("Rectangular"), 100.0, 100.0, 150.0, 0.0, 2000.0, 150.0);
        assert(tankAdded);

        // Immediately visible in Coach 02 without application restart
        c2Tanks = railway.getTanksForCoach(coach02Id);
        assert(c2Tanks.size() == initialCount + 1);
        int createdTankId = -1;
        bool foundTank2 = false;
        for (const auto &tVar : c2Tanks) {
            QVariantMap t = tVar.toMap();
            if (t.value("tankNumber").toString() == QStringLiteral("Tank 2") || t.value("tagName").toString() == QStringLiteral("T2")) {
                foundTank2 = true;
                createdTankId = t.value("id").toInt();
                assert(t.value("capacityLiters").toDouble() == 2000.0);
                assert(t.value("heightCm").toDouble() == 150.0);
                break;
            }
        }
        assert(foundTank2);
        assert(createdTankId > 0);
        std::cout << "  - Tank 2 successfully created and immediately visible in Coach 02: PASS" << std::endl;

        // Adding duplicate Tank 2 to the same coach must be rejected
        bool dupRejected = !railway.addTank(coach02Id, QStringLiteral("Tank 2"), QStringLiteral("T2_dup"), QStringLiteral("Rectangular"), 100.0, 100.0, 150.0, 0.0, 2000.0, 150.0);
        assert(dupRejected);
        std::cout << "  - Duplicate Tank 2 in Coach 02 correctly rejected: PASS" << std::endl;

        // Clean up test Tank 2
        bool removed = railway.deleteTank(createdTankId);
        assert(removed);
        c2Tanks = railway.getTanksForCoach(coach02Id);
        assert(c2Tanks.size() == initialCount);
        railway.deleteCoach(coach02Id);
        std::cout << "  - Tank removal immediately updates Coach 02 collection: PASS" << std::endl;
    }

    // -------------------------------------------------------------
    // Test 7: Bug 3 — New Device shows NO fake water level
    // -------------------------------------------------------------
    std::cout << "\n[Test 7] Testing New Device Telemetry Uninitialized State (Bug 3)..." << std::endl;
    {
        // Add a new device with no tank assignment
        bool devAdded = railway.addDevice(
            QStringLiteral("WLI-UNASSIGNED-TEST"),
            QStringLiteral("Unassigned Test Device"),
            QStringLiteral("Quectel EC200U"),
            QStringLiteral("Cellular"),
            QStringLiteral("Online"),
            QStringLiteral(""),
            QStringLiteral(""),
            QStringLiteral(""),
            QStringLiteral("")
        );
        assert(devAdded);

        // Fetch device from database
        QVariantMap dev = db.getDevice(QStringLiteral("WLI-UNASSIGNED-TEST"));
        assert(!dev.isEmpty());
        assert(dev.value("hasTank").toBool() == false);
        assert(dev.value("waterLevel").toDouble() < 0.0);
        assert(dev.value("waterHeightCm").toDouble() < 0.0);
        assert(dev.value("sensorStatus").toString() == QStringLiteral("Not Assigned"));
        std::cout << "  - New unassigned device reports uninitialized (-1) level and height (NO 70% / 35 cm): PASS" << std::endl;

        // Clean up
        railway.removeDevice(QStringLiteral("WLI-UNASSIGNED-TEST"));
    }

    // -------------------------------------------------------------
    // Test 8: Bug 5 — User Persistence & 10-Operator Limit
    // -------------------------------------------------------------
    std::cout << "\n[Test 8] Testing User Persistence & 10-Operator Limit (Bug 5)..." << std::endl;
    {
        auth.loginAdmin(QStringLiteral("123"));
        int initialOpCount = auth.operatorCount();
        
        // Add user Employee Test A
        bool u1 = auth.addUser(QStringLiteral("Employee Test A"), QStringLiteral("emptesta"), QStringLiteral("pass123"), QStringLiteral("Employee"));
        assert(u1);
        assert(auth.operatorCount() == initialOpCount + 1);

        // Verify immediately in users list
        bool foundU1 = false;
        for (const auto &uVar : auth.users()) {
            if (uVar.toMap().value("username").toString() == QStringLiteral("emptesta")) {
                foundU1 = true;
                break;
            }
        }
        assert(foundU1);
        std::cout << "  - Newly created user immediately visible in AuthManager::users: PASS" << std::endl;

        // Verify persisted directly in database
        QVariantList persistedUsers = db.getAllUsers();
        bool foundInDb = false;
        for (const auto &uVar : persistedUsers) {
            if (uVar.toMap().value("username").toString() == QStringLiteral("emptesta")) {
                foundInDb = true;
                break;
            }
        }
        assert(foundInDb);
        std::cout << "  - User persisted immediately in SQLite database: PASS" << std::endl;

        // Remove user
        bool rem = auth.removeUser(QStringLiteral("emptesta"));
        assert(rem);
        assert(auth.operatorCount() == initialOpCount);

        // Verify removal persisted in database
        persistedUsers = db.getAllUsers();
        for (const auto &uVar : persistedUsers) {
            assert(uVar.toMap().value("username").toString() != QStringLiteral("emptesta"));
        }
        std::cout << "  - User removal immediately persisted in SQLite database: PASS" << std::endl;
        auth.logout();
    }

    // -------------------------------------------------------------
    // Test 9: Train Summary Calculation & Reactivity (Bug 1 & 2)
    // -------------------------------------------------------------
    std::cout << "\n[Test 9] Testing Train Summary Calculation & Reactivity..." << std::endl;
    {
        // 9.1: Query train summary for Rajdhani Express (12301)
        railway.setActiveTrainNumber(QStringLiteral("12301"));
        QVariantMap activeTrain = railway.activeTrain();
        assert(!activeTrain.isEmpty());
        assert(activeTrain.value("trainNumber").toString() == QStringLiteral("12301"));

        int assignedCoaches = railway.assignedCoachCount();
        assert(assignedCoaches >= 1 && assignedCoaches <= 24);
        assert(assignedCoaches != 24); // Must not count all 24 slots!
        assert(activeTrain.value("coachCount").toInt() == assignedCoaches);
        std::cout << "  - Assigned coach count strictly matches configured coaches (" << assignedCoaches << " / 24): PASS" << std::endl;

        // 9.2: Verify tank counts and online/offline breakdown
        int totalTanks = activeTrain.value("tankCount").toInt();
        int onlineTanks = activeTrain.value("onlineTanks").toInt();
        int offlineTanks = activeTrain.value("offlineTanks").toInt();

        assert(totalTanks >= 1);
        assert(onlineTanks >= 0);
        assert(offlineTanks >= 0);
        assert(onlineTanks + offlineTanks == totalTanks);
        std::cout << "  - Tanks total (" << totalTanks << ") = Online (" << onlineTanks 
                  << ") + Offline (" << offlineTanks << "): PASS" << std::endl;

        // Verify primary online device 'wli' is properly reflected in onlineTanks
        assert(onlineTanks >= 1);
        std::cout << "  - Active online device 'wli' counted as Online: PASS" << std::endl;

        // 9.3: Consist grid calculation matches train summary
        QVariantList consist = railway.coaches();
        assert(consist.size() == 24);
        int consistAssigned = 0;
        int consistTanks = 0;
        int consistOnline = 0;
        int consistOffline = 0;
        for (const auto &cVar : consist) {
            QVariantMap c = cVar.toMap();
            if (c.value("assigned").toBool()) {
                consistAssigned++;
                consistTanks += c.value("tankCount").toInt();
                consistOnline += c.value("onlineCount").toInt();
                consistOffline += c.value("offlineCount").toInt();
            }
        }
        assert(consistAssigned == assignedCoaches);
        assert(consistTanks == totalTanks);
        assert(consistOnline == onlineTanks);
        assert(consistOffline == offlineTanks);
        std::cout << "  - Consist grid derivation exactly matches authoritative train summary: PASS" << std::endl;

        // 9.4: Multi-train isolation
        // Add a temporary train 88888 with 1 coach and 1 offline tank
        bool trAdded = railway.addTrain(QStringLiteral("88888"), QStringLiteral("Test Express"),
                                       QStringLiteral("Western Region"), QStringLiteral("Test"),
                                       QStringLiteral("Mumbai - Ahmedabad"), QStringLiteral("Online"));
        assert(trAdded);
        bool coachAdded = railway.addCoach(QStringLiteral("88888"), QStringLiteral("01"),
                                          QStringLiteral("Sleeper"), 1, QStringLiteral("Front"));
        assert(coachAdded);
        int coachId88 = -1;
        for (const auto &cVar : railway.getCoaches(QStringLiteral("88888"))) {
            QVariantMap c = cVar.toMap();
            if (c.value("assigned").toBool()) {
                coachId88 = c.value("id").toInt();
                break;
            }
        }
        assert(coachId88 > 0);
        bool tankAdded = railway.addTank(coachId88, QStringLiteral("T01"), QStringLiteral("Test Tank"),
                                        QStringLiteral("Rectangular"), 40.0, 30.0, 50.0, 0.0, 60.0, 50.0);
        assert(tankAdded);

        // Switch to train 88888 and verify its summary is independent
        railway.setActiveTrainNumber(QStringLiteral("88888"));
        QVariantMap train88 = railway.activeTrain();
        assert(train88.value("trainNumber").toString() == QStringLiteral("88888"));
        assert(train88.value("coachCount").toInt() == 1);
        assert(train88.value("tankCount").toInt() == 1);
        assert(train88.value("onlineTanks").toInt() == 0); // No device assigned -> offline
        assert(train88.value("offlineTanks").toInt() == 1);
        std::cout << "  - Independent multi-train summary isolation: PASS" << std::endl;

        // Cleanup temporary train
        railway.deleteTrain(QStringLiteral("88888"));
        railway.setActiveTrainNumber(QStringLiteral("12301"));
        std::cout << "  - Train summary dynamic reactivity and cleanup: PASS" << std::endl;
    }

    std::cout << "\n=======================================================" << std::endl;
    std::cout << "  ALL ROLE & RAILWAY ARCHITECTURE TESTS PASSED (100%)" << std::endl;
    std::cout << "=======================================================" << std::endl;

    return 0;
}
