# TrainManager

> God node · 63 connections · `src/models/TrainManager.h`

**Community:** [Community 12](Community_12.md)

## Connections by Relation

### contains
- TrainManager.h `EXTRACTED`

### defines
- m_tanks `EXTRACTED`
- m_trainConnectionState `EXTRACTED`
- m_selectedTankId `EXTRACTED`
- m_tankModel `EXTRACTED`
- m_configProvider `EXTRACTED`
- m_dbManager `EXTRACTED`
- m_activeTrainNumber `EXTRACTED`
- m_activeTrainTankIds `EXTRACTED`
- m_totalTanks `EXTRACTED`
- m_onlineTanks `EXTRACTED`
- m_offlineTanks `EXTRACTED`
- m_alertCount `EXTRACTED`
- m_lowLevelCount `EXTRACTED`
- QML_ELEMENT `EXTRACTED`
- QVariantList `EXTRACTED`
- QVariantMap `EXTRACTED`

### inherits
- QObject `EXTRACTED`

### method
- .recalculateAlarmsAndCounters() `EXTRACTED`
- .processReading() `EXTRACTED`
- .findPrimaryTank() `EXTRACTED`
- .setDatabaseManager() `EXTRACTED`
- .processEsp32Status() `EXTRACTED`
- .setConnectionState() `EXTRACTED`
- .initializeTrainConsist() `EXTRACTED`
- .setTrainConfigProvider() `EXTRACTED`
- .selectedTank() `EXTRACTED`
- .allTanks() `EXTRACTED`
- .filteredTanks() `EXTRACTED`
- .selectTank() `EXTRACTED`
- .setActiveTrainNumber() `EXTRACTED`
- .setTankModel() `EXTRACTED`
- .totalTanks() `EXTRACTED`
- .onlineTanks() `EXTRACTED`
- .offlineTanks() `EXTRACTED`
- .alertCount() `EXTRACTED`
- .lowLevelCount() `EXTRACTED`
- .trainConnectionState() `EXTRACTED`
- *…and 16 more `method` connection(s) not listed (lowest-degree first to go)*

### references
- TankItem `EXTRACTED`
- QStringList `EXTRACTED`
- QString `EXTRACTED`
- [TankModel](TankModel.md) `EXTRACTED`
- TrainConfigProvider `EXTRACTED`
- [DatabaseManager](DatabaseManager.md) `EXTRACTED`
- QList `EXTRACTED`
- Q_OBJECT `EXTRACTED`
- Q_INVOKABLE `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*