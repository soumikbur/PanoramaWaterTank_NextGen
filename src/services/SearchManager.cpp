#include "SearchManager.h"
#include "DatabaseManager.h"
#include <QDebug>

namespace Panorama {

SearchManager::SearchManager(QObject *parent)
    : QObject(parent)
{
    m_debounceTimer.setSingleShot(true);
    m_debounceTimer.setInterval(200); // 200ms debounce
    connect(&m_debounceTimer, &QTimer::timeout, this, &SearchManager::executeSearch);

    initializeKnownLocations();
}

void SearchManager::setDatabaseManager(DatabaseManager *dbManager)
{
    m_dbManager = dbManager;
}

void SearchManager::initializeKnownLocations()
{
    m_knownLocations = {
        { QStringLiteral("Wardha Junction"), QStringLiteral("WR"), QStringLiteral("Nagpur"), QStringLiteral("Central Railway"), 20.7453, 78.6022 },
        { QStringLiteral("Nagpur Junction"), QStringLiteral("NGP"), QStringLiteral("Nagpur"), QStringLiteral("Central Railway"), 21.1528, 79.0882 },
        { QStringLiteral("Howrah Junction"), QStringLiteral("HWH"), QStringLiteral("Howrah"), QStringLiteral("Eastern Railway"), 22.5838, 88.3426 },
        { QStringLiteral("Barddhaman Junction"), QStringLiteral("BWN"), QStringLiteral("Howrah"), QStringLiteral("Eastern Railway"), 23.2324, 87.8615 },
        { QStringLiteral("Durgapur"), QStringLiteral("DGR"), QStringLiteral("Asansol"), QStringLiteral("Eastern Railway"), 23.4990, 87.3119 },
        { QStringLiteral("Raniganj"), QStringLiteral("RNG"), QStringLiteral("Asansol"), QStringLiteral("Eastern Railway"), 23.6214, 87.1328 },
        { QStringLiteral("Asansol Junction"), QStringLiteral("ASN"), QStringLiteral("Asansol"), QStringLiteral("Eastern Railway"), 23.6889, 86.9661 },
        { QStringLiteral("Dhanbad Junction"), QStringLiteral("DHN"), QStringLiteral("Dhanbad"), QStringLiteral("East Central Railway"), 23.7957, 86.4304 },
        { QStringLiteral("Bhusawal Junction"), QStringLiteral("BSL"), QStringLiteral("Bhusawal"), QStringLiteral("Central Railway"), 21.0455, 75.7925 },
        { QStringLiteral("Mumbai Central"), QStringLiteral("MMCT"), QStringLiteral("Mumbai"), QStringLiteral("Western Railway"), 18.9696, 72.8193 },
        { QStringLiteral("Surat"), QStringLiteral("ST"), QStringLiteral("Vadodara"), QStringLiteral("Western Railway"), 21.2049, 72.8406 },
        { QStringLiteral("Vadodara Junction"), QStringLiteral("BRC"), QStringLiteral("Vadodara"), QStringLiteral("Western Railway"), 22.3107, 73.1812 },
        { QStringLiteral("New Delhi"), QStringLiteral("NDLS"), QStringLiteral("Delhi"), QStringLiteral("Northern Railway"), 28.6429, 77.2195 },
        { QStringLiteral("Kanpur Central"), QStringLiteral("CNB"), QStringLiteral("Prayagraj"), QStringLiteral("North Central Railway"), 26.4547, 80.3507 },
        { QStringLiteral("Prayagraj Junction"), QStringLiteral("PRYJ"), QStringLiteral("Prayagraj"), QStringLiteral("North Central Railway"), 25.4497, 81.8282 },
        { QStringLiteral("Pt. Deen Dayal Upadhyaya"), QStringLiteral("DDU"), QStringLiteral("DDU"), QStringLiteral("East Central Railway"), 25.2796, 83.1189 },
        { QStringLiteral("Patna Junction"), QStringLiteral("PNBE"), QStringLiteral("Danapur"), QStringLiteral("East Central Railway"), 25.6019, 85.1376 },
        { QStringLiteral("Kharagpur Junction"), QStringLiteral("KGP"), QStringLiteral("Kharagpur"), QStringLiteral("South Eastern Railway"), 22.3391, 87.3256 },
        { QStringLiteral("Puri"), QStringLiteral("PURI"), QStringLiteral("Khurda Road"), QStringLiteral("East Coast Railway"), 19.8135, 85.8312 },
        { QStringLiteral("Pune Junction"), QStringLiteral("PUNE"), QStringLiteral("Pune"), QStringLiteral("Central Railway"), 18.5284, 73.8739 }
    };
}

void SearchManager::setQuery(const QString &query)
{
    if (m_query == query) return;
    m_query = query;
    emit queryChanged();

    if (m_query.trimmed().isEmpty()) {
        clear();
    } else {
        m_isSearching = true;
        emit isSearchingChanged();
        m_debounceTimer.start(); // Debounce 200ms
    }
}

void SearchManager::searchImmediate(const QString &query)
{
    m_query = query;
    emit queryChanged();
    m_debounceTimer.stop();
    executeSearch();
}

void SearchManager::clear()
{
    m_debounceTimer.stop();
    m_query.clear();
    m_trainResults.clear();
    m_coachResults.clear();
    m_tankResults.clear();
    m_locationResults.clear();
    m_isSearching = false;
    emit queryChanged();
    emit isSearchingChanged();
    emit searchResultsChanged();
}

void SearchManager::executeSearch()
{
    const QString q = m_query.trimmed();
    if (q.isEmpty()) {
        clear();
        return;
    }

    const QString lowerQ = q.toLower();
    m_trainResults.clear();
    m_coachResults.clear();
    m_tankResults.clear();
    m_locationResults.clear();

    // 1. Search LOCATIONS
    for (const auto &loc : m_knownLocations) {
        if (loc.name.toLower().contains(lowerQ) ||
            loc.code.toLower().contains(lowerQ) ||
            loc.division.toLower().contains(lowerQ) ||
            loc.zone.toLower().contains(lowerQ)) {

            QVariantMap item;
            item[QStringLiteral("type")] = QStringLiteral("location");
            item[QStringLiteral("title")] = loc.name;
            item[QStringLiteral("subtitle")] = QStringLiteral("%1 · %2").arg(loc.code, loc.zone);
            item[QStringLiteral("context")] = QStringLiteral("Lat: %1° N, Lon: %2° E").arg(loc.latitude, 0, 'f', 4).arg(loc.longitude, 0, 'f', 4);
            item[QStringLiteral("latitude")] = loc.latitude;
            item[QStringLiteral("longitude")] = loc.longitude;
            item[QStringLiteral("code")] = loc.code;
            item[QStringLiteral("name")] = loc.name;
            m_locationResults.append(item);
        }
    }

    if (m_dbManager) {
        // 2. Search TRAINS
        const auto allTrains = m_dbManager->getAllTrains();
        for (const auto &tVar : allTrains) {
            const QVariantMap t = tVar.toMap();
            const QString num = t.value(QStringLiteral("trainNumber")).toString();
            const QString name = t.value(QStringLiteral("trainName")).toString();
            const QString reg = t.value(QStringLiteral("region")).toString();
            const QString loc = t.value(QStringLiteral("location")).toString();

            if (num.toLower().contains(lowerQ) ||
                name.toLower().contains(lowerQ) ||
                reg.toLower().contains(lowerQ) ||
                loc.toLower().contains(lowerQ)) {

                QVariantMap item;
                item[QStringLiteral("type")] = QStringLiteral("train");
                item[QStringLiteral("id")] = num;
                item[QStringLiteral("trainNumber")] = num;
                item[QStringLiteral("title")] = QStringLiteral("Train %1 · %2").arg(num, name);
                item[QStringLiteral("subtitle")] = QStringLiteral("%1 · %2").arg(reg, t.value(QStringLiteral("status")).toString());
                item[QStringLiteral("context")] = QStringLiteral("%1 coaches · %2 tanks").arg(t.value(QStringLiteral("coachCount")).toInt()).arg(t.value(QStringLiteral("tankCount")).toInt());
                m_trainResults.append(item);
            }
        }

        // 3. Search COACHES
        for (const auto &tVar : allTrains) {
            const QString tNum = tVar.toMap().value(QStringLiteral("trainNumber")).toString();
            const auto coaches = m_dbManager->getCoachesForTrain(tNum);
            for (const auto &cVar : coaches) {
                const QVariantMap c = cVar.toMap();
                const QString cNum = c.value(QStringLiteral("coachNumber")).toString();
                const QString cType = c.value(QStringLiteral("coachType")).toString();

                if (cNum.toLower().contains(lowerQ) ||
                    cType.toLower().contains(lowerQ) ||
                    tNum.toLower().contains(lowerQ) ||
                    (lowerQ.startsWith(QStringLiteral("coach")) && cNum.toLower().contains(lowerQ.mid(5).trimmed()))) {

                    QVariantMap item;
                    item[QStringLiteral("type")] = QStringLiteral("coach");
                    item[QStringLiteral("id")] = c.value(QStringLiteral("id")).toInt();
                    item[QStringLiteral("coachId")] = c.value(QStringLiteral("id")).toInt();
                    item[QStringLiteral("coachNumber")] = cNum;
                    item[QStringLiteral("trainNumber")] = tNum;
                    item[QStringLiteral("title")] = QStringLiteral("Coach %1 (%2)").arg(cNum, cType);
                    item[QStringLiteral("subtitle")] = QStringLiteral("Train %1").arg(tNum);
                    item[QStringLiteral("context")] = QStringLiteral("%1 tanks configured").arg(c.value(QStringLiteral("tankCount")).toInt());
                    m_coachResults.append(item);
                }
            }
        }

        // 4. Search TANKS
        const auto allTanks = m_dbManager->getAllTanks();
        for (const auto &tkVar : allTanks) {
            const QVariantMap tk = tkVar.toMap();
            const QString tkNum = tk.value(QStringLiteral("tankNumber")).toString();
            const QString tkName = tk.value(QStringLiteral("tankName")).toString();
            const QString devId = tk.value(QStringLiteral("deviceId")).toString();
            const QString geom = tk.value(QStringLiteral("geometryType")).toString();
            const QString cNum = tk.value(QStringLiteral("coachNumber")).toString();
            const QString tNum = tk.value(QStringLiteral("trainNumber")).toString();
            const QString tName = tk.value(QStringLiteral("trainName")).toString();
            const QString reg = tk.value(QStringLiteral("region")).toString();

            if (tkNum.toLower().contains(lowerQ) ||
                tkName.toLower().contains(lowerQ) ||
                devId.toLower().contains(lowerQ) ||
                geom.toLower().contains(lowerQ) ||
                cNum.toLower().contains(lowerQ) ||
                tNum.toLower().contains(lowerQ) ||
                tName.toLower().contains(lowerQ) ||
                reg.toLower().contains(lowerQ) ||
                (lowerQ.startsWith(QStringLiteral("tank")) && tkNum.toLower().contains(lowerQ.mid(4).trimmed()))) {

                QVariantMap item;
                item[QStringLiteral("type")] = QStringLiteral("tank");
                item[QStringLiteral("id")] = tk.value(QStringLiteral("id")).toInt();
                item[QStringLiteral("tankId")] = tk.value(QStringLiteral("id")).toInt();
                item[QStringLiteral("tankNumber")] = tkNum;
                item[QStringLiteral("title")] = QStringLiteral("Tank %1 · %2").arg(tkNum, tkName.isEmpty() ? geom : tkName);
                item[QStringLiteral("subtitle")] = QStringLiteral("Coach %1 · Train %2 (%3)").arg(cNum, tNum, tk.value(QStringLiteral("region")).toString());
                item[QStringLiteral("context")] = QStringLiteral("Status: %1 · Capacity: %2 L").arg(tk.value(QStringLiteral("deviceStatus")).toString()).arg(tk.value(QStringLiteral("capacityLiters")).toDouble(), 0, 'f', 1);
                m_tankResults.append(item);
            }
        }
    }

    m_isSearching = false;
    emit isSearchingChanged();
    emit searchResultsChanged();
}

void SearchManager::selectResult(const QString &type, const QVariantMap &item)
{
    if (type == QStringLiteral("location")) {
        const double lat = item.value(QStringLiteral("latitude")).toDouble();
        const double lon = item.value(QStringLiteral("longitude")).toDouble();
        const QString name = item.value(QStringLiteral("name")).toString();
        emit navigateToLocation(lat, lon, name);
    } else if (type == QStringLiteral("train")) {
        const QString tNum = item.value(QStringLiteral("trainNumber")).toString();
        emit navigateToTrain(tNum);
    } else if (type == QStringLiteral("coach")) {
        const int cid = item.value(QStringLiteral("coachId")).toInt();
        const QString cNum = item.value(QStringLiteral("coachNumber")).toString();
        const QString tNum = item.value(QStringLiteral("trainNumber")).toString();
        emit navigateToCoach(cid, cNum, tNum);
    } else if (type == QStringLiteral("tank")) {
        const int tid = item.value(QStringLiteral("tankId")).toInt();
        const QString tNum = item.value(QStringLiteral("tankNumber")).toString();
        emit navigateToTank(tid, tNum);
    }
}

} // namespace Panorama
