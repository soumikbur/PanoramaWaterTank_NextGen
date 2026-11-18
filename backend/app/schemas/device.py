"""Device Pydantic Schemas."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class DeviceBase(BaseModel):
    uid: str
    trainNumber: str = Field("UNASSIGNED", alias="train_number")
    coachNumber: str = Field("UNASSIGNED", alias="coach_number")
    name: str = "Coach Water Monitor"
    hardwareVersion: Optional[str] = Field("Standard WLI Node", alias="hardware_version")
    firmwareVersion: Optional[str] = Field("2.0.0", alias="firmware_version")
    deviceType: Optional[str] = Field("Quectel EC200U 4G LTE", alias="device_type")
    protocol: Optional[str] = Field("MQTT over TLS/WSS", alias="protocol")
    mqttClientId: Optional[str] = Field(None, alias="mqtt_client_id")
    mqttTopic: Optional[str] = Field(None, alias="mqtt_topic")
    tankAssignment: Optional[str] = Field("BOTH", alias="tank_assignment")
    description: Optional[str] = Field(None, alias="description")
    status: Optional[str] = Field("AVAILABLE", alias="status")

    model_config = ConfigDict(populate_by_name=True)


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    trainNumber: Optional[str] = Field(None, alias="train_number")
    coachNumber: Optional[str] = Field(None, alias="coach_number")
    firmwareVersion: Optional[str] = Field(None, alias="firmware_version")
    hardwareVersion: Optional[str] = Field(None, alias="hardware_version")
    deviceType: Optional[str] = Field(None, alias="device_type")
    protocol: Optional[str] = None
    mqttClientId: Optional[str] = Field(None, alias="mqtt_client_id")
    mqttTopic: Optional[str] = Field(None, alias="mqtt_topic")
    tankAssignment: Optional[str] = Field(None, alias="tank_assignment")
    description: Optional[str] = None
    status: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


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
