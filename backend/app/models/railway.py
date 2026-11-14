"""SQLAlchemy ORM models for Railway Regions and Railway Zones."""
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import utc_now


class RailwayRegion(Base):
    __tablename__ = "railway_regions"

    code = Column(String(16), primary_key=True)  # e.g. NORTH, EAST, SOUTH, WEST, CENTRAL
    name = Column(String(64), nullable=False)
    headquarters = Column(String(64), nullable=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    zones = relationship("RailwayZone", back_populates="region", cascade="all, delete-orphan", lazy="selectin")


class RailwayZone(Base):
    __tablename__ = "railway_zones"

    code = Column(String(16), primary_key=True)  # e.g. NR, NCR, NER, ER, ECR, SER, SR, WR, CR
    name = Column(String(64), nullable=False)
    region_code = Column(String(16), ForeignKey("railway_regions.code", ondelete="CASCADE"), nullable=False, index=True)
    headquarters = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    region = relationship("RailwayRegion", back_populates="zones")
