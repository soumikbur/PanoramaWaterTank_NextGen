"""SQLAlchemy ORM models for persistent railway train metadata and lookup cache."""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, Float
from app.core.database import Base
from app.models.base import generate_uuid, utc_now


class Train(Base):
    __tablename__ = "trains"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    train_number = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(160), nullable=False)
    source_station = Column(String(120), nullable=True)
    source_code = Column(String(16), nullable=True)
    destination_station = Column(String(120), nullable=True)
    destination_code = Column(String(16), nullable=True)
    region = Column(String(32), nullable=False, default="NORTH", index=True)
    railway_zone = Column(String(16), nullable=True)
    train_type = Column(String(64), nullable=True, default="Express")
    running_days_json = Column(Text, nullable=True)
    coach_configuration_json = Column(Text, nullable=True)
    route_json = Column(Text, nullable=True)
    total_coaches = Column(Integer, nullable=True)
    has_official_composition = Column(Boolean, nullable=False, default=False)
    api_provider = Column(String(64), nullable=True)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    tank_height_cm = Column(Float, nullable=False, default=50.0)
    tank_capacity_liters = Column(Float, nullable=False, default=20.0)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class TrainLookupCache(Base):
    __tablename__ = "train_lookup_cache"

    train_number = Column(String(16), primary_key=True)
    provider = Column(String(64), nullable=False)
    payload_json = Column(Text, nullable=False)
    fetched_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

