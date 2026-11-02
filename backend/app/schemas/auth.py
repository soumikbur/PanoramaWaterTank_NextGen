"""Authentication Pydantic Schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict, Field


class UserLogin(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    fullName: str = Field(..., alias="full_name")
    email: Optional[EmailStr] = None
    role: str = "OPERATOR"

    model_config = ConfigDict(populate_by_name=True)


class UserOut(BaseModel):
    id: str
    username: str
    fullName: str = Field(..., alias="full_name")
    email: Optional[str] = None
    role: str
    isActive: bool = Field(True, alias="is_active")
    createdAt: datetime = Field(..., alias="created_at")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
