#pragma once

#include <QObject>
#include <QString>
#include <qqml.h>

namespace Panorama {

class AuthManager;

class PermissionManager : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(bool canManageTrains READ canManageTrains NOTIFY permissionsChanged)
    Q_PROPERTY(bool canManageCoaches READ canManageCoaches NOTIFY permissionsChanged)
    Q_PROPERTY(bool canConfigureTanks READ canConfigureTanks NOTIFY permissionsChanged)
    Q_PROPERTY(bool canConfigureDevice READ canConfigureDevice NOTIFY permissionsChanged)
    Q_PROPERTY(bool canConfigureNetwork READ canConfigureNetwork NOTIFY permissionsChanged)
    Q_PROPERTY(bool canConfigureUbidots READ canConfigureUbidots NOTIFY permissionsChanged)
    Q_PROPERTY(bool canConfigureMap READ canConfigureMap NOTIFY permissionsChanged)
    Q_PROPERTY(bool canChangeUserPassword READ canChangeUserPassword NOTIFY permissionsChanged)
    Q_PROPERTY(bool canAccessSystemSettings READ canAccessSystemSettings NOTIFY permissionsChanged)
    Q_PROPERTY(bool canViewHistory READ canViewHistory NOTIFY permissionsChanged)
    Q_PROPERTY(bool canViewLiveData READ canViewLiveData NOTIFY permissionsChanged)
    Q_PROPERTY(bool isAdmin READ isAdmin NOTIFY permissionsChanged)
    Q_PROPERTY(bool isUser READ isUser NOTIFY permissionsChanged)
    Q_PROPERTY(QString roleName READ roleName NOTIFY permissionsChanged)

public:
    explicit PermissionManager(QObject *parent = nullptr);

    void setAuthManager(AuthManager *authManager);

    bool canManageTrains() const;
    bool canManageCoaches() const;
    bool canConfigureTanks() const;
    bool canConfigureDevice() const;
    bool canConfigureNetwork() const;
    bool canConfigureUbidots() const;
    bool canConfigureMap() const;
    bool canChangeUserPassword() const;
    bool canAccessSystemSettings() const;
    bool canViewHistory() const;
    bool canViewLiveData() const;
    bool isAdmin() const;
    bool isUser() const;
    QString roleName() const;

    Q_INVOKABLE bool hasPermission(const QString &permissionName) const;

signals:
    void permissionsChanged();

private:
    AuthManager *m_authManager{nullptr};
};

} // namespace Panorama
