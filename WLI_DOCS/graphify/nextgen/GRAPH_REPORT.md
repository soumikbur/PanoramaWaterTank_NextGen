# Graph Report - graphify_pwt_nextgen  (2026-10-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1621 nodes · 2956 edges · 67 communities (36 shown, 31 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 361 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 16
- Community 17
- Community 18
- Community 19
- Community 21
- Community 22
- Community 23
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 41
- Community 42
- Community 43
- Community 45
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 58
- Community 66

## God Nodes (most connected - your core abstractions)
1. `TankModel` - 188 edges
2. `SettingsManager` - 177 edges
3. `MqttService` - 86 edges
4. `ApiClient` - 84 edges
5. `LocationManager` - 84 edges
6. `TrainManager` - 63 edges
7. `RailwayManager` - 58 edges
8. `DatabaseManager` - 52 edges
9. `ApplicationController` - 51 edges
10. `ApplicationStateManager` - 45 edges

## Surprising Connections (you probably didn't know these)
- `ApplicationController` --references--> `DisplayPerformanceManager`  [EXTRACTED]
  app/ApplicationController.h → src/core/DisplayPerformanceManager.h
- `ApplicationController` --references--> `TimeManager`  [EXTRACTED]
  app/ApplicationController.h → src/core/TimeManager.h
- `ApplicationController` --references--> `RailwayManager`  [EXTRACTED]
  app/ApplicationController.h → src/domain/RailwayManager.h
- `ApplicationController` --references--> `ConnectionManager`  [EXTRACTED]
  app/ApplicationController.h → src/networking/ConnectionManager.h
- `ApplicationController` --references--> `PermissionManager`  [EXTRACTED]
  app/ApplicationController.h → src/security/PermissionManager.h

## Import Cycles
- None detected.

## Communities (67 total, 31 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (50): TankModel, m_activeAlertCount, m_activeAlerts, m_alarmEvaluationEnabled, m_alarmHistory, m_alarmLevel, m_capacityRank, m_composedTrendHistory (+42 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (44): SettingsManager, m_apiBaseUrl, m_apiToken, m_criticalThresholdPercent, m_dataSourceId, m_deviceLabel, m_distanceVariable, m_esp32Host (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (23): DatabaseManager, enrichTanksWithTelemetry(), RailwayManager, RailwayManager::getAllTanks(), RailwayManager::getCoach(), RailwayManager::getCoaches(), RailwayManager::getDevices(), RailwayManager::getRegions() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (18): Logger, TankModel, TankRepository, m_cachedPressure, m_cachedSensorStatus, m_cachedWaterLevel, m_hasPressure, m_lastMeasurementReceivedMs (+10 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (5): DatabaseManager, DatabaseManager::DatabaseManager(), m_connectionName, m_db, public

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (22): MqttService, m_client, m_config, m_errorMessage, m_lastCoachNumber, m_lastMessageTime, m_lastUid, m_reconnectAttempt (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (16): Logger, Logger::Logger(), m_consoleMirrorEnabled, m_currentLogLevel, m_logDirectory, m_logFile, m_mutex, m_openLogDate (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (13): ApplicationStateManager, ApplicationStateManager::ApplicationStateManager(), m_configProvider, m_currentPageIndex, m_selectedCoach, m_selectedRegionId, m_selectedRegionName, m_selectedTankId (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (11): AuthManager, AuthManager::AuthManager(), m_adminHash, m_adminSalt, m_currentUserName, m_currentUserRole, m_dbManager, m_errorMessage (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (27): defaultFilename(), downsampleLTTB(), ExportPoint, heightCm, levelPercentage, status, timestampMs, volumeLiters (+19 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (24): ApiClient, m_apiBaseUrl, m_authToken, m_connectionState, m_deviceLabel, m_esp32Host, m_esp32Port, m_hasReceivedFirstValidReading (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (23): LocationManager, m_activeTrainNumber, m_currentStationName, m_destinationDistanceKm, m_destinationEtaString, m_destinationStationName, m_enduranceState, m_gnssEngineState (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (20): DatabaseManager, TankModel, TrainConfigProvider, TrainManager, m_activeTrainNumber, m_activeTrainTankIds, m_alertCount, m_configProvider (+12 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (21): ApplicationController, m_app, m_appStateManager, m_authManager, m_connectionManager, m_databaseManager, m_displayPerfManager, m_engine (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.06
Nodes (33): AlarmLevel, Critical, Low, Normal, Overflow, SensorError, Unassessed, ApplicationState (+25 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (14): ApiClient, ConnectionManager, ConnectionManager::ConnectionManager(), m_apiClient, m_locationManager, m_tankModel, m_tankRepository, m_trainManager (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (8): TimeManager, m_currentDate, m_currentTime, m_dateFormat, m_timeFormat, m_timer, QML_ELEMENT, TimeManager::TimeManager()

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (27): TankItem, alarmState, capacityLiters, coachId, coachName, coachType, connectionState, deviceId (+19 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (11): SearchManager, m_coachResults, m_dbManager, m_debounceTimer, m_isSearching, m_knownLocations, m_locationResults, m_query (+3 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (3): TrainManager::getFilteredTanksForTrain(), TrainManager::getTank(), TrainManager::getTanksFiltered()

### Community 25 - "Community 25"
Cohesion: 0.19
Nodes (9): TrainConfigProvider::allConfiguredTanks(), TrainConfigProvider::coachesForTrain(), TrainConfigProvider::regionInfo(), TrainConfigProvider::regions(), TrainConfigProvider::routeStations(), TrainConfigProvider::tanksForTrain(), TrainConfigProvider::trainInfo(), TrainConfigProvider::trainsForRegion() (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (9): buildTrainConsist(), TrainConfigProvider, m_regions, m_trains, public, QML_ELEMENT, QVariantList, QVariantMap (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.13
Nodes (6): DisplayPerformanceManager, m_currentScreen, m_reducedMotion, m_refreshRate, m_window, QML_ELEMENT

### Community 30 - "Community 30"
Cohesion: 0.13
Nodes (11): MqttConfig, broker, clientId, enabled, password, port, tlsEnabled, topic (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (18): RailwayStation, code, distanceKm, etaMinutes, etaString, id, isDestination, isJunction (+10 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (18): TankConfig, capacityLiters, coachName, coachNumber, coachType, deviceId, isPrimaryHardwareDevice, legacyId (+10 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (15): TrainLocation, accuracyMeters, altitudeMeters, hasValidFix, headingCardinal, headingDegrees, isLive, isStale (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (15): WaterEnduranceState, consumptionRateLph, consumptionTrend, criticalReserveLiters, dataQuality, decision, decisionString, fillPercentage (+7 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (15): RouteStation, code, id, isDestination, isJunction, isSource, isWaterSource, lastVerified (+7 more)

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (11): CoachConfig, coachName, coachNumber, coachType, tankIds, RegionConfig, regionId, regionName (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.16
Nodes (9): TrainConfig, coaches, destination, regionId, routeStations, source, tanks, trainName (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.18
Nodes (5): ConnectionState, Connected, Connecting, Disconnected, Error

### Community 49 - "Community 49"
Cohesion: 0.22
Nodes (7): KnownLocation, code, division, latitude, longitude, name, zone

### Community 51 - "Community 51"
Cohesion: 0.25
Nodes (8): State, Connected, Connecting, Disconnected, Error, MqttConnecting, Reconnecting, TlsHandshake

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (6): RefillDecision, InsufficientData, NoFacilityReachable, RefillRecommended, RefillRequired, Safe

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (3): SettingsManager, TrainConfigProvider, TrainManager

## Knowledge Gaps
- **467 isolated node(s):** `m_activeAlertCount`, `m_activeAlerts`, `m_alarmEvaluationEnabled`, `m_alarmHistory`, `m_alarmLevel` (+462 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 861 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SettingsManager` connect `Community 1` to `Community 58`, `Community 22`, `Community 7`?**
  _High betweenness centrality (0.200) - this node is a cross-community bridge._
- **What connects `m_activeAlertCount`, `m_activeAlerts`, `m_alarmEvaluationEnabled` to the rest of the system?**
  _467 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.015873015873015872 - nodes in this community are weakly interconnected._
- **Why does `TankModel` connect `Community 0` to `Community 3`, `Community 44`, `Community 45`, `Community 15`, `Community 50`, `Community 55`, `Community 61`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01904761904761905 - nodes in this community are weakly interconnected._
- **Why does `ApplicationController` connect `Community 14` to `Community 2`, `Community 3`, `Community 5`, `Community 8`, `Community 17`, `Community 18`, `Community 21`, `Community 28`, `Community 29`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.056943056943056944 - nodes in this community are weakly interconnected._