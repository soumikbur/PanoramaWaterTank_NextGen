"""Unit tests for VolumeCalculator mathematical parity."""
import pytest
import math
from app.services.calculator import VolumeCalculator


def test_geometry_defaults():
    """Verify default cylindrical geometry matches legacy C++ specifications."""
    # Area = 0.04 m2
    # Radius = sqrt(0.04 / pi) = ~0.1128379 m
    radius = VolumeCalculator.calculate_radius(0.04)
    expected_radius = math.sqrt(0.04 / math.pi)
    assert pytest.approx(radius, rel=1e-5) == expected_radius
    assert round(radius, 4) == 0.1128

    # Max height for 20.0 L with Area = 0.04 m2
    # Height = (20.0 / 1000) / 0.04 = 0.50 m (50.0 cm)
    max_h = VolumeCalculator.calculate_max_height(20.0, 0.04)
    assert pytest.approx(max_h, rel=1e-5) == 0.50


def test_water_height_calculation():
    """Verify water height proportional calculation from fill percentage."""
    # 0% -> 0.0 m
    assert VolumeCalculator.calculate_water_height(0.0, 0.50) == 0.0

    # 50% -> 0.25 m (25.0 cm)
    h_50 = VolumeCalculator.calculate_water_height(50.0, 0.50)
    assert pytest.approx(h_50, rel=1e-5) == 0.25

    # 100% -> 0.50 m (50.0 cm)
    h_100 = VolumeCalculator.calculate_water_height(100.0, 0.50)
    assert pytest.approx(h_100, rel=1e-5) == 0.50

    # 76.5% -> 0.3825 m (38.25 cm)
    h_76_5 = VolumeCalculator.calculate_water_height(76.5, 0.50)
    assert pytest.approx(h_76_5, rel=1e-4) == 0.3825


def test_volume_liters_calculation():
    """Verify volume calculation in liters: Area * Height * 1000."""
    # At full height (0.50 m) and Area = 0.04 m2 -> 20.0 Liters
    vol_full = VolumeCalculator.calculate_volume_liters(0.04, 0.50)
    assert pytest.approx(vol_full, rel=1e-5) == 20.0

    # At half height (0.25 m) -> 10.0 Liters
    vol_half = VolumeCalculator.calculate_volume_liters(0.04, 0.25)
    assert pytest.approx(vol_half, rel=1e-5) == 10.0

    # At 38.25 cm (0.3825 m) -> 15.3 Liters
    vol_custom = VolumeCalculator.calculate_volume_liters(0.04, 0.3825)
    assert pytest.approx(vol_custom, rel=1e-4) == 15.3


def test_fill_percentage_calculation():
    """Verify reverse percentage calculation from volume."""
    pct_full = VolumeCalculator.calculate_fill_percentage(20.0, 20.0)
    assert pct_full == 100.0

    pct_half = VolumeCalculator.calculate_fill_percentage(10.0, 20.0)
    assert pct_half == 50.0

    pct_zero = VolumeCalculator.calculate_fill_percentage(0.0, 20.0)
    assert pct_zero == 0.0


def test_capacity_ranks():
    """Verify 4-tier capacity ranks match legacy UI color boundaries."""
    # LOW: 0 - 25%
    assert VolumeCalculator.determine_capacity_rank(0.0) == "LOW"
    assert VolumeCalculator.determine_capacity_rank(15.0) == "LOW"
    assert VolumeCalculator.determine_capacity_rank(24.9) == "LOW"

    # MODERATE: 25 - 50%
    assert VolumeCalculator.determine_capacity_rank(25.0) == "MODERATE"
    assert VolumeCalculator.determine_capacity_rank(37.5) == "MODERATE"
    assert VolumeCalculator.determine_capacity_rank(49.9) == "MODERATE"

    # GOOD: 50 - 75%
    assert VolumeCalculator.determine_capacity_rank(50.0) == "GOOD"
    assert VolumeCalculator.determine_capacity_rank(65.0) == "GOOD"
    assert VolumeCalculator.determine_capacity_rank(74.9) == "GOOD"

    # HIGH: 75 - 100%
    assert VolumeCalculator.determine_capacity_rank(75.0) == "HIGH"
    assert VolumeCalculator.determine_capacity_rank(88.0) == "HIGH"
    assert VolumeCalculator.determine_capacity_rank(100.0) == "HIGH"


def test_overflow_unconstrained():
    """Verify raw level above 100% preserves overflow flag while clamping visual percent."""
    metrics = VolumeCalculator.evaluate_metrics(
        raw_level_percent=105.0,
        capacity_liters=20.0,
        max_height_cm=50.0,
        area_m2=0.04
    )
    assert metrics["raw_level_percent"] == 105.0
    assert metrics["level_percent"] == 100.0
    assert metrics["is_overflow"] is True
    assert metrics["volume_liters"] == 20.0
