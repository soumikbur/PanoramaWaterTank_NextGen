#include "ApplicationStateManager.h"
#include "TrainConfigProvider.h"

namespace Panorama {

static const auto kNavGroup       = QStringLiteral("Navigation");
static const auto kPageIndex      = QStringLiteral("currentPageIndex");
static const auto kRegionId       = QStringLiteral("selectedRegionId");
static const auto kRegionName     = QStringLiteral("selectedRegionName");
static const auto kTrainNumber    = QStringLiteral("selectedTrainNumber");
static const auto kTrainName      = QStringLiteral("selectedTrainName");
static const auto kTankId         = QStringLiteral("selectedTankId");
static const auto kCoach          = QStringLiteral("selectedCoach");

ApplicationStateManager::ApplicationStateManager(QObject *parent)
    : QObject(parent)
{
}

void ApplicationStateManager::setTrainConfigProvider(TrainConfigProvider *provider)
{
    m_configProvider = provider;
}

// ============================================================================
// Navigation actions
// ============================================================================

void ApplicationStateManager::setCurrentPageIndex(int index)
{
    if (m_currentPageIndex != index) {
        m_currentPageIndex = index;
        emit currentPageIndexChanged();
        persistState();
    }
}

void ApplicationStateManager::selectRegion(const QString &regionId, const QString &regionName)
{
    bool changed = false;

    if (m_selectedRegionId != regionId) {
        m_selectedRegionId = regionId;
        m_selectedRegionName = regionName;
        changed = true;
    }

    // Selecting a new region clears train / coach / tank context
    if (!m_selectedTrainNumber.isEmpty()) {
        m_selectedTrainNumber.clear();
        m_selectedTrainName.clear();
        emit selectedTrainNumberChanged();
        emit selectedTrainNameChanged();
    }
    if (!m_selectedCoach.isEmpty()) {
        m_selectedCoach.clear();
        emit selectedCoachChanged();
    }
    if (!m_selectedTankId.isEmpty()) {
        m_selectedTankId.clear();
        emit selectedTankIdChanged();
    }

    if (changed) {
        emit selectedRegionIdChanged();
        persistState();
    }
}

void ApplicationStateManager::selectTrain(const QString &trainNumber, const QString &trainName)
{
    bool changed = false;

    if (m_selectedTrainNumber != trainNumber) {
        m_selectedTrainNumber = trainNumber;
        changed = true;
    }
    if (m_selectedTrainName != trainName) {
        m_selectedTrainName = trainName;
        emit selectedTrainNameChanged();
    }

    // Selecting a new train clears coach / tank context
    if (!m_selectedCoach.isEmpty()) {
        m_selectedCoach.clear();
        emit selectedCoachChanged();
    }
    if (!m_selectedTankId.isEmpty()) {
        m_selectedTankId.clear();
        emit selectedTankIdChanged();
    }

    if (changed) {
        emit selectedTrainNumberChanged();
        persistState();
    }
}

void ApplicationStateManager::selectTank(const QString &tankId, const QString &coach)
{
    bool changed = false;

    if (m_selectedTankId != tankId) {
        m_selectedTankId = tankId;
        changed = true;
        emit selectedTankIdChanged();
    }
    if (m_selectedCoach != coach) {
        m_selectedCoach = coach;
        emit selectedCoachChanged();
    }

    if (changed) {
        persistState();
    }
}

void ApplicationStateManager::clearTrainContext()
{
    bool hadTrain = !m_selectedTrainNumber.isEmpty();
    bool hadRegion = !m_selectedRegionId.isEmpty();

    m_selectedTrainNumber.clear();
    m_selectedTrainName.clear();
    m_selectedCoach.clear();
    m_selectedTankId.clear();
    m_selectedRegionId.clear();
    m_selectedRegionName.clear();

    if (hadTrain) {
        emit selectedTrainNumberChanged();
        emit selectedTrainNameChanged();
    }
    if (hadRegion) {
        emit selectedRegionIdChanged();
    }
    emit selectedCoachChanged();
    emit selectedTankIdChanged();
    persistState();
}

void ApplicationStateManager::clearAllContext()
{
    clearTrainContext();
    m_currentPageIndex = 0;
    emit currentPageIndexChanged();
    persistState();
}

// ============================================================================
// Persistence
// ============================================================================

void ApplicationStateManager::persistState()
{
    m_settings.beginGroup(kNavGroup);
    m_settings.setValue(kPageIndex, m_currentPageIndex);
    m_settings.setValue(kRegionId, m_selectedRegionId);
    m_settings.setValue(kRegionName, m_selectedRegionName);
    m_settings.setValue(kTrainNumber, m_selectedTrainNumber);
    m_settings.setValue(kTrainName, m_selectedTrainName);
    m_settings.setValue(kTankId, m_selectedTankId);
    m_settings.setValue(kCoach, m_selectedCoach);
    m_settings.endGroup();
    m_settings.sync();
}

void ApplicationStateManager::saveState()
{
    persistState();
}

void ApplicationStateManager::restoreState()
{
    m_settings.beginGroup(kNavGroup);

    int pageIdx        = m_settings.value(kPageIndex, 0).toInt();
    QString regionId   = m_settings.value(kRegionId).toString();
    QString regionName = m_settings.value(kRegionName).toString();
    QString trainNum   = m_settings.value(kTrainNumber).toString();
    QString trainName  = m_settings.value(kTrainName).toString();
    QString tankId     = m_settings.value(kTankId).toString();
    QString coach      = m_settings.value(kCoach).toString();

    m_settings.endGroup();

    // Validate restored state against TrainConfigProvider
    if (m_configProvider) {
        if (!regionId.isEmpty() && !m_configProvider->isValidRegion(regionId)) {
            // Region no longer exists — fall back to defaults
            regionId.clear();
            regionName.clear();
            trainNum.clear();
            trainName.clear();
            tankId.clear();
            coach.clear();
            pageIdx = 0;
        }

        if (!trainNum.isEmpty() && !m_configProvider->isValidTrain(trainNum)) {
            // Train no longer exists — fall back to region selection
            trainNum.clear();
            trainName.clear();
            tankId.clear();
            coach.clear();
            if (!regionId.isEmpty()) {
                pageIdx = 0; // Train Selection page
            } else {
                pageIdx = 0;
            }
        }

        // Validate that tank belongs to the selected train
        if (!tankId.isEmpty() && !trainNum.isEmpty()) {
            QStringList trainTanks = m_configProvider->tankIdsForTrain(trainNum);
            if (!trainTanks.contains(tankId)) {
                tankId.clear();
                coach.clear();
            }
        }
    }

    // Clamp page index to valid range
    if (pageIdx < 0 || pageIdx > 11) {
        pageIdx = 0;
    }

    // Apply restored state
    m_currentPageIndex = pageIdx;
    m_selectedRegionId = regionId;
    m_selectedRegionName = regionName;
    m_selectedTrainNumber = trainNum;
    m_selectedTrainName = trainName;
    m_selectedTankId = tankId;
    m_selectedCoach = coach;

    emit currentPageIndexChanged();
    emit selectedRegionIdChanged();
    emit selectedTrainNumberChanged();
    emit selectedTrainNameChanged();
    emit selectedTankIdChanged();
    emit selectedCoachChanged();
    emit stateRestored();
}

bool ApplicationStateManager::hasSavedState() const
{
    return m_settings.contains(kNavGroup + QStringLiteral("/") + kPageIndex);
}

} // namespace Panorama
