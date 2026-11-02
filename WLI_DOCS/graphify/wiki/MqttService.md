# MqttService

> God node · 85 connections · `src/mqtt/MqttService.h`

**Community:** [Community 4](Community_4.md)

## Connections by Relation

### contains
- MqttService.h `EXTRACTED`
- State `EXTRACTED`

### defines
- m_config `EXTRACTED`
- m_state `EXTRACTED`
- m_errorMessage `EXTRACTED`
- m_lastMessageTime `EXTRACTED`
- m_client `EXTRACTED`
- m_subscription `EXTRACTED`
- m_reconnectTimer `EXTRACTED`
- m_reconnectAttempt `EXTRACTED`
- m_userDisconnected `EXTRACTED`
- m_sensor1LevelPercent `EXTRACTED`
- m_sensor2LevelPercent `EXTRACTED`
- m_sensor1Valid `EXTRACTED`
- m_sensor2Valid `EXTRACTED`
- m_lastUid `EXTRACTED`
- m_lastCoachNumber `EXTRACTED`
- m_testClient `EXTRACTED`
- m_testTimer `EXTRACTED`
- m_testInProgress `EXTRACTED`
- m_testStatusMessage `EXTRACTED`
- m_testStatusIsError `EXTRACTED`
- *…and 1 more `defines` connection(s) not listed (lowest-degree first to go)*

### inherits
- QObject `EXTRACTED`

### method
- .setState() `EXTRACTED`
- .applyConfiguration() `EXTRACTED`
- .finishTest() `EXTRACTED`
- .connectToBroker() `EXTRACTED`
- .scheduleReconnect() `EXTRACTED`
- .testConnection() `EXTRACTED`
- .processPayload() `EXTRACTED`
- .onClientErrorChanged() `EXTRACTED`
- .onMessageReceived() `EXTRACTED`
- .stopReconnect() `EXTRACTED`
- .cleanClient() `EXTRACTED`
- .configure() `EXTRACTED`
- .onClientStateChanged() `EXTRACTED`
- .onClientDisconnected() `EXTRACTED`
- .onTestClientError() `EXTRACTED`
- .setupClient() `EXTRACTED`
- .disconnectFromBroker() `EXTRACTED`
- .onClientConnected() `EXTRACTED`
- .onReconnectTimeout() `EXTRACTED`
- .onTestClientConnected() `EXTRACTED`
- *…and 34 more `method` connection(s) not listed (lowest-degree first to go)*

### references
- MqttConfig `EXTRACTED`
- QString `EXTRACTED`
- QTimer `EXTRACTED`
- Logger `EXTRACTED`
- QMqttClient `EXTRACTED`
- QMqttSubscription `EXTRACTED`
- Q_ENUM `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*