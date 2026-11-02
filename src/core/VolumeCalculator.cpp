#include "VolumeCalculator.h"

#include <algorithm>
#include <cmath>

namespace Panorama::VolumeCalculator {

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kLitersPerCubicMeter = 1000.0;

} // namespace

double calculateArea(double radiusMeters)
{
    if (!std::isfinite(radiusMeters) || radiusMeters <= 0.0) {
        return 0.0;
    }
    return kPi * radiusMeters * radiusMeters;
}

double calculateRectangularArea(double widthMeters, double lengthMeters)
{
    if (!std::isfinite(widthMeters) || !std::isfinite(lengthMeters) || widthMeters <= 0.0 || lengthMeters <= 0.0) {
        return 0.0;
    }
    return widthMeters * lengthMeters;
}

double calculateVolume(double areaSquareMeters, double heightMeters)
{
    if (!std::isfinite(areaSquareMeters) || !std::isfinite(heightMeters) || areaSquareMeters <= 0.0
        || heightMeters <= 0.0) {
        return 0.0;
    }
    return areaSquareMeters * heightMeters * kLitersPerCubicMeter;
}

double calculateRectangularVolume(double widthMeters, double lengthMeters, double heightMeters)
{
    double area = calculateRectangularArea(widthMeters, lengthMeters);
    return calculateVolume(area, heightMeters);
}

double calculateCustomVolume(double currentHeightMeters, double totalHeightMeters, double totalCapacityLiters)
{
    if (!std::isfinite(currentHeightMeters) || !std::isfinite(totalHeightMeters) || !std::isfinite(totalCapacityLiters)
        || totalHeightMeters <= 0.0 || totalCapacityLiters <= 0.0 || currentHeightMeters <= 0.0) {
        return 0.0;
    }
    double clampedH = std::min(currentHeightMeters, totalHeightMeters);
    return (clampedH / totalHeightMeters) * totalCapacityLiters;
}

double calculateHeight(double volumeLiters, double areaSquareMeters)
{
    if (!std::isfinite(volumeLiters) || !std::isfinite(areaSquareMeters) || areaSquareMeters <= 0.0) {
        return 0.0;
    }
    const double clampedVolume = std::max(0.0, volumeLiters);
    return (clampedVolume / kLitersPerCubicMeter) / areaSquareMeters;
}

double calculateFillPercentageRaw(double currentVolumeLiters, double maximumVolumeLiters)
{
    if (!std::isfinite(currentVolumeLiters) || !std::isfinite(maximumVolumeLiters) || maximumVolumeLiters <= 0.0) {
        return 0.0;
    }
    return (currentVolumeLiters / maximumVolumeLiters) * 100.0;
}

double clampPercentageForDisplay(double rawPercentage)
{
    if (!std::isfinite(rawPercentage)) {
        return 0.0;
    }
    return std::clamp(rawPercentage, 0.0, 100.0);
}

double calculateRemainingVolume(double maximumVolumeLiters, double currentVolumeLiters)
{
    if (!std::isfinite(maximumVolumeLiters) || !std::isfinite(currentVolumeLiters)) {
        return 0.0;
    }
    return std::max(0.0, maximumVolumeLiters - currentVolumeLiters);
}

double calculateCapacityForShape(int shapeId, double heightMeters, double diameterMeters,
                                double widthMeters, double lengthMeters, double customCapacityLiters)
{
    if (shapeId == 0) { // Cylinder
        double radiusM = diameterMeters / 2.0;
        double area = calculateArea(radiusM);
        return calculateVolume(area, heightMeters);
    } else if (shapeId == 1) { // Rectangle
        return calculateRectangularVolume(widthMeters, lengthMeters, heightMeters);
    } else { // Custom
        return (customCapacityLiters > 0.0) ? customCapacityLiters : 20.0;
    }
}

double calculateVolumeForShape(int shapeId, double waterHeightMeters, double totalHeightMeters,
                              double diameterMeters, double widthMeters, double lengthMeters,
                              double totalCapacityLiters)
{
    if (waterHeightMeters <= 0.0 || totalHeightMeters <= 0.0) {
        return 0.0;
    }
    double clampedH = std::min(waterHeightMeters, totalHeightMeters);
    if (shapeId == 0) { // Cylinder
        double radiusM = diameterMeters / 2.0;
        double area = calculateArea(radiusM);
        return calculateVolume(area, clampedH);
    } else if (shapeId == 1) { // Rectangle
        double area = calculateRectangularArea(widthMeters, lengthMeters);
        return calculateVolume(area, clampedH);
    } else { // Custom
        return calculateCustomVolume(clampedH, totalHeightMeters, totalCapacityLiters);
    }
}

} // namespace Panorama::VolumeCalculator
