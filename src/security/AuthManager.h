#pragma once

#include <QObject>
#include <QString>
#include <qqml.h>

namespace Panorama {

class DatabaseManager;

class AuthManager : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(bool isAuthenticated READ isAuthenticated NOTIFY authStateChanged)
    Q_PROPERTY(QString currentUserRole READ currentUserRole NOTIFY authStateChanged)
    Q_PROPERTY(QString currentUserName READ currentUserName NOTIFY authStateChanged)
    Q_PROPERTY(QString errorMessage READ errorMessage NOTIFY errorChanged)
    Q_PROPERTY(bool isAdmin READ isAdmin NOTIFY authStateChanged)
    Q_PROPERTY(bool isUser READ isUser NOTIFY authStateChanged)
    Q_PROPERTY(QVariantList users READ users NOTIFY usersChanged)
    Q_PROPERTY(int operatorCount READ operatorCount NOTIFY usersChanged)
    Q_PROPERTY(int maxOperators READ maxOperators CONSTANT)

public:
    explicit AuthManager(QObject *parent = nullptr);

    bool isAuthenticated() const { return m_isAuthenticated; }
    QString currentUserRole() const { return m_currentUserRole; }
    QString currentUserName() const { return m_currentUserName; }
    QString errorMessage() const { return m_errorMessage; }
    bool isAdmin() const {
        return m_isAuthenticated && (
            m_currentUserRole.compare(QStringLiteral("Admin"), Qt::CaseInsensitive) == 0 ||
            m_currentUserRole.compare(QStringLiteral("Administrator"), Qt::CaseInsensitive) == 0
        );
    }
    bool isUser() const {
        return m_isAuthenticated && !isAdmin();
    }
    QVariantList users() const;
    int operatorCount() const;
    int maxOperators() const { return 10; }

    void setDatabaseManager(DatabaseManager *dbManager);

    Q_INVOKABLE bool loginAdmin(const QString &password);
    Q_INVOKABLE bool loginUser(const QString &username, const QString &password);
    Q_INVOKABLE void logout();
    Q_INVOKABLE bool changeUserPassword(const QString &username, const QString &newPassword);
    Q_INVOKABLE void clearError();
    Q_INVOKABLE bool addUser(const QString &name, const QString &username, const QString &password, const QString &role);
    Q_INVOKABLE bool removeUser(const QString &username);
    Q_INVOKABLE QVariantList getUsers() const { return users(); }
    Q_INVOKABLE int getOperatorCount() const { return operatorCount(); }

signals:
    void authStateChanged();
    void errorChanged();
    void usersChanged();
    void loginSucceeded(const QString &role, const QString &username);
    void loginFailed(const QString &reason);
    void userPasswordChanged(bool success, const QString &message);

private:
    bool verifyAdminPassword(const QString &password) const;
    void setErrorMessage(const QString &msg);

    bool m_isAuthenticated{false};
    QString m_currentUserRole;
    QString m_currentUserName;
    QString m_errorMessage;

    DatabaseManager *m_dbManager{nullptr};

    // Precomputed SHA-256 digest of salt + "123"
    // Salt: "panorama_admin_salt_2026"
    // Admin password is fixed to "123" and cannot be changed via UI or application code
    const QByteArray m_adminSalt{"panorama_admin_salt_2026"};
    QByteArray m_adminHash;
};

} // namespace Panorama
