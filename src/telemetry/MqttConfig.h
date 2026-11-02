// MqttConfig.h - Secure MQTT configuration data structure
#pragma once

#include <QString>
#include <QUuid>

namespace Panorama {

struct MqttConfig {
    bool enabled{true};
    QString broker{QStringLiteral("broker.hivemq.com")};
    int port{8883};
    QString topic{QStringLiteral("stm32f411/ec200u/telemetry")};
    bool tlsEnabled{true};
    bool verifyCertificate{true};
    QString username;
    QString password;
    QString clientId;

    static QString generateDefaultClientId() {
        return QStringLiteral("PanoramaWaterTankMonitor_%1")
            .arg(QUuid::createUuid().toString().remove(QLatin1Char('{')).remove(QLatin1Char('}')).remove(QLatin1Char('-')).left(8));
    }

    bool isValid(QString *errorMessage = nullptr) const {
        if (broker.trimmed().isEmpty()) {
            if (errorMessage) *errorMessage = QStringLiteral("MQTT Broker hostname or IP cannot be empty.");
            return false;
        }
        if (port < 1 || port > 65535) {
            if (errorMessage) *errorMessage = QStringLiteral("MQTT Port must be between 1 and 65535.");
            return false;
        }
        if (topic.trimmed().isEmpty()) {
            if (errorMessage) *errorMessage = QStringLiteral("MQTT Topic cannot be empty.");
            return false;
        }
        return true;
    }
};

} // namespace Panorama
