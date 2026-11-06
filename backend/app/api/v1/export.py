"""CSV History Data Export Router."""
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.tank_repo import TankRepository
from app.repositories.device_repo import DeviceRepository
from app.repositories.telemetry_repo import TelemetryRepository

router = APIRouter(prefix="/export", tags=["Export"])


@router.get("/csv")
async def export_history_csv(
    tank_id: Optional[str] = Query(None, description="Tank UUID. Defaults to first primary"),
    range: str = Query("24h", description="Time window: 12h, 24h, 7d"),
    db: AsyncSession = Depends(get_db)
):
    """Export historical telemetry data formatted as an RFC 4180 CSV file."""
    tank_repo = TankRepository(db)
    device_repo = DeviceRepository(db)
    telemetry_repo = TelemetryRepository(db)

    if not tank_id:
        tank = await tank_repo.get_first_primary()
        if not tank:
            from app.core.config import settings
            device = await device_repo.create_or_update(
                uid=settings.DEFAULT_DEVICE_UID,
                train_number=settings.DEFAULT_TRAIN_NUMBER,
                coach_number=settings.DEFAULT_COACH_NUMBER,
                name="Shatabdi Coach B4 Water System"
            )
            tank = await tank_repo.get_by_device_and_index(device.id, 1)
            await db.commit()
        if not tank:
            raise HTTPException(status_code=404, detail="No active tanks found")
    else:
        tank = await tank_repo.get_by_id(tank_id)
        if not tank:
            raise HTTPException(status_code=404, detail="Tank not found")

    device = await device_repo.get_by_id(tank.device_id)
    now = datetime.now(timezone.utc)
    if range == "12h":
        start_time = now - timedelta(hours=12)
    elif range == "7d":
        start_time = now - timedelta(days=7)
    else:
        start_time = now - timedelta(hours=24)

    readings = await telemetry_repo.get_history_for_tank(tank.id, start_time, now)

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "Timestamp",
        "Train_Number",
        "Coach_Number",
        "Device_UID",
        "Level_Percent",
        "Volume_Liters",
        "Height_cm",
        "Battery_V1",
        "Status"
    ])

    for r in readings:
        writer.writerow([
            r.timestamp.isoformat() if r.timestamp else "",
            device.train_number if device else "12002",
            device.coach_number if device else "B4",
            device.uid if device else "",
            f"{r.level_percent:.1f}" if r.level_percent is not None else "",
            f"{r.volume_liters:.1f}" if r.volume_liters is not None else "",
            f"{r.height_cm:.1f}" if r.height_cm is not None else "",
            f"{r.battery_v1:.2f}" if r.battery_v1 is not None else "12.00",
            "NORMAL" if r.sensor_valid else "FAULT"
        ])

    output.seek(0)
    filename = f"water_tank_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

