"""MQTT Telemetry Payload Parser.

Parses incoming MQTT payload byte arrays and strings, normalizes legacy and standard
keys, and validates against the Pydantic schema.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from app.schemas.telemetry import MqttTelemetryPayload

logger = logging.getLogger("panorama.mqtt.parser")


class TelemetryParser:
    """Parses and normalizes telemetry frames."""

    @staticmethod
    def parse_payload(payload_bytes: bytes) -> Optional[MqttTelemetryPayload]:
        """Decode and validate a raw MQTT byte payload."""
        try:
            payload_str = payload_bytes.decode("utf-8").strip()
            data = json.loads(payload_str)
            return TelemetryParser.from_dict(data)
        except Exception as e:
            logger.error(f"Failed to parse MQTT payload: {e}")
            return None

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> Optional[MqttTelemetryPayload]:
        """Normalize dictionary keys and instantiate schema."""
        try:
            # Map legacy alternate keys if present
            if "deviceId" in data and "uid" not in data:
                data["uid"] = data["deviceId"]
            if "trainNumber" in data and "trno" not in data:
                data["trno"] = data["trainNumber"]
            if "coachNumber" in data and "chno" not in data:
                data["chno"] = data["coachNumber"]

            # Timestamp normalization
            if "time" in data and "dt" not in data:
                data["dt"] = data["time"]
            if not data.get("dt"):
                data["dt"] = datetime.now(timezone.utc).isoformat()

            return MqttTelemetryPayload(**data)
        except Exception as e:
            logger.error(f"Schema validation failed for telemetry dict: {e}")
            return None

