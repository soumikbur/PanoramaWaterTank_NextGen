#pragma once

#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>
#include <QDateTime>
#include <QTimer>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <qqml.h>

#include "LocationTypes.h"

namespace Panorama {

class TrainManager;
class SettingsManager;
class TrainConfigProvider;

class LocationManager : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(QVariantMap trainLocation READ trainLocation NOTIFY locationChanged)
    Q_PROPERTY(double trainSpeed READ trainSpeed NOTIFY locationChanged)
    Q_PROPERTY(QString trainHeading READ trainHeading NOTIFY locationChanged)
    Q_PROPERTY(QString gpsStatus READ gpsStatus NOTIFY locationChanged)
    Q_PROPERTY(bool isGpsLive READ isGpsLive NOTIFY locationChanged)
    Q_PROPERTY(bool hasValidFix READ hasValidFix NOTIFY locationChanged)
    Q_PROPERTY(QString gpsLastUpdate READ gpsLastUpdate NOTIFY locationChanged)
    Q_PROPERTY(bool hasLastKnownLocation READ hasLastKnownLocation NOTIFY locationChanged)
    Q_PROPERTY(QVariantMap lastKnownLocation READ lastKnownLocation NOTIFY locationChanged)
    Q_PROPERTY(QString gpsBannerText READ gpsBannerText NOTIFY locationChanged)
    Q_PROPERTY(QString gpsBannerType READ gpsBannerType NOTIFY locationChanged)
    Q_PROPERTY(QString gnssEngineState READ gnssEngineState NOTIFY locationChanged)
    
    Q_PROPERTY(QString currentStationName READ currentStationName NOTIFY routeChanged)
    Q_PROPERTY(QString nextStationName READ nextStationName NOTIFY routeChanged)
    Q_PROPERTY(QString destinationStationName READ destinationStationName NOTIFY routeChanged)
    Q_PROPERTY(double routeProgressPercent READ routeProgressPercent NOTIFY routeChanged)
    Q_PROPERTY(double destinationDistanceKm READ destinationDistanceKm NOTIFY routeChanged)
    Q_PROPERTY(QString destinationEtaString READ destinationEtaString NOTIFY routeChanged)

    Q_PROPERTY(QVariantMap waterEndurance READ waterEndurance NOTIFY enduranceChanged)
    Q_PROPERTY(QString refillDecision READ refillDecision NOTIFY enduranceChanged)
    Q_PROPERTY(QVariantMap nextRefillStation READ nextRefillStation NOTIFY routeChanged)
    Q_PROPERTY(QVariantList stations READ stations NOTIFY routeChanged)
    Q_PROPERTY(QVariantList waterFacilities READ waterFacilities NOTIFY routeChanged)
    Q_PROPERTY(QString googleMapsApiKey READ googleMapsApiKey WRITE setGoogleMapsApiKey NOTIFY apiKeyChanged)
    Q_PROPERTY(QString activeTrainNumber READ activeTrainNumber NOTIFY activeTrainChanged)

public:
    explicit LocationManager(QObject *parent = nullptr);

    QVariantMap trainLocation() const;
    double trainSpeed() const { return m_trainLocation.speedKmh; }
    QString trainHeading() const { return m_trainLocation.headingCardinal; }
    QString gpsStatus() const;
    bool isGpsLive() const;
    bool hasValidFix() const { return m_trainLocation.hasValidFix; }
    QString gpsLastUpdate() const;
    bool hasLastKnownLocation() const { return m_hasLastKnownLocation; }
    QVariantMap lastKnownLocation() const;
    QString gpsBannerText() const;
    QString gpsBannerType() const;
    QString gnssEngineState() const { return m_gnssEngineState; }

    QString currentStationName() const { return m_currentStationName; }
    QString nextStationName() const { return m_nextStationName; }
    QString destinationStationName() const { return m_destinationStationName; }
    double routeProgressPercent() const { return m_routeProgressPercent; }
    double destinationDistanceKm() const { return m_destinationDistanceKm; }
    QString destinationEtaString() const { return m_destinationEtaString; }

    QVariantMap waterEndurance() const { return m_enduranceState.toMap(); }
    QString refillDecision() const { return m_enduranceState.decisionString; }
    QVariantMap nextRefillStation() const;
    QVariantList stations() const;
    QVariantList waterFacilities() const;
    QString googleMapsApiKey() const { return m_googleMapsApiKey; }
    bool isMockLocationEnabled() const { return m_mockLocationEnabled; }
    QString activeTrainNumber() const { return m_activeTrainNumber; }

    void setTrainManager(TrainManager *trainManager);
    void setSettingsManager(SettingsManager *settingsManager);
    void setTrainConfigProvider(TrainConfigProvider *provider) { m_trainConfigProvider = provider; }

    Q_INVOKABLE void setGoogleMapsApiKey(const QString &key);
    Q_INVOKABLE void updateGpsCoordinates(double lat, double lon, double speedKmh, double headingDeg, bool isLive, const QString &source);
    Q_INVOKABLE void processEsp32Status(const QJsonObject &statusObj);
    Q_INVOKABLE void setMockLocationEnabled(bool enabled) { m_mockLocationEnabled = enabled; }
    Q_INVOKABLE void recalculateEnduranceAndDecision();
    Q_INVOKABLE QVariantMap getStation(const QString &stationId) const;
    Q_INVOKABLE void requestGoogleRoute(double destLat, double destLon);
    Q_INVOKABLE void loadRouteForTrain(const QString &trainNumber);

signals:
    void locationChanged();
    void routeChanged();
    void enduranceChanged();
    void apiKeyChanged();
    void routeCalculated(double distanceKm, int durationMinutes, const QString &polyline);
    void activeTrainChanged();

private slots:
    void onGoogleRouteReply(QNetworkReply *reply);

private:
    void initializeRouteAndStations();
    void updateDistancesAndEtas();
    void updateCurrentAndNextStations();
    double calculateTrackDistanceKm(double lat1, double lon1, double lat2, double lon2) const;

    TrainManager *m_trainManager{nullptr};
    SettingsManager *m_settingsManager{nullptr};
    TrainConfigProvider *m_trainConfigProvider{nullptr};

    TrainLocation m_trainLocation;
    TrainLocation m_lastKnownLocation;
    bool m_hasLastKnownLocation{false};
    QString m_gnssEngineState{"GPS SEARCHING"};
    QList<RailwayStation> m_stations;
    WaterEnduranceState m_enduranceState;

    QString m_currentStationName{"GPS Fix Unavailable"};
    QString m_nextStationName{"Bardhaman Junction"};
    QString m_destinationStationName{"Asansol Junction"};
    double m_routeProgressPercent{0.0};
    double m_destinationDistanceKm{0.0};
    QString m_destinationEtaString{"--"};

    bool m_mockLocationEnabled{false};
    QString m_googleMapsApiKey;
    QString m_activeTrainNumber;
    QNetworkAccessManager m_networkManager;
    QDateTime m_lastRouteQueryTime;
};

} // namespace Panorama
