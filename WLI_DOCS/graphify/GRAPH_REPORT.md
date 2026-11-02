# Graph Report - graphify_pwt_source  (2026-10-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1585 nodes · 2889 edges · 72 communities (39 shown, 33 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 355 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 19
- Community 20
- Community 21
- Community 22
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 40
- Community 41
- Community 42
- Community 44
- Community 45
- Community 50
- Community 51
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 63
- Community 64

## God Nodes (most connected - your core abstractions)
1. `TankModel` - 188 edges
2. `SettingsManager` - 177 edges
3. `MqttService` - 85 edges
4. `ApiClient` - 84 edges
5. `LocationManager` - 84 edges
6. `TrainManager` - 63 edges
7. `RailwayManager` - 57 edges
8. `DatabaseManager` - 52 edges
9. `ApplicationStateManager` - 44 edges
10. `AuthManager` - 44 edges

## Surprising Connections (you probably didn't know these)
- `TrainManager` --references--> `QStringList`  [EXTRACTED]
  src/models/TrainManager.h → src/models/TrainConfigProvider.h
- `LocationManager` --references--> `RailwayStation`  [EXTRACTED]
  src/services/LocationManager.h → src/models/LocationTypes.h
- `LocationManager` --references--> `TrainLocation`  [EXTRACTED]
  src/services/LocationManager.h → src/models/LocationTypes.h
- `LocationManager` --references--> `WaterEnduranceState`  [EXTRACTED]
  src/services/LocationManager.h → src/models/LocationTypes.h
- `MqttService` --references--> `MqttConfig`  [EXTRACTED]
  src/mqtt/MqttService.h → src/mqtt/MqttConfig.h

## Import Cycles
- None detected.

## Communities (72 total, 33 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (50): TankModel, m_activeAlertCount, m_activeAlerts, m_alarmEvaluationEnabled, m_alarmHistory, m_alarmLevel, m_capacityRank, m_composedTrendHistory (+42 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (45): Logger, SettingsManager, m_apiBaseUrl, m_apiToken, m_criticalThresholdPercent, m_dataSourceId, m_deviceLabel, m_distanceVariable (+37 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (23): DatabaseManager, enrichTanksWithTelemetry(), RailwayManager, RailwayManager::getAllTanks(), RailwayManager::getCoach(), RailwayManager::getCoaches(), RailwayManager::getDevices(), RailwayManager::getRegions() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (5): DatabaseManager, DatabaseManager::DatabaseManager(), m_connectionName, m_db, public

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (22): MqttService, m_client, m_config, m_errorMessage, m_lastCoachNumber, m_lastMessageTime, m_lastUid, m_reconnectAttempt (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (13): ApplicationStateManager, ApplicationStateManager::ApplicationStateManager(), m_configProvider, m_currentPageIndex, m_selectedCoach, m_selectedRegionId, m_selectedRegionName, m_selectedTankId (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (12): AuthManager, AuthManager::AuthManager(), m_adminHash, m_adminSalt, m_currentUserName, m_currentUserRole, m_dbManager, m_errorMessage (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (26): LocationManager, m_activeTrainNumber, m_currentStationName, m_destinationDistanceKm, m_destinationEtaString, m_destinationStationName, m_enduranceState, m_gnssEngineState (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (19): calculateArea(), calculateCapacityForShape(), calculateCustomVolume(), calculateRectangularArea(), calculateRectangularVolume(), calculateVolume(), calculateVolumeForShape(), Logger (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (24): ApiClient, m_apiBaseUrl, m_authToken, m_connectionState, m_deviceLabel, m_esp32Host, m_esp32Port, m_hasReceivedFirstValidReading (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (20): DatabaseManager, TankModel, TrainConfigProvider, TrainManager, m_activeTrainNumber, m_activeTrainTankIds, m_alertCount, m_configProvider (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (7): DisplayPerformanceManager, DisplayPerformanceManager::DisplayPerformanceManager(), m_currentScreen, m_reducedMotion, m_refreshRate, m_window, QML_ELEMENT

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (33): AlarmLevel, Critical, Low, Normal, Overflow, SensorError, Unassessed, ApplicationState (+25 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (5): AuthManager, PermissionManager, m_authManager, PermissionManager::PermissionManager(), QML_ELEMENT

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (8): TimeManager, m_currentDate, m_currentTime, m_dateFormat, m_timeFormat, m_timer, QML_ELEMENT, TimeManager::TimeManager()

### Community 17 - "Community 17"
Cohesion: 0.07
Nodes (27): TankItem, alarmState, capacityLiters, coachId, coachName, coachType, connectionState, deviceId (+19 more)

### Community 19 - "Community 19"
Cohesion: 0.08
Nodes (12): DatabaseManager, SearchManager, m_coachResults, m_dbManager, m_debounceTimer, m_isSearching, m_knownLocations, m_locationResults (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (10): buildTrainConsist(), TrainConfigProvider::coachesForTrain(), TrainConfigProvider::regionInfo(), TrainConfigProvider::regions(), TrainConfigProvider::routeStations(), TrainConfigProvider::tankIdsForTrain(), TrainConfigProvider::TrainConfigProvider(), TrainConfigProvider::trainInfo() (+2 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (3): TrainManager::getFilteredTanksForTrain(), TrainManager::getTank(), TrainManager::getTanksFiltered()

### Community 22 - "Community 22"
Cohesion: 0.17
Nodes (7): LogLevel, Critical, Debug, Error, Info, Trace, Warning

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (8): Logger, m_consoleMirrorEnabled, m_currentLogLevel, m_logDirectory, m_logFile, m_mutex, m_openLogDate, m_retentionDays

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (11): defaultFilename(), downsampleLTTB(), ExportPoint, heightCm, levelPercentage, status, timestampMs, volumeLiters (+3 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (18): TankConfig, capacityLiters, coachName, coachNumber, coachType, deviceId, isPrimaryHardwareDevice, legacyId (+10 more)

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (13): ApiClient, ConnectionManager, m_apiClient, m_locationManager, m_tankModel, m_tankRepository, m_trainManager, public (+5 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (18): RailwayStation, code, distanceKm, etaMinutes, etaString, id, isDestination, isJunction (+10 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (15): TrainLocation, accuracyMeters, altitudeMeters, hasValidFix, headingCardinal, headingDegrees, isLive, isStale (+7 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (15): WaterEnduranceState, consumptionRateLph, consumptionTrend, criticalReserveLiters, dataQuality, decision, decisionString, fillPercentage (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (15): RouteStation, code, id, isDestination, isJunction, isSource, isWaterSource, lastVerified (+7 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (10): MqttConfig, broker, clientId, enabled, password, port, tlsEnabled, topic (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (7): TrainConfigProvider, m_regions, m_trains, public, QML_ELEMENT, QVariantList, QVariantMap

### Community 44 - "Community 44"
Cohesion: 0.20
Nodes (9): CoachConfig, coachName, coachNumber, coachType, tankIds, RegionConfig, regionId, regionName (+1 more)

### Community 45 - "Community 45"
Cohesion: 0.20
Nodes (9): TrainConfig, coaches, destination, regionId, routeStations, source, tanks, trainName (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.22
Nodes (7): KnownLocation, code, division, latitude, longitude, name, zone

### Community 53 - "Community 53"
Cohesion: 0.25
Nodes (3): DashboardController, DashboardController::DashboardController(), public

### Community 56 - "Community 56"
Cohesion: 0.25
Nodes (8): State, Connected, Connecting, Disconnected, Error, MqttConnecting, Reconnecting, TlsHandshake

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (6): ExportResult, errorMessage, fileName, filePath, pointCount, success

### Community 58 - "Community 58"
Cohesion: 0.33
Nodes (6): RefillDecision, InsufficientData, NoFacilityReachable, RefillRecommended, RefillRequired, Safe

### Community 59 - "Community 59"
Cohesion: 0.33
Nodes (5): ConnectionState, Connected, Connecting, Disconnected, Error

### Community 64 - "Community 64"
Cohesion: 0.50
Nodes (3): RawPoint, rawHeightCm, timestampMs

## Knowledge Gaps
- **448 isolated node(s):** `m_activeAlertCount`, `m_activeAlerts`, `m_alarmEvaluationEnabled`, `m_alarmHistory`, `m_alarmLevel` (+443 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 840 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SettingsManager` connect `Community 1` to `Community 24`, `Community 63`, `Community 5`, `Community 31`?**
  _High betweenness centrality (0.219) - this node is a cross-community bridge._
- **What connects `m_activeAlertCount`, `m_activeAlerts`, `m_alarmEvaluationEnabled` to the rest of the system?**
  _448 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.015503875968992248 - nodes in this community are weakly interconnected._
- **Why does `TankModel` connect `Community 0` to `Community 66`, `Community 9`, `Community 42`, `Community 43`, `Community 29`, `Community 31`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.018867924528301886 - nodes in this community are weakly interconnected._
- **Why does `MqttService` connect `Community 4` to `Community 36`, `Community 41`, `Community 49`, `Community 23`, `Community 56`, `Community 60`, `Community 62`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05707450444292549 - nodes in this community are weakly interconnected._