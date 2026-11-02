# ApiClient

> God node · 84 connections · `src/network/ApiClient.h`

**Community:** [Community 11](Community_11.md)

## Connections by Relation

### contains
- ApiClient.h `EXTRACTED`

### defines
- m_networkManager `EXTRACTED`
- m_pollTimer `EXTRACTED`
- m_historyTimer `EXTRACTED`
- m_historyRangeHours `EXTRACTED`
- m_apiBaseUrl `EXTRACTED`
- m_authToken `EXTRACTED`
- m_deviceLabel `EXTRACTED`
- m_esp32Host `EXTRACTED`
- m_esp32Port `EXTRACTED`
- m_useDirectEsp32 `EXTRACTED`
- m_pollingIntervalMs `EXTRACTED`
- m_transferTimeoutMs `EXTRACTED`
- m_levelVar `EXTRACTED`
- m_pressureVar `EXTRACTED`
- m_statusVar `EXTRACTED`
- m_connectionState `EXTRACTED`
- m_hasVerifiedHealth `EXTRACTED`
- m_requestInProgress `EXTRACTED`
- m_pollTimerActive `EXTRACTED`
- m_lastValidWaterLevel `EXTRACTED`
- *…and 3 more `defines` connection(s) not listed (lowest-degree first to go)*

### inherits
- QObject `EXTRACTED`

### method
- .buildEsp32Url() `EXTRACTED`
- .onReplyFinished() `EXTRACTED`
- .setConnectionState() `EXTRACTED`
- .fetchLatestData() `EXTRACTED`
- .handleNetworkError() `EXTRACTED`
- .parseStatusReply() `EXTRACTED`
- .parseHealthReply() `EXTRACTED`
- .fetchHistoricalData() `EXTRACTED`
- .parseReply() `EXTRACTED`
- .extractVariables() `EXTRACTED`
- .logHttpRequest() `EXTRACTED`
- .getStatus() `EXTRACTED`
- .postTankConfig() `EXTRACTED`
- .buildHistoricalRequest() `EXTRACTED`
- .parseEsp32HistoricalReply() `EXTRACTED`
- .parseEsp32SyncReply() `EXTRACTED`
- .parseConfigReply() `EXTRACTED`
- .parseConfigPostReply() `EXTRACTED`
- .parseHistoricalReply() `EXTRACTED`
- .connectionStateString() `EXTRACTED`
- *…and 35 more `method` connection(s) not listed (lowest-degree first to go)*

### references
- ConnectionState `EXTRACTED`
- QNetworkAccessManager `EXTRACTED`
- QTimer `EXTRACTED`
- QString `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*