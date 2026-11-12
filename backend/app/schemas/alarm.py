"""Alarm Pydantic Schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class AlarmOut(BaseModel):
    id: str
    deviceId: str = Field(..., alias="device_id")
    tankId: Optional[str] = Field(None, alias="tank_id")
    coachNumber: Optional[str] = None
    alarmType: str = Field(..., alias="alarm_type")
    severity: str
    triggerValue: float = Field(..., alias="trigger_value")
    thresholdValue: float = Field(..., alias="threshold_value")
    message: str
    status: str
    triggeredAt: datetime = Field(..., alias="triggered_at")
    acknowledgedAt: Optional[datetime] = Field(None, alias="acknowledged_at")
    acknowledgedBy: Optional[str] = Field(None, alias="acknowledged_by")
    resolvedAt: Optional[datetime] = Field(None, alias="resolved_at")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class AlarmAcknowledge(BaseModel):
    comment: Optional[str] = None


class AlarmStats(BaseModel):
    totalActive: int = 0
    criticalCount: int = 0
    warningCount: int = 0
    resolvedToday: int = 0
