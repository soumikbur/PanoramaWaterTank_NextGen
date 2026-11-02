#include "AuthManager.h"
#include "DatabaseManager.h"
#include <QCryptographicHash>

namespace Panorama {

AuthManager::AuthManager(QObject *parent)
    : QObject(parent)
{
    // Compute admin hash once at startup: SHA-256(m_adminSalt + "123")
    // Fixed Admin password is exactly "123", immutable from UI and database
    const QByteArray fixedAdminPw = "123";
    m_adminHash = QCryptographicHash::hash(m_adminSalt + fixedAdminPw, QCryptographicHash::Sha256);
}

void AuthManager::setDatabaseManager(DatabaseManager *dbManager)
{
    if (m_dbManager == dbManager) return;
    m_dbManager = dbManager;
    if (m_dbManager) {
        connect(m_dbManager, &DatabaseManager::databaseChanged, this, &AuthManager::usersChanged);
    }
    emit usersChanged();
}

bool AuthManager::verifyAdminPassword(const QString &password) const
{
    const QByteArray inputHash = QCryptographicHash::hash(m_adminSalt + password.toUtf8(), QCryptographicHash::Sha256);
    return (inputHash == m_adminHash);
}

void AuthManager::setErrorMessage(const QString &msg)
{
    if (m_errorMessage != msg) {
        m_errorMessage = msg;
        emit errorChanged();
    }
}

void AuthManager::clearError()
{
    setErrorMessage(QString());
}

bool AuthManager::loginAdmin(const QString &password)
{
    clearError();
    if (password.isEmpty()) {
        setErrorMessage(QStringLiteral("Password cannot be empty."));
        emit loginFailed(m_errorMessage);
        return false;
    }

    if (!verifyAdminPassword(password)) {
        setErrorMessage(QStringLiteral("Invalid administrator password. Access denied."));
        emit loginFailed(m_errorMessage);
        return false;
    }

    m_isAuthenticated = true;
    m_currentUserRole = QStringLiteral("Admin");
    m_currentUserName = QStringLiteral("Administrator");
    emit authStateChanged();
    emit loginSucceeded(m_currentUserRole, m_currentUserName);
    return true;
}

bool AuthManager::loginUser(const QString &username, const QString &password)
{
    clearError();
    const QString userTrimmed = username.trimmed();
    if (userTrimmed.isEmpty()) {
        setErrorMessage(QStringLiteral("Username cannot be empty."));
        emit loginFailed(m_errorMessage);
        return false;
    }
    if (password.isEmpty()) {
        setErrorMessage(QStringLiteral("Password cannot be empty."));
        emit loginFailed(m_errorMessage);
        return false;
    }

    // Check if logging in as Administrator (via username 'admin' or 'administrator' and admin password)
    if (userTrimmed.compare(QStringLiteral("admin"), Qt::CaseInsensitive) == 0 ||
        userTrimmed.compare(QStringLiteral("administrator"), Qt::CaseInsensitive) == 0) {
        if (verifyAdminPassword(password)) {
            m_isAuthenticated = true;
            m_currentUserRole = QStringLiteral("Admin");
            m_currentUserName = QStringLiteral("Administrator");
            emit authStateChanged();
            emit loginSucceeded(m_currentUserRole, m_currentUserName);
            return true;
        } else {
            setErrorMessage(QStringLiteral("Invalid administrator credentials. Access denied."));
            emit loginFailed(m_errorMessage);
            return false;
        }
    }

    if (!m_dbManager) {
        setErrorMessage(QStringLiteral("System database unavailable."));
        emit loginFailed(m_errorMessage);
        return false;
    }

    if (!m_dbManager->verifyUserCredential(userTrimmed, password)) {
        setErrorMessage(QStringLiteral("Invalid credentials. Please check username and password."));
        emit loginFailed(m_errorMessage);
        return false;
    }

    // Retrieve authoritative role and display name from system database
    const QString userRole = m_dbManager->getUserRole(userTrimmed);
    const QString displayName = m_dbManager->getUserDisplayName(userTrimmed);

    m_isAuthenticated = true;
    m_currentUserRole = userRole.isEmpty() ? QStringLiteral("User") : userRole;
    m_currentUserName = userTrimmed;
    emit authStateChanged();
    emit loginSucceeded(m_currentUserRole, m_currentUserName);
    return true;
}

void AuthManager::logout()
{
    m_isAuthenticated = false;
    m_currentUserRole.clear();
    m_currentUserName.clear();
    clearError();
    emit authStateChanged();
}

bool AuthManager::changeUserPassword(const QString &username, const QString &newPassword)
{
    if (!isAdmin()) {
        setErrorMessage(QStringLiteral("Permission denied: Only administrators can modify credentials."));
        emit userPasswordChanged(false, m_errorMessage);
        return false;
    }

    const QString userTrimmed = username.trimmed();
    if (userTrimmed.compare(QStringLiteral("admin"), Qt::CaseInsensitive) == 0 ||
        userTrimmed.compare(QStringLiteral("administrator"), Qt::CaseInsensitive) == 0) {
        setErrorMessage(QStringLiteral("Permission denied: Administrator password is fixed and cannot be changed."));
        emit userPasswordChanged(false, m_errorMessage);
        return false;
    }

    if (userTrimmed.isEmpty()) {
        setErrorMessage(QStringLiteral("Username cannot be empty."));
        emit userPasswordChanged(false, m_errorMessage);
        return false;
    }

    if (newPassword.isEmpty()) {
        setErrorMessage(QStringLiteral("Password cannot be empty."));
        emit userPasswordChanged(false, m_errorMessage);
        return false;
    }

    if (!m_dbManager) {
        setErrorMessage(QStringLiteral("System database unavailable."));
        emit userPasswordChanged(false, m_errorMessage);
        return false;
    }

    bool success = m_dbManager->updateUserPassword(username.trimmed(), newPassword);
    if (success) {
        clearError();
        emit userPasswordChanged(true, QStringLiteral("User password updated successfully."));
    } else {
        setErrorMessage(QStringLiteral("Failed to update user password in database."));
        emit userPasswordChanged(false, m_errorMessage);
    }
    return success;
}

QVariantList AuthManager::users() const
{
    QVariantList list;

    // Fixed Administrator account
    QVariantMap adminMap;
    adminMap[QStringLiteral("id")] = 0;
    adminMap[QStringLiteral("name")] = QStringLiteral("System Administrator");
    adminMap[QStringLiteral("username")] = QStringLiteral("admin");
    adminMap[QStringLiteral("role")] = QStringLiteral("Administrator");
    adminMap[QStringLiteral("status")] = QStringLiteral("Active");
    adminMap[QStringLiteral("lastActive")] = QStringLiteral("Active");
    adminMap[QStringLiteral("initial")] = QStringLiteral("A");
    list.append(adminMap);

    if (m_dbManager) {
        const QVariantList dbUsers = m_dbManager->getAllUsers();
        for (const QVariant &v : dbUsers) {
            list.append(v);
        }
    }
    return list;
}

int AuthManager::operatorCount() const
{
    if (m_dbManager) {
        return m_dbManager->getOperatorCount();
    }
    return 0;
}

bool AuthManager::addUser(const QString &name, const QString &username, const QString &password, const QString &role)
{
    clearError();
    if (!isAdmin()) {
        setErrorMessage(QStringLiteral("Permission denied: Only administrators can add users."));
        return false;
    }

    if (operatorCount() >= 10) {
        setErrorMessage(QStringLiteral("Maximum 10 employee/operator accounts reached."));
        return false;
    }

    const QString uTrimmed = username.trimmed();
    if (uTrimmed.isEmpty()) {
        setErrorMessage(QStringLiteral("Username cannot be empty."));
        return false;
    }

    if (password.length() < 3) {
        setErrorMessage(QStringLiteral("Password must be at least 3 characters."));
        return false;
    }

    if (!m_dbManager) {
        setErrorMessage(QStringLiteral("System database unavailable."));
        return false;
    }

    bool success = m_dbManager->createUser(uTrimmed, password, role, name, QStringLiteral("Active"));
    if (success) {
        clearError();
        emit usersChanged();
        return true;
    } else {
        setErrorMessage(QStringLiteral("Failed to create user. Username may already exist or limit reached."));
        return false;
    }
}

bool AuthManager::removeUser(const QString &username)
{
    clearError();
    if (!isAdmin()) {
        setErrorMessage(QStringLiteral("Permission denied: Only administrators can remove users."));
        return false;
    }

    const QString uTrimmed = username.trimmed();
    if (uTrimmed.isEmpty()) {
        setErrorMessage(QStringLiteral("Username cannot be empty."));
        return false;
    }

    if (uTrimmed.compare(QStringLiteral("admin"), Qt::CaseInsensitive) == 0 ||
        uTrimmed.compare(QStringLiteral("administrator"), Qt::CaseInsensitive) == 0) {
        setErrorMessage(QStringLiteral("Cannot remove system administrator account."));
        return false;
    }

    if (!m_dbManager) {
        setErrorMessage(QStringLiteral("System database unavailable."));
        return false;
    }

    bool success = m_dbManager->deleteUser(uTrimmed);
    if (success) {
        // If the removed user is currently logged in, revoke session immediately
        if (m_currentUserName.compare(uTrimmed, Qt::CaseInsensitive) == 0) {
            logout();
        }
        clearError();
        emit usersChanged();
        return true;
    } else {
        setErrorMessage(QStringLiteral("Failed to remove user from database."));
        return false;
    }
}

} // namespace Panorama
