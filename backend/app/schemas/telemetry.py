"""Telemetry Pydantic Schemas."""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator


class MqttTelemetryPayload(BaseModel):
    """Schema matching the edge telemetry JSON payload from the EC200U."""
    uid: str = Field(..., description="Device UID / IMEI")
    trno: str = Field(..., description="Train Number (e.g. 12002 or 225256)")
    chno: str = Field(..., description="Coach Number (e.g. B4 or CR123456)")
    wlp1: float = Field(..., description="Primary tank level percent")
    wlp2: Optional[float] = Field(None, description="Secondary tank level percent")
    wlvl: Optional[bool] = Field(True, description="Primary sensor validity flag")
    wlv1: Optional[bool] = Field(None, description="Primary sensor validity flag alias")
    wlv2: Optional[bool] = Field(True, description="Secondary sensor validity flag")
    cm1: Optional[float] = Field(None, description="Primary water level in cm")
    cm2: Optional[float] = Field(None, description="Secondary water level in cm")
    bat: Optional[float] = Field(None, description="Battery percentage (0-100)")
    lat: Optional[float] = Field(None, description="GPS Latitude")
    long: Optional[float] = Field(None, description="GPS Longitude (legacy key)")
    lon: Optional[float] = Field(None, description="GPS Longitude (standard key)")
    alt: Optional[float] = Field(None, description="Altitude (m)")
    speed: Optional[float] = Field(None, description="Speed (km/h)")
    sats: Optional[int] = Field(None, description="Satellites count")
    v1: Optional[float] = Field(None, description="Primary battery voltage (V)")
    v2: Optional[float] = Field(None, description="Auxiliary voltage (V)")
    dt: Optional[str] = Field(None, description="Timestamp ISO string")
    time: Optional[str] = Field(None, description="Alternative timestamp ISO string")

    @field_validator("lat")
    @classmethod
    def validate_latitude(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (-90.0 <= v <= 90.0):
            raise ValueError(f"Latitude out of range [-90, 90]: {v}")
        return v

    @field_validator("lon", "long")
    @classmethod
    def validate_longitude(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (-180.0 <= v <= 180.0):
            raise ValueError(f"Longitude out of range [-180, 180]: {v}")
        return v

    @field_validator("wlp1")
    @classmethod
    def validate_water_level(cls, v: float) -> float:
        if v < 0.0 or v > 200.0:
            raise ValueError(f"Water level out of valid range [0, 200]: {v}")
        return v

    @property
    def effective_longitude(self) -> Optional[float]:
        return self.lon if self.lon is not None else self.long


class TelemetryPoint(BaseModel):
    timestamp: datetime
    levelPercent: float
    volumeLiters: float
    heightCm: float


class TelemetryStats(BaseModel):
    averagePercent: float
    minPercent: float
    maxPercent: float
    deltaPercent: float


class TelemetryHistoryResponse(BaseModel):
    tankId: str
    range: str
    stats: TelemetryStats
    dataPoints: List[TelemetryPoint]

