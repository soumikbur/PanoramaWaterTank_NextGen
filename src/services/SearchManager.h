#pragma once

#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>
#include <QTimer>
#include <qqml.h>

namespace Panorama {

class DatabaseManager;

class SearchManager : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

    Q_PROPERTY(QString query READ query WRITE setQuery NOTIFY queryChanged)
    Q_PROPERTY(bool isSearching READ isSearching NOTIFY isSearchingChanged)
    Q_PROPERTY(QVariantList trainResults READ trainResults NOTIFY searchResultsChanged)
    Q_PROPERTY(QVariantList coachResults READ coachResults NOTIFY searchResultsChanged)
    Q_PROPERTY(QVariantList tankResults READ tankResults NOTIFY searchResultsChanged)
    Q_PROPERTY(QVariantList locationResults READ locationResults NOTIFY searchResultsChanged)
    Q_PROPERTY(bool hasResults READ hasResults NOTIFY searchResultsChanged)
    Q_PROPERTY(int totalMatches READ totalMatches NOTIFY searchResultsChanged)

public:
    explicit SearchManager(QObject *parent = nullptr);

    void setDatabaseManager(DatabaseManager *dbManager);

    QString query() const { return m_query; }
    void setQuery(const QString &query);

    bool isSearching() const { return m_isSearching; }
    QVariantList trainResults() const { return m_trainResults; }
    QVariantList coachResults() const { return m_coachResults; }
    QVariantList tankResults() const { return m_tankResults; }
    QVariantList locationResults() const { return m_locationResults; }
    bool hasResults() const { return totalMatches() > 0; }
    int totalMatches() const {
        return m_trainResults.size() + m_coachResults.size() + m_tankResults.size() + m_locationResults.size();
    }

    Q_INVOKABLE void searchImmediate(const QString &query);
    Q_INVOKABLE void clear();
    Q_INVOKABLE void selectResult(const QString &type, const QVariantMap &item);

signals:
    void queryChanged();
    void isSearchingChanged();
    void searchResultsChanged();
    void navigateToTrain(const QString &trainNumber);
    void navigateToCoach(int coachId, const QString &coachNumber, const QString &trainNumber);
    void navigateToTank(int tankId, const QString &tankNumber);
    void navigateToLocation(double latitude, double longitude, const QString &name);

private slots:
    void executeSearch();

private:
    void initializeKnownLocations();

    DatabaseManager *m_dbManager{nullptr};
    QString m_query;
    bool m_isSearching{false};
    QTimer m_debounceTimer;

    QVariantList m_trainResults;
    QVariantList m_coachResults;
    QVariantList m_tankResults;
    QVariantList m_locationResults;

    struct KnownLocation {
        QString name;
        QString code;
        QString division;
        QString zone;
        double latitude;
        double longitude;
    };
    QList<KnownLocation> m_knownLocations;
};

} // namespace Panorama
