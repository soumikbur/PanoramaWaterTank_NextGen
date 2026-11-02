#include "DatabaseManager.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QSqlRecord>
#include <QStandardPaths>
#include <QDir>
#include <QDebug>
#include <QCryptographicHash>
#include <QUuid>
#include <QRegularExpression>

namespace Panorama {

DatabaseManager::DatabaseManager(QObject *parent)
    : QObject(parent)
{
}

DatabaseManager::~DatabaseManager()
{
    if (m_db.isOpen()) {
        m_db.close();
    }
}

bool DatabaseManager::initialize(const QString &dbPath)
{
    QString path = dbPath;
    if (path.isEmpty()) {
        const QString appData = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
        QDir().mkpath(appData);
        path = appData + QStringLiteral("/panorama_railway.db");
    }

    m_connectionName = QStringLiteral("PanoramaDbConnection");
    if (QSqlDatabase::contains(m_connectionName)) {
        m_db = QSqlDatabase::database(m_connectionName);
    } else {
        m_db = QSqlDatabase::addDatabase(QStringLiteral("QSQLITE"), m_connectionName);
    }

    m_db.setDatabaseName(path);

    if (!m_db.open()) {
        qCritical() << "DatabaseManager: failed to open SQLite database at" << path
                    << "Error:" << m_db.lastError().text();
        return false;
    }

    qInfo() << "DatabaseManager: SQLite database opened successfully at" << path;

    // Enable foreign keys
    QSqlQuery pragmaQuery(m_db);
    pragmaQuery.exec(QStringLiteral("PRAGMA foreign_keys = ON;"));

    if (!createTables()) {
        return false;
    }

    migrateData();
    seedInitialData();
    return true;
}

bool DatabaseManager::isOpen() const
{
    return m_db.isOpen();
}

bool DatabaseManager::createTables()
{
    QSqlQuery query(m_db);

    // 1. Trains table
    const QString createTrains = QStringLiteral(
        "CREATE TABLE IF NOT EXISTS trains ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  train_number TEXT UNIQUE NOT NULL,"
        "  train_name TEXT NOT NULL,"
        "  region TEXT NOT NULL,"
        "  location TEXT,"
        "  description TEXT,"
        "  status TEXT DEFAULT 'Online'"
        ");"
    );
    if (!query.exec(createTrains)) {
        qCritical() << "Failed to create trains table:" << query.lastError().text();
        return false;
    }

    // 2. Coaches table
    const QString createCoaches = QStringLiteral(
        "CREATE TABLE IF NOT EXISTS coaches ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  train_id INTEGER NOT NULL REFERENCES trains(id) ON DELETE CASCADE,"
        "  coach_number TEXT NOT NULL,"
        "  coach_type TEXT NOT NULL,"
        "  position INTEGER DEFAULT 1,"
        "  description TEXT,"
        "  UNIQUE(train_id, coach_number)"
        ");"
    );
    if (!query.exec(createCoaches)) {
        qCritical() << "Failed to create coaches table:" << query.lastError().text();
        return false;
    }

    // 3. Tanks table
    const QString createTanks = QStringLiteral(
        "CREATE TABLE IF NOT EXISTS tanks ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  coach_id INTEGER NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,"
        "  tank_number TEXT NOT NULL,"
        "  tank_name TEXT,"
        "  geometry_type TEXT DEFAULT 'Rectangular',"
        "  length_cm REAL DEFAULT 40.0,"
        "  width_cm REAL DEFAULT 30.0,"
        "  height_cm REAL DEFAULT 50.0,"
        "  diameter_cm REAL DEFAULT 30.0,"
        "  capacity_liters REAL DEFAULT 60.0,"
        "  max_height_cm REAL DEFAULT 50.0,"
        "  device_id TEXT DEFAULT '',"
        "  device_status TEXT DEFAULT 'NOT CONNECTED',"
        "  UNIQUE(coach_id, tank_number)"
        ");"
    );
    if (!query.exec(createTanks)) {
        qCritical() << "Failed to create tanks table:" << query.lastError().text();
        return false;
    }

    // 4. Users table
    const QString createUsers = QStringLiteral(
        "CREATE TABLE IF NOT EXISTS users ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  username TEXT UNIQUE NOT NULL,"
        "  password_hash TEXT NOT NULL,"
        "  salt TEXT NOT NULL,"
        "  role TEXT NOT NULL"
        ");"
    );
    if (!query.exec(createUsers)) {
        qCritical() << "Failed to create users table:" << query.lastError().text();
        return false;
    }

    // 5. System settings table
    const QString createSettings = QStringLiteral(
        "CREATE TABLE IF NOT EXISTS system_settings ("
        "  key TEXT PRIMARY KEY,"
        "  value TEXT"
        ");"
    );
    if (!query.exec(createSettings)) {
        qCritical() << "Failed to create system_settings table:" << query.lastError().text();
        return false;
    }

    // 6. Devices table
    const QString createDevices = QStringLiteral(
        "CREATE TABLE IF NOT EXISTS devices ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  device_id TEXT UNIQUE NOT NULL,"
        "  name TEXT NOT NULL,"
        "  device_type TEXT DEFAULT 'Quectel EC200U-CN LTE Cat-1',"
        "  connection_type TEXT DEFAULT 'LTE / Cellular',"
        "  status TEXT DEFAULT 'Offline',"
        "  location TEXT DEFAULT '',"
        "  train_number TEXT DEFAULT '',"
        "  coach_number TEXT DEFAULT '',"
        "  tank_number TEXT DEFAULT '',"
        "  sensor_type TEXT DEFAULT 'ADS1115 Differential (A0-A1)',"
        "  firmware_version TEXT DEFAULT 'v1.2.4',"
        "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ");"
    );
    if (!query.exec(createDevices)) {
        qCritical() << "Failed to create devices table:" << query.lastError().text();
        return false;
    }

    return true;
}

QString DatabaseManager::hashPassword(const QString &password, const QString &salt)
{
    QByteArray combined = salt.toUtf8() + password.toUtf8();
    return QString::fromUtf8(QCryptographicHash::hash(combined, QCryptographicHash::Sha256).toHex());
}

void DatabaseManager::migrateData()
{
    // Schema version check — Ensure migrations only run once and never wipe user-created coaches/tanks
    int currentVer = getSetting(QStringLiteral("schema_version"), QStringLiteral("0")).toInt();
    if (currentVer >= 9) {
        return;
    }

    // Migration 1: If old 12345 exists, migrate it to 12301 — Rajdhani Express — Eastern Railway
    QSqlQuery checkOld(m_db);
    checkOld.prepare(QStringLiteral("SELECT id FROM trains WHERE train_number = '12345';"));
    if (checkOld.exec() && checkOld.next()) {
        int oldTrainId = checkOld.value(0).toInt();
        int existing12301Id = getTrainId(QStringLiteral("12301"));
        if (existing12301Id > 0) {
            // Repoint coaches from 12345 to 12301, then delete obsolete 12345
            QSqlQuery repointCoaches(m_db);
            repointCoaches.prepare(QStringLiteral("UPDATE coaches SET train_id = :newId WHERE train_id = :oldId;"));
            repointCoaches.bindValue(QStringLiteral(":newId"), existing12301Id);
            repointCoaches.bindValue(QStringLiteral(":oldId"), oldTrainId);
            repointCoaches.exec();

            QSqlQuery delOld(m_db);
            delOld.prepare(QStringLiteral("DELETE FROM trains WHERE id = :oldId;"));
            delOld.bindValue(QStringLiteral(":oldId"), oldTrainId);
            delOld.exec();
        } else {
            // Rename 12345 to 12301 in-place
            QSqlQuery updateOld(m_db);
            updateOld.exec(QStringLiteral(
                "UPDATE trains SET train_number = '12301', train_name = 'Rajdhani Express', "
                "region = 'Eastern Railway', location = 'Howrah - New Delhi', status = 'Online' "
                "WHERE train_number = '12345';"
            ));
        }
        qInfo() << "DatabaseManager: Migrated obsolete train 12345 to canonical 12301 (Eastern Railway)";
    }

    // Migration 2: Ensure train 12301 is canonical Rajdhani Express in Eastern Railway
    QSqlQuery update12301(m_db);
    update12301.exec(QStringLiteral(
        "UPDATE trains SET train_name = 'Rajdhani Express', region = 'Eastern Railway', "
        "location = 'Howrah - New Delhi', status = 'Online' WHERE train_number = '12301';"
    ));

    // Migration 3: Ensure coach S1 and tank T01 exist under train 12301
    int train12301Id = getTrainId(QStringLiteral("12301"));
    if (train12301Id > 0) {
        int s1Id = 0;
        QSqlQuery cQuery(m_db);
        cQuery.prepare(QStringLiteral("SELECT id FROM coaches WHERE train_id = :tid AND coach_number = 'S1';"));
        cQuery.bindValue(QStringLiteral(":tid"), train12301Id);
        if (cQuery.exec() && cQuery.next()) {
            s1Id = cQuery.value(0).toInt();
        } else {
            // Check if coach A1 exists, rename to S1
            QSqlQuery renameA1(m_db);
            renameA1.prepare(QStringLiteral("UPDATE coaches SET coach_number = 'S1', coach_type = 'Sleeper Class' WHERE train_id = :tid AND coach_number = 'A1';"));
            renameA1.bindValue(QStringLiteral(":tid"), train12301Id);
            renameA1.exec();
            if (cQuery.exec() && cQuery.next()) {
                s1Id = cQuery.value(0).toInt();
            } else {
                addCoach(QStringLiteral("12301"), QStringLiteral("S1"), QStringLiteral("Sleeper Class"), 1, QStringLiteral("Front Coach"));
                if (cQuery.exec() && cQuery.next()) {
                    s1Id = cQuery.value(0).toInt();
                }
            }
        }

        if (s1Id > 0) {
            QSqlQuery checkT01(m_db);
            checkT01.prepare(QStringLiteral("SELECT id FROM tanks WHERE coach_id = :cid AND tank_number = 'T01';"));
            checkT01.bindValue(QStringLiteral(":cid"), s1Id);
            if (checkT01.exec() && !checkT01.next()) {
                QSqlQuery checkAnyTank(m_db);
                checkAnyTank.prepare(QStringLiteral("SELECT id FROM tanks WHERE coach_id = :cid LIMIT 1;"));
                checkAnyTank.bindValue(QStringLiteral(":cid"), s1Id);
                if (checkAnyTank.exec() && checkAnyTank.next()) {
                    int tid = checkAnyTank.value(0).toInt();
                    QSqlQuery renTank(m_db);
                    renTank.prepare(QStringLiteral("UPDATE tanks SET tank_number = 'T01', tank_name = 'Toilet Front', device_id = 'wli', device_status = 'Online' WHERE id = :tid;"));
                    renTank.bindValue(QStringLiteral(":tid"), tid);
                    renTank.exec();
                } else {
                    addTank(s1Id, QStringLiteral("T01"), QStringLiteral("Toilet Front"),
                            QStringLiteral("Rectangular"), 40.0, 30.0, 50.0, 0.0, 60.0, 50.0, QStringLiteral("wli"));
                }
            }
        }
    }

    // Migration 4: Ensure coach S1 -> Tank T01 is assigned to real hardware device 'wli'
    QSqlQuery assignWli(m_db);
    assignWli.exec(QStringLiteral(
        "UPDATE tanks SET device_id = 'wli', device_status = 'Online' "
        "WHERE tank_number = 'T01' AND coach_id IN ("
        "  SELECT c.id FROM coaches c "
        "  INNER JOIN trains t ON c.train_id = t.id "
        "  WHERE t.train_number = '12301' AND c.coach_number = 'S1'"
        ");"
    ));

    // Migration 5: Ensure other tanks on train 12301 have NO fabricated device assignments
    QSqlQuery clearOthers(m_db);
    clearOthers.exec(QStringLiteral(
        "UPDATE tanks SET device_id = '', device_status = 'NOT CONNECTED' "
        "WHERE coach_id IN ("
        "  SELECT c.id FROM coaches c "
        "  INNER JOIN trains t ON c.train_id = t.id "
        "  WHERE t.train_number = '12301'"
        ") AND id NOT IN ("
        "  SELECT tk.id FROM tanks tk "
        "  INNER JOIN coaches c ON tk.coach_id = c.id "
        "  INNER JOIN trains t ON c.train_id = t.id "
        "  WHERE t.train_number = '12301' AND c.coach_number = 'S1' AND tk.tank_number = 'T01'"
        ");"
    ));

    // Migration 6: Ensure users table has name and status columns
    QSqlQuery alterUsers1(m_db);
    alterUsers1.exec(QStringLiteral("ALTER TABLE users ADD COLUMN name TEXT DEFAULT '';"));
    QSqlQuery alterUsers2(m_db);
    alterUsers2.exec(QStringLiteral("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Active';"));

    // Migration 7: Ensure primary device 'wli' exists in devices table
    QSqlQuery checkWli(m_db);
    checkWli.exec(QStringLiteral("SELECT COUNT(*) FROM devices WHERE device_id = 'wli';"));
    if (checkWli.next() && checkWli.value(0).toInt() == 0) {
        QSqlQuery insWli(m_db);
        insWli.exec(QStringLiteral(
            "INSERT INTO devices (device_id, name, device_type, connection_type, status, location, train_number, coach_number, tank_number) "
            "VALUES ('wli', 'Water Level Sensor 01', 'Quectel EC200U-CN LTE Cat-1', 'LTE / Cellular', 'Online', 'Rajdhani Express - Coach 01 - Tank T01', '12301', '01', 'T01');"
        ));
    }

    // Migration 8: Enforce 24-coach consist architecture & clean up extra test trains/coaches (Requirements 35 & 36)
    // East -> Rajdhani Express (12301) -> Coach 01 -> T01 (wli)
    // Coach 02-24: available positions, NOT fake populated coaches.
    // North, South, West: No trains assigned.
    QSqlQuery cleanTrains(m_db);
    cleanTrains.exec(QStringLiteral(
        "DELETE FROM tanks WHERE coach_id IN (SELECT id FROM coaches WHERE train_id IN (SELECT id FROM trains WHERE train_number != '12301'));"
    ));
    cleanTrains.exec(QStringLiteral(
        "DELETE FROM coaches WHERE train_id IN (SELECT id FROM trains WHERE train_number != '12301');"
    ));
    cleanTrains.exec(QStringLiteral(
        "DELETE FROM trains WHERE train_number != '12301';"
    ));

    int rajTrainId = getTrainId(QStringLiteral("12301"));
    if (rajTrainId > 0) {
        // Ensure Coach 01 exists with coach_number '01' and position 1
        QSqlQuery c1Q(m_db);
        c1Q.prepare(QStringLiteral("SELECT id FROM coaches WHERE train_id = :tid AND (position = 1 OR coach_number = 'S1' OR coach_number = '01' OR coach_number = '1');"));
        c1Q.bindValue(QStringLiteral(":tid"), rajTrainId);
        int c1Id = 0;
        if (c1Q.exec() && c1Q.next()) {
            c1Id = c1Q.value(0).toInt();
            QSqlQuery updC1(m_db);
            updC1.prepare(QStringLiteral("UPDATE coaches SET coach_number = '01', position = 1, coach_type = 'Sleeper Class' WHERE id = :id;"));
            updC1.bindValue(QStringLiteral(":id"), c1Id);
            updC1.exec();
        } else {
            addCoach(QStringLiteral("12301"), QStringLiteral("01"), QStringLiteral("Sleeper Class"), 1, QStringLiteral("Front Coach"));
            c1Q.exec();
            if (c1Q.next()) c1Id = c1Q.value(0).toInt();
        }

        if (c1Id > 0) {
            // Remove any extra test coaches (S2, S3, etc.) so Coach 02-24 remain unassigned slots
            QSqlQuery delExtraTanks(m_db);
            delExtraTanks.prepare(QStringLiteral("DELETE FROM tanks WHERE coach_id != :c1id AND coach_id IN (SELECT id FROM coaches WHERE train_id = :tid);"));
            delExtraTanks.bindValue(QStringLiteral(":c1id"), c1Id);
            delExtraTanks.bindValue(QStringLiteral(":tid"), rajTrainId);
            delExtraTanks.exec();

            QSqlQuery delExtraCoaches(m_db);
            delExtraCoaches.prepare(QStringLiteral("DELETE FROM coaches WHERE id != :c1id AND train_id = :tid;"));
            delExtraCoaches.bindValue(QStringLiteral(":c1id"), c1Id);
            delExtraCoaches.bindValue(QStringLiteral(":tid"), rajTrainId);
            delExtraCoaches.exec();

            // In Coach 01: keep only T01 with device 'wli', remove extra unused tanks like T02
            QSqlQuery delExtraTanksC1(m_db);
            delExtraTanksC1.prepare(QStringLiteral("DELETE FROM tanks WHERE coach_id = :c1id AND tank_number != 'T01';"));
            delExtraTanksC1.bindValue(QStringLiteral(":c1id"), c1Id);
            delExtraTanksC1.exec();

            // Ensure T01 exists in Coach 01
            QSqlQuery checkT01(m_db);
            checkT01.prepare(QStringLiteral("SELECT id FROM tanks WHERE coach_id = :c1id AND tank_number = 'T01';"));
            checkT01.bindValue(QStringLiteral(":c1id"), c1Id);
            if (checkT01.exec() && !checkT01.next()) {
                addTank(c1Id, QStringLiteral("T01"), QStringLiteral("Toilet Front"),
                        QStringLiteral("Rectangular"), 40.0, 30.0, 50.0, 0.0, 60.0, 50.0, QStringLiteral("wli"));
            } else {
                QSqlQuery updT01(m_db);
                updT01.prepare(QStringLiteral("UPDATE tanks SET device_id = 'wli', device_status = 'Online' WHERE coach_id = :c1id AND tank_number = 'T01';"));
                updT01.bindValue(QStringLiteral(":c1id"), c1Id);
                updT01.exec();
            }

            // Update device 'wli' table record
            QSqlQuery updDevWli(m_db);
            updDevWli.exec(QStringLiteral(
                "UPDATE devices SET train_number = '12301', coach_number = '01', tank_number = 'T01', "
                "location = 'Rajdhani Express - Coach 01 - Tank T01', status = 'Online' WHERE device_id = 'wli';"
            ));
        }
    }

    // Migration 9: Canonical Real ESP Device Mapping
    // Hierarchy: Eastern Railway -> 12301 Rajdhani Express -> Coach S1 -> Tank T01 -> Device wli
    // Tank T01 Geometry: Cylindrical, Height: 50 cm, Diameter: 22.5676 cm, Capacity: 20 L
    int canonical12301Id = getTrainId(QStringLiteral("12301"));
    if (canonical12301Id > 0) {
        // 1. Locate or rename the primary coach to 'S1'
        int s1CoachId = 0;
        QSqlQuery s1Search(m_db);
        s1Search.prepare(QStringLiteral(
            "SELECT id FROM coaches WHERE train_id = :tid AND (coach_number = 'S1' OR coach_number = '01' OR coach_number = '1' OR coach_number = 'A1' OR position = 1) ORDER BY position LIMIT 1;"
        ));
        s1Search.bindValue(QStringLiteral(":tid"), canonical12301Id);
        if (s1Search.exec() && s1Search.next()) {
            s1CoachId = s1Search.value(0).toInt();
            QSqlQuery renCoach(m_db);
            renCoach.prepare(QStringLiteral(
                "UPDATE coaches SET coach_number = 'S1', coach_type = 'Sleeper Class', position = 1, description = 'Front Coach' WHERE id = :id;"
            ));
            renCoach.bindValue(QStringLiteral(":id"), s1CoachId);
            renCoach.exec();
        } else {
            addCoach(QStringLiteral("12301"), QStringLiteral("S1"), QStringLiteral("Sleeper Class"), 1, QStringLiteral("Front Coach"));
            QSqlQuery q(m_db);
            q.prepare(QStringLiteral("SELECT id FROM coaches WHERE train_id = :tid AND coach_number = 'S1';"));
            q.bindValue(QStringLiteral(":tid"), canonical12301Id);
            if (q.exec() && q.next()) s1CoachId = q.value(0).toInt();
        }

        if (s1CoachId > 0) {
            // Remove any extra test coaches/tanks that might have old associations
            QSqlQuery delExtra(m_db);
            delExtra.prepare(QStringLiteral("DELETE FROM tanks WHERE coach_id != :s1id AND coach_id IN (SELECT id FROM coaches WHERE train_id = :tid);"));
            delExtra.bindValue(QStringLiteral(":s1id"), s1CoachId);
            delExtra.bindValue(QStringLiteral(":tid"), canonical12301Id);
            delExtra.exec();

            QSqlQuery delExtraCoaches(m_db);
            delExtraCoaches.prepare(QStringLiteral("DELETE FROM coaches WHERE id != :s1id AND train_id = :tid;"));
            delExtraCoaches.bindValue(QStringLiteral(":s1id"), s1CoachId);
            delExtraCoaches.bindValue(QStringLiteral(":tid"), canonical12301Id);
            delExtraCoaches.exec();

            // 2. Ensure Tank T01 is Cylindrical, 20 L, 50 cm height, 22.5676 cm diameter, assigned to 'wli'
            QSqlQuery t01Check(m_db);
            t01Check.prepare(QStringLiteral("SELECT id FROM tanks WHERE coach_id = :cid AND tank_number = 'T01';"));
            t01Check.bindValue(QStringLiteral(":cid"), s1CoachId);
            if (t01Check.exec() && t01Check.next()) {
                int t01Id = t01Check.value(0).toInt();
                QSqlQuery updT(m_db);
                updT.prepare(QStringLiteral(
                    "UPDATE tanks SET tank_name = 'Toilet Front', geometry_type = 'Cylindrical', "
                    "length_cm = 0.0, width_cm = 0.0, height_cm = 50.0, diameter_cm = 22.5676, "
                    "capacity_liters = 20.0, max_height_cm = 50.0, device_id = 'wli', device_status = 'Online' "
                    "WHERE id = :tid;"
                ));
                updT.bindValue(QStringLiteral(":tid"), t01Id);
                updT.exec();
            } else {
                addTank(s1CoachId, QStringLiteral("T01"), QStringLiteral("Toilet Front"),
                        QStringLiteral("Cylindrical"), 0.0, 0.0, 50.0, 22.5676, 20.0, 50.0, QStringLiteral("wli"));
            }

            // Remove any extra tanks in S1 (like T02, T03) so only T01 is the active physical test tank
            QSqlQuery delExtraTanks(m_db);
            delExtraTanks.prepare(QStringLiteral("DELETE FROM tanks WHERE coach_id = :cid AND tank_number != 'T01';"));
            delExtraTanks.bindValue(QStringLiteral(":cid"), s1CoachId);
            delExtraTanks.exec();
        }

        // 3. Update devices table for 'wli'
        QSqlQuery updDev(m_db);
        updDev.exec(QStringLiteral(
            "UPDATE devices SET train_number = '12301', coach_number = 'S1', tank_number = 'T01', "
            "location = 'Rajdhani Express - Coach S1 - Tank T01', status = 'Online' "
            "WHERE device_id = 'wli';"
        ));
    }

    setSetting(QStringLiteral("schema_version"), QStringLiteral("9"));
}

void DatabaseManager::seedInitialData()
{
    QSqlQuery query(m_db);

    // Seed default employee user if no users exist
    query.exec(QStringLiteral("SELECT COUNT(*) FROM users;"));
    if (query.next() && query.value(0).toInt() == 0) {
        const QString salt = QStringLiteral("panorama_user_salt_2026");
        const QString hash = hashPassword(QStringLiteral("panorama123"), salt);

        QSqlQuery insertUser(m_db);
        insertUser.prepare(QStringLiteral(
            "INSERT INTO users (username, password_hash, salt, role) "
            "VALUES (:username, :hash, :salt, :role);"
        ));
        insertUser.bindValue(QStringLiteral(":username"), QStringLiteral("employee"));
        insertUser.bindValue(QStringLiteral(":hash"), hash);
        insertUser.bindValue(QStringLiteral(":salt"), salt);
        insertUser.bindValue(QStringLiteral(":role"), QStringLiteral("User"));
        insertUser.exec();
        qInfo() << "DatabaseManager: Seeded default employee user account";
    }

    // Seed default trains if no trains exist
    query.exec(QStringLiteral("SELECT COUNT(*) FROM trains;"));
    if (query.next() && query.value(0).toInt() == 0) {
        // Train 1: 12301 Eastern Railway — Canonical Rajdhani Express
        addTrain(QStringLiteral("12301"), QStringLiteral("Rajdhani Express"),
                 QStringLiteral("Eastern Railway"), QStringLiteral("Superfast Express"),
                 QStringLiteral("Howrah - New Delhi"), QStringLiteral("Online"));

        addCoach(QStringLiteral("12301"), QStringLiteral("S1"), QStringLiteral("Sleeper Class"), 1, QStringLiteral("Front Coach"));

        // Fetch coach IDs
        int train1Id = getTrainId(QStringLiteral("12301"));
        int s1Id = 0;
        if (train1Id > 0) {
            QSqlQuery cQuery(m_db);
            cQuery.prepare(QStringLiteral("SELECT id FROM coaches WHERE train_id = :tid AND coach_number = 'S1';"));
            cQuery.bindValue(QStringLiteral(":tid"), train1Id);
            if (cQuery.exec() && cQuery.next()) {
                s1Id = cQuery.value(0).toInt();
            }
        }

        if (s1Id > 0) {
            // Coach S1: Tank T01 has the current physical device 'wli' (20 L Cylindrical)
            addTank(s1Id, QStringLiteral("T01"), QStringLiteral("Toilet Front"),
                    QStringLiteral("Cylindrical"), 0.0, 0.0, 50.0, 22.5676, 20.0, 50.0, QStringLiteral("wli"));
        }

        // Train 2: 12346 Eastern Railway
        addTrain(QStringLiteral("12346"), QStringLiteral("Express"),
                 QStringLiteral("Eastern Railway"), QStringLiteral("Intercity Express"),
                 QStringLiteral("Howrah - Patna"), QStringLiteral("Offline"));

        addCoach(QStringLiteral("12346"), QStringLiteral("B1"), QStringLiteral("AC 3-Tier"), 1, QStringLiteral("Executive"));
        int train2Id = getTrainId(QStringLiteral("12346"));
        if (train2Id > 0) {
            QSqlQuery bQuery(m_db);
            bQuery.prepare(QStringLiteral("SELECT id FROM coaches WHERE train_id = :tid;"));
            bQuery.bindValue(QStringLiteral(":tid"), train2Id);
            if (bQuery.exec() && bQuery.next()) {
                int b1Id = bQuery.value(0).toInt();
                addTank(b1Id, QStringLiteral("T01"), QStringLiteral("Galley Tank"),
                        QStringLiteral("Rectangular"), 40.0, 30.0, 50.0, 0.0, 60.0, 50.0, QString());
            }
        }

        qInfo() << "DatabaseManager: Seeded initial canonical trains, coaches, and tanks";
    }
}

// ----------------------------------------------------------------------------
// Trains CRUD
// ----------------------------------------------------------------------------

QVariantList DatabaseManager::getAllTrains()
{
    QVariantList list;
    QSqlQuery query(m_db);
    query.exec(QStringLiteral("SELECT id, train_number, train_name, region, location, description, status FROM trains ORDER BY train_number;"));

    while (query.next()) {
        QVariantMap map;
        const QString tNum = query.value(1).toString();
        map[QStringLiteral("id")] = query.value(0).toInt();
        map[QStringLiteral("trainNumber")] = tNum;
        map[QStringLiteral("trainName")] = query.value(2).toString();
        map[QStringLiteral("region")] = query.value(3).toString();
        map[QStringLiteral("location")] = query.value(4).toString();
        map[QStringLiteral("description")] = query.value(5).toString();
        map[QStringLiteral("status")] = query.value(6).toString();
        map[QStringLiteral("coachCount")] = getTrainCoachCount(tNum);
        map[QStringLiteral("tankCount")] = getTrainTankCount(tNum);
        list.append(map);
    }
    return list;
}

QVariantList DatabaseManager::getRegions()
{
    QVariantList list;

    struct RegionDef {
        QString displayName;
        QString fullName;
        QString id;
        QString keyword;
    };
    const QList<RegionDef> canonical = {
        { QStringLiteral("North"), QStringLiteral("Northern Region"), QStringLiteral("nr"), QStringLiteral("north") },
        { QStringLiteral("South"), QStringLiteral("Southern Region"), QStringLiteral("sr"), QStringLiteral("south") },
        { QStringLiteral("East"),  QStringLiteral("Eastern Railway"), QStringLiteral("er"), QStringLiteral("east") },
        { QStringLiteral("West"),  QStringLiteral("Western Region"),  QStringLiteral("wr"), QStringLiteral("west") }
    };

    for (const auto &r : canonical) {
        QVariantMap map;
        map[QStringLiteral("region")] = r.displayName;
        map[QStringLiteral("regionName")] = r.fullName;
        map[QStringLiteral("regionId")] = r.id;

        const QString likeKey = QStringLiteral("%%1%").arg(r.keyword);

        // Query trains in this region
        QSqlQuery tQuery(m_db);
        tQuery.prepare(QStringLiteral("SELECT COUNT(*), SUM(CASE WHEN LOWER(status)='online' THEN 1 ELSE 0 END) FROM trains WHERE LOWER(region) LIKE :likeKey;"));
        tQuery.bindValue(QStringLiteral(":likeKey"), likeKey);
        int trainCount = 0;
        int onlineTrains = 0;
        if (tQuery.exec() && tQuery.next()) {
            trainCount = tQuery.value(0).toInt();
            onlineTrains = tQuery.value(1).toInt();
        }
        map[QStringLiteral("trainCount")] = trainCount;
        map[QStringLiteral("onlineTrains")] = onlineTrains;
        map[QStringLiteral("offlineTrains")] = trainCount - onlineTrains;

        // Query total coaches for this region
        QSqlQuery cQuery(m_db);
        cQuery.prepare(QStringLiteral(
            "SELECT COUNT(c.id) FROM coaches c "
            "INNER JOIN trains t ON c.train_id = t.id "
            "WHERE LOWER(t.region) LIKE :likeKey;"
        ));
        cQuery.bindValue(QStringLiteral(":likeKey"), likeKey);
        int coachCount = 0;
        if (cQuery.exec() && cQuery.next()) {
            coachCount = cQuery.value(0).toInt();
        }
        map[QStringLiteral("coachCount")] = coachCount;

        // Query total tanks and health for this region
        QSqlQuery tkQuery(m_db);
        tkQuery.prepare(QStringLiteral(
            "SELECT COUNT(tk.id), "
            "SUM(CASE WHEN tk.device_id IS NOT NULL AND TRIM(tk.device_id) != '' AND LOWER(tk.device_status) = 'online' THEN 1 ELSE 0 END), "
            "SUM(CASE WHEN tk.device_id IS NOT NULL AND TRIM(tk.device_id) != '' AND LOWER(tk.device_status) = 'warning' THEN 1 ELSE 0 END), "
            "SUM(CASE WHEN tk.device_id IS NOT NULL AND TRIM(tk.device_id) != '' AND LOWER(tk.device_status) = 'critical' THEN 1 ELSE 0 END) "
            "FROM tanks tk "
            "INNER JOIN coaches c ON tk.coach_id = c.id "
            "INNER JOIN trains t ON c.train_id = t.id "
            "WHERE LOWER(t.region) LIKE :likeKey;"
        ));
        tkQuery.bindValue(QStringLiteral(":likeKey"), likeKey);
        int tankCount = 0;
        int onlineTanks = 0;
        int warningTanks = 0;
        int criticalTanks = 0;
        if (tkQuery.exec() && tkQuery.next()) {
            tankCount = tkQuery.value(0).toInt();
            onlineTanks = tkQuery.value(1).toInt();
            warningTanks = tkQuery.value(2).toInt();
            criticalTanks = tkQuery.value(3).toInt();
        }
        map[QStringLiteral("tankCount")] = tankCount;
        map[QStringLiteral("onlineTanks")] = onlineTanks;
        map[QStringLiteral("offlineTanks")] = tankCount - onlineTanks;
        map[QStringLiteral("warningTanks")] = warningTanks;
        map[QStringLiteral("criticalTanks")] = criticalTanks;

        list.append(map);
    }
    return list;
}

QVariantList DatabaseManager::getTrainsByRegion(const QString &region)
{
    QVariantList list;
    const QString rLower = region.trimmed().toLower();
    if (rLower.isEmpty()) return list;

    QString searchKeyword = rLower;
    if (rLower.startsWith(QStringLiteral("east"))) searchKeyword = QStringLiteral("east");
    else if (rLower.startsWith(QStringLiteral("north"))) searchKeyword = QStringLiteral("north");
    else if (rLower.startsWith(QStringLiteral("south"))) searchKeyword = QStringLiteral("south");
    else if (rLower.startsWith(QStringLiteral("west"))) searchKeyword = QStringLiteral("west");

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "SELECT id, train_number, train_name, region, location, description, status FROM trains "
        "WHERE LOWER(region) = :reg OR LOWER(region) LIKE :likeKey ORDER BY train_number;"
    ));
    query.bindValue(QStringLiteral(":reg"), rLower);
    query.bindValue(QStringLiteral(":likeKey"), QStringLiteral("%%1%").arg(searchKeyword));

    if (query.exec()) {
        while (query.next()) {
            QVariantMap map;
            const QString tNum = query.value(1).toString();
            map[QStringLiteral("id")] = query.value(0).toInt();
            map[QStringLiteral("trainNumber")] = tNum;
            map[QStringLiteral("trainName")] = query.value(2).toString();
            map[QStringLiteral("region")] = query.value(3).toString();
            map[QStringLiteral("location")] = query.value(4).toString();
            map[QStringLiteral("description")] = query.value(5).toString();
            map[QStringLiteral("status")] = query.value(6).toString();
            map[QStringLiteral("coachCount")] = getTrainCoachCount(tNum);
            map[QStringLiteral("tankCount")] = getTrainTankCount(tNum);

            int tId = query.value(0).toInt();
            QSqlQuery statsQ(m_db);
            statsQ.prepare(QStringLiteral(
                "SELECT "
                "SUM(CASE WHEN tk.device_id IS NOT NULL AND TRIM(tk.device_id) != '' AND LOWER(tk.device_status) = 'online' THEN 1 ELSE 0 END), "
                "SUM(CASE WHEN tk.device_id IS NOT NULL AND TRIM(tk.device_id) != '' AND LOWER(tk.device_status) = 'warning' THEN 1 ELSE 0 END), "
                "SUM(CASE WHEN tk.device_id IS NOT NULL AND TRIM(tk.device_id) != '' AND LOWER(tk.device_status) = 'critical' THEN 1 ELSE 0 END) "
                "FROM tanks tk "
                "INNER JOIN coaches c ON tk.coach_id = c.id "
                "WHERE c.train_id = :tid;"
            ));
            statsQ.bindValue(QStringLiteral(":tid"), tId);
            int onlineTanks = 0, warningTanks = 0, criticalTanks = 0;
            if (statsQ.exec() && statsQ.next()) {
                onlineTanks = statsQ.value(0).toInt();
                warningTanks = statsQ.value(1).toInt();
                criticalTanks = statsQ.value(2).toInt();
            }
            int totalT = map[QStringLiteral("tankCount")].toInt();
            map[QStringLiteral("onlineTanks")] = onlineTanks;
            map[QStringLiteral("offlineTanks")] = totalT - onlineTanks;
            map[QStringLiteral("warningTanks")] = warningTanks;
            map[QStringLiteral("criticalTanks")] = criticalTanks;

            list.append(map);
        }
    }
    return list;
}

QVariantMap DatabaseManager::getTrainByNumber(const QString &trainNumber)
{
    QVariantMap map;
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT id, train_number, train_name, region, location, description, status FROM trains WHERE train_number = :num;"));
    query.bindValue(QStringLiteral(":num"), trainNumber);

    if (query.exec() && query.next()) {
        int tId = query.value(0).toInt();
        map[QStringLiteral("id")] = tId;
        map[QStringLiteral("trainNumber")] = query.value(1).toString();
        map[QStringLiteral("trainName")] = query.value(2).toString();
        map[QStringLiteral("region")] = query.value(3).toString();
        map[QStringLiteral("location")] = query.value(4).toString();
        map[QStringLiteral("description")] = query.value(5).toString();
        map[QStringLiteral("status")] = query.value(6).toString();
        map[QStringLiteral("coachCount")] = getTrainCoachCount(trainNumber);
        map[QStringLiteral("tankCount")] = getTrainTankCount(trainNumber);

        QSqlQuery statsQ(m_db);
        statsQ.prepare(QStringLiteral(
            "SELECT "
            "SUM(CASE WHEN tk.device_id IS NOT NULL AND TRIM(tk.device_id) != '' AND LOWER(tk.device_status) = 'online' THEN 1 ELSE 0 END), "
            "SUM(CASE WHEN tk.device_id IS NOT NULL AND TRIM(tk.device_id) != '' AND LOWER(tk.device_status) = 'warning' THEN 1 ELSE 0 END), "
            "SUM(CASE WHEN tk.device_id IS NOT NULL AND TRIM(tk.device_id) != '' AND LOWER(tk.device_status) = 'critical' THEN 1 ELSE 0 END) "
            "FROM tanks tk "
            "INNER JOIN coaches c ON tk.coach_id = c.id "
            "WHERE c.train_id = :tid;"
        ));
        statsQ.bindValue(QStringLiteral(":tid"), tId);
        int onlineTanks = 0, warningTanks = 0, criticalTanks = 0;
        if (statsQ.exec() && statsQ.next()) {
            onlineTanks = statsQ.value(0).toInt();
            warningTanks = statsQ.value(1).toInt();
            criticalTanks = statsQ.value(2).toInt();
        }
        int totalT = map[QStringLiteral("tankCount")].toInt();
        map[QStringLiteral("onlineTanks")] = onlineTanks;
        map[QStringLiteral("offlineTanks")] = totalT - onlineTanks;
        map[QStringLiteral("warningTanks")] = warningTanks;
        map[QStringLiteral("criticalTanks")] = criticalTanks;
    }
    return map;
}

int DatabaseManager::getTrainId(const QString &trainNumber)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT id FROM trains WHERE train_number = :num;"));
    query.bindValue(QStringLiteral(":num"), trainNumber);
    if (query.exec() && query.next()) {
        return query.value(0).toInt();
    }
    return -1;
}

bool DatabaseManager::addTrain(const QString &trainNumber, const QString &trainName,
                               const QString &region, const QString &description,
                               const QString &location, const QString &status)
{
    if (trainNumber.trimmed().isEmpty() || trainName.trimmed().isEmpty() || region.trimmed().isEmpty()) {
        return false;
    }

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "INSERT INTO trains (train_number, train_name, region, description, location, status) "
        "VALUES (:num, :name, :reg, :desc, :loc, :stat);"
    ));
    query.bindValue(QStringLiteral(":num"), trainNumber.trimmed());
    query.bindValue(QStringLiteral(":name"), trainName.trimmed());
    query.bindValue(QStringLiteral(":reg"), region.trimmed());
    query.bindValue(QStringLiteral(":desc"), description.trimmed());
    query.bindValue(QStringLiteral(":loc"), location.trimmed());
    query.bindValue(QStringLiteral(":stat"), status.trimmed());

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

bool DatabaseManager::updateTrain(const QString &trainNumber, const QString &trainName,
                                  const QString &region, const QString &description,
                                  const QString &location, const QString &status)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "UPDATE trains SET train_name = :name, region = :reg, description = :desc, "
        "location = :loc, status = :stat WHERE train_number = :num;"
    ));
    query.bindValue(QStringLiteral(":name"), trainName.trimmed());
    query.bindValue(QStringLiteral(":reg"), region.trimmed());
    query.bindValue(QStringLiteral(":desc"), description.trimmed());
    query.bindValue(QStringLiteral(":loc"), location.trimmed());
    query.bindValue(QStringLiteral(":stat"), status.trimmed());
    query.bindValue(QStringLiteral(":num"), trainNumber.trimmed());

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

bool DatabaseManager::deleteTrain(const QString &trainNumber)
{
    int tid = getTrainId(trainNumber);
    if (tid < 0) return false;

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("DELETE FROM trains WHERE id = :id;"));
    query.bindValue(QStringLiteral(":id"), tid);

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

int DatabaseManager::getTrainCoachCount(const QString &trainNumber)
{
    int tid = getTrainId(trainNumber);
    if (tid < 0) return 0;

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT COUNT(*) FROM coaches WHERE train_id = :tid;"));
    query.bindValue(QStringLiteral(":tid"), tid);
    if (query.exec() && query.next()) {
        return query.value(0).toInt();
    }
    return 0;
}

int DatabaseManager::getTrainTankCount(const QString &trainNumber)
{
    int tid = getTrainId(trainNumber);
    if (tid < 0) return 0;

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "SELECT COUNT(*) FROM tanks "
        "INNER JOIN coaches ON tanks.coach_id = coaches.id "
        "WHERE coaches.train_id = :tid;"
    ));
    query.bindValue(QStringLiteral(":tid"), tid);
    if (query.exec() && query.next()) {
        return query.value(0).toInt();
    }
    return 0;
}

// ----------------------------------------------------------------------------
// Coaches CRUD
// ----------------------------------------------------------------------------

QVariantList DatabaseManager::getCoachesForTrain(const QString &trainNumber)
{
    QVariantList list;
    int tid = getTrainId(trainNumber);
    if (tid < 0) return list;

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "SELECT id, coach_number, coach_type, position, description "
        "FROM coaches WHERE train_id = :tid ORDER BY position, coach_number;"
    ));
    query.bindValue(QStringLiteral(":tid"), tid);

    if (query.exec()) {
        while (query.next()) {
            QVariantMap map;
            int cid = query.value(0).toInt();
            map[QStringLiteral("id")] = cid;
            map[QStringLiteral("coachId")] = cid;
            map[QStringLiteral("trainNumber")] = trainNumber;
            map[QStringLiteral("coachNumber")] = query.value(1).toString();
            map[QStringLiteral("coachType")] = query.value(2).toString();
            map[QStringLiteral("position")] = query.value(3).toInt();
            map[QStringLiteral("description")] = query.value(4).toString();

            // Count tanks and health in this coach
            QSqlQuery tQuery(m_db);
            tQuery.prepare(QStringLiteral(
                "SELECT COUNT(*), "
                "SUM(CASE WHEN device_id IS NOT NULL AND TRIM(device_id) != '' AND LOWER(device_status) = 'online' THEN 1 ELSE 0 END), "
                "SUM(CASE WHEN device_id IS NOT NULL AND TRIM(device_id) != '' AND (LOWER(device_status) = 'warning' OR LOWER(device_status) = 'critical') THEN 1 ELSE 0 END) "
                "FROM tanks WHERE coach_id = :cid;"
            ));
            tQuery.bindValue(QStringLiteral(":cid"), cid);
            int tankCount = 0, onlineCount = 0, alertCount = 0;
            if (tQuery.exec() && tQuery.next()) {
                tankCount = tQuery.value(0).toInt();
                onlineCount = tQuery.value(1).toInt();
                alertCount = tQuery.value(2).toInt();
            }
            map[QStringLiteral("tankCount")] = tankCount;
            map[QStringLiteral("onlineCount")] = onlineCount;
            map[QStringLiteral("offlineCount")] = tankCount - onlineCount;
            map[QStringLiteral("alertCount")] = alertCount;

            list.append(map);
        }
    }
    return list;
}

QVariantMap DatabaseManager::getCoach(int coachId)
{
    QVariantMap map;
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "SELECT c.id, c.coach_number, c.coach_type, c.position, c.description, t.train_number, t.train_name, t.region "
        "FROM coaches c INNER JOIN trains t ON c.train_id = t.id WHERE c.id = :id;"
    ));
    query.bindValue(QStringLiteral(":id"), coachId);

    if (query.exec() && query.next()) {
        map[QStringLiteral("id")] = query.value(0).toInt();
        map[QStringLiteral("coachId")] = query.value(0).toInt();
        map[QStringLiteral("coachNumber")] = query.value(1).toString();
        map[QStringLiteral("coachType")] = query.value(2).toString();
        map[QStringLiteral("position")] = query.value(3).toInt();
        map[QStringLiteral("description")] = query.value(4).toString();
        map[QStringLiteral("trainNumber")] = query.value(5).toString();
        map[QStringLiteral("trainName")] = query.value(6).toString();
        map[QStringLiteral("region")] = query.value(7).toString();
    }
    return map;
}

bool DatabaseManager::addCoach(const QString &trainNumber, const QString &coachNumber,
                               const QString &coachType, int position,
                               const QString &description)
{
    // Enforce maximum 24 coaches limit (Requirement 33)
    if (position < 1 || position > 24) {
        qWarning() << "DatabaseManager::addCoach: Position" << position << "out of valid range 01-24";
        return false;
    }

    const QString cleanNum = coachNumber.trimmed();
    if (cleanNum.isEmpty()) return false;

    // Check if numeric value in coach number exceeds 24 (e.g. "25", "Coach 25")
    QRegularExpression numRe(QStringLiteral("(\\d+)"));
    auto m = numRe.match(cleanNum);
    if (m.hasMatch() && m.captured(1).toInt() > 24) {
        qWarning() << "DatabaseManager::addCoach: Coach number" << m.captured(1) << "exceeds maximum 24";
        return false;
    }

    int tid = getTrainId(trainNumber);
    if (tid < 0) return false;

    // Total coaches per train cannot exceed 24
    QSqlQuery cntQ(m_db);
    cntQ.prepare(QStringLiteral("SELECT COUNT(*) FROM coaches WHERE train_id = :tid;"));
    cntQ.bindValue(QStringLiteral(":tid"), tid);
    if (cntQ.exec() && cntQ.next() && cntQ.value(0).toInt() >= 24) {
        qWarning() << "DatabaseManager::addCoach: Train" << trainNumber << "already has maximum 24 coaches";
        return false;
    }

    // Position must be unique in this train
    QSqlQuery posQ(m_db);
    posQ.prepare(QStringLiteral("SELECT id FROM coaches WHERE train_id = :tid AND position = :pos;"));
    posQ.bindValue(QStringLiteral(":tid"), tid);
    posQ.bindValue(QStringLiteral(":pos"), position);
    if (posQ.exec() && posQ.next()) {
        qWarning() << "DatabaseManager::addCoach: Position" << position << "already occupied on train" << trainNumber;
        return false;
    }

    // Two-digit formatting for numeric coach numbers
    QString formattedNum = cleanNum;
    if (m.hasMatch() && cleanNum.length() <= 2) {
        formattedNum = QString::asprintf("%02d", m.captured(1).toInt());
    }

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "INSERT INTO coaches (train_id, coach_number, coach_type, position, description) "
        "VALUES (:tid, :num, :type, :pos, :desc);"
    ));
    query.bindValue(QStringLiteral(":tid"), tid);
    query.bindValue(QStringLiteral(":num"), formattedNum);
    query.bindValue(QStringLiteral(":type"), coachType.trimmed().isEmpty() ? QStringLiteral("General") : coachType.trimmed());
    query.bindValue(QStringLiteral(":pos"), position);
    query.bindValue(QStringLiteral(":desc"), description.trimmed());

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

bool DatabaseManager::updateCoach(int coachId, const QString &coachNumber,
                                  const QString &coachType, int position,
                                  const QString &description)
{
    // Enforce maximum 24 coaches limit (Requirement 33)
    if (position < 1 || position > 24) {
        qWarning() << "DatabaseManager::updateCoach: Position" << position << "out of valid range 01-24";
        return false;
    }

    const QString cleanNum = coachNumber.trimmed();
    if (cleanNum.isEmpty()) return false;

    QRegularExpression numRe(QStringLiteral("(\\d+)"));
    auto m = numRe.match(cleanNum);
    if (m.hasMatch() && m.captured(1).toInt() > 24) {
        qWarning() << "DatabaseManager::updateCoach: Coach number" << m.captured(1) << "exceeds maximum 24";
        return false;
    }

    // Check position conflict with other coaches on the same train
    QSqlQuery conflictQ(m_db);
    conflictQ.prepare(QStringLiteral(
        "SELECT id FROM coaches WHERE train_id = (SELECT train_id FROM coaches WHERE id = :id) "
        "AND position = :pos AND id != :id;"
    ));
    conflictQ.bindValue(QStringLiteral(":id"), coachId);
    conflictQ.bindValue(QStringLiteral(":pos"), position);
    if (conflictQ.exec() && conflictQ.next()) {
        qWarning() << "DatabaseManager::updateCoach: Position" << position << "already occupied by another coach";
        return false;
    }

    QString formattedNum = cleanNum;
    if (m.hasMatch() && cleanNum.length() <= 2) {
        formattedNum = QString::asprintf("%02d", m.captured(1).toInt());
    }

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "UPDATE coaches SET coach_number = :num, coach_type = :type, "
        "position = :pos, description = :desc WHERE id = :id;"
    ));
    query.bindValue(QStringLiteral(":num"), formattedNum);
    query.bindValue(QStringLiteral(":type"), coachType.trimmed());
    query.bindValue(QStringLiteral(":pos"), position);
    query.bindValue(QStringLiteral(":desc"), description.trimmed());
    query.bindValue(QStringLiteral(":id"), coachId);

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

bool DatabaseManager::deleteCoach(int coachId)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("DELETE FROM coaches WHERE id = :id;"));
    query.bindValue(QStringLiteral(":id"), coachId);

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

int DatabaseManager::ensureCoach(const QString &trainNumber, int position,
                                 const QString &coachNumber, const QString &coachType)
{
    if (position < 1 || position > 24) return -1;
    int tid = getTrainId(trainNumber);
    if (tid < 0) return -1;

    // Check if coach already exists at this position
    QSqlQuery q(m_db);
    q.prepare(QStringLiteral("SELECT id FROM coaches WHERE train_id = :tid AND position = :pos;"));
    q.bindValue(QStringLiteral(":tid"), tid);
    q.bindValue(QStringLiteral(":pos"), position);
    if (q.exec() && q.next()) {
        return q.value(0).toInt();
    }

    QString cNum = coachNumber.trimmed();
    if (cNum.isEmpty()) {
        cNum = QString::asprintf("%02d", position);
    }

    if (addCoach(trainNumber, cNum, coachType, position, QString())) {
        q.prepare(QStringLiteral("SELECT id FROM coaches WHERE train_id = :tid AND position = :pos;"));
        q.bindValue(QStringLiteral(":tid"), tid);
        q.bindValue(QStringLiteral(":pos"), position);
        if (q.exec() && q.next()) {
            return q.value(0).toInt();
        }
    }
    return -1;
}

// ----------------------------------------------------------------------------
// Tanks CRUD & Geometry
// ----------------------------------------------------------------------------

QVariantList DatabaseManager::getTanksForCoach(int coachId)
{
    QVariantList list;
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "SELECT t.id, t.tank_number, t.tank_name, t.geometry_type, "
        "t.length_cm, t.width_cm, t.height_cm, t.diameter_cm, "
        "t.capacity_liters, t.max_height_cm, t.device_id, t.device_status, "
        "c.coach_number, c.coach_type, tr.train_number, tr.train_name, tr.region "
        "FROM tanks t "
        "INNER JOIN coaches c ON t.coach_id = c.id "
        "INNER JOIN trains tr ON c.train_id = tr.id "
        "WHERE t.coach_id = :cid ORDER BY t.tank_number;"
    ));
    query.bindValue(QStringLiteral(":cid"), coachId);

    if (query.exec()) {
        while (query.next()) {
            QVariantMap map;
            map[QStringLiteral("id")] = query.value(0).toInt();
            map[QStringLiteral("tankId")] = query.value(0).toInt();
            map[QStringLiteral("tankNumber")] = query.value(1).toString();
            map[QStringLiteral("tankName")] = query.value(2).toString();
            map[QStringLiteral("geometryType")] = query.value(3).toString();
            map[QStringLiteral("lengthCm")] = query.value(4).toDouble();
            map[QStringLiteral("widthCm")] = query.value(5).toDouble();
            map[QStringLiteral("heightCm")] = query.value(6).toDouble();
            map[QStringLiteral("diameterCm")] = query.value(7).toDouble();
            map[QStringLiteral("capacityLiters")] = query.value(8).toDouble();
            map[QStringLiteral("maxHeightCm")] = query.value(9).toDouble();
            map[QStringLiteral("deviceId")] = query.value(10).toString();

            const QString devId = query.value(10).toString().trimmed();
            QString devStatus = query.value(11).toString();
            if (devId.isEmpty()) {
                devStatus = QStringLiteral("NOT CONNECTED");
            }
            map[QStringLiteral("deviceStatus")] = devStatus;
            map[QStringLiteral("coachNumber")] = query.value(12).toString();
            map[QStringLiteral("coachType")] = query.value(13).toString();
            map[QStringLiteral("trainNumber")] = query.value(14).toString();
            map[QStringLiteral("trainName")] = query.value(15).toString();
            map[QStringLiteral("region")] = query.value(16).toString();
            list.append(map);
        }
    }
    return list;
}

QVariantList DatabaseManager::getTanksForTrain(const QString &trainNumber)
{
    QVariantList list;
    int tid = getTrainId(trainNumber);
    if (tid < 0) return list;

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "SELECT t.id, t.tank_number, t.tank_name, t.geometry_type, "
        "t.length_cm, t.width_cm, t.height_cm, t.diameter_cm, "
        "t.capacity_liters, t.max_height_cm, t.device_id, t.device_status, "
        "c.coach_number, c.coach_type, tr.train_number, tr.train_name, tr.region, t.coach_id "
        "FROM tanks t "
        "INNER JOIN coaches c ON t.coach_id = c.id "
        "INNER JOIN trains tr ON c.train_id = tr.id "
        "WHERE tr.id = :tid ORDER BY c.position, t.tank_number;"
    ));
    query.bindValue(QStringLiteral(":tid"), tid);

    if (query.exec()) {
        while (query.next()) {
            QVariantMap map;
            map[QStringLiteral("id")] = query.value(0).toInt();
            map[QStringLiteral("tankId")] = query.value(0).toInt();
            map[QStringLiteral("tankNumber")] = query.value(1).toString();
            map[QStringLiteral("tankName")] = query.value(2).toString();
            map[QStringLiteral("geometryType")] = query.value(3).toString();
            map[QStringLiteral("lengthCm")] = query.value(4).toDouble();
            map[QStringLiteral("widthCm")] = query.value(5).toDouble();
            map[QStringLiteral("heightCm")] = query.value(6).toDouble();
            map[QStringLiteral("diameterCm")] = query.value(7).toDouble();
            map[QStringLiteral("capacityLiters")] = query.value(8).toDouble();
            map[QStringLiteral("maxHeightCm")] = query.value(9).toDouble();
            map[QStringLiteral("deviceId")] = query.value(10).toString();

            const QString devId = query.value(10).toString().trimmed();
            QString devStatus = query.value(11).toString();
            if (devId.isEmpty()) {
                devStatus = QStringLiteral("NOT CONNECTED");
            }
            map[QStringLiteral("deviceStatus")] = devStatus;
            map[QStringLiteral("coachNumber")] = query.value(12).toString();
            map[QStringLiteral("coachType")] = query.value(13).toString();
            map[QStringLiteral("trainNumber")] = query.value(14).toString();
            map[QStringLiteral("trainName")] = query.value(15).toString();
            map[QStringLiteral("region")] = query.value(16).toString();
            map[QStringLiteral("coachId")] = query.value(17).toInt();
            list.append(map);
        }
    }
    return list;
}

QVariantList DatabaseManager::getAllTanks()
{
    QVariantList list;
    QSqlQuery query(m_db);
    query.exec(QStringLiteral(
        "SELECT t.id, t.tank_number, t.tank_name, t.geometry_type, "
        "t.length_cm, t.width_cm, t.height_cm, t.diameter_cm, "
        "t.capacity_liters, t.max_height_cm, t.device_id, t.device_status, "
        "c.coach_number, c.coach_type, tr.train_number, tr.train_name, tr.region, t.coach_id "
        "FROM tanks t "
        "INNER JOIN coaches c ON t.coach_id = c.id "
        "INNER JOIN trains tr ON c.train_id = tr.id "
        "ORDER BY tr.train_number, c.position, t.tank_number;"
    ));

    while (query.next()) {
        QVariantMap map;
        map[QStringLiteral("id")] = query.value(0).toInt();
        map[QStringLiteral("tankId")] = query.value(0).toInt();
        map[QStringLiteral("tankNumber")] = query.value(1).toString();
        map[QStringLiteral("tankName")] = query.value(2).toString();
        map[QStringLiteral("geometryType")] = query.value(3).toString();
        map[QStringLiteral("lengthCm")] = query.value(4).toDouble();
        map[QStringLiteral("widthCm")] = query.value(5).toDouble();
        map[QStringLiteral("heightCm")] = query.value(6).toDouble();
        map[QStringLiteral("diameterCm")] = query.value(7).toDouble();
        map[QStringLiteral("capacityLiters")] = query.value(8).toDouble();
        map[QStringLiteral("maxHeightCm")] = query.value(9).toDouble();
        map[QStringLiteral("deviceId")] = query.value(10).toString();

        const QString devId = query.value(10).toString().trimmed();
        QString devStatus = query.value(11).toString();
        if (devId.isEmpty()) {
            devStatus = QStringLiteral("NOT CONNECTED");
        }
        map[QStringLiteral("deviceStatus")] = devStatus;
        map[QStringLiteral("coachNumber")] = query.value(12).toString();
        map[QStringLiteral("coachType")] = query.value(13).toString();
        map[QStringLiteral("trainNumber")] = query.value(14).toString();
        map[QStringLiteral("trainName")] = query.value(15).toString();
        map[QStringLiteral("region")] = query.value(16).toString();
        map[QStringLiteral("coachId")] = query.value(17).toInt();
        list.append(map);
    }
    return list;
}

QVariantMap DatabaseManager::getTank(int tankId)
{
    QVariantMap map;
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "SELECT t.id, t.tank_number, t.tank_name, t.geometry_type, "
        "t.length_cm, t.width_cm, t.height_cm, t.diameter_cm, "
        "t.capacity_liters, t.max_height_cm, t.device_id, t.device_status, "
        "c.coach_number, c.coach_type, tr.train_number, tr.train_name, tr.region, t.coach_id "
        "FROM tanks t "
        "INNER JOIN coaches c ON t.coach_id = c.id "
        "INNER JOIN trains tr ON c.train_id = tr.id "
        "WHERE t.id = :id;"
    ));
    query.bindValue(QStringLiteral(":id"), tankId);

    if (query.exec() && query.next()) {
        map[QStringLiteral("id")] = query.value(0).toInt();
        map[QStringLiteral("tankId")] = query.value(0).toInt();
        map[QStringLiteral("tankNumber")] = query.value(1).toString();
        map[QStringLiteral("tankName")] = query.value(2).toString();
        map[QStringLiteral("geometryType")] = query.value(3).toString();
        map[QStringLiteral("lengthCm")] = query.value(4).toDouble();
        map[QStringLiteral("widthCm")] = query.value(5).toDouble();
        map[QStringLiteral("heightCm")] = query.value(6).toDouble();
        map[QStringLiteral("diameterCm")] = query.value(7).toDouble();
        map[QStringLiteral("capacityLiters")] = query.value(8).toDouble();
        map[QStringLiteral("maxHeightCm")] = query.value(9).toDouble();
        map[QStringLiteral("deviceId")] = query.value(10).toString();

        const QString devId = query.value(10).toString().trimmed();
        QString devStatus = query.value(11).toString();
        if (devId.isEmpty()) {
            devStatus = QStringLiteral("NOT CONNECTED");
        }
        map[QStringLiteral("deviceStatus")] = devStatus;
        map[QStringLiteral("coachNumber")] = query.value(12).toString();
        map[QStringLiteral("coachType")] = query.value(13).toString();
        map[QStringLiteral("trainNumber")] = query.value(14).toString();
        map[QStringLiteral("trainName")] = query.value(15).toString();
        map[QStringLiteral("region")] = query.value(16).toString();
        map[QStringLiteral("coachId")] = query.value(17).toInt();
    }
    return map;
}

bool DatabaseManager::addTank(int coachId, const QString &tankNumber, const QString &tankName,
                              const QString &geometryType, double lengthCm, double widthCm,
                              double heightCm, double diameterCm, double capacityLiters,
                              double maxHeightCm, const QString &deviceId)
{
    if (coachId <= 0 || tankNumber.trimmed().isEmpty()) return false;

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "INSERT INTO tanks (coach_id, tank_number, tank_name, geometry_type, "
        "length_cm, width_cm, height_cm, diameter_cm, capacity_liters, max_height_cm, device_id, device_status) "
        "VALUES (:cid, :num, :name, :geom, :len, :w, :h, :diam, :cap, :maxh, :dev, :stat);"
    ));
    query.bindValue(QStringLiteral(":cid"), coachId);
    query.bindValue(QStringLiteral(":num"), tankNumber.trimmed());
    query.bindValue(QStringLiteral(":name"), tankName.trimmed());
    query.bindValue(QStringLiteral(":geom"), geometryType.trimmed().isEmpty() ? QStringLiteral("Rectangular") : geometryType.trimmed());
    query.bindValue(QStringLiteral(":len"), lengthCm);
    query.bindValue(QStringLiteral(":w"), widthCm);
    query.bindValue(QStringLiteral(":h"), heightCm);
    query.bindValue(QStringLiteral(":diam"), diameterCm);
    query.bindValue(QStringLiteral(":cap"), capacityLiters);
    query.bindValue(QStringLiteral(":maxh"), maxHeightCm > 0 ? maxHeightCm : heightCm);
    query.bindValue(QStringLiteral(":dev"), deviceId.trimmed());
    query.bindValue(QStringLiteral(":stat"), deviceId.trimmed().isEmpty() ? QStringLiteral("NOT CONNECTED") : QStringLiteral("Offline"));

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

bool DatabaseManager::updateTank(int tankId, const QString &tankNumber, const QString &tankName,
                                 const QString &geometryType, double lengthCm, double widthCm,
                                 double heightCm, double diameterCm, double capacityLiters,
                                 double maxHeightCm, const QString &deviceId)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "UPDATE tanks SET tank_number = :num, tank_name = :name, geometry_type = :geom, "
        "length_cm = :len, width_cm = :w, height_cm = :h, diameter_cm = :diam, "
        "capacity_liters = :cap, max_height_cm = :maxh, device_id = :dev "
        "WHERE id = :id;"
    ));
    query.bindValue(QStringLiteral(":num"), tankNumber.trimmed());
    query.bindValue(QStringLiteral(":name"), tankName.trimmed());
    query.bindValue(QStringLiteral(":geom"), geometryType.trimmed());
    query.bindValue(QStringLiteral(":len"), lengthCm);
    query.bindValue(QStringLiteral(":w"), widthCm);
    query.bindValue(QStringLiteral(":h"), heightCm);
    query.bindValue(QStringLiteral(":diam"), diameterCm);
    query.bindValue(QStringLiteral(":cap"), capacityLiters);
    query.bindValue(QStringLiteral(":maxh"), maxHeightCm);
    query.bindValue(QStringLiteral(":dev"), deviceId.trimmed());
    query.bindValue(QStringLiteral(":id"), tankId);

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

bool DatabaseManager::deleteTank(int tankId)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("DELETE FROM tanks WHERE id = :id;"));
    query.bindValue(QStringLiteral(":id"), tankId);

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

bool DatabaseManager::assignDeviceToTank(int tankId, const QString &deviceId)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "UPDATE tanks SET device_id = :dev, "
        "device_status = CASE WHEN :dev = '' THEN 'NOT CONNECTED' ELSE 'Offline' END "
        "WHERE id = :id;"
    ));
    query.bindValue(QStringLiteral(":dev"), deviceId.trimmed());
    query.bindValue(QStringLiteral(":id"), tankId);

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

// ----------------------------------------------------------------------------
// User Authentication
// ----------------------------------------------------------------------------

bool DatabaseManager::verifyUserCredential(const QString &username, const QString &password)
{
    const QString nameTrimmed = username.trimmed();
    if (nameTrimmed.isEmpty() || password.isEmpty()) return false;

    // Admin authentication is strictly handled in C++ memory, never in SQLite user table
    if (nameTrimmed.compare(QStringLiteral("admin"), Qt::CaseInsensitive) == 0 ||
        nameTrimmed.compare(QStringLiteral("administrator"), Qt::CaseInsensitive) == 0) {
        return false;
    }

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT password_hash, salt FROM users WHERE username = :name;"));
    query.bindValue(QStringLiteral(":name"), nameTrimmed);

    if (query.exec() && query.next()) {
        const QString storedHash = query.value(0).toString();
        const QString salt = query.value(1).toString();
        const QString calculatedHash = hashPassword(password, salt);
        return (storedHash == calculatedHash);
    }
    return false;
}

QString DatabaseManager::getUserRole(const QString &username)
{
    const QString nameTrimmed = username.trimmed();
    if (nameTrimmed.compare(QStringLiteral("admin"), Qt::CaseInsensitive) == 0 ||
        nameTrimmed.compare(QStringLiteral("administrator"), Qt::CaseInsensitive) == 0) {
        return QStringLiteral("Administrator");
    }

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT role FROM users WHERE username = :name;"));
    query.bindValue(QStringLiteral(":name"), nameTrimmed);
    if (query.exec() && query.next()) {
        QString r = query.value(0).toString().trimmed();
        if (!r.isEmpty()) return r;
    }
    return QStringLiteral("Operator");
}

QString DatabaseManager::getUserDisplayName(const QString &username)
{
    const QString nameTrimmed = username.trimmed();
    if (nameTrimmed.compare(QStringLiteral("admin"), Qt::CaseInsensitive) == 0 ||
        nameTrimmed.compare(QStringLiteral("administrator"), Qt::CaseInsensitive) == 0) {
        return QStringLiteral("Administrator");
    }

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT name FROM users WHERE username = :name;"));
    query.bindValue(QStringLiteral(":name"), nameTrimmed);
    if (query.exec() && query.next()) {
        QString n = query.value(0).toString().trimmed();
        if (!n.isEmpty()) return n;
    }
    return nameTrimmed.left(1).toUpper() + nameTrimmed.mid(1);
}

bool DatabaseManager::updateUserPassword(const QString &username, const QString &newPassword)
{
    const QString nameTrimmed = username.trimmed();
    if (nameTrimmed.isEmpty() || newPassword.isEmpty()) return false;

    // Fixed Admin credential cannot be modified
    if (nameTrimmed.compare(QStringLiteral("admin"), Qt::CaseInsensitive) == 0 ||
        nameTrimmed.compare(QStringLiteral("administrator"), Qt::CaseInsensitive) == 0) {
        return false;
    }

    const QString salt = QUuid::createUuid().toString(QUuid::WithoutBraces);
    const QString hash = hashPassword(newPassword, salt);

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("UPDATE users SET password_hash = :hash, salt = :salt WHERE username = :name;"));
    query.bindValue(QStringLiteral(":hash"), hash);
    query.bindValue(QStringLiteral(":salt"), salt);
    query.bindValue(QStringLiteral(":name"), nameTrimmed);

    return query.exec();
}

bool DatabaseManager::createUser(const QString &username, const QString &password, const QString &role,
                                const QString &name, const QString &status)
{
    const QString uTrimmed = username.trimmed();
    if (uTrimmed.isEmpty() || password.length() < 3) return false;

    // Prevent creating accounts named admin/administrator (fixed in C++ memory)
    if (uTrimmed.compare(QStringLiteral("admin"), Qt::CaseInsensitive) == 0 ||
        uTrimmed.compare(QStringLiteral("administrator"), Qt::CaseInsensitive) == 0) {
        return false;
    }

    // Strictly enforce 10 employee/operator limit
    if (getOperatorCount() >= 10) {
        qWarning() << "DatabaseManager::createUser: Maximum 10 employee/operator accounts reached.";
        return false;
    }

    const QString salt = QUuid::createUuid().toString(QUuid::WithoutBraces);
    const QString hash = hashPassword(password, salt);
    const QString displayName = name.trimmed().isEmpty() ? (uTrimmed.left(1).toUpper() + uTrimmed.mid(1)) : name.trimmed();
    const QString userStatus = status.trimmed().isEmpty() ? QStringLiteral("Active") : status.trimmed();
    const QString userRole = role.trimmed().isEmpty() ? QStringLiteral("Operator") : role.trimmed();

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "INSERT INTO users (username, password_hash, salt, role, name, status) "
        "VALUES (:name, :hash, :salt, :role, :displayName, :status);"
    ));
    query.bindValue(QStringLiteral(":name"), uTrimmed);
    query.bindValue(QStringLiteral(":hash"), hash);
    query.bindValue(QStringLiteral(":salt"), salt);
    query.bindValue(QStringLiteral(":role"), userRole);
    query.bindValue(QStringLiteral(":displayName"), displayName);
    query.bindValue(QStringLiteral(":status"), userStatus);

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

QVariantList DatabaseManager::getAllUsers()
{
    QVariantList list;
    QSqlQuery query(m_db);
    query.exec(QStringLiteral("SELECT id, username, role, name, status FROM users ORDER BY id;"));

    while (query.next()) {
        QVariantMap map;
        int id = query.value(0).toInt();
        QString username = query.value(1).toString();
        QString role = query.value(2).toString();
        QString name = query.value(3).toString().trimmed();
        QString status = query.value(4).toString().trimmed();

        if (name.isEmpty()) {
            if (username == QStringLiteral("employee")) name = QStringLiteral("Station Operator");
            else name = username.left(1).toUpper() + username.mid(1);
        }
        if (status.isEmpty()) status = QStringLiteral("Active");

        map[QStringLiteral("id")] = id;
        map[QStringLiteral("username")] = username;
        map[QStringLiteral("role")] = role;
        map[QStringLiteral("name")] = name;
        map[QStringLiteral("status")] = status;
        map[QStringLiteral("lastActive")] = QStringLiteral("Active");
        map[QStringLiteral("initial")] = name.left(1).toUpper();

        list.append(map);
    }
    return list;
}

int DatabaseManager::getOperatorCount()
{
    QSqlQuery query(m_db);
    query.exec(QStringLiteral("SELECT COUNT(*) FROM users;"));
    if (query.next()) {
        return query.value(0).toInt();
    }
    return 0;
}

bool DatabaseManager::deleteUser(const QString &username)
{
    const QString uTrimmed = username.trimmed();
    if (uTrimmed.isEmpty()) return false;

    // Fixed Admin account cannot be deleted
    if (uTrimmed.compare(QStringLiteral("admin"), Qt::CaseInsensitive) == 0 ||
        uTrimmed.compare(QStringLiteral("administrator"), Qt::CaseInsensitive) == 0) {
        return false;
    }

    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("DELETE FROM users WHERE username = :name;"));
    query.bindValue(QStringLiteral(":name"), uTrimmed);

    bool ok = query.exec();
    if (ok) emit databaseChanged();
    return ok;
}

// ----------------------------------------------------------------------------
// System Settings
// ----------------------------------------------------------------------------

QString DatabaseManager::getSetting(const QString &key, const QString &defaultValue)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT value FROM system_settings WHERE key = :key;"));
    query.bindValue(QStringLiteral(":key"), key);
    if (query.exec() && query.next()) {
        return query.value(0).toString();
    }
    return defaultValue;
}

bool DatabaseManager::setSetting(const QString &key, const QString &value)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "INSERT INTO system_settings (key, value) VALUES (:key, :val) "
        "ON CONFLICT(key) DO UPDATE SET value = :val;"
    ));
    query.bindValue(QStringLiteral(":key"), key);
    query.bindValue(QStringLiteral(":val"), value);
    return query.exec();
}

// ----------------------------------------------------------------------------
// Device Management
// ----------------------------------------------------------------------------

QVariantList DatabaseManager::getAllDevices()
{
    QVariantList list;
    QSqlQuery q(m_db);
    q.exec(QStringLiteral(
        "SELECT id, device_id, name, device_type, connection_type, status, location, "
        "train_number, coach_number, tank_number, sensor_type, firmware_version FROM devices ORDER BY id;"
    ));

    while (q.next()) {
        QVariantMap map;
        int id = q.value(0).toInt();
        QString devId = q.value(1).toString();
        QString name = q.value(2).toString();
        QString devType = q.value(3).toString();
        QString connType = q.value(4).toString();
        QString status = q.value(5).toString();
        QString location = q.value(6).toString();
        QString trainNumber = q.value(7).toString();
        QString coachNumber = q.value(8).toString();
        QString tankNumber = q.value(9).toString();
        QString sensorType = q.value(10).toString();
        QString fwVersion = q.value(11).toString();

        bool isPrimary = (devId.compare(QStringLiteral("wli"), Qt::CaseInsensitive) == 0);

        map[QStringLiteral("id")] = devId;
        map[QStringLiteral("dbId")] = id;
        map[QStringLiteral("name")] = name;
        map[QStringLiteral("serialNumber")] = QStringLiteral("SN-") + devId.toUpper();
        map[QStringLiteral("location")] = location.isEmpty() ? (trainNumber.isEmpty() ? QStringLiteral("Unassigned") : QStringLiteral("Train %1 - Coach %2 - %3").arg(trainNumber, coachNumber, tankNumber)) : location;
        map[QStringLiteral("status")] = status;
        map[QStringLiteral("connectionType")] = connType;
        map[QStringLiteral("modemModel")] = devType;
        bool hasAssignedTank = (!trainNumber.trimmed().isEmpty() && !coachNumber.trimmed().isEmpty() && !tankNumber.trimmed().isEmpty());
        map[QStringLiteral("hasTank")] = hasAssignedTank;
        map[QStringLiteral("signalQuality")] = (status == QStringLiteral("Online")) ? QStringLiteral("-72 dBm (Excellent)") : QStringLiteral("No Signal");
        map[QStringLiteral("ipAddress")] = (status == QStringLiteral("Online")) ? QStringLiteral("10.142.68.19") : QStringLiteral("Disconnected");

        if (hasAssignedTank && isPrimary) {
            map[QStringLiteral("waterLevel")] = 0.0;
            map[QStringLiteral("waterHeightCm")] = 0.0;
            map[QStringLiteral("tankHeightCm")] = 50.0;
            map[QStringLiteral("volumeLiters")] = 0.0;
            map[QStringLiteral("capacityLiters")] = 60.0;
            map[QStringLiteral("sensorStatus")] = (status == QStringLiteral("Online")) ? QStringLiteral("Healthy") : QStringLiteral("Disconnected");
        } else if (hasAssignedTank) {
            map[QStringLiteral("waterLevel")] = -1.0;
            map[QStringLiteral("waterHeightCm")] = -1.0;
            map[QStringLiteral("tankHeightCm")] = 50.0;
            map[QStringLiteral("volumeLiters")] = -1.0;
            map[QStringLiteral("capacityLiters")] = 60.0;
            map[QStringLiteral("sensorStatus")] = (status == QStringLiteral("Online")) ? QStringLiteral("Healthy") : QStringLiteral("Disconnected");
        } else {
            // Unassigned device (Requirement Bug 3: Zero fake telemetry)
            map[QStringLiteral("waterLevel")] = -1.0;
            map[QStringLiteral("waterHeightCm")] = -1.0;
            map[QStringLiteral("tankHeightCm")] = 0.0;
            map[QStringLiteral("volumeLiters")] = -1.0;
            map[QStringLiteral("capacityLiters")] = 0.0;
            map[QStringLiteral("sensorStatus")] = QStringLiteral("Not Assigned");
        }

        map[QStringLiteral("sensorType")] = sensorType;
        map[QStringLiteral("gain")] = QStringLiteral("±4.096 V (128 SPS)");
        map[QStringLiteral("pressure")] = 1013.2;
        map[QStringLiteral("humidity")] = 61.2;
        map[QStringLiteral("firmwareVersion")] = fwVersion;
        map[QStringLiteral("runtime")] = QStringLiteral("FreeRTOS v10.4.6");
        map[QStringLiteral("calibrationStatus")] = QStringLiteral("CALIBRATED (Magic 0xAA55)");
        map[QStringLiteral("airBaseline")] = 1420;
        map[QStringLiteral("deadband")] = QStringLiteral("0.5 cm");
        map[QStringLiteral("alarmState")] = (status == QStringLiteral("Online")) ? QStringLiteral("ENABLED") : QStringLiteral("DISABLED");
        map[QStringLiteral("lastUpdate")] = (status == QStringLiteral("Online")) ? QStringLiteral("Just now") : QStringLiteral("Offline");
        map[QStringLiteral("uploadInterval")] = QStringLiteral("90 seconds");
        map[QStringLiteral("trainNumber")] = trainNumber;
        map[QStringLiteral("coachNumber")] = coachNumber;
        map[QStringLiteral("tankNumber")] = tankNumber;
        map[QStringLiteral("isPrimary")] = isPrimary;

        list.append(map);
    }
    return list;
}

QVariantMap DatabaseManager::getDevice(const QString &deviceId)
{
    QVariantMap map;
    const QString did = deviceId.trimmed();
    if (did.isEmpty()) return map;

    QSqlQuery q(m_db);
    q.prepare(QStringLiteral(
        "SELECT id, device_id, name, device_type, connection_type, status, location, "
        "train_number, coach_number, tank_number, sensor_type, firmware_version FROM devices WHERE device_id = :did;"
    ));
    q.bindValue(QStringLiteral(":did"), did);
    if (q.exec() && q.next()) {
        int id = q.value(0).toInt();
        QString devId = q.value(1).toString();
        QString name = q.value(2).toString();
        QString devType = q.value(3).toString();
        QString connType = q.value(4).toString();
        QString status = q.value(5).toString();
        QString location = q.value(6).toString();
        QString trainNumber = q.value(7).toString();
        QString coachNumber = q.value(8).toString();
        QString tankNumber = q.value(9).toString();
        QString sensorType = q.value(10).toString();
        QString fwVersion = q.value(11).toString();

        bool isPrimary = (devId.compare(QStringLiteral("wli"), Qt::CaseInsensitive) == 0);

        map[QStringLiteral("id")] = devId;
        map[QStringLiteral("dbId")] = id;
        map[QStringLiteral("name")] = name;
        map[QStringLiteral("serialNumber")] = QStringLiteral("SN-") + devId.toUpper();
        map[QStringLiteral("location")] = location.isEmpty() ? (trainNumber.isEmpty() ? QStringLiteral("Unassigned") : QStringLiteral("Train %1 - Coach %2 - %3").arg(trainNumber, coachNumber, tankNumber)) : location;
        map[QStringLiteral("status")] = status;
        map[QStringLiteral("connectionType")] = connType;
        map[QStringLiteral("modemModel")] = devType;
        map[QStringLiteral("signalQuality")] = (status == QStringLiteral("Online")) ? QStringLiteral("-72 dBm (Excellent)") : QStringLiteral("No Signal");
        map[QStringLiteral("ipAddress")] = (status == QStringLiteral("Online")) ? QStringLiteral("10.142.68.19") : QStringLiteral("Disconnected");

        bool hasAssignedTank = (!trainNumber.trimmed().isEmpty() && !coachNumber.trimmed().isEmpty() && !tankNumber.trimmed().isEmpty());
        map[QStringLiteral("hasTank")] = hasAssignedTank;

        if (hasAssignedTank && isPrimary) {
            map[QStringLiteral("waterLevel")] = 0.0;
            map[QStringLiteral("waterHeightCm")] = 0.0;
            map[QStringLiteral("tankHeightCm")] = 50.0;
            map[QStringLiteral("volumeLiters")] = 0.0;
            map[QStringLiteral("capacityLiters")] = 60.0;
            map[QStringLiteral("sensorStatus")] = (status == QStringLiteral("Online")) ? QStringLiteral("Healthy") : QStringLiteral("Disconnected");
        } else if (hasAssignedTank) {
            map[QStringLiteral("waterLevel")] = -1.0;
            map[QStringLiteral("waterHeightCm")] = -1.0;
            map[QStringLiteral("tankHeightCm")] = 50.0;
            map[QStringLiteral("volumeLiters")] = -1.0;
            map[QStringLiteral("capacityLiters")] = 60.0;
            map[QStringLiteral("sensorStatus")] = (status == QStringLiteral("Online")) ? QStringLiteral("Healthy") : QStringLiteral("Disconnected");
        } else {
            // Unassigned device (Requirement Bug 3: Zero fake telemetry)
            map[QStringLiteral("waterLevel")] = -1.0;
            map[QStringLiteral("waterHeightCm")] = -1.0;
            map[QStringLiteral("tankHeightCm")] = 0.0;
            map[QStringLiteral("volumeLiters")] = -1.0;
            map[QStringLiteral("capacityLiters")] = 0.0;
            map[QStringLiteral("sensorStatus")] = QStringLiteral("Not Assigned");
        }

        map[QStringLiteral("sensorType")] = sensorType;
        map[QStringLiteral("gain")] = QStringLiteral("±4.096 V (128 SPS)");
        map[QStringLiteral("pressure")] = 1013.2;
        map[QStringLiteral("humidity")] = 61.2;
        map[QStringLiteral("firmwareVersion")] = fwVersion;
        map[QStringLiteral("runtime")] = QStringLiteral("FreeRTOS v10.4.6");
        map[QStringLiteral("calibrationStatus")] = QStringLiteral("CALIBRATED (Magic 0xAA55)");
        map[QStringLiteral("airBaseline")] = 1420;
        map[QStringLiteral("deadband")] = QStringLiteral("0.5 cm");
        map[QStringLiteral("alarmState")] = (status == QStringLiteral("Online")) ? QStringLiteral("ENABLED") : QStringLiteral("DISABLED");
        map[QStringLiteral("lastUpdate")] = (status == QStringLiteral("Online")) ? QStringLiteral("Just now") : QStringLiteral("Offline");
        map[QStringLiteral("uploadInterval")] = QStringLiteral("90 seconds");
        map[QStringLiteral("trainNumber")] = trainNumber;
        map[QStringLiteral("coachNumber")] = coachNumber;
        map[QStringLiteral("tankNumber")] = tankNumber;
        map[QStringLiteral("isPrimary")] = isPrimary;
    }
    return map;
}

bool DatabaseManager::addDevice(const QString &deviceId, const QString &name, const QString &deviceType,
                                const QString &connectionType, const QString &status, const QString &location,
                                const QString &trainNumber, const QString &coachNumber, const QString &tankNumber)
{
    const QString devId = deviceId.trimmed();
    if (devId.isEmpty()) return false;

    QSqlQuery q(m_db);
    q.prepare(QStringLiteral(
        "INSERT INTO devices (device_id, name, device_type, connection_type, status, location, train_number, coach_number, tank_number) "
        "VALUES (:did, :name, :dtype, :ctype, :stat, :loc, :train, :coach, :tank) "
        "ON CONFLICT(device_id) DO UPDATE SET "
        "name = :name, device_type = :dtype, connection_type = :ctype, status = :stat, location = :loc, "
        "train_number = :train, coach_number = :coach, tank_number = :tank;"
    ));
    q.bindValue(QStringLiteral(":did"), devId);
    q.bindValue(QStringLiteral(":name"), name.trimmed().isEmpty() ? devId : name.trimmed());
    q.bindValue(QStringLiteral(":dtype"), deviceType.trimmed().isEmpty() ? QStringLiteral("Quectel EC200U-CN LTE Cat-1") : deviceType.trimmed());
    q.bindValue(QStringLiteral(":ctype"), connectionType.trimmed().isEmpty() ? QStringLiteral("LTE / Cellular") : connectionType.trimmed());
    q.bindValue(QStringLiteral(":stat"), status.trimmed().isEmpty() ? QStringLiteral("Offline") : status.trimmed());
    q.bindValue(QStringLiteral(":loc"), location.trimmed());
    q.bindValue(QStringLiteral(":train"), trainNumber.trimmed());
    q.bindValue(QStringLiteral(":coach"), coachNumber.trimmed());
    q.bindValue(QStringLiteral(":tank"), tankNumber.trimmed());

    bool ok = q.exec();
    if (ok) {
        // If assigned to a train, coach, and tank, update the tanks table
        if (!trainNumber.trimmed().isEmpty() && !coachNumber.trimmed().isEmpty() && !tankNumber.trimmed().isEmpty()) {
            int pos = 0;
            QRegularExpression re(QStringLiteral("(\\d+)"));
            auto m = re.match(coachNumber);
            if (m.hasMatch()) pos = m.captured(1).toInt();

            // Find coach id
            QSqlQuery findCoach(m_db);
            findCoach.prepare(QStringLiteral(
                "SELECT c.id FROM coaches c "
                "INNER JOIN trains t ON c.train_id = t.id "
                "WHERE t.train_number = :trnum AND (c.coach_number = :cnum OR c.position = :pos);"
            ));
            findCoach.bindValue(QStringLiteral(":trnum"), trainNumber.trimmed());
            findCoach.bindValue(QStringLiteral(":cnum"), coachNumber.trimmed());
            findCoach.bindValue(QStringLiteral(":pos"), pos);

            int cid = 0;
            if (findCoach.exec() && findCoach.next()) {
                cid = findCoach.value(0).toInt();
            } else if (pos >= 1 && pos <= 24) {
                cid = ensureCoach(trainNumber.trimmed(), pos, QString::asprintf("%02d", pos));
            }

            if (cid > 0) {
                QSqlQuery checkTk(m_db);
                checkTk.prepare(QStringLiteral("SELECT id FROM tanks WHERE coach_id = :cid AND tank_number = :tnum;"));
                checkTk.bindValue(QStringLiteral(":cid"), cid);
                checkTk.bindValue(QStringLiteral(":tnum"), tankNumber.trimmed());
                if (checkTk.exec() && checkTk.next()) {
                    int tkId = checkTk.value(0).toInt();
                    QSqlQuery updTk(m_db);
                    updTk.prepare(QStringLiteral("UPDATE tanks SET device_id = :did, device_status = :stat WHERE id = :tkid;"));
                    updTk.bindValue(QStringLiteral(":did"), devId);
                    updTk.bindValue(QStringLiteral(":stat"), status.trimmed().isEmpty() ? QStringLiteral("Online") : status.trimmed());
                    updTk.bindValue(QStringLiteral(":tkid"), tkId);
                    updTk.exec();
                } else {
                    addTank(cid, tankNumber.trimmed(), QStringLiteral("Tank ") + tankNumber.trimmed(),
                            QStringLiteral("Rectangular"), 40.0, 30.0, 50.0, 0.0, 60.0, 50.0, devId);
                }
            }
        }
        emit databaseChanged();
    }
    return ok;
}

bool DatabaseManager::updateDevice(const QString &deviceId, const QString &name, const QString &deviceType,
                                   const QString &connectionType, const QString &status, const QString &location,
                                   const QString &trainNumber, const QString &coachNumber, const QString &tankNumber)
{
    return addDevice(deviceId, name, deviceType, connectionType, status, location, trainNumber, coachNumber, tankNumber);
}

bool DatabaseManager::deleteDevice(const QString &deviceId)
{
    const QString devId = deviceId.trimmed();
    if (devId.isEmpty()) return false;

    // Do not allow deleting the primary real hardware device 'wli'
    if (devId.compare(QStringLiteral("wli"), Qt::CaseInsensitive) == 0) {
        return false;
    }

    QSqlQuery q(m_db);
    q.prepare(QStringLiteral("DELETE FROM devices WHERE device_id = :did;"));
    q.bindValue(QStringLiteral(":did"), devId);
    bool ok = q.exec();
    if (ok) {
        // Clear assignment in tanks table
        QSqlQuery clearTank(m_db);
        clearTank.prepare(QStringLiteral("UPDATE tanks SET device_id = '', device_status = 'NOT CONNECTED' WHERE device_id = :did;"));
        clearTank.bindValue(QStringLiteral(":did"), devId);
        clearTank.exec();

        emit databaseChanged();
    }
    return ok;
}

} // namespace Panorama
