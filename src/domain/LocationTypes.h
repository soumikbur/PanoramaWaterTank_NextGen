#pragma once

#include <QString>
#include <QDateTime>
#include <QVariantMap>

namespace Panorama {

struct RailwayStation {
    QString id;
    QString name;
    QString code;
    double latitude{0.0};
    double longitude{0.0};
    int routeOrder{0};
    bool waterFillingAvailable{false};
    double waterFillingCapacityLiters{0.0};
    bool isJunction{false};
    bool isWaterSource{false};
    bool isSource{false};
    bool isDestination{false};
    QString operationalStatus{"Operational"};
    QString lastVerified{"05 Sep 2026"};
    double distanceKm{0.0};
    int etaMinutes{0};
    QString etaString{"--"};

    QVariantMap toMap() const {
        QVariantMap m;
        m[QStringLiteral("id")] = id;
        m[QStringLiteral("name")] = name;
        m[QStringLiteral("code")] = code;
        m[QStringLiteral("latitude")] = latitude;
        m[QStringLiteral("longitude")] = longitude;
        m[QStringLiteral("routeOrder")] = routeOrder;
        m[QStringLiteral("waterFillingAvailable")] = waterFillingAvailable || isWaterSource;
        m[QStringLiteral("waterFillingCapacityLiters")] = waterFillingCapacityLiters;
        m[QStringLiteral("capacityLiters")] = waterFillingCapacityLiters;
        m[QStringLiteral("isJunction")] = isJunction;
        m[QStringLiteral("isWaterSource")] = isWaterSource || waterFillingAvailable;
        m[QStringLiteral("isSource")] = isSource;
        m[QStringLiteral("isDestination")] = isDestination;
        m[QStringLiteral("operationalStatus")] = operationalStatus;
        m[QStringLiteral("facilityStatus")] = operationalStatus;
        m[QStringLiteral("lastVerified")] = lastVerified;
        m[QStringLiteral("distanceKm")] = distanceKm;
        m[QStringLiteral("etaMinutes")] = etaMinutes;
        m[QStringLiteral("etaString")] = etaString;
        return m;
    }
};

struct TrainLocation {
    QString trainId{"Train 001"};
    double latitude{0.0};
    double longitude{0.0};
    double altitudeMeters{0.0};
    double speedKmh{0.0};
    double headingDegrees{0.0};
    QString headingCardinal{"--"};
    double accuracyMeters{0.0};
    int satellites{0};
    QDateTime timestamp;
    bool hasValidFix{false};
    bool isLive{false};
    bool isStale{false};
    QString source{"EC200U-CN GNSS"};

    QVariantMap toMap() const {
        QVariantMap m;
        m[QStringLiteral("trainId")] = trainId;
        m[QStringLiteral("latitude")] = latitude;
        m[QStringLiteral("longitude")] = longitude;
        m[QStringLiteral("altitudeMeters")] = altitudeMeters;
        m[QStringLiteral("speedKmh")] = speedKmh;
        m[QStringLiteral("headingDegrees")] = headingDegrees;
        m[QStringLiteral("headingCardinal")] = headingCardinal;
        m[QStringLiteral("accuracyMeters")] = accuracyMeters;
        m[QStringLiteral("satellites")] = satellites;
        m[QStringLiteral("timestamp")] = timestamp.isValid() ? timestamp.toString(QStringLiteral("hh:mm:ss AP")) : QStringLiteral("--");
        m[QStringLiteral("hasValidFix")] = hasValidFix;
        m[QStringLiteral("isLive")] = isLive;
        m[QStringLiteral("isStale")] = isStale;
        m[QStringLiteral("source")] = source;
        return m;
    }
};

enum class RefillDecision {
    Safe,
    RefillRecommended,
    RefillRequired,
    NoFacilityReachable,
    InsufficientData
};

struct WaterEnduranceState {
    double totalMeasurableWaterLiters{24820.0};
    double totalCapacityLiters{36000.0};
    double fillPercentage{68.9};
    double consumptionRateLph{2850.0};
    QString consumptionTrend{"Increasing"};
    double criticalReserveLiters{3600.0};
    double usableWaterLiters{21220.0};
    int timeUntilCriticalMinutes{138};     // ~2h 18m
    QString timeUntilCriticalString{"2h 18m"};
    QString dataQuality{"High (16/18 reporting)"};
    RefillDecision decision{RefillDecision::RefillRequired};
    QString decisionString{"REFILL REQUIRED"};
    int marginMinutes{-44};
    QString marginString{"-44m"};

    QVariantMap toMap() const {
        QVariantMap m;
        m[QStringLiteral("totalMeasurableWaterLiters")] = totalMeasurableWaterLiters;
        m[QStringLiteral("totalCapacityLiters")] = totalCapacityLiters;
        m[QStringLiteral("fillPercentage")] = fillPercentage;
        m[QStringLiteral("consumptionRateLph")] = consumptionRateLph;
        m[QStringLiteral("consumptionTrend")] = consumptionTrend;
        m[QStringLiteral("criticalReserveLiters")] = criticalReserveLiters;
        m[QStringLiteral("usableWaterLiters")] = usableWaterLiters;
        m[QStringLiteral("timeUntilCriticalMinutes")] = timeUntilCriticalMinutes;
        m[QStringLiteral("timeUntilCriticalString")] = timeUntilCriticalString;
        m[QStringLiteral("dataQuality")] = dataQuality;
        m[QStringLiteral("decisionString")] = decisionString;
        m[QStringLiteral("marginMinutes")] = marginMinutes;
        m[QStringLiteral("marginString")] = marginString;
        return m;
    }
};

} // namespace Panorama
