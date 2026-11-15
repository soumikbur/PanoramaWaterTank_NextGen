"""SQLAlchemy ORM models for Railway Regions and Railway Zones."""
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import generate_uuid, utc_now


class RailwayRegion(Base):
    __tablename__ = "railway_regions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    code = Column(String(16), unique=True, nullable=False, index=True)  # e.g. NORTH, EAST, SOUTH, WEST, CENTRAL
    name = Column(String(128), nullable=False)                          # e.g. Northern Railway
    headquarters = Column(String(128), nullable=True)                  # e.g. New Delhi
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    zones = relationship("RailwayZone", back_populates="region", cascade="all, delete-orphan", lazy="selectin")
    trains = relationship("Train", back_populates="region_rel", lazy="selectin")


class RailwayZone(Base):
    __tablename__ = "railway_zones"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    code = Column(String(16), unique=True, nullable=False, index=True)  # e.g. NR, NCR, NER, ER, ECR, SER, SR, WR, CR
    name = Column(String(128), nullable=False)                          # e.g. Northern Railway Zone
    headquarters = Column(String(128), nullable=True)                  # e.g. New Delhi
    region_id = Column(String(36), ForeignKey("railway_regions.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    region = relationship("RailwayRegion", back_populates="zones")
    trains = relationship("Train", back_populates="zone_rel", lazy="selectin")

