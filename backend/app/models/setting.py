"""Settings model for system, MQTT, tank, and alarm parameters."""
from sqlalchemy import Column, String, Text, DateTime
from app.core.database import Base
from app.models.base import utc_now


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String(64), primary_key=True)
    category = Column(String(32), nullable=False, index=True)  # MQTT, TANK, ALARM, SYSTEM
    value = Column(Text, nullable=False)  # JSON-encoded value string
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

