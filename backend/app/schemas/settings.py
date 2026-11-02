"""Settings Pydantic Schemas."""
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict


class SettingItem(BaseModel):
    key: str
    category: str
    value: Any
    description: Optional[str] = None
    updatedAt: datetime

    model_config = ConfigDict(from_attributes=True)


class SettingUpdate(BaseModel):
    value: Any


class MqttSettings(BaseModel):
    brokerHost: str
    brokerPort: int
    tlsPort: int
    useTls: bool
    username: Optional[str] = None
    password: Optional[str] = None
    clientIdPrefix: str


class TankGeometrySettings(BaseModel):
    capacityLiters: float
    heightCm: float
    areaM2: float
    warningThresholdPercent: float
    criticalThresholdPercent: float
    overflowThresholdPercent: float
