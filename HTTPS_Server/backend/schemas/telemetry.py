"""Telemetry and system schemas for HTTPS Receiver."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator


class TelemetryPayload(BaseModel):
    """Dynamic IoT Telemetry Payload schema.
    
    Accepts known sensor attributes while dynamically preserving any extra
    firmware-reported variables and nested structures.
    """
    model_config = ConfigDict(extra="allow")

    device_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Unique device identifier (e.g. WLI_TANK_01, EC200U_TEST_01)",
    )
    sequence_id: Optional[int] = Field(
        default=None,
        description="Monotonically increasing sequence number (e.g. 101, 102)",
    )
    timestamp: Optional[Union[str, int, float]] = Field(
        default=None,
        description="Device-side timestamp (Unix epoch or ISO 8601 string)",
    )
    water_level_cm: Optional[float] = Field(
        default=None,
        description="Calculated water level in centimeters",
    )
    water_level_percentage: Optional[float] = Field(
        default=None,
        description="Water level as a percentage of tank capacity (0.0 to 100.0)",
    )
    raw_voltage: Optional[float] = Field(
        default=None,
        description="Raw analog voltage reading from level sensor (V)",
    )
    sensor_status: Optional[str] = Field(
        default=None,
        description="Sensor operational state (e.g. NORMAL, ERROR, CALIBRATING)",
    )
    latitude: Optional[float] = Field(
        default=None,
        description="GNSS latitude coordinate (-90.0 to 90.0)",
    )
    longitude: Optional[float] = Field(
        default=None,
        description="GNSS longitude coordinate (-180.0 to 180.0)",
    )
    gps_valid: Optional[bool] = Field(
        default=None,
        description="GPS positioning fix status",
    )
    battery_voltage: Optional[float] = Field(
        default=None,
        description="Battery or power supply rail voltage (V)",
    )
    alarm_status: Optional[Union[str, bool]] = Field(
        default=None,
        description="Alarm condition status (e.g. LOW_LEVEL, OVERFLOW, False)",
    )

    @field_validator("device_id")
    @classmethod
    def validate_device_id(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("device_id cannot be blank or whitespace.")
        return trimmed

    def extract_full_record(self, received_at: Optional[str] = None) -> Dict[str, Any]:
        """Produce the complete stored telemetry dictionary with server timestamp."""
        if received_at is None:
            received_at = datetime.now(timezone.utc).isoformat()

        # Dump known and extra fields
        record = self.model_dump(mode="python")
        if self.model_extra:
            record.update(self.model_extra)
        
        record["received_at"] = received_at
        return record

    def get_extra_fields(self) -> Dict[str, Any]:
        """Return only the dynamically extracted arbitrary variables."""
        return self.model_extra.copy() if self.model_extra else {}


class TelemetryIngestResponse(BaseModel):
    """Response returned upon successful JSON telemetry ingestion."""
    status: str = "success"
    message: str = "Telemetry received"
    device_id: str
    received_at: str
    variables_count: int
    data: Dict[str, Any]


class FileIngestResponse(BaseModel):
    """Response returned upon successful file telemetry ingestion."""
    status: str = "success"
    message: str = "Telemetry file ingested"
    filename: str
    device_id: str
    received_at: str
    variables_count: int
    data: Dict[str, Any]


class TelemetryLatestResponse(BaseModel):
    """Response returning latest telemetry for one or more devices."""
    status: str = "success"
    device_id: Optional[str] = None
    count: int
    data: Union[Dict[str, Any], List[Dict[str, Any]], None]


class TelemetryHistoryResponse(BaseModel):
    """Response returning historical telemetry records."""
    status: str = "success"
    device_id: Optional[str] = None
    count: int
    limit: int
    data: List[Dict[str, Any]]


class SystemInfoResponse(BaseModel):
    """System information and operational metrics."""
    status: str = "online"
    application: str
    version: str
    environment: str
    uptime_seconds: float
    server_time: str
    storage: Dict[str, Any]
