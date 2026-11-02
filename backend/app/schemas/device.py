"""Device Pydantic Schemas."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class DeviceBase(BaseModel):
    uid: str
    trainNumber: str = Field("12002", alias="train_number")
    coachNumber: str = Field("B4", alias="coach_number")
    name: str = "Coach Water Monitor"
    hardwareVersion: Optional[str] = Field("Standard WLI Node", alias="hardware_version")
    firmwareVersion: Optional[str] = Field("2.0.0", alias="firmware_version")

    model_config = ConfigDict(populate_by_name=True)


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    trainNumber: Optional[str] = None
    coachNumber: Optional[str] = None
    firmwareVersion: Optional[str] = None


class DeviceOut(DeviceBase):
    id: str
    isOnline: bool = Field(False, alias="is_online")
    lastSeenAt: Optional[datetime] = Field(None, alias="last_seen_at")
    createdAt: datetime = Field(..., alias="created_at")
    updatedAt: datetime = Field(..., alias="updated_at")
    primaryLevel: Optional[float] = None
    secondaryLevel: Optional[float] = None
    hasActiveAlarm: bool = False

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class DeviceDiagnostics(BaseModel):
    deviceId: str
    uid: str
    batteryV1: Optional[float] = None
    auxiliaryV2: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitudeMeters: Optional[float] = None
    speedKmh: Optional[float] = None
    satellites: Optional[int] = None
    sensor1Valid: Optional[bool] = None
    sensor2Valid: Optional[bool] = None
    lastPayloadAt: Optional[datetime] = None
