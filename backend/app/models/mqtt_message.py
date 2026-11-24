"""MQTT Latest Messages model for persistent per-topic telemetry retention."""
from datetime import datetime
from typing import Optional, Any, Dict
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text
from app.models.base import Base, generate_uuid, utc_now


class MqttLatestMessage(Base):
    """Stores the authoritative latest received payload for each distinct MQTT topic."""

    __tablename__ = "mqtt_latest_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    topic = Column(String(255), unique=True, nullable=False, index=True)
    payload = Column(Text, nullable=False)
    payload_type = Column(String(32), default="JSON", nullable=False)
    qos = Column(Integer, default=0, nullable=False)
    retained = Column(Boolean, default=False, nullable=False)
    received_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
    message_sequence = Column(Integer, default=1, nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        """Convert record to a structured dictionary with parsed JSON where applicable."""
        import json
        parsed: Any = None
        if self.payload_type == "JSON":
            try:
                parsed = json.loads(self.payload)
            except Exception:
                parsed = self.payload
        else:
            parsed = self.payload

        return {
            "id": self.id,
            "topic": self.topic,
            "payload": parsed,
            "raw_payload": self.payload,
            "payload_type": self.payload_type,
            "qos": self.qos,
            "retained": bool(self.retained),
            "received_at": self.received_at.isoformat() if self.received_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "message_sequence": self.message_sequence,
        }
