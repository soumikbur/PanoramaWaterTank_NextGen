#include "TrainConfigProvider.h"
#include <QDebug>
#include <QSet>
#include <tuple>

namespace Panorama {

TrainConfigProvider::TrainConfigProvider(QObject *parent)
    : QObject(parent)
{
    initializeRegions();
    initializeTrains();
    validateConfiguration();
}

// ============================================================================
// Region Queries
// ============================================================================

QVariantList TrainConfigProvider::regions() const
{
    QVariantList list;
    for (const auto &r : m_regions) {
        QVariantMap rm = r.toMap();
        int tanks = 0;
        int junctions = 0;
        for (const auto &tn : r.trainNumbers) {
            auto it = m_trains.find(tn);
            if (it != m_trains.end()) {
                tanks += it->allTankIds().size();
                for (const auto &st : it->routeStations) {
                    if (st.isJunction) ++junctions;
                }
            }
        }
        rm[QStringLiteral("tankCount")] = tanks;
        rm[QStringLiteral("junctionCount")] = junctions;
        if (r.regionId == QStringLiteral("er")) {
            rm[QStringLiteral("areaDescriptor")] = QStringLiteral("Howrah • Asansol • Dhanbad • Ranchi");
            rm[QStringLiteral("accentColor")] = QStringLiteral("#2563EB");
        } else if (r.regionId == QStringLiteral("ser")) {
            rm[QStringLiteral("areaDescriptor")] = QStringLiteral("Puri • Howrah • Kharagpur • Chennai");
            rm[QStringLiteral("accentColor")] = QStringLiteral("#059669");
        } else if (r.regionId == QStringLiteral("ner") || r.regionId == QStringLiteral("nfr")) {
            rm[QStringLiteral("areaDescriptor")] = QStringLiteral("Guwahati • Kamakhya • Katihar • Dibrugarh");
            rm[QStringLiteral("accentColor")] = QStringLiteral("#7C3AED");
        } else if (r.regionId == QStringLiteral("wr")) {
            rm[QStringLiteral("areaDescriptor")] = QStringLiteral("Mumbai Central • Surat • Vadodara • Kota");
            rm[QStringLiteral("accentColor")] = QStringLiteral("#D97706");
        }
        list.append(rm);
    }
    return list;
}

QVariantMap TrainConfigProvider::regionInfo(const QString &regionId) const
{
    for (const auto &r : m_regions) {
        if (r.regionId == regionId || (regionId == QStringLiteral("nfr") && r.regionId == QStringLiteral("ner"))) {
            QVariantMap rm = r.toMap();
            int tanks = 0;
            int junctions = 0;
            for (const auto &tn : r.trainNumbers) {
                auto it = m_trains.find(tn);
                if (it != m_trains.end()) {
                    tanks += it->allTankIds().size();
                    for (const auto &st : it->routeStations) {
                        if (st.isJunction) ++junctions;
                    }
                }
            }
            rm[QStringLiteral("tankCount")] = tanks;
            rm[QStringLiteral("junctionCount")] = junctions;
            if (r.regionId == QStringLiteral("er")) {
                rm[QStringLiteral("areaDescriptor")] = QStringLiteral("Howrah • Asansol • Dhanbad • Ranchi");
                rm[QStringLiteral("accentColor")] = QStringLiteral("#2563EB");
            } else if (r.regionId == QStringLiteral("ser")) {
                rm[QStringLiteral("areaDescriptor")] = QStringLiteral("Puri • Howrah • Kharagpur • Chennai");
                rm[QStringLiteral("accentColor")] = QStringLiteral("#059669");
            } else if (r.regionId == QStringLiteral("ner") || r.regionId == QStringLiteral("nfr")) {
                rm[QStringLiteral("areaDescriptor")] = QStringLiteral("Guwahati • Kamakhya • Katihar • Dibrugarh");
                rm[QStringLiteral("accentColor")] = QStringLiteral("#7C3AED");
            } else if (r.regionId == QStringLiteral("wr")) {
                rm[QStringLiteral("areaDescriptor")] = QStringLiteral("Mumbai Central • Surat • Vadodara • Kota");
                rm[QStringLiteral("accentColor")] = QStringLiteral("#D97706");
            }
            return rm;
        }
    }
    return QVariantMap();
}

bool TrainConfigProvider::isValidRegion(const QString &regionId) const
{
    for (const auto &r : m_regions) {
        if (r.regionId == regionId || (regionId == QStringLiteral("nfr") && r.regionId == QStringLiteral("ner"))) {
            return true;
        }
    }
    return false;
}

int TrainConfigProvider::trainCountForRegion(const QString &regionId) const
{
    for (const auto &r : m_regions) {
        if (r.regionId == regionId || (regionId == QStringLiteral("nfr") && r.regionId == QStringLiteral("ner"))) {
            return r.trainNumbers.size();
        }
    }
    return 0;
}

int TrainConfigProvider::tankCountForRegion(const QString &regionId) const
{
    for (const auto &r : m_regions) {
        if (r.regionId == regionId || (regionId == QStringLiteral("nfr") && r.regionId == QStringLiteral("ner"))) {
            int count = 0;
            for (const auto &tn : r.trainNumbers) {
                auto it = m_trains.find(tn);
                if (it != m_trains.end()) {
                    count += it->allTankIds().size();
                }
            }
            return count;
        }
    }
    return 0;
}

int TrainConfigProvider::junctionCountForRegion(const QString &regionId) const
{
    for (const auto &r : m_regions) {
        if (r.regionId == regionId || (regionId == QStringLiteral("nfr") && r.regionId == QStringLiteral("ner"))) {
            int count = 0;
            for (const auto &tn : r.trainNumbers) {
                auto it = m_trains.find(tn);
                if (it != m_trains.end()) {
                    for (const auto &st : it->routeStations) {
                        if (st.isJunction) ++count;
                    }
                }
            }
            return count;
        }
    }
    return 0;
}

// ============================================================================
// Train Queries
// ============================================================================

QVariantList TrainConfigProvider::trainsForRegion(const QString &regionId) const
{
    QVariantList list;
    for (const auto &r : m_regions) {
        if (r.regionId == regionId || (regionId == QStringLiteral("nfr") && r.regionId == QStringLiteral("ner"))) {
            for (const auto &tn : r.trainNumbers) {
                auto it = m_trains.find(tn);
                if (it != m_trains.end()) {
                    list.append(it->toMap());
                }
            }
            break;
        }
    }
    return list;
}

QVariantMap TrainConfigProvider::trainInfo(const QString &trainNumber) const
{
    auto it = m_trains.find(trainNumber);
    if (it != m_trains.end()) {
        return it->toMap();
    }
    return QVariantMap();
}

bool TrainConfigProvider::isValidTrain(const QString &trainNumber) const
{
    return m_trains.contains(trainNumber);
}

QString TrainConfigProvider::regionForTrain(const QString &trainNumber) const
{
    auto it = m_trains.find(trainNumber);
    if (it != m_trains.end()) {
        return it->regionId;
    }
    return QString();
}

QString TrainConfigProvider::regionNameForTrain(const QString &trainNumber) const
{
    QString regId = regionForTrain(trainNumber);
    for (const auto &r : m_regions) {
        if (r.regionId == regId) return r.regionName;
    }
    return QString();
}

// ============================================================================
// Route Queries
// ============================================================================

QVariantList TrainConfigProvider::routeStations(const QString &trainNumber) const
{
    auto it = m_trains.find(trainNumber);
    if (it != m_trains.end()) {
        QVariantList list;
        for (const auto &s : it->routeStations) {
            list.append(s.toMap());
        }
        return list;
    }
    return QVariantList();
}

QVariantList TrainConfigProvider::waterJunctions(const QString &trainNumber) const
{
    auto it = m_trains.find(trainNumber);
    if (it != m_trains.end()) {
        QVariantList list;
        for (const auto &s : it->routeStations) {
            if (s.waterFillingAvailable || s.isWaterSource) {
                list.append(s.toMap());
            }
        }
        return list;
    }
    return QVariantList();
}

// ============================================================================
// Tank Association Queries
// ============================================================================

QStringList TrainConfigProvider::tankIdsForTrain(const QString &trainNumber) const
{
    auto it = m_trains.find(trainNumber);
    if (it != m_trains.end()) {
        return it->allTankIds();
    }
    return QStringList();
}

QVariantList TrainConfigProvider::coachesForTrain(const QString &trainNumber) const
{
    auto it = m_trains.find(trainNumber);
    if (it != m_trains.end()) {
        QVariantList list;
        for (const auto &c : it->coaches) {
            list.append(c.toMap());
        }
        return list;
    }
    return QVariantList();
}

QVariantList TrainConfigProvider::tanksForTrain(const QString &trainNumber) const
{
    auto it = m_trains.find(trainNumber);
    if (it != m_trains.end()) {
        QVariantList list;
        for (const auto &t : it->tanks) {
            list.append(t.toMap());
        }
        return list;
    }
    return QVariantList();
}

QVariantList TrainConfigProvider::allConfiguredTanks() const
{
    QVariantList list;
    for (const auto &train : m_trains) {
        for (const auto &t : train.tanks) {
            list.append(t.toMap());
        }
    }
    return list;
}

const QList<TankConfig>& TrainConfigProvider::tankConfigsForTrain(const QString &trainNumber) const
{
    static const QList<TankConfig> s_empty;
    auto it = m_trains.find(trainNumber);
    if (it != m_trains.end()) {
        return it->tanks;
    }
    return s_empty;
}

QList<TankConfig> TrainConfigProvider::allTankConfigs() const
{
    QList<TankConfig> list;
    for (const auto &train : m_trains) {
        list.append(train.tanks);
    }
    return list;
}

// ============================================================================
// Helper to generate coaches and tanks consistently
// ============================================================================

static void buildTrainConsist(
    TrainConfig &train,
    const QString &regionName,
    const QList<std::tuple<QString, QString, QString>> &coachDefs)
{
    train.coaches.clear();
    train.tanks.clear();

    int tankSeq = 1;

    for (const auto &cDef : coachDefs) {
        const QString coachNumber = std::get<0>(cDef);
        const QString coachName = std::get<1>(cDef);
        const QString coachType = std::get<2>(cDef);

        CoachConfig coach;
        coach.coachNumber = coachNumber;
        coach.coachName = coachName;
        coach.coachType = coachType;

        // 2 tanks per coach: Tank 1 (Front / Main Tank), Tank 2 (Rear / Aux Tank)
        // Tank 1
        {
            TankConfig tk;
            tk.tankId = QStringLiteral("T-%1-%2").arg(train.trainNumber).arg(tankSeq, 2, 10, QLatin1Char('0'));
            tk.tankNumber = QStringLiteral("T01");
            if (train.trainNumber == QStringLiteral("12301") && tankSeq <= 18) {
                tk.legacyId = QStringLiteral("tank-%1").arg(tankSeq, 3, 10, QLatin1Char('0'));
            }
            if (train.trainNumber == QStringLiteral("12301")) {
                if (tankSeq == 1) {
                    tk.deviceId = QStringLiteral("wli");
                    tk.isPrimaryHardwareDevice = true;
                } else {
                    tk.deviceId = QString();
                    tk.isPrimaryHardwareDevice = false;
                }
            }
            tk.trainNumber = train.trainNumber;
            tk.trainName = train.trainName;
            tk.regionId = train.regionId;
            tk.regionName = regionName;
            tk.coachNumber = coachNumber;
            tk.coachName = coachName;
            tk.coachType = coachType;
            tk.position = QStringLiteral("Front");
            tk.tankName = (tankSeq == 1) ? QStringLiteral("Toilet Front") : QStringLiteral("Tank %1").arg(tankSeq, 3, 10, QLatin1Char('0'));
            tk.tankType = QStringLiteral("Main Tank");
            tk.maxHeightCm = 50.0;
            tk.capacityLiters = (train.trainNumber == QStringLiteral("12301") && tankSeq == 1) ? 20.0 : 60.0;

            coach.tankIds.append(tk.tankId);
            train.tanks.append(tk);
            ++tankSeq;
        }

        // Tank 2
        {
            TankConfig tk;
            tk.tankId = QStringLiteral("T-%1-%2").arg(train.trainNumber).arg(tankSeq, 2, 10, QLatin1Char('0'));
            tk.tankNumber = QStringLiteral("T02");
            if (train.trainNumber == QStringLiteral("12301") && tankSeq <= 18) {
                tk.legacyId = QStringLiteral("tank-%1").arg(tankSeq, 3, 10, QLatin1Char('0'));
            }
            if (train.trainNumber == QStringLiteral("12301")) {
                tk.deviceId = QString();
                tk.isPrimaryHardwareDevice = false;
            }
            tk.trainNumber = train.trainNumber;
            tk.trainName = train.trainName;
            tk.regionId = train.regionId;
            tk.regionName = regionName;
            tk.coachNumber = coachNumber;
            tk.coachName = coachName;
            tk.coachType = coachType;
            tk.position = QStringLiteral("Rear");
            tk.tankName = (tankSeq == 2) ? QStringLiteral("Toilet Rear") : QStringLiteral("Tank %1").arg(tankSeq, 3, 10, QLatin1Char('0'));
            tk.tankType = QStringLiteral("Aux Tank");
            tk.maxHeightCm = 50.0;
            tk.capacityLiters = 35.3;

            coach.tankIds.append(tk.tankId);
            train.tanks.append(tk);
            ++tankSeq;
        }

        train.coaches.append(coach);
    }
}

// ============================================================================
// Initialization — Static Configuration Data
// ============================================================================

void TrainConfigProvider::initializeRegions()
{
    m_regions.clear();

    RegionConfig er;
    er.regionId = QStringLiteral("er");
    er.regionName = QStringLiteral("Eastern Railway");
    er.trainNumbers = {QStringLiteral("12301"), QStringLiteral("12302"), QStringLiteral("12019")};
    m_regions.append(er);

    RegionConfig ser;
    ser.regionId = QStringLiteral("ser");
    ser.regionName = QStringLiteral("South Eastern Region");
    ser.trainNumbers = {QStringLiteral("12801"), QStringLiteral("12809"), QStringLiteral("12841")};
    m_regions.append(ser);

    RegionConfig ner;
    ner.regionId = QStringLiteral("ner");
    ner.regionName = QStringLiteral("North Eastern Region");
    ner.trainNumbers = {QStringLiteral("12501"), QStringLiteral("12505"), QStringLiteral("12423")};
    m_regions.append(ner);

    RegionConfig wr;
    wr.regionId = QStringLiteral("wr");
    wr.regionName = QStringLiteral("Western Region");
    wr.trainNumbers = {QStringLiteral("12951"), QStringLiteral("12953"), QStringLiteral("12903")};
    m_regions.append(wr);
}

void TrainConfigProvider::initializeTrains()
{
    m_trains.clear();

    // ========================================================================
    // EASTERN RAILWAY
    // ========================================================================

    // 12301 — Rajdhani Express (Howrah Junction → New Delhi)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12301");
        t.trainName = QStringLiteral("Rajdhani Express");
        t.regionId = QStringLiteral("er");
        t.source = QStringLiteral("Howrah Junction");
        t.destination = QStringLiteral("New Delhi");

        RouteStation s;
        s = {}; s.id = QStringLiteral("hwh"); s.name = QStringLiteral("Howrah Junction"); s.code = QStringLiteral("HWH");
        s.latitude = 22.5839; s.longitude = 88.3426; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bwn"); s.name = QStringLiteral("Barddhaman Junction"); s.code = QStringLiteral("BWN");
        s.latitude = 23.2324; s.longitude = 87.8615; s.routeOrder = 1;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 25000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("dgr"); s.name = QStringLiteral("Durgapur"); s.code = QStringLiteral("DGR");
        s.latitude = 23.5014; s.longitude = 87.3119; s.routeOrder = 2;
        s.isJunction = false; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("asn"); s.name = QStringLiteral("Asansol Junction"); s.code = QStringLiteral("ASN");
        s.latitude = 23.6871; s.longitude = 86.9746; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("dhn"); s.name = QStringLiteral("Dhanbad Junction"); s.code = QStringLiteral("DHN");
        s.latitude = 23.7957; s.longitude = 86.4304; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("gaya"); s.name = QStringLiteral("Gaya Junction"); s.code = QStringLiteral("GAYA");
        s.latitude = 24.7914; s.longitude = 85.0002; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ddu"); s.name = QStringLiteral("Pt. Deen Dayal Upadhyaya Jn"); s.code = QStringLiteral("DDU");
        s.latitude = 25.2795; s.longitude = 83.0079; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("pryj"); s.name = QStringLiteral("Prayagraj Junction"); s.code = QStringLiteral("PRYJ");
        s.latitude = 25.4358; s.longitude = 81.8463; s.routeOrder = 7;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("cnb"); s.name = QStringLiteral("Kanpur Central"); s.code = QStringLiteral("CNB");
        s.latitude = 26.4499; s.longitude = 80.3319; s.routeOrder = 8;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ndls"); s.name = QStringLiteral("New Delhi"); s.code = QStringLiteral("NDLS");
        s.latitude = 28.6417; s.longitude = 77.2194; s.routeOrder = 9;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 60000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("Eastern Railway"), {
            {QStringLiteral("S1"), QStringLiteral("Coach S1"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S2"), QStringLiteral("Coach S2"), QStringLiteral("AC 3-Tier")},
            {QStringLiteral("S3"), QStringLiteral("Coach S3"), QStringLiteral("AC 2-Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B4"), QStringLiteral("Coach B4"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B5"), QStringLiteral("Coach B5"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // 12302 — Howrah Rajdhani (New Delhi → Howrah Junction)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12302");
        t.trainName = QStringLiteral("Howrah Rajdhani");
        t.regionId = QStringLiteral("er");
        t.source = QStringLiteral("New Delhi");
        t.destination = QStringLiteral("Howrah Junction");

        RouteStation s;
        s = {}; s.id = QStringLiteral("ndls"); s.name = QStringLiteral("New Delhi"); s.code = QStringLiteral("NDLS");
        s.latitude = 28.6417; s.longitude = 77.2194; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 60000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("cnb"); s.name = QStringLiteral("Kanpur Central"); s.code = QStringLiteral("CNB");
        s.latitude = 26.4499; s.longitude = 80.3319; s.routeOrder = 1;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ddu"); s.name = QStringLiteral("Pt. Deen Dayal Upadhyaya Jn"); s.code = QStringLiteral("DDU");
        s.latitude = 25.2795; s.longitude = 83.0079; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("gaya"); s.name = QStringLiteral("Gaya Junction"); s.code = QStringLiteral("GAYA");
        s.latitude = 24.7914; s.longitude = 85.0002; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("dhn"); s.name = QStringLiteral("Dhanbad Junction"); s.code = QStringLiteral("DHN");
        s.latitude = 23.7957; s.longitude = 86.4304; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("asn"); s.name = QStringLiteral("Asansol Junction"); s.code = QStringLiteral("ASN");
        s.latitude = 23.6871; s.longitude = 86.9746; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bwn"); s.name = QStringLiteral("Barddhaman Junction"); s.code = QStringLiteral("BWN");
        s.latitude = 23.2324; s.longitude = 87.8615; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 25000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("hwh"); s.name = QStringLiteral("Howrah Junction"); s.code = QStringLiteral("HWH");
        s.latitude = 22.5839; s.longitude = 88.3426; s.routeOrder = 7;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("Eastern Railway"), {
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC First Class")},
            {QStringLiteral("A2"), QStringLiteral("Coach A2"), QStringLiteral("AC First Class")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B4"), QStringLiteral("Coach B4"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B5"), QStringLiteral("Coach B5"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B6"), QStringLiteral("Coach B6"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // 12019 — Howrah–Ranchi Express (Howrah Junction → Ranchi)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12019");
        t.trainName = QStringLiteral("Howrah\u2013Ranchi Express");
        t.regionId = QStringLiteral("er");
        t.source = QStringLiteral("Howrah Junction");
        t.destination = QStringLiteral("Ranchi");

        RouteStation s;
        s = {}; s.id = QStringLiteral("hwh"); s.name = QStringLiteral("Howrah Junction"); s.code = QStringLiteral("HWH");
        s.latitude = 22.5839; s.longitude = 88.3426; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bwn"); s.name = QStringLiteral("Barddhaman Junction"); s.code = QStringLiteral("BWN");
        s.latitude = 23.2324; s.longitude = 87.8615; s.routeOrder = 1;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("dgr"); s.name = QStringLiteral("Durgapur"); s.code = QStringLiteral("DGR");
        s.latitude = 23.5014; s.longitude = 87.3119; s.routeOrder = 2;
        s.isJunction = false; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("asn"); s.name = QStringLiteral("Asansol Junction"); s.code = QStringLiteral("ASN");
        s.latitude = 23.6871; s.longitude = 86.9746; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("dhn"); s.name = QStringLiteral("Dhanbad Junction"); s.code = QStringLiteral("DHN");
        s.latitude = 23.7957; s.longitude = 86.4304; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bksc"); s.name = QStringLiteral("Bokaro Steel City"); s.code = QStringLiteral("BKSC");
        s.latitude = 23.6693; s.longitude = 86.1511; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("muri"); s.name = QStringLiteral("Muri Junction"); s.code = QStringLiteral("MURI");
        s.latitude = 23.3712; s.longitude = 85.8569; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("rnc"); s.name = QStringLiteral("Ranchi"); s.code = QStringLiteral("RNC");
        s.latitude = 23.3441; s.longitude = 85.3096; s.routeOrder = 7;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 25000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("Eastern Railway"), {
            {QStringLiteral("E1"), QStringLiteral("Coach E1"), QStringLiteral("Executive Chair Car")},
            {QStringLiteral("C1"), QStringLiteral("Coach C1"), QStringLiteral("AC Chair Car")},
            {QStringLiteral("C2"), QStringLiteral("Coach C2"), QStringLiteral("AC Chair Car")},
            {QStringLiteral("C3"), QStringLiteral("Coach C3"), QStringLiteral("AC Chair Car")},
            {QStringLiteral("C4"), QStringLiteral("Coach C4"), QStringLiteral("AC Chair Car")},
            {QStringLiteral("C5"), QStringLiteral("Coach C5"), QStringLiteral("AC Chair Car")},
            {QStringLiteral("C6"), QStringLiteral("Coach C6"), QStringLiteral("AC Chair Car")},
            {QStringLiteral("D1"), QStringLiteral("Coach D1"), QStringLiteral("Second Sitting")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // ========================================================================
    // SOUTH EASTERN REGION
    // ========================================================================

    // 12801 — Purushottam Express (Puri → New Delhi)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12801");
        t.trainName = QStringLiteral("Purushottam Express");
        t.regionId = QStringLiteral("ser");
        t.source = QStringLiteral("Puri");
        t.destination = QStringLiteral("New Delhi");

        RouteStation s;
        s = {}; s.id = QStringLiteral("puri"); s.name = QStringLiteral("Puri"); s.code = QStringLiteral("PURI");
        s.latitude = 19.8135; s.longitude = 85.8312; s.routeOrder = 0;
        s.isSource = true; s.isJunction = false; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 25000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kur"); s.name = QStringLiteral("Khurda Road Junction"); s.code = QStringLiteral("KUR");
        s.latitude = 20.1873; s.longitude = 85.7337; s.routeOrder = 1;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bbs"); s.name = QStringLiteral("Bhubaneswar"); s.code = QStringLiteral("BBS");
        s.latitude = 20.2707; s.longitude = 85.8409; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ctc"); s.name = QStringLiteral("Cuttack Junction"); s.code = QStringLiteral("CTC");
        s.latitude = 20.4625; s.longitude = 85.8830; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bls"); s.name = QStringLiteral("Balasore"); s.code = QStringLiteral("BLS");
        s.latitude = 21.4934; s.longitude = 86.9317; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 25000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("tata"); s.name = QStringLiteral("Tatanagar Junction"); s.code = QStringLiteral("TATA");
        s.latitude = 22.7856; s.longitude = 86.2025; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bksc"); s.name = QStringLiteral("Bokaro Steel City"); s.code = QStringLiteral("BKSC");
        s.latitude = 23.6693; s.longitude = 86.1511; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("gaya"); s.name = QStringLiteral("Gaya Junction"); s.code = QStringLiteral("GAYA");
        s.latitude = 24.7914; s.longitude = 85.0002; s.routeOrder = 7;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ddu"); s.name = QStringLiteral("Pt. Deen Dayal Upadhyaya Jn"); s.code = QStringLiteral("DDU");
        s.latitude = 25.2795; s.longitude = 83.0079; s.routeOrder = 8;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("cnb"); s.name = QStringLiteral("Kanpur Central"); s.code = QStringLiteral("CNB");
        s.latitude = 26.4499; s.longitude = 80.3319; s.routeOrder = 9;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ndls"); s.name = QStringLiteral("New Delhi"); s.code = QStringLiteral("NDLS");
        s.latitude = 28.6417; s.longitude = 77.2194; s.routeOrder = 10;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 60000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("South Eastern Region"), {
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("A2"), QStringLiteral("Coach A2"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B4"), QStringLiteral("Coach B4"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("S1"), QStringLiteral("Coach S1"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S2"), QStringLiteral("Coach S2"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // 12809 — Mumbai CSMT–Howrah Mail (Mumbai CSMT → Howrah Junction)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12809");
        t.trainName = QStringLiteral("Mumbai CSMT\u2013Howrah Mail");
        t.regionId = QStringLiteral("ser");
        t.source = QStringLiteral("Mumbai CSMT");
        t.destination = QStringLiteral("Howrah Junction");

        RouteStation s;
        s = {}; s.id = QStringLiteral("csmt"); s.name = QStringLiteral("Mumbai CSMT"); s.code = QStringLiteral("CSMT");
        s.latitude = 18.9401; s.longitude = 72.8355; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kyn"); s.name = QStringLiteral("Kalyan Junction"); s.code = QStringLiteral("KYN");
        s.latitude = 19.2437; s.longitude = 73.1355; s.routeOrder = 1;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("nk"); s.name = QStringLiteral("Nashik Road"); s.code = QStringLiteral("NK");
        s.latitude = 19.9575; s.longitude = 73.8340; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bsl"); s.name = QStringLiteral("Bhusaval Junction"); s.code = QStringLiteral("BSL");
        s.latitude = 21.0455; s.longitude = 75.8011; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ngp"); s.name = QStringLiteral("Nagpur Junction"); s.code = QStringLiteral("NGP");
        s.latitude = 21.1528; s.longitude = 79.0882; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 45000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("r"); s.name = QStringLiteral("Raipur Junction"); s.code = QStringLiteral("R");
        s.latitude = 21.2514; s.longitude = 81.6296; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bsp"); s.name = QStringLiteral("Bilaspur Junction"); s.code = QStringLiteral("BSP");
        s.latitude = 22.0797; s.longitude = 82.1409; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("rou"); s.name = QStringLiteral("Rourkela Junction"); s.code = QStringLiteral("ROU");
        s.latitude = 22.2272; s.longitude = 84.8622; s.routeOrder = 7;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("tata"); s.name = QStringLiteral("Tatanagar Junction"); s.code = QStringLiteral("TATA");
        s.latitude = 22.7856; s.longitude = 86.2025; s.routeOrder = 8;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kgp"); s.name = QStringLiteral("Kharagpur Junction"); s.code = QStringLiteral("KGP");
        s.latitude = 22.3385; s.longitude = 87.3205; s.routeOrder = 9;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("hwh"); s.name = QStringLiteral("Howrah Junction"); s.code = QStringLiteral("HWH");
        s.latitude = 22.5839; s.longitude = 88.3426; s.routeOrder = 10;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("South Eastern Region"), {
            {QStringLiteral("H1"), QStringLiteral("Coach H1"), QStringLiteral("AC First Class")},
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("S1"), QStringLiteral("Coach S1"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S2"), QStringLiteral("Coach S2"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S3"), QStringLiteral("Coach S3"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S4"), QStringLiteral("Coach S4"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // 12841 — Coromandel Express (Howrah Junction → MGR Chennai Central)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12841");
        t.trainName = QStringLiteral("Coromandel Express");
        t.regionId = QStringLiteral("ser");
        t.source = QStringLiteral("Howrah Junction");
        t.destination = QStringLiteral("MGR Chennai Central");

        RouteStation s;
        s = {}; s.id = QStringLiteral("hwh"); s.name = QStringLiteral("Howrah Junction"); s.code = QStringLiteral("HWH");
        s.latitude = 22.5839; s.longitude = 88.3426; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kgp"); s.name = QStringLiteral("Kharagpur Junction"); s.code = QStringLiteral("KGP");
        s.latitude = 22.3385; s.longitude = 87.3205; s.routeOrder = 1;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bls"); s.name = QStringLiteral("Balasore"); s.code = QStringLiteral("BLS");
        s.latitude = 21.4934; s.longitude = 86.9317; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 25000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ctc"); s.name = QStringLiteral("Cuttack Junction"); s.code = QStringLiteral("CTC");
        s.latitude = 20.4625; s.longitude = 85.8830; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bbs"); s.name = QStringLiteral("Bhubaneswar"); s.code = QStringLiteral("BBS");
        s.latitude = 20.2707; s.longitude = 85.8409; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("vskp"); s.name = QStringLiteral("Visakhapatnam Junction"); s.code = QStringLiteral("VSKP");
        s.latitude = 17.7215; s.longitude = 83.2870; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 45000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bza"); s.name = QStringLiteral("Vijayawada Junction"); s.code = QStringLiteral("BZA");
        s.latitude = 16.5062; s.longitude = 80.6480; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("mas"); s.name = QStringLiteral("MGR Chennai Central"); s.code = QStringLiteral("MAS");
        s.latitude = 13.0827; s.longitude = 80.2707; s.routeOrder = 7;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 60000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("South Eastern Region"), {
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("A2"), QStringLiteral("Coach A2"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B4"), QStringLiteral("Coach B4"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("S1"), QStringLiteral("Coach S1"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S2"), QStringLiteral("Coach S2"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // ========================================================================
    // NORTH EASTERN REGION
    // ========================================================================

    // 12501 — North East Express (Guwahati → New Delhi)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12501");
        t.trainName = QStringLiteral("North East Express");
        t.regionId = QStringLiteral("ner");
        t.source = QStringLiteral("Guwahati");
        t.destination = QStringLiteral("New Delhi");

        RouteStation s;
        s = {}; s.id = QStringLiteral("ghy"); s.name = QStringLiteral("Guwahati"); s.code = QStringLiteral("GHY");
        s.latitude = 26.1824; s.longitude = 91.7513; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kyq"); s.name = QStringLiteral("Kamakhya Junction"); s.code = QStringLiteral("KYQ");
        s.latitude = 26.1557; s.longitude = 91.7061; s.routeOrder = 1;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("nbq"); s.name = QStringLiteral("New Bongaigaon Junction"); s.code = QStringLiteral("NBQ");
        s.latitude = 26.4975; s.longitude = 90.5488; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("njp"); s.name = QStringLiteral("New Jalpaiguri Junction"); s.code = QStringLiteral("NJP");
        s.latitude = 26.6853; s.longitude = 88.4410; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kir"); s.name = QStringLiteral("Katihar Junction"); s.code = QStringLiteral("KIR");
        s.latitude = 25.5413; s.longitude = 87.5714; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bju"); s.name = QStringLiteral("Barauni Junction"); s.code = QStringLiteral("BJU");
        s.latitude = 25.4740; s.longitude = 85.9790; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("pnbe"); s.name = QStringLiteral("Patna Junction"); s.code = QStringLiteral("PNBE");
        s.latitude = 25.6022; s.longitude = 85.1376; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ddu"); s.name = QStringLiteral("Pt. Deen Dayal Upadhyaya Jn"); s.code = QStringLiteral("DDU");
        s.latitude = 25.2795; s.longitude = 83.0079; s.routeOrder = 7;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("cnb"); s.name = QStringLiteral("Kanpur Central"); s.code = QStringLiteral("CNB");
        s.latitude = 26.4499; s.longitude = 80.3319; s.routeOrder = 8;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ndls"); s.name = QStringLiteral("New Delhi"); s.code = QStringLiteral("NDLS");
        s.latitude = 28.6417; s.longitude = 77.2194; s.routeOrder = 9;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 60000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("North Eastern Region"), {
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B4"), QStringLiteral("Coach B4"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("S1"), QStringLiteral("Coach S1"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S2"), QStringLiteral("Coach S2"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S3"), QStringLiteral("Coach S3"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // 12505 — North East Express (Kamakhya → Anand Vihar Terminal)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12505");
        t.trainName = QStringLiteral("North East Express");
        t.regionId = QStringLiteral("ner");
        t.source = QStringLiteral("Kamakhya");
        t.destination = QStringLiteral("Anand Vihar Terminal");

        RouteStation s;
        s = {}; s.id = QStringLiteral("kyq"); s.name = QStringLiteral("Kamakhya Junction"); s.code = QStringLiteral("KYQ");
        s.latitude = 26.1557; s.longitude = 91.7061; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("nbq"); s.name = QStringLiteral("New Bongaigaon Junction"); s.code = QStringLiteral("NBQ");
        s.latitude = 26.4975; s.longitude = 90.5488; s.routeOrder = 1;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("njp"); s.name = QStringLiteral("New Jalpaiguri Junction"); s.code = QStringLiteral("NJP");
        s.latitude = 26.6853; s.longitude = 88.4410; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kir"); s.name = QStringLiteral("Katihar Junction"); s.code = QStringLiteral("KIR");
        s.latitude = 25.5413; s.longitude = 87.5714; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bju"); s.name = QStringLiteral("Barauni Junction"); s.code = QStringLiteral("BJU");
        s.latitude = 25.4740; s.longitude = 85.9790; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("dnr"); s.name = QStringLiteral("Danapur"); s.code = QStringLiteral("DNR");
        s.latitude = 25.6267; s.longitude = 85.0447; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 25000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ddu"); s.name = QStringLiteral("Pt. Deen Dayal Upadhyaya Jn"); s.code = QStringLiteral("DDU");
        s.latitude = 25.2795; s.longitude = 83.0079; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("pryj"); s.name = QStringLiteral("Prayagraj Junction"); s.code = QStringLiteral("PRYJ");
        s.latitude = 25.4358; s.longitude = 81.8463; s.routeOrder = 7;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("cnb"); s.name = QStringLiteral("Kanpur Central"); s.code = QStringLiteral("CNB");
        s.latitude = 26.4499; s.longitude = 80.3319; s.routeOrder = 8;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("anvt"); s.name = QStringLiteral("Anand Vihar Terminal"); s.code = QStringLiteral("ANVT");
        s.latitude = 28.6502; s.longitude = 77.3150; s.routeOrder = 9;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("North Eastern Region"), {
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B4"), QStringLiteral("Coach B4"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("S1"), QStringLiteral("Coach S1"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S2"), QStringLiteral("Coach S2"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S3"), QStringLiteral("Coach S3"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // 12423 — Dibrugarh Rajdhani Express (Dibrugarh → New Delhi)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12423");
        t.trainName = QStringLiteral("Dibrugarh Rajdhani Express");
        t.regionId = QStringLiteral("ner");
        t.source = QStringLiteral("Dibrugarh");
        t.destination = QStringLiteral("New Delhi");

        RouteStation s;
        s = {}; s.id = QStringLiteral("dbrg"); s.name = QStringLiteral("Dibrugarh"); s.code = QStringLiteral("DBRG");
        s.latitude = 27.4728; s.longitude = 94.9120; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ntsk"); s.name = QStringLiteral("New Tinsukia Junction"); s.code = QStringLiteral("NTSK");
        s.latitude = 27.4922; s.longitude = 95.3467; s.routeOrder = 1;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("lmg"); s.name = QStringLiteral("Lumding Junction"); s.code = QStringLiteral("LMG");
        s.latitude = 25.7505; s.longitude = 93.1706; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ghy"); s.name = QStringLiteral("Guwahati"); s.code = QStringLiteral("GHY");
        s.latitude = 26.1824; s.longitude = 91.7513; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("njp"); s.name = QStringLiteral("New Jalpaiguri Junction"); s.code = QStringLiteral("NJP");
        s.latitude = 26.6853; s.longitude = 88.4410; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kir"); s.name = QStringLiteral("Katihar Junction"); s.code = QStringLiteral("KIR");
        s.latitude = 25.5413; s.longitude = 87.5714; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ddu"); s.name = QStringLiteral("Pt. Deen Dayal Upadhyaya Jn"); s.code = QStringLiteral("DDU");
        s.latitude = 25.2795; s.longitude = 83.0079; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("pryj"); s.name = QStringLiteral("Prayagraj Junction"); s.code = QStringLiteral("PRYJ");
        s.latitude = 25.4358; s.longitude = 81.8463; s.routeOrder = 7;
        s.isJunction = true; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("cnb"); s.name = QStringLiteral("Kanpur Central"); s.code = QStringLiteral("CNB");
        s.latitude = 26.4499; s.longitude = 80.3319; s.routeOrder = 8;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ndls"); s.name = QStringLiteral("New Delhi"); s.code = QStringLiteral("NDLS");
        s.latitude = 28.6417; s.longitude = 77.2194; s.routeOrder = 9;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 60000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("North Eastern Region"), {
            {QStringLiteral("H1"), QStringLiteral("Coach H1"), QStringLiteral("AC First Class")},
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("A2"), QStringLiteral("Coach A2"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B4"), QStringLiteral("Coach B4"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B5"), QStringLiteral("Coach B5"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B6"), QStringLiteral("Coach B6"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // ========================================================================
    // WESTERN REGION
    // ========================================================================

    // 12951 — Mumbai Rajdhani (Mumbai Central → New Delhi)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12951");
        t.trainName = QStringLiteral("Mumbai Rajdhani");
        t.regionId = QStringLiteral("wr");
        t.source = QStringLiteral("Mumbai Central");
        t.destination = QStringLiteral("New Delhi");

        RouteStation s;
        s = {}; s.id = QStringLiteral("mmct"); s.name = QStringLiteral("Mumbai Central"); s.code = QStringLiteral("MMCT");
        s.latitude = 18.9696; s.longitude = 72.8193; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bvi"); s.name = QStringLiteral("Borivali"); s.code = QStringLiteral("BVI");
        s.latitude = 19.2288; s.longitude = 72.8576; s.routeOrder = 1;
        s.isJunction = false; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("st"); s.name = QStringLiteral("Surat"); s.code = QStringLiteral("ST");
        s.latitude = 21.2049; s.longitude = 72.8407; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("brc"); s.name = QStringLiteral("Vadodara Junction"); s.code = QStringLiteral("BRC");
        s.latitude = 22.3107; s.longitude = 73.1812; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("rtm"); s.name = QStringLiteral("Ratlam Junction"); s.code = QStringLiteral("RTM");
        s.latitude = 23.3441; s.longitude = 75.0376; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kota"); s.name = QStringLiteral("Kota Junction"); s.code = QStringLiteral("KOTA");
        s.latitude = 25.2215; s.longitude = 75.8647; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ndls"); s.name = QStringLiteral("New Delhi"); s.code = QStringLiteral("NDLS");
        s.latitude = 28.6417; s.longitude = 77.2194; s.routeOrder = 6;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 60000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("Western Region"), {
            {QStringLiteral("H1"), QStringLiteral("Coach H1"), QStringLiteral("AC First Class")},
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("A2"), QStringLiteral("Coach A2"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B4"), QStringLiteral("Coach B4"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B5"), QStringLiteral("Coach B5"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // 12953 — August Kranti Rajdhani (Mumbai Central → Hazrat Nizamuddin)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12953");
        t.trainName = QStringLiteral("August Kranti Rajdhani");
        t.regionId = QStringLiteral("wr");
        t.source = QStringLiteral("Mumbai Central");
        t.destination = QStringLiteral("Hazrat Nizamuddin");

        RouteStation s;
        s = {}; s.id = QStringLiteral("mmct"); s.name = QStringLiteral("Mumbai Central"); s.code = QStringLiteral("MMCT");
        s.latitude = 18.9696; s.longitude = 72.8193; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bvi"); s.name = QStringLiteral("Borivali"); s.code = QStringLiteral("BVI");
        s.latitude = 19.2288; s.longitude = 72.8576; s.routeOrder = 1;
        s.isJunction = false; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("st"); s.name = QStringLiteral("Surat"); s.code = QStringLiteral("ST");
        s.latitude = 21.2049; s.longitude = 72.8407; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("brc"); s.name = QStringLiteral("Vadodara Junction"); s.code = QStringLiteral("BRC");
        s.latitude = 22.3107; s.longitude = 73.1812; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("rtm"); s.name = QStringLiteral("Ratlam Junction"); s.code = QStringLiteral("RTM");
        s.latitude = 23.3441; s.longitude = 75.0376; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kota"); s.name = QStringLiteral("Kota Junction"); s.code = QStringLiteral("KOTA");
        s.latitude = 25.2215; s.longitude = 75.8647; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("mtj"); s.name = QStringLiteral("Mathura Junction"); s.code = QStringLiteral("MTJ");
        s.latitude = 27.4924; s.longitude = 77.6737; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("nzm"); s.name = QStringLiteral("Hazrat Nizamuddin"); s.code = QStringLiteral("NZM");
        s.latitude = 28.5888; s.longitude = 77.2534; s.routeOrder = 7;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 55000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("Western Region"), {
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC First Class")},
            {QStringLiteral("A2"), QStringLiteral("Coach A2"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B4"), QStringLiteral("Coach B4"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B5"), QStringLiteral("Coach B5"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B6"), QStringLiteral("Coach B6"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }

    // 12903 — Golden Temple Mail (Mumbai Central → Amritsar Junction)
    {
        TrainConfig t;
        t.trainNumber = QStringLiteral("12903");
        t.trainName = QStringLiteral("Golden Temple Mail");
        t.regionId = QStringLiteral("wr");
        t.source = QStringLiteral("Mumbai Central");
        t.destination = QStringLiteral("Amritsar Junction");

        RouteStation s;
        s = {}; s.id = QStringLiteral("mmct"); s.name = QStringLiteral("Mumbai Central"); s.code = QStringLiteral("MMCT");
        s.latitude = 18.9696; s.longitude = 72.8193; s.routeOrder = 0;
        s.isSource = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("bvi"); s.name = QStringLiteral("Borivali"); s.code = QStringLiteral("BVI");
        s.latitude = 19.2288; s.longitude = 72.8576; s.routeOrder = 1;
        s.isJunction = false; s.isWaterSource = false; s.waterFillingAvailable = false;
        s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("st"); s.name = QStringLiteral("Surat"); s.code = QStringLiteral("ST");
        s.latitude = 21.2049; s.longitude = 72.8407; s.routeOrder = 2;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("brc"); s.name = QStringLiteral("Vadodara Junction"); s.code = QStringLiteral("BRC");
        s.latitude = 22.3107; s.longitude = 73.1812; s.routeOrder = 3;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("rtm"); s.name = QStringLiteral("Ratlam Junction"); s.code = QStringLiteral("RTM");
        s.latitude = 23.3441; s.longitude = 75.0376; s.routeOrder = 4;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("kota"); s.name = QStringLiteral("Kota Junction"); s.code = QStringLiteral("KOTA");
        s.latitude = 25.2215; s.longitude = 75.8647; s.routeOrder = 5;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 40000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("mtj"); s.name = QStringLiteral("Mathura Junction"); s.code = QStringLiteral("MTJ");
        s.latitude = 27.4924; s.longitude = 77.6737; s.routeOrder = 6;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("nzm"); s.name = QStringLiteral("Hazrat Nizamuddin"); s.code = QStringLiteral("NZM");
        s.latitude = 28.5888; s.longitude = 77.2534; s.routeOrder = 7;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 55000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("umb"); s.name = QStringLiteral("Ambala Cantt Junction"); s.code = QStringLiteral("UMB");
        s.latitude = 30.3308; s.longitude = 76.8378; s.routeOrder = 8;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 35000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("ldh"); s.name = QStringLiteral("Ludhiana Junction"); s.code = QStringLiteral("LDH");
        s.latitude = 30.9010; s.longitude = 75.8573; s.routeOrder = 9;
        s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 30000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        s = {}; s.id = QStringLiteral("asr"); s.name = QStringLiteral("Amritsar Junction"); s.code = QStringLiteral("ASR");
        s.latitude = 31.6340; s.longitude = 74.8723; s.routeOrder = 10;
        s.isDestination = true; s.isJunction = true; s.isWaterSource = true; s.waterFillingAvailable = true;
        s.waterFillingCapacityLiters = 50000.0; s.operationalStatus = QStringLiteral("Operational"); s.lastVerified = QStringLiteral("05 Sep 2026");
        t.routeStations.append(s);

        buildTrainConsist(t, QStringLiteral("Western Region"), {
            {QStringLiteral("A1"), QStringLiteral("Coach A1"), QStringLiteral("AC 2 Tier")},
            {QStringLiteral("B1"), QStringLiteral("Coach B1"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B2"), QStringLiteral("Coach B2"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("B3"), QStringLiteral("Coach B3"), QStringLiteral("AC 3 Tier")},
            {QStringLiteral("S1"), QStringLiteral("Coach S1"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S2"), QStringLiteral("Coach S2"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S3"), QStringLiteral("Coach S3"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("S4"), QStringLiteral("Coach S4"), QStringLiteral("Sleeper Class")},
            {QStringLiteral("PC"), QStringLiteral("Pantry/Service"), QStringLiteral("Pantry Car")}
        });

        m_trains.insert(t.trainNumber, t);
    }
}

// ============================================================================
// Data Validation
// ============================================================================

bool TrainConfigProvider::validateConfiguration() const
{
    bool valid = true;
    QSet<QString> globalTankIds;
    int totalCoaches = 0;
    int totalTanks = 0;
    int totalStations = 0;
    int totalJunctions = 0;
    int totalWaterSources = 0;

    // Check regions
    if (m_regions.size() != 4) {
        qCritical() << "[TrainConfig] Validation failed: expected exactly 4 regions, found:" << m_regions.size();
        valid = false;
    }

    for (const auto &r : m_regions) {
        if (r.regionId.isEmpty()) {
            qCritical() << "[TrainConfig] Region has empty ID!";
            valid = false;
        }
        if (r.regionName.isEmpty()) {
            qCritical() << "[TrainConfig] Region" << r.regionId << "has empty name!";
            valid = false;
        }
        if (r.trainNumbers.isEmpty()) {
            qCritical() << "[TrainConfig] Region" << r.regionName << "has no trains configured!";
            valid = false;
        }
    }

    // Check trains
    for (auto it = m_trains.begin(); it != m_trains.end(); ++it) {
        const TrainConfig &train = it.value();

        if (train.trainNumber.isEmpty()) {
            qCritical() << "[TrainConfig] Train record has empty train number!";
            valid = false;
        }
        if (train.trainName.isEmpty()) {
            qCritical() << "[TrainConfig] Train" << train.trainNumber << "has empty name!";
            valid = false;
        }
        if (train.regionId.isEmpty()) {
            qCritical() << "[TrainConfig] Train" << train.trainNumber << "has empty region ID!";
            valid = false;
        }
        if (train.source.isEmpty()) {
            qCritical() << "[TrainConfig] Train" << train.trainNumber << "has empty source station!";
            valid = false;
        }
        if (train.destination.isEmpty()) {
            qCritical() << "[TrainConfig] Train" << train.trainNumber << "has empty destination station!";
            valid = false;
        }

        // Route verification
        if (train.routeStations.size() < 2) {
            qCritical() << "[TrainConfig] Train" << train.trainNumber << "route has fewer than 2 stations!";
            valid = false;
        } else {
            if (!train.routeStations.first().isSource) {
                qCritical() << "[TrainConfig] Train" << train.trainNumber << "first station is not marked as source!";
                valid = false;
            }
            if (!train.routeStations.last().isDestination) {
                qCritical() << "[TrainConfig] Train" << train.trainNumber << "last station is not marked as destination!";
                valid = false;
            }
        }

        totalStations += train.routeStations.size();
        for (const auto &st : train.routeStations) {
            if (st.isJunction) ++totalJunctions;
            if (st.isWaterSource || st.waterFillingAvailable) ++totalWaterSources;
        }

        // Coaches & Tanks verification
        if (train.coaches.isEmpty()) {
            qCritical() << "[TrainConfig] Train" << train.trainNumber << "has 0 coaches configured!";
            valid = false;
        }
        if (train.tanks.isEmpty()) {
            qCritical() << "[TrainConfig] Train" << train.trainNumber << "has 0 tanks configured!";
            valid = false;
        }

        totalCoaches += train.coaches.size();
        totalTanks += train.tanks.size();

        // Check coach mapping
        QSet<QString> coachSet;
        for (const auto &c : train.coaches) {
            if (c.coachNumber.isEmpty()) {
                qCritical() << "[TrainConfig] Train" << train.trainNumber << "has coach with empty number!";
                valid = false;
            }
            if (coachSet.contains(c.coachNumber)) {
                qCritical() << "[TrainConfig] Train" << train.trainNumber << "has duplicate coach:" << c.coachNumber;
                valid = false;
            }
            coachSet.insert(c.coachNumber);
        }

        // Check each tank
        for (const auto &tk : train.tanks) {
            if (tk.tankId.isEmpty()) {
                qCritical() << "[TrainConfig] Train" << train.trainNumber << "has tank with empty ID!";
                valid = false;
            }
            if (globalTankIds.contains(tk.tankId)) {
                qCritical() << "[TrainConfig] Duplicate global tank ID detected:" << tk.tankId;
                valid = false;
            }
            globalTankIds.insert(tk.tankId);

            if (tk.trainNumber != train.trainNumber) {
                qCritical() << "[TrainConfig] Tank" << tk.tankId << "mismatches train number" << train.trainNumber;
                valid = false;
            }
            if (!coachSet.contains(tk.coachNumber)) {
                qCritical() << "[TrainConfig] Invalid tank assignment:" << tk.tankId
                            << "belongs to unknown coach" << tk.coachNumber << "on train" << train.trainNumber;
                valid = false;
            }
            if (tk.capacityLiters <= 0.0) {
                qCritical() << "[TrainConfig] Tank" << tk.tankId << "has invalid capacity:" << tk.capacityLiters;
                valid = false;
            }
        }
    }

    if (valid) {
        qInfo().noquote() << QStringLiteral("[TrainConfig] Configuration validation PASSED: %1 regions, %2 trains, %3 coaches, %4 tanks, %5 route stops, %6 junctions, %7 water refill locations.")
                                .arg(m_regions.size())
                                .arg(m_trains.size())
                                .arg(totalCoaches)
                                .arg(totalTanks)
                                .arg(totalStations)
                                .arg(totalJunctions)
                                .arg(totalWaterSources);
    }

    return valid;
}

} // namespace Panorama
