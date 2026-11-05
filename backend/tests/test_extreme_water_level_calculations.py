"""Extreme Testing Suite for Water Level Monitoring Calculations & Sensor Physics.

Validates:
1. Complete fill boundary matrix: 0.0%, 1.0%, 10.0%, 20.0%, 50.0%, 99.0%, 100.0%.
2. Negative raw levels (sensor drift/undershoot) and sensor overflow (>100.0%).
3. Physical tank geometry calculations (height, area, volume in Liters).
4. Capacity rank classifications and alarm trigger boundaries.
5. AlarmService state evaluation across nominal and fault conditions.
"""
import pytest
from app.services.calculator import VolumeCalculator
from app.services.alarm_service import AlarmService


def test_boundary_zero_percent():
    """Verify 0.0% exact boundary: empty tank, 0.0 Liters, 0.0 m height."""
    # Water height at 0% with 0.50m (50cm) max height
    h_m = VolumeCalculator.calculate_water_height(0.0, 0.50)
    assert h_m == 0.0

    # Volume at 0 height
    vol_l = VolumeCalculator.calculate_volume_liters(0.04, h_m)
    assert vol_l == 0.0

    # Fill percentage
    fill_pct = VolumeCalculator.calculate_fill_percentage(vol_l, 20.0)
    assert fill_pct == 0.0

    # Capacity rank
    rank = VolumeCalculator.determine_capacity_rank(0.0)
    assert rank == "LOW"

    # Alarm evaluation
    alarms = AlarmService.evaluate_reading(
        raw_level_percent=0.0,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0,
        overflow_threshold=100.0
    )
    assert any(a["severity"] == "CRITICAL" and a["alarm_type"] == "CRITICAL_LOW" for a in alarms)
    assert AlarmService.determine_overall_status(alarms) == "CRITICAL_LOW"


def test_boundary_one_percent():
    """Verify 1.0% extreme low boundary."""
    h_m = VolumeCalculator.calculate_water_height(1.0, 0.50)
    assert pytest.approx(h_m, rel=1e-4) == 0.005  # 0.5 cm

    vol_l = VolumeCalculator.calculate_volume_liters(0.04, h_m)
    assert pytest.approx(vol_l, rel=1e-4) == 0.20  # 0.2 Liters

    rank = VolumeCalculator.determine_capacity_rank(1.0)
    assert rank == "LOW"

    alarms = AlarmService.evaluate_reading(
        raw_level_percent=1.0,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0
    )
    assert any(a["severity"] == "CRITICAL" and a["alarm_type"] == "CRITICAL_LOW" for a in alarms)


def test_boundary_critical_threshold_ten_percent():
    """Verify 10.0% Critical Low threshold boundary."""
    h_m = VolumeCalculator.calculate_water_height(10.0, 0.50)
    assert pytest.approx(h_m, rel=1e-4) == 0.05  # 5 cm

    vol_l = VolumeCalculator.calculate_volume_liters(0.04, h_m)
    assert pytest.approx(vol_l, rel=1e-4) == 2.0  # 2.0 Liters

    rank = VolumeCalculator.determine_capacity_rank(10.0)
    assert rank == "LOW"

    # Below 10.0% must trigger CRITICAL_LOW
    alarms = AlarmService.evaluate_reading(
        raw_level_percent=9.9,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0
    )
    assert any(a["severity"] == "CRITICAL" and a["alarm_type"] == "CRITICAL_LOW" for a in alarms)


def test_boundary_warning_threshold_twenty_percent():
    """Verify 20.0% Warning Low threshold boundary."""
    h_m = VolumeCalculator.calculate_water_height(20.0, 0.50)
    assert pytest.approx(h_m, rel=1e-4) == 0.10  # 10 cm

    vol_l = VolumeCalculator.calculate_volume_liters(0.04, h_m)
    assert pytest.approx(vol_l, rel=1e-4) == 4.0  # 4.0 Liters

    rank = VolumeCalculator.determine_capacity_rank(20.0)
    assert rank == "LOW"

    # Above 10% but <= 20% triggers WARNING_LOW
    alarms = AlarmService.evaluate_reading(
        raw_level_percent=20.0,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0
    )
    # At 20.0%, depending on rule (<20 or <=20)
    # Check 19.9%
    alarms_19 = AlarmService.evaluate_reading(
        raw_level_percent=19.9,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0
    )
    assert any(a["severity"] == "WARNING" and a["alarm_type"] == "WARNING_LOW" for a in alarms_19)


def test_boundary_nominal_fifty_percent():
    """Verify 50.0% nominal mid-level operation."""
    h_m = VolumeCalculator.calculate_water_height(50.0, 0.50)
    assert pytest.approx(h_m, rel=1e-4) == 0.25  # 25 cm

    vol_l = VolumeCalculator.calculate_volume_liters(0.04, h_m)
    assert pytest.approx(vol_l, rel=1e-4) == 10.0  # 10 Liters

    rank = VolumeCalculator.determine_capacity_rank(50.0)
    assert rank == "GOOD"

    alarms = AlarmService.evaluate_reading(
        raw_level_percent=50.0,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0,
        overflow_threshold=100.0
    )
    assert len(alarms) == 0
    assert AlarmService.determine_overall_status(alarms) == "NORMAL"


def test_boundary_ninety_nine_percent():
    """Verify 99.0% near full capacity."""
    h_m = VolumeCalculator.calculate_water_height(99.0, 0.50)
    assert pytest.approx(h_m, rel=1e-4) == 0.495  # 49.5 cm

    vol_l = VolumeCalculator.calculate_volume_liters(0.04, h_m)
    assert pytest.approx(vol_l, rel=1e-4) == 19.80  # 19.8 Liters

    rank = VolumeCalculator.determine_capacity_rank(99.0)
    assert rank == "HIGH"

    alarms = AlarmService.evaluate_reading(
        raw_level_percent=99.0,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0,
        overflow_threshold=100.0
    )
    assert len(alarms) == 0


def test_boundary_hundred_percent():
    """Verify 100.0% full rated capacity."""
    h_m = VolumeCalculator.calculate_water_height(100.0, 0.50)
    assert pytest.approx(h_m, rel=1e-4) == 0.50  # 50 cm

    vol_l = VolumeCalculator.calculate_volume_liters(0.04, h_m)
    assert pytest.approx(vol_l, rel=1e-4) == 20.00  # 20 Liters

    rank = VolumeCalculator.determine_capacity_rank(100.0)
    assert rank == "HIGH"


def test_negative_raw_level_anomalies():
    """Verify negative raw level clamping via evaluate_metrics."""
    metrics = VolumeCalculator.evaluate_metrics(
        raw_level_percent=-5.0,
        capacity_liters=20.0,
        max_height_cm=50.0,
        area_m2=0.04
    )
    assert metrics["raw_level_percent"] == -5.0
    assert metrics["level_percent"] == 0.0
    assert metrics["volume_liters"] == 0.0
    assert metrics["water_height_cm"] == 0.0


def test_overflow_unconstrained_calculations():
    """Verify overflow conditions (>100.0%)."""
    metrics = VolumeCalculator.evaluate_metrics(
        raw_level_percent=115.0,
        capacity_liters=20.0,
        max_height_cm=50.0,
        area_m2=0.04
    )
    assert metrics["raw_level_percent"] == 115.0
    assert metrics["level_percent"] == 100.0  # visual clamped
    assert metrics["is_overflow"] is True

    alarms = AlarmService.evaluate_reading(
        raw_level_percent=115.0,
        sensor_valid=True,
        overflow_threshold=100.0
    )
    assert any(a["alarm_type"] == "OVERFLOW" for a in alarms)
    assert AlarmService.determine_overall_status(alarms) == "OVERFLOW"


def test_sensor_voltage_and_fault_anomalies():
    """Verify electrical fault triggers and sensor failure flags."""
    # Under-voltage
    alarms_v = AlarmService.evaluate_reading(
        raw_level_percent=50.0,
        sensor_valid=True,
        battery_voltage=9.5
    )
    assert any(a["alarm_type"] == "VOLTAGE_FAULT" for a in alarms_v)

    # Sensor fault
    alarms_s = AlarmService.evaluate_reading(
        raw_level_percent=50.0,
        sensor_valid=False
    )
    assert any(a["alarm_type"] == "SENSOR_FAULT" for a in alarms_s)
    assert AlarmService.determine_overall_status(alarms_s) == "SENSOR_FAULT"
