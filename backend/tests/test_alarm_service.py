"""Unit tests for AlarmService evaluation rules."""
from app.services.alarm_service import AlarmService


def test_critical_low_alarm():
    """Verify critical low alarm generated when level < 10%."""
    alarms = AlarmService.evaluate_reading(
        raw_level_percent=8.5,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0
    )
    assert len(alarms) == 1
    assert alarms[0]["alarm_type"] == "CRITICAL_LOW"
    assert alarms[0]["severity"] == "CRITICAL"
    assert AlarmService.determine_overall_status(alarms) == "CRITICAL_LOW"


def test_warning_low_alarm():
    """Verify warning low alarm generated when 10% <= level < 20%."""
    alarms = AlarmService.evaluate_reading(
        raw_level_percent=15.0,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0
    )
    assert len(alarms) == 1
    assert alarms[0]["alarm_type"] == "WARNING_LOW"
    assert alarms[0]["severity"] == "WARNING"
    assert AlarmService.determine_overall_status(alarms) == "WARNING_LOW"


def test_normal_level():
    """Verify no alarms generated when level >= 20% and < 100%."""
    alarms = AlarmService.evaluate_reading(
        raw_level_percent=65.0,
        sensor_valid=True,
        critical_threshold=10.0,
        warning_threshold=20.0
    )
    assert len(alarms) == 0
    assert AlarmService.determine_overall_status(alarms) == "NORMAL"


def test_overflow_alarm():
    """Verify overflow alarm triggered when level >= 100%."""
    alarms = AlarmService.evaluate_reading(
        raw_level_percent=102.5,
        sensor_valid=True,
        overflow_threshold=100.0
    )
    assert any(a["alarm_type"] == "OVERFLOW" for a in alarms)
    assert AlarmService.determine_overall_status(alarms) == "OVERFLOW"


def test_sensor_fault_detection():
    """Verify sensor fault alarm overrides level evaluation when sensor_valid is False."""
    alarms = AlarmService.evaluate_reading(
        raw_level_percent=50.0,
        sensor_valid=False
    )
    assert len(alarms) == 1
    assert alarms[0]["alarm_type"] == "SENSOR_FAULT"
    assert alarms[0]["severity"] == "CRITICAL"
    assert AlarmService.determine_overall_status(alarms) == "SENSOR_FAULT"


def test_voltage_fault():
    """Verify low battery voltage generates voltage fault alarm."""
    alarms = AlarmService.evaluate_reading(
        raw_level_percent=75.0,
        sensor_valid=True,
        battery_voltage=9.8
    )
    assert any(a["alarm_type"] == "VOLTAGE_FAULT" for a in alarms)

