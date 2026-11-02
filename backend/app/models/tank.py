"""Tank model representing physical water reservoir geometry and thresholds."""
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_uuid, utc_now


class Tank(Base):
    __tablename__ = "tanks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_id = Column(String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    tank_index = Column(Integer, nullable=False, default=1)  # 1 = Primary, 2 = Secondary
    name = Column(String(64), nullable=False, default="Primary Water Tank")
    tank_type = Column(String(32), nullable=False, default="CYLINDRICAL")  # CYLINDRICAL, RECTANGULAR
    
    # Exact default geometry from legacy milestone 2:
    # 20.0 L capacity, 50.0 cm height, 0.04 m2 cross-sectional area
    capacity_liters = Column(Float, nullable=False, default=20.0)
    height_cm = Column(Float, nullable=False, default=50.0)
    area_m2 = Column(Float, nullable=False, default=0.04)

    # Alarm Thresholds (%)
    warning_threshold_percent = Column(Float, nullable=False, default=20.0)
    critical_threshold_percent = Column(Float, nullable=False, default=10.0)
    overflow_threshold_percent = Column(Float, nullable=False, default=100.0)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("device_id", "tank_index", name="uq_device_tank_index"),
    )

    # Relationships
    device = relationship("Device", back_populates="tanks")
    telemetry_readings = relationship("TelemetryReading", back_populates="tank")
    alarms = relationship("Alarm", back_populates="tank")

