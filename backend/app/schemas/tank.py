"""Tank Pydantic Schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class TankBase(BaseModel):
    name: str = "Primary Water Tank"
    tankType: str = Field("CYLINDRICAL", alias="tank_type")
    capacityLiters: float = Field(20.0, alias="capacity_liters")
    heightCm: float = Field(50.0, alias="height_cm")
    areaM2: float = Field(0.04, alias="area_m2")
    warningThresholdPercent: float = Field(20.0, alias="warning_threshold_percent")
    criticalThresholdPercent: float = Field(10.0, alias="critical_threshold_percent")
    overflowThresholdPercent: float = Field(100.0, alias="overflow_threshold_percent")

    model_config = ConfigDict(populate_by_name=True)


class TankUpdate(BaseModel):
    name: Optional[str] = None
    capacityLiters: Optional[float] = None
    heightCm: Optional[float] = None
    areaM2: Optional[float] = None
    warningThresholdPercent: Optional[float] = None
    criticalThresholdPercent: Optional[float] = None
    overflowThresholdPercent: Optional[float] = None


class TankOut(TankBase):
    id: str
    deviceId: str = Field(..., alias="device_id")
    tankIndex: int = Field(..., alias="tank_index")
    createdAt: datetime = Field(..., alias="created_at")
    updatedAt: datetime = Field(..., alias="updated_at")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class TankLiveStatus(BaseModel):
    tankId: str
    deviceId: str
    deviceUid: str
    trainNumber: str
    coachNumber: str
    tankName: str
    levelPercent: Optional[float] = None
    rawLevelPercent: Optional[float] = None
    volumeLiters: Optional[float] = None
    heightCm: Optional[float] = None
    capacityLiters: float
    maxHeightCm: float
    crossSectionalAreaM2: float
    rank: str            # LOW, MODERATE, GOOD, HIGH, N/A
    alarmStatus: str     # NORMAL, WARNING_LOW, CRITICAL_LOW, OVERFLOW, SENSOR_FAULT, AWAITING_TELEMETRY
    batteryVoltage: Optional[float] = None
    isOnline: bool
    hasTelemetry: bool = False
    isStale: bool = False
    lastUpdate: Optional[datetime] = None
