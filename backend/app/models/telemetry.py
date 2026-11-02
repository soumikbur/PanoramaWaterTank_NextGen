"""Telemetry reading model capturing sensor frames."""
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import utc_now


class TelemetryReading(Base):
    __tablename__ = "telemetry_readings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    tank_id = Column(String(36), ForeignKey("tanks.id", ondelete="SET NULL"), nullable=True, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)

    # Fluid Level Metrics
    raw_level_percent = Column(Float, nullable=False)     # Unclamped (for overflow detection)
    level_percent = Column(Float, nullable=False)         # Clamped 0-100% (for UI display)
    volume_liters = Column(Float, nullable=False)         # Calculated Volume (L)
    height_cm = Column(Float, nullable=False)             # Calculated Height (cm)
    sensor_valid = Column(Boolean, nullable=False, default=True)

    # GPS Dynamics
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    altitude = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)
    satellites = Column(Integer, default=0)

    # Electrical Power
    battery_v1 = Column(Float, nullable=True)             # Primary power / battery voltage
    auxiliary_v2 = Column(Float, nullable=True)           # Auxiliary supply voltage

    # Raw Payload JSON representation
    raw_payload = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    device = relationship("Device", back_populates="telemetry_readings")
    tank = relationship("Tank", back_populates="telemetry_readings")

