"""SQLAlchemy ORM model for explicit deletion audit records."""
from sqlalchemy import Column, Integer, String, DateTime, Text
from app.core.database import Base
from app.models.base import utc_now


class DeletionAuditRecord(Base):
    __tablename__ = "deletion_audit_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    admin_username = Column(String(64), nullable=False)
    entity_type = Column(String(32), nullable=False, index=True)        # TRAIN, COACH, DEVICE, TANK
    entity_identifier = Column(String(64), nullable=False, index=True)  # e.g. 15120, B4, WLI-001
    entity_id = Column(String(64), nullable=True)
    snapshot_json = Column(Text, nullable=False)
    reason = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
