"""Alarm model capturing system warnings, critical alerts, and faults."""
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_uuid, utc_now


class Alarm(Base):
    __tablename__ = "alarms"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_id = Column(String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    tank_id = Column(String(36), ForeignKey("tanks.id", ondelete="SET NULL"), nullable=True, index=True)

    alarm_type = Column(String(32), nullable=False)   # CRITICAL_LOW, WARNING_LOW, OVERFLOW, SENSOR_FAULT, VOLTAGE_FAULT
    severity = Column(String(16), nullable=False)     # CRITICAL, WARNING, INFO
    trigger_value = Column(Float, nullable=False)
    threshold_value = Column(Float, nullable=False)
    message = Column(String(255), nullable=False)
    status = Column(String(16), nullable=False, default="ACTIVE", index=True)  # ACTIVE, ACKNOWLEDGED, RESOLVED

    triggered_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    device = relationship("Device", back_populates="alarms")
    tank = relationship("Tank", back_populates="alarms")
    history = relationship("AlarmHistory", back_populates="alarm", cascade="all, delete-orphan", lazy="selectin")


class AlarmHistory(Base):
    __tablename__ = "alarm_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    alarm_id = Column(String(36), ForeignKey("alarms.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_status = Column(String(16), nullable=False)
    new_status = Column(String(16), nullable=False)
    comment = Column(Text, nullable=True)
    changed_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationship
    alarm = relationship("Alarm", back_populates="history")

