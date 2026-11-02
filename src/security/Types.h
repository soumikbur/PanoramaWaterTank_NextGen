#pragma once

namespace Panorama {

/*!
 * \brief Shared, dependency-free type definitions used across the backend
 *        layers (repository, models, network, state).
 *
 * These enumerations mirror the vocabulary fixed in the approved planning
 * documents (docs/04-engineering-model-workflow.md,
 * docs/05-implementation-blueprint.md) and intentionally carry no
 * behavior. They exist so that layers which must not depend on one
 * another directly (docs/05-implementation-blueprint.md, Section 15) can
 * still agree on a common data vocabulary through this single,
 * dependency-free header instead of depending on each other's classes.
 */

//! The physical quantity a configured Ubidots variable represents
//! (docs/04, Section 3).
enum class ReadingType {
    Height,
    Volume,
    Distance
};

//! Connection health, owned conceptually by ConnectionManager
//! (docs/05, Section 1).
enum class ConnectionState {
    Connecting,
    Connected,
    Reconnecting,
    Offline
};

//! Tank alarm severity, owned conceptually by TankModel
//! (docs/04, Section 10).
enum class AlarmLevel {
    Unassessed,
    Normal,
    Low,
    Critical,
    Overflow,
    SensorError
};

//! Purely descriptive capacity quartile (docs/03, Section 8), distinct
//! from AlarmLevel - never subject to hysteresis, never operationally
//! actionable on its own.
enum class CapacityRank {
    Low,
    Moderate,
    Good,
    High
};

//! Application-level lifecycle state (docs/02, Section 6).
enum class ApplicationState {
    Starting,
    LoadingConfiguration,
    Connecting,
    Connected,
    WaitingForData,
    Updating,
    Offline,
    Reconnecting,
    AuthenticationError,
    ConfigurationError,
    ShuttingDown
};

} // namespace Panorama
