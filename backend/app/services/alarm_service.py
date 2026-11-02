"""Alarm Engine Service.

Evaluates fluid levels, sensor validity flags, and electrical voltages against
configurable thresholds to trigger, maintain, and resolve system alarms.
"""
from typing import List, Optional, Tuple, Dict, Any


class AlarmService:
    """Evaluates telemetry readings and generates structured alarm states."""

    HYSTERESIS_PERCENT: float = 1.0

    @classmethod
    def evaluate_reading(
        cls,
        raw_level_percent: float,
        sensor_valid: bool = True,
        battery_voltage: Optional[float] = None,
        critical_threshold: float = 10.0,
        warning_threshold: float = 20.0,
        overflow_threshold: float = 100.0
    ) -> List[Dict[str, Any]]:
        """Evaluate a reading against all alarm conditions and return active alarm descriptors."""
        alarms: List[Dict[str, Any]] = []

        # 1. Sensor Hardware Fault
        if not sensor_valid:
            alarms.append({
                "alarm_type": "SENSOR_FAULT",
                "severity": "CRITICAL",
                "trigger_value": raw_level_percent,
                "threshold_value": 0.0,
                "message": "Water Level Sensor Fault: Invalid ADC reading or probe disconnected"
            })
            # If sensor is invalid, do not evaluate level thresholds
            return alarms

        # 2. Critical Low Water Level
        if raw_level_percent < critical_threshold:
            alarms.append({
                "alarm_type": "CRITICAL_LOW",
                "severity": "CRITICAL",
                "trigger_value": raw_level_percent,
                "threshold_value": critical_threshold,
                "message": f"Critical Low Water Level ({raw_level_percent:.1f}% < {critical_threshold:.1f}%)"
            })
        # 3. Warning Low Water Level
        elif raw_level_percent < warning_threshold:
            alarms.append({
                "alarm_type": "WARNING_LOW",
                "severity": "WARNING",
                "trigger_value": raw_level_percent,
                "threshold_value": warning_threshold,
                "message": f"Low Water Warning ({raw_level_percent:.1f}% < {warning_threshold:.1f}%)"
            })

        # 4. Overflow Condition
        if raw_level_percent >= overflow_threshold:
            alarms.append({
                "alarm_type": "OVERFLOW",
                "severity": "WARNING",
                "trigger_value": raw_level_percent,
                "threshold_value": overflow_threshold,
                "message": f"Tank Overflow Detected ({raw_level_percent:.1f}% >= {overflow_threshold:.1f}%)"
            })

        # 5. Low Battery Voltage
        if battery_voltage is not None and battery_voltage < 10.5:
            alarms.append({
                "alarm_type": "VOLTAGE_FAULT",
                "severity": "WARNING",
                "trigger_value": battery_voltage,
                "threshold_value": 10.5,
                "message": f"Low Power Bus Voltage ({battery_voltage:.2f} V < 10.50 V)"
            })

        return alarms

    @classmethod
    def determine_overall_status(cls, alarms: List[Dict[str, Any]]) -> str:
        """Derive the primary status string for dashboard display."""
        if not alarms:
            return "NORMAL"
        
        # Check severities
        has_critical = any(a["severity"] == "CRITICAL" for a in alarms)
        if has_critical:
            for a in alarms:
                if a["alarm_type"] == "SENSOR_FAULT":
                    return "SENSOR_FAULT"
                if a["alarm_type"] == "CRITICAL_LOW":
                    return "CRITICAL_LOW"
            return "CRITICAL"

        for a in alarms:
            if a["alarm_type"] == "OVERFLOW":
                return "OVERFLOW"
            if a["alarm_type"] == "WARNING_LOW":
                return "WARNING_LOW"

        return "WARNING"

