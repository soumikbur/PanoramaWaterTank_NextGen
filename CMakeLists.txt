cmake_minimum_required(VERSION 3.21)

project(PanoramaWaterTank
    VERSION 2.0.0
    DESCRIPTION "Panorama Water Tank Monitor - NextGen Industrial SCADA/HMI Application"
    LANGUAGES CXX
)

# --- C++ Standard & Qt Automation ------------------------------------------

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

if (NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE "Debug" CACHE STRING "Build type" FORCE)
    set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS "Debug" "Release" "RelWithDebInfo" "MinSizeRel")
endif()

option(PANORAMA_WARNINGS_AS_ERRORS "Treat compiler warnings as errors" OFF)

# --- Qt Dependencies -------------------------------------------------------

find_package(Qt6 6.9 REQUIRED COMPONENTS
    Core
    Gui
    Quick
    QuickControls2
    Svg
    Network
    Sql
    Mqtt
)

qt_standard_project_setup(REQUIRES 6.9)

# --- Centralized Include Directories ---------------------------------------

set(ALL_MODULE_INCLUDES
    ${CMAKE_CURRENT_SOURCE_DIR}/app
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${CMAKE_CURRENT_SOURCE_DIR}/src/core
    ${CMAKE_CURRENT_SOURCE_DIR}/src/networking
    ${CMAKE_CURRENT_SOURCE_DIR}/src/telemetry
    ${CMAKE_CURRENT_SOURCE_DIR}/src/domain
    ${CMAKE_CURRENT_SOURCE_DIR}/src/services
    ${CMAKE_CURRENT_SOURCE_DIR}/src/repository
    ${CMAKE_CURRENT_SOURCE_DIR}/src/security
    ${CMAKE_CURRENT_SOURCE_DIR}/src/configuration
)

# --- Executable Target -----------------------------------------------------

qt_add_executable(PanoramaWaterTank
    app/main.cpp
    app/ApplicationController.h
    app/ApplicationController.cpp

    # Security & RBAC
    src/security/Types.h
    src/security/AuthManager.h
    src/security/AuthManager.cpp
    src/security/PermissionManager.h
    src/security/PermissionManager.cpp

    # Core & Utilities
    src/core/Logger.h
    src/core/Logger.cpp
    src/core/TimeManager.h
    src/core/TimeManager.cpp
    src/core/HistoryExporter.h
    src/core/HistoryExporter.cpp
    src/core/DisplayPerformanceManager.h
    src/core/DisplayPerformanceManager.cpp
    src/core/VolumeCalculator.h
    src/core/VolumeCalculator.cpp

    # Configuration
    src/configuration/SettingsManager.h
    src/configuration/SettingsManager.cpp

    # Domain Models
    src/domain/LocationTypes.h
    src/domain/TankModel.h
    src/domain/TankModel.cpp
    src/domain/TrainManager.h
    src/domain/TrainManager.cpp
    src/domain/RailwayManager.h
    src/domain/RailwayManager.cpp
    src/domain/TrainConfigProvider.h
    src/domain/TrainConfigProvider.cpp

    # Services
    src/services/LocationManager.h
    src/services/LocationManager.cpp
    src/services/SearchManager.h
    src/services/SearchManager.cpp
    src/services/ApplicationStateManager.h
    src/services/ApplicationStateManager.cpp

    # Repository & Persistence
    src/repository/TankRepository.h
    src/repository/TankRepository.cpp
    src/repository/DatabaseManager.h
    src/repository/DatabaseManager.cpp

    # Networking
    src/networking/ConnectionManager.h
    src/networking/ConnectionManager.cpp
    src/networking/ApiClient.h
    src/networking/ApiClient.cpp

    # Telemetry & MQTT
    src/telemetry/MqttConfig.h
    src/telemetry/MqttConfig.cpp
    src/telemetry/MqttService.h
    src/telemetry/MqttService.cpp
)

target_include_directories(PanoramaWaterTank PRIVATE ${ALL_MODULE_INCLUDES})

# --- QML Module Registration -----------------------------------------------

set_source_files_properties(
    qml/theme/Colors.qml
    qml/theme/Typography.qml
    qml/theme/Metrics.qml
    qml/theme/Icons.qml
    qml/theme/Theme.qml
    PROPERTIES
        QT_QML_SINGLETON_TYPE TRUE
)

qt_add_qml_module(PanoramaWaterTank
    URI PanoramaWaterTank
    VERSION 1.0

    QML_FILES
        # Application Root
        qml/App.qml

        # Theme Singletons
        qml/theme/Colors.qml
        qml/theme/Typography.qml
        qml/theme/Metrics.qml
        qml/theme/Icons.qml
        qml/theme/Theme.qml

        # Core Components
        qml/components/BaseCard.qml
        qml/components/Header.qml
        qml/components/FramelessResizeHandler.qml
        qml/components/Sidebar.qml
        qml/components/NavItem.qml
        qml/components/Footer.qml
        qml/components/WaterWave.qml
        qml/components/StatusBadge.qml
        qml/components/InfoRow.qml
        qml/components/StyledTextField.qml
        qml/components/StyledComboBox.qml
        qml/components/StyledButton.qml
        qml/components/StyledSlider.qml
        qml/components/StyledCheckBox.qml
        qml/components/StyledSwitch.qml

        # Dashboard & Visualization
        qml/components/SummaryCard.qml
        qml/components/RankIndicator.qml
        qml/components/TankVisualization.qml
        qml/components/TankLevelCard.qml
        qml/components/TrendChart.qml
        qml/components/LevelTrendCard.qml
        qml/components/TankInfoCard.qml
        qml/components/QuickInfoCard.qml
        qml/components/AlertLevelIndicator.qml
        qml/components/MetricCard.qml
        qml/components/RecentAlertsCard.qml
        qml/components/ConnectionCard.qml
        qml/components/DashboardConnectionCard.qml
        qml/components/TankConfigurationCard.qml
        qml/components/TankCard.qml
        qml/components/LocationMap.qml
        qml/components/DashboardLayout.qml
        qml/components/DashboardTopSection.qml
        qml/components/DashboardStatus.qml
        qml/components/DashboardSummaryGrid.qml

        # Pages
        qml/pages/PlaceholderPage.qml
        qml/pages/TrainSelectionPage.qml
        qml/pages/TrainManagementPage.qml
        qml/pages/CoachConfigurationPage.qml
        qml/pages/AllTanksPage.qml
        qml/pages/DashboardPage.qml
        qml/pages/LocationPage.qml
        qml/pages/WaterTankPage.qml
        qml/pages/DevicesPage.qml
        qml/pages/AlertsPage.qml
        qml/pages/HistoryPage.qml
        qml/pages/ReportsPage.qml
        qml/pages/SettingsPage.qml
        qml/pages/ConfigurationPage.qml
        qml/pages/UsersPage.qml
        qml/pages/LogsPage.qml

        # Authentication & Roles
        qml/auth/RoleSelectionView.qml
        qml/auth/AdminLoginView.qml
        qml/auth/UserLoginView.qml
        qml/auth/VectorIcon.qml
        qml/auth/LandingHeader.qml
        qml/auth/RoleCard.qml
        qml/auth/FeatureTile.qml
        qml/auth/CapabilityItem.qml
        qml/auth/CapabilityStrip.qml

        # Global Search
        qml/search/SearchBar.qml
        qml/search/SearchResultsDropdown.qml

    RESOURCES
        resources/images/panorama_logo.png
        resources/images/panorama_icon.png
        resources/images/railway_hero.jpg
)

# --- Compiler Warnings & Flags ---------------------------------------------

if (MSVC)
    target_compile_options(PanoramaWaterTank PRIVATE /W4 /permissive-)
    if (PANORAMA_WARNINGS_AS_ERRORS)
        target_compile_options(PanoramaWaterTank PRIVATE /WX)
    endif()
else()
    target_compile_options(PanoramaWaterTank PRIVATE -Wall -Wextra -Wpedantic)
    if (PANORAMA_WARNINGS_AS_ERRORS)
        target_compile_options(PanoramaWaterTank PRIVATE -Werror)
    endif()
endif()

target_compile_definitions(PanoramaWaterTank PRIVATE
    QT_DISABLE_DEPRECATED_BEFORE=0x060900
    $<$<CONFIG:Debug>:PANORAMA_DEBUG_BUILD>
    $<$<CONFIG:Release>:QT_NO_DEBUG_OUTPUT>
)

target_link_libraries(PanoramaWaterTank
    PRIVATE
        Qt6::Core
        Qt6::Gui
        Qt6::Quick
        Qt6::QuickControls2
        Qt6::Svg
        Qt6::Network
        Qt6::Sql
        Qt6::Mqtt
)

set_target_properties(PanoramaWaterTank PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
    WIN32_EXECUTABLE ON
    MACOSX_BUNDLE ON
)

# --- Automated Test Targets ------------------------------------------------

enable_testing()

# 1. test_csv_export
add_executable(test_csv_export
    tests/test_csv_export.cpp
    src/core/HistoryExporter.h
    src/core/HistoryExporter.cpp
)
target_include_directories(test_csv_export PRIVATE ${ALL_MODULE_INCLUDES})
target_link_libraries(test_csv_export PRIVATE Qt6::Core)
set_target_properties(test_csv_export PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
add_test(NAME CsvExportTest COMMAND test_csv_export)

# 2. test_e2e_integration
add_executable(test_e2e_integration
    tests/test_e2e_integration.cpp
    src/core/HistoryExporter.h
    src/core/HistoryExporter.cpp
    src/domain/TankModel.h
    src/domain/TankModel.cpp
    src/core/VolumeCalculator.h
    src/core/VolumeCalculator.cpp
)
target_include_directories(test_e2e_integration PRIVATE ${ALL_MODULE_INCLUDES})
target_link_libraries(test_e2e_integration PRIVATE Qt6::Core Qt6::Network Qt6::Quick)
set_target_properties(test_e2e_integration PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
add_test(NAME E2EIntegrationTest COMMAND test_e2e_integration)

# 3. test_esp32_rest
add_executable(test_esp32_rest
    tests/test_esp32_rest.cpp
    src/networking/ApiClient.h
    src/networking/ApiClient.cpp
    src/repository/TankRepository.h
    src/repository/TankRepository.cpp
    src/domain/TankModel.h
    src/domain/TankModel.cpp
    src/core/VolumeCalculator.h
    src/core/VolumeCalculator.cpp
    src/core/Logger.h
    src/core/Logger.cpp
    src/core/HistoryExporter.h
    src/core/HistoryExporter.cpp
)
target_include_directories(test_esp32_rest PRIVATE ${ALL_MODULE_INCLUDES})
target_link_libraries(test_esp32_rest PRIVATE Qt6::Core Qt6::Network Qt6::Quick)
set_target_properties(test_esp32_rest PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
add_test(NAME Esp32RestTest COMMAND test_esp32_rest)

# 4. test_location_and_tanks
add_executable(test_location_and_tanks
    tests/test_location_and_tanks.cpp
    src/core/Logger.h
    src/core/Logger.cpp
    src/configuration/SettingsManager.h
    src/configuration/SettingsManager.cpp
    src/domain/TrainManager.h
    src/domain/TrainManager.cpp
    src/domain/TrainConfigProvider.h
    src/domain/TrainConfigProvider.cpp
    src/domain/TankModel.h
    src/domain/TankModel.cpp
    src/services/LocationManager.h
    src/services/LocationManager.cpp
    src/core/VolumeCalculator.h
    src/core/VolumeCalculator.cpp
    src/core/HistoryExporter.h
    src/core/HistoryExporter.cpp
    src/core/TimeManager.h
    src/core/TimeManager.cpp
    src/repository/TankRepository.h
    src/repository/TankRepository.cpp
    src/repository/DatabaseManager.h
    src/repository/DatabaseManager.cpp
)
target_include_directories(test_location_and_tanks PRIVATE ${ALL_MODULE_INCLUDES})
target_link_libraries(test_location_and_tanks PRIVATE Qt6::Core Qt6::Network Qt6::Quick Qt6::Sql)
set_target_properties(test_location_and_tanks PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
add_test(NAME LocationAndTanksTest COMMAND test_location_and_tanks)

# 5. test_role_railway_architecture
add_executable(test_role_railway_architecture
    tests/test_role_railway_architecture.cpp
    src/security/AuthManager.h
    src/security/AuthManager.cpp
    src/security/PermissionManager.h
    src/security/PermissionManager.cpp
    src/repository/DatabaseManager.h
    src/repository/DatabaseManager.cpp
    src/domain/RailwayManager.h
    src/domain/RailwayManager.cpp
    src/services/SearchManager.h
    src/services/SearchManager.cpp
    src/domain/TankModel.h
    src/domain/TankModel.cpp
    src/core/VolumeCalculator.h
    src/core/VolumeCalculator.cpp
    src/core/HistoryExporter.h
    src/core/HistoryExporter.cpp
)
target_include_directories(test_role_railway_architecture PRIVATE ${ALL_MODULE_INCLUDES})
target_link_libraries(test_role_railway_architecture PRIVATE Qt6::Core Qt6::Sql Qt6::Qml Qt6::Network)
set_target_properties(test_role_railway_architecture PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
add_test(NAME RoleRailwayArchitectureTest COMMAND test_role_railway_architecture)

# 6. test_mqtt_service
add_executable(test_mqtt_service
    tests/test_mqtt_service.cpp
    src/telemetry/MqttConfig.h
    src/telemetry/MqttConfig.cpp
    src/telemetry/MqttService.h
    src/telemetry/MqttService.cpp
    src/configuration/SettingsManager.h
    src/configuration/SettingsManager.cpp
    src/core/Logger.h
    src/core/Logger.cpp
    src/repository/TankRepository.h
    src/repository/TankRepository.cpp
    src/repository/DatabaseManager.h
    src/repository/DatabaseManager.cpp
    src/domain/TankModel.h
    src/domain/TankModel.cpp
    src/core/VolumeCalculator.h
    src/core/VolumeCalculator.cpp
    src/core/HistoryExporter.h
    src/core/HistoryExporter.cpp
    src/services/ApplicationStateManager.h
    src/services/ApplicationStateManager.cpp
    src/domain/TrainConfigProvider.h
    src/domain/TrainConfigProvider.cpp
)
target_include_directories(test_mqtt_service PRIVATE ${ALL_MODULE_INCLUDES})
target_link_libraries(test_mqtt_service PRIVATE Qt6::Core Qt6::Network Qt6::Mqtt Qt6::Sql Qt6::Quick)
set_target_properties(test_mqtt_service PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
add_test(NAME MqttServiceTest COMMAND test_mqtt_service)

