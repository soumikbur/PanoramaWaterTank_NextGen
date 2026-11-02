"""User model for authentication and role-based access control."""
from sqlalchemy import Column, String, Boolean, DateTime
from app.core.database import Base
from app.models.base import generate_uuid, utc_now


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    username = Column(String(64), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(128), nullable=False)
    email = Column(String(255), unique=True, nullable=True)
    role = Column(String(32), nullable=False, default="OPERATOR")  # ADMIN, OPERATOR, VIEWER
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

