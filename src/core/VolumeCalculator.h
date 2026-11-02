#pragma once

namespace Panorama::VolumeCalculator {

/*!
 * \brief Pure cylindrical-tank engineering math
 *        (docs/05-implementation-blueprint.md, Section 5).
 *
 * Every function here is stateless, has zero dependencies (not even on
 * Qt), and matches the equations approved in docs/05, Section 5 exactly.
 *
 * Implemented in full during this milestone rather than left as an empty
 * skeleton like the other backend classes: these functions are fully
 * specified with no remaining design ambiguity, and depend on nothing
 * else in the project (docs/05, Section 1: "Dependencies: none"). Unlike
 * every other class generated in this milestone, there is no later
 * decision left to make here - only a decision already made and approved
 * in planning, being transcribed.
 */

//! Cross-sectional area of the tank, in square metres. area = pi * r^2.
//! Returns 0 for a non-finite or non-positive radius.
double calculateArea(double radiusMeters);

//! Cross-sectional area of a rectangular tank, in square metres. area = width * length.
//! Returns 0 for non-finite or non-positive dimensions.
double calculateRectangularArea(double widthMeters, double lengthMeters);

//! Volume of a column of the given cross-sectional area and height, in
//! litres. Returns 0 if either input is non-finite or non-positive.
double calculateVolume(double areaSquareMeters, double heightMeters);

//! Volume of a rectangular tank in litres: width * length * height * 1000.
double calculateRectangularVolume(double widthMeters, double lengthMeters, double heightMeters);

//! Volume of a custom tank in litres: linear ratio of height against total capacity.
double calculateCustomVolume(double currentHeightMeters, double totalHeightMeters, double totalCapacityLiters);

//! Inverse of calculateVolume(): recovers height (m) from a known volume
//! (L) and cross-sectional area (m^2). Returns 0 for a non-finite or
//! non-positive area; a negative volume is treated as 0.
double calculateHeight(double volumeLiters, double areaSquareMeters);

//! Fill percentage of currentVolume against maximumVolume. Deliberately
//! UNCLAMPED - may legitimately return a value above 100, which is the
//! signal used for Overflow detection (docs/04-engineering-model-workflow.md,
//! Section 10). Returns 0 if maximumVolume is non-finite or non-positive.
//! See clampPercentageForDisplay() for the display-facing value.
double calculateFillPercentageRaw(double currentVolumeLiters, double maximumVolumeLiters);

//! Clamps a raw fill percentage to the [0, 100] range for display
//! purposes only (docs/04, Section 4).
double clampPercentageForDisplay(double rawPercentage);

//! Litres of headroom left before the tank is full. Never negative.
double calculateRemainingVolume(double maximumVolumeLiters, double currentVolumeLiters);

//! Shape-aware capacity calculator (litres)
double calculateCapacityForShape(int shapeId, double heightMeters, double diameterMeters,
                                double widthMeters, double lengthMeters, double customCapacityLiters);

//! Shape-aware volume calculator from liquid height (litres)
double calculateVolumeForShape(int shapeId, double waterHeightMeters, double totalHeightMeters,
                              double diameterMeters, double widthMeters, double lengthMeters,
                              double totalCapacityLiters);

} // namespace Panorama::VolumeCalculator
