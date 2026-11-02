# LocationManager

> God node · 84 connections · `src/services/LocationManager.h`

**Community:** [Community 8](Community_8.md)

## Connections by Relation

### contains
- LocationManager.h `EXTRACTED`

### defines
- m_trainManager `EXTRACTED`
- m_settingsManager `EXTRACTED`
- m_trainConfigProvider `EXTRACTED`
- m_trainLocation `EXTRACTED`
- m_lastKnownLocation `EXTRACTED`
- m_hasLastKnownLocation `EXTRACTED`
- m_gnssEngineState `EXTRACTED`
- m_stations `EXTRACTED`
- m_enduranceState `EXTRACTED`
- m_currentStationName `EXTRACTED`
- m_nextStationName `EXTRACTED`
- m_destinationStationName `EXTRACTED`
- m_routeProgressPercent `EXTRACTED`
- m_destinationDistanceKm `EXTRACTED`
- m_destinationEtaString `EXTRACTED`
- m_mockLocationEnabled `EXTRACTED`
- m_googleMapsApiKey `EXTRACTED`
- m_activeTrainNumber `EXTRACTED`
- m_networkManager `EXTRACTED`
- m_lastRouteQueryTime `EXTRACTED`
- *…and 2 more `defines` connection(s) not listed (lowest-degree first to go)*

### inherits
- QObject `EXTRACTED`

### method
- .updateDistancesAndEtas() `EXTRACTED`
- .recalculateEnduranceAndDecision() `EXTRACTED`
- .loadRouteForTrain() `EXTRACTED`
- .calculateTrackDistanceKm() `EXTRACTED`
- .updateGpsCoordinates() `EXTRACTED`
- .processEsp32Status() `EXTRACTED`
- .onGoogleRouteReply() `EXTRACTED`
- .initializeRouteAndStations() `EXTRACTED`
- .updateCurrentAndNextStations() `EXTRACTED`
- .nextRefillStation() `EXTRACTED`
- .stations() `EXTRACTED`
- .waterFacilities() `EXTRACTED`
- .setTrainManager() `EXTRACTED`
- .setSettingsManager() `EXTRACTED`
- .setGoogleMapsApiKey() `EXTRACTED`
- .trainLocation() `EXTRACTED`
- .gpsStatus() `EXTRACTED`
- .gpsLastUpdate() `EXTRACTED`
- .lastKnownLocation() `EXTRACTED`
- .gpsBannerText() `EXTRACTED`
- *…and 28 more `method` connection(s) not listed (lowest-degree first to go)*

### references
- RailwayStation `EXTRACTED`
- TrainLocation `EXTRACTED`
- WaterEnduranceState `EXTRACTED`
- QString `EXTRACTED`
- TrainConfigProvider `EXTRACTED`
- [TrainManager](TrainManager.md) `EXTRACTED`
- [SettingsManager](SettingsManager.md) `EXTRACTED`
- Q_INVOKABLE `EXTRACTED`
- QList `EXTRACTED`
- QNetworkAccessManager `EXTRACTED`
- QDateTime `EXTRACTED`
- Q_OBJECT `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*