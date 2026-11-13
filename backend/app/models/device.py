"""Device model representing an edge monitoring node on a railway coach."""
from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_uuid, utc_now


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    uid = Column(String(64), unique=True, nullable=False, index=True)
    train_number = Column(String(32), nullable=False, default="12002", index=True)
    coach_number = Column(String(32), nullable=False, default="B4", index=True)
    name = Column(String(128), nullable=False, default="Coach Water Monitor")
    hardware_version = Column(String(32), default="Standard WLI Node")
    firmware_version = Column(String(32), default="2.0.0")
    device_type = Column(String(64), default="Quectel EC200U 4G LTE")
    protocol = Column(String(64), default="MQTT over TLS/WSS")
    mqtt_client_id = Column(String(128), nullable=True)
    mqtt_topic = Column(String(128), nullable=True)
    tank_assignment = Column(String(32), default="BOTH")
    description = Column(String(255), nullable=True)
    status = Column(String(32), default="AVAILABLE")
    is_online = Column(Boolean, nullable=False, default=False, index=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    tanks = relationship("Tank", back_populates="device", cascade="all, delete-orphan", lazy="selectin")
    telemetry_readings = relationship("TelemetryReading", back_populates="device", cascade="all, delete-orphan", lazy="selectin")
    alarms = relationship("Alarm", back_populates="device", cascade="all, delete-orphan", lazy="selectin")

