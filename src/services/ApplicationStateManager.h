#pragma once

#include <QObject>
#include <QString>
#include <QSettings>
#include <qqml.h>

namespace Panorama {

class TrainConfigProvider;

/*!
 * \brief Persistent application navigation state manager.
 *
 * Tracks the user's current navigation context (selected region, train,
 * coach, tank, page index) and persists it via QSettings so the
 * application restores to the exact same position on relaunch.
 *
 * Validation against TrainConfigProvider ensures stale/deleted trains
 * or regions are handled gracefully on restore.
 */
class ApplicationStateManager : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(int currentPageIndex READ currentPageIndex WRITE setCurrentPageIndex NOTIFY currentPageIndexChanged)
    Q_PROPERTY(QString selectedRegionId READ selectedRegionId NOTIFY selectedRegionIdChanged)
    Q_PROPERTY(QString selectedRegionName READ selectedRegionName NOTIFY selectedRegionIdChanged)
    Q_PROPERTY(QString selectedTrainNumber READ selectedTrainNumber NOTIFY selectedTrainNumberChanged)
    Q_PROPERTY(QString selectedTrainName READ selectedTrainName NOTIFY selectedTrainNameChanged)
    Q_PROPERTY(QString selectedTankId READ selectedTankId NOTIFY selectedTankIdChanged)
    Q_PROPERTY(QString selectedCoach READ selectedCoach NOTIFY selectedCoachChanged)
    Q_PROPERTY(bool hasTrainContext READ hasTrainContext NOTIFY selectedTrainNumberChanged)
    Q_PROPERTY(bool hasRegionContext READ hasRegionContext NOTIFY selectedRegionIdChanged)

public:
    explicit ApplicationStateManager(QObject *parent = nullptr);

    int currentPageIndex() const { return m_currentPageIndex; }
    QString selectedRegionId() const { return m_selectedRegionId; }
    QString selectedRegionName() const { return m_selectedRegionName; }
    QString selectedTrainNumber() const { return m_selectedTrainNumber; }
    QString selectedTrainName() const { return m_selectedTrainName; }
    QString selectedTankId() const { return m_selectedTankId; }
    QString selectedCoach() const { return m_selectedCoach; }
    bool hasTrainContext() const { return !m_selectedTrainNumber.isEmpty(); }
    bool hasRegionContext() const { return !m_selectedRegionId.isEmpty(); }

    void setTrainConfigProvider(TrainConfigProvider *provider);

    Q_INVOKABLE void setCurrentPageIndex(int index);
    Q_INVOKABLE void selectRegion(const QString &regionId, const QString &regionName);
    Q_INVOKABLE void selectTrain(const QString &trainNumber, const QString &trainName);
    Q_INVOKABLE void selectTank(const QString &tankId, const QString &coach);
    Q_INVOKABLE void clearTrainContext();
    Q_INVOKABLE void clearAllContext();

    Q_INVOKABLE void saveState();
    Q_INVOKABLE void restoreState();
    Q_INVOKABLE bool hasSavedState() const;

signals:
    void currentPageIndexChanged();
    void selectedRegionIdChanged();
    void selectedTrainNumberChanged();
    void selectedTrainNameChanged();
    void selectedTankIdChanged();
    void selectedCoachChanged();
    void stateRestored();

private:
    void persistState();

    TrainConfigProvider *m_configProvider{nullptr};
    QSettings m_settings;

    int m_currentPageIndex{0};       // 0 = Dashboard (default landing page)
    QString m_selectedRegionId;
    QString m_selectedRegionName;
    QString m_selectedTrainNumber;
    QString m_selectedTrainName;
    QString m_selectedTankId;
    QString m_selectedCoach;
};

} // namespace Panorama
