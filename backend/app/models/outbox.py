"""SQLAlchemy ORM model for Transactional Outbox synchronization events."""
from sqlalchemy import Column, Integer, String, DateTime, Text
from app.core.database import Base
from app.models.base import generate_uuid, utc_now


class SyncOutboxEvent(Base):
    __tablename__ = "sync_outbox"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(36), default=generate_uuid, nullable=False, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    entity_type = Column(String(32), nullable=False, index=True)  # TRAIN, COACH, DEVICE, TANK, ALARM, SETTING, USER
    entity_id = Column(String(64), nullable=False, index=True)
    operation = Column(String(32), nullable=False)                # CREATE, UPDATE, DELETE, REORDER, ASSIGN
    payload_json = Column(Text, nullable=False)
    status = Column(String(16), default="PENDING", nullable=False, index=True)  # PENDING, PUBLISHED, FAILED
    retry_count = Column(Integer, default=0, nullable=False)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
