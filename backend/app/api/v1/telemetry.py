"""Telemetry API Router."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.tank_repo import TankRepository
from app.repositories.telemetry_repo import TelemetryRepository
from app.schemas.telemetry import (
    TelemetryHistoryResponse,
    TelemetryPoint,
    MqttTelemetryPayload
)
from app.services.downsampler import LTTBDownsampler
from app.services.history_service import HistoryService
from app.mqtt.client import mqtt_service

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


@router.get("/history", response_model=TelemetryHistoryResponse)
async def get_telemetry_history(
    tank_id: Optional[str] = Query(None, description="Tank UUID. If omitted, uses primary tank"),
    range: str = Query("24h", description="Time window: 12h, 24h, or 7d"),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve historical telemetry with LTTB downsampling to ~100 points."""
    tank_repo = TankRepository(db)
    telemetry_repo = TelemetryRepository(db)

    if not tank_id:
        tank = await tank_repo.get_first_primary()
        if not tank:
            raise HTTPException(status_code=404, detail="No active tanks found")
        tank_id = tank.id
    else:
        tank = await tank_repo.get_by_id(tank_id)
        if not tank:
            raise HTTPException(status_code=404, detail="Tank not found")

    now = datetime.now(timezone.utc)
    if range == "12h":
        start_time = now - timedelta(hours=12)
    elif range == "7d":
        start_time = now - timedelta(days=7)
    else:  # default 24h
        start_time = now - timedelta(hours=24)

    readings = await telemetry_repo.get_history_for_tank(tank_id, start_time, now)

    # Format raw points
    points_dict = [
        {
            "id": r.id,
            "timestamp": r.timestamp,
            "levelPercent": r.level_percent,
            "volumeLiters": r.volume_liters,
            "heightCm": r.height_cm
        }
        for r in readings
    ]

    # Calculate aggregate stats before downsampling (on full series)
    stats = HistoryService.calculate_stats(points_dict, level_key="levelPercent")

    # Downsample dense points to ~100 points using LTTB
    downsampled = LTTBDownsampler.downsample(
        points_dict,
        threshold=100,
        x_key="timestamp",
        y_key="levelPercent"
    )

    data_points = [
        TelemetryPoint(
            timestamp=p["timestamp"],
            levelPercent=round(p["levelPercent"], 1),
            volumeLiters=round(p["volumeLiters"], 1),
            heightCm=round(p["heightCm"], 1)
        )
        for p in downsampled
    ]

    return TelemetryHistoryResponse(
        tankId=tank_id,
        range=range,
        stats=stats,
        dataPoints=data_points
    )


@router.post("/ingest")
async def ingest_telemetry_rest(
    payload: MqttTelemetryPayload
):
    """REST fallback endpoint for direct edge telemetry submission."""
    await mqtt_service.process_telemetry(payload, topic=f"panorama/telemetry/{payload.uid}")
    return {"status": "SUCCESS", "message": "Telemetry frame processed"}

