"""SQLAlchemy ORM model for persistent railway coaches."""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship, foreign
from app.core.database import Base
from app.models.base import generate_uuid, utc_now


class Coach(Base):
    __tablename__ = "coaches"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    train_id = Column(String(36), ForeignKey("trains.id", ondelete="CASCADE"), nullable=False, index=True)
    train_number = Column(String(16), nullable=False, index=True)
    coach_number = Column(String(16), nullable=False, index=True)
    coach_name = Column(String(64), nullable=True)
    coach_category = Column(String(64), nullable=False, default="PASSENGER")  # PASSENGER, LOCOMOTIVE, BRAKE_LUGGAGE, PANTRY
    coach_type = Column(String(32), nullable=True, default="AC_CHAIR_CAR")   # AC_CHAIR_CAR, AC_3_TIER, SLEEPER, etc.
    position = Column(Integer, nullable=False, default=1)
    device_uid = Column(String(64), nullable=True, index=True)
    is_deleted = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("train_number", "coach_number", "is_deleted", name="uq_train_coach_active"),
    )

    # Relationships
    train = relationship("Train", back_populates="coaches")
    device = relationship("Device", primaryjoin="foreign(Coach.device_uid) == Device.uid", uselist=False, lazy="selectin")
    tanks = relationship("Tank", back_populates="coach", cascade="all, delete-orphan", lazy="selectin")
