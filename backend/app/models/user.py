"""User model for authentication and role-based access control."""
from sqlalchemy import Column, String, Boolean, DateTime, Integer
from app.core.database import Base
from app.models.base import generate_uuid, utc_now


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    username = Column(String(64), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(128), nullable=False)
    email = Column(String(255), unique=True, nullable=True)
    phone = Column(String(32), nullable=True)
    employee_id = Column(String(32), unique=True, nullable=True, index=True)
    designation = Column(String(64), nullable=True, default="Station Operator")
    department = Column(String(64), nullable=True, default="Rolling Stock Operations")
    division_region = Column(String(64), nullable=True, default="Eastern Railway (Howrah)")
    joining_date = Column(DateTime(timezone=True), default=utc_now, nullable=True)
    role = Column(String(32), nullable=False, default="EMPLOYEE")  # ADMIN, EMPLOYEE, OPERATOR, VIEWER
    account_status = Column(String(16), nullable=False, default="ACTIVE")  # ACTIVE, INACTIVE, LOCKED
    must_change_password = Column(Boolean, nullable=False, default=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_activity_at = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
