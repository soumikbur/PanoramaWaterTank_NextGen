#include "PermissionManager.h"
#include "AuthManager.h"

namespace Panorama {

PermissionManager::PermissionManager(QObject *parent)
    : QObject(parent)
{
}

void PermissionManager::setAuthManager(AuthManager *authManager)
{
    if (m_authManager == authManager) return;
    m_authManager = authManager;
    if (m_authManager) {
        connect(m_authManager, &AuthManager::authStateChanged,
                this, &PermissionManager::permissionsChanged);
    }
    emit permissionsChanged();
}

bool PermissionManager::isAdmin() const
{
    return m_authManager && m_authManager->isAdmin();
}

bool PermissionManager::isUser() const
{
    return m_authManager && m_authManager->isUser();
}

QString PermissionManager::roleName() const
{
    if (!m_authManager || !m_authManager->isAuthenticated()) return QStringLiteral("None");
    return m_authManager->currentUserRole();
}

bool PermissionManager::canManageTrains() const
{
    // Both Admin and User (Employee) can add/edit/delete trains
    return isAdmin() || isUser();
}

bool PermissionManager::canManageCoaches() const
{
    // Both Admin and User (Employee) can add/edit/delete coaches
    return isAdmin() || isUser();
}

bool PermissionManager::canConfigureTanks() const
{
    // Both Admin and User (Employee) can configure tank geometry & assign tanks
    return isAdmin() || isUser();
}

bool PermissionManager::canConfigureDevice() const
{
    // Admin ONLY: ESP IP, port, hardware parameters
    return isAdmin();
}

bool PermissionManager::canConfigureNetwork() const
{
    // Admin ONLY: Wi-Fi, Ethernet, LTE parameters
    return isAdmin();
}

bool PermissionManager::canConfigureUbidots() const
{
    // Admin ONLY: Ubidots endpoint, token, variable mappings
    return isAdmin();
}

bool PermissionManager::canConfigureMap() const
{
    // Admin ONLY: Google Maps API key
    return isAdmin();
}

bool PermissionManager::canChangeUserPassword() const
{
    // Admin ONLY: Change employee credentials
    return isAdmin();
}

bool PermissionManager::canAccessSystemSettings() const
{
    // Admin ONLY
    return isAdmin();
}

bool PermissionManager::canViewHistory() const
{
    // Both Admin and User can view history
    return isAdmin() || isUser();
}

bool PermissionManager::canViewLiveData() const
{
    // Both Admin and User can view live data
    return isAdmin() || isUser();
}

bool PermissionManager::hasPermission(const QString &permissionName) const
{
    const QString perm = permissionName.toUpper();
    if (perm == QStringLiteral("CAN_MANAGE_TRAINS")) return canManageTrains();
    if (perm == QStringLiteral("CAN_MANAGE_COACHES")) return canManageCoaches();
    if (perm == QStringLiteral("CAN_CONFIGURE_TANKS")) return canConfigureTanks();
    if (perm == QStringLiteral("CAN_CONFIGURE_DEVICE")) return canConfigureDevice();
    if (perm == QStringLiteral("CAN_CONFIGURE_NETWORK")) return canConfigureNetwork();
    if (perm == QStringLiteral("CAN_CONFIGURE_UBIDOTS")) return canConfigureUbidots();
    if (perm == QStringLiteral("CAN_CONFIGURE_MAP")) return canConfigureMap();
    if (perm == QStringLiteral("CAN_CHANGE_USER_PASSWORD")) return canChangeUserPassword();
    if (perm == QStringLiteral("CAN_ACCESS_SYSTEM_SETTINGS")) return canAccessSystemSettings();
    if (perm == QStringLiteral("CAN_VIEW_HISTORY")) return canViewHistory();
    if (perm == QStringLiteral("CAN_VIEW_LIVE_DATA")) return canViewLiveData();
    return false;
}

} // namespace Panorama
