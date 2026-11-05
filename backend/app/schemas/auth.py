"""Authentication and User Profile Pydantic Schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict, Field


class UserLogin(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: Optional[str] = None
    fullName: str = Field(..., alias="full_name")
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    employeeId: Optional[str] = Field(None, alias="employee_id")
    designation: Optional[str] = "Station Operator"
    department: Optional[str] = "Rolling Stock Operations"
    divisionRegion: Optional[str] = Field("Eastern Railway (Howrah)", alias="division_region")
    role: str = "EMPLOYEE"
    accountStatus: str = Field("ACTIVE", alias="account_status")
    mustChangePassword: bool = Field(True, alias="must_change_password")

    model_config = ConfigDict(populate_by_name=True)


class UserUpdate(BaseModel):
    fullName: Optional[str] = Field(None, alias="full_name")
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    employeeId: Optional[str] = Field(None, alias="employee_id")
    designation: Optional[str] = None
    department: Optional[str] = None
    divisionRegion: Optional[str] = Field(None, alias="division_region")
    role: Optional[str] = None
    accountStatus: Optional[str] = Field(None, alias="account_status")
    isActive: Optional[bool] = Field(None, alias="is_active")

    model_config = ConfigDict(populate_by_name=True)


class UserOut(BaseModel):
    id: str
    username: str
    fullName: str = Field(..., alias="full_name")
    email: Optional[str] = None
    phone: Optional[str] = None
    employeeId: Optional[str] = Field(None, alias="employee_id")
    designation: Optional[str] = None
    department: Optional[str] = None
    divisionRegion: Optional[str] = Field(None, alias="division_region")
    role: str
    accountStatus: str = Field("ACTIVE", alias="account_status")
    isActive: bool = Field(True, alias="is_active")
    mustChangePassword: bool = Field(False, alias="must_change_password")
    joiningDate: Optional[datetime] = Field(None, alias="joining_date")
    lastLoginAt: Optional[datetime] = Field(None, alias="last_login_at")
    lastActivityAt: Optional[datetime] = Field(None, alias="last_activity_at")
    createdAt: datetime = Field(..., alias="created_at")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
    must_change_password: bool = False


class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str


class ResetPasswordRequest(BaseModel):
    new_password: Optional[str] = None
    force_change_next_login: bool = True


class UpdateStatusRequest(BaseModel):
    account_status: str  # ACTIVE, INACTIVE, LOCKED
