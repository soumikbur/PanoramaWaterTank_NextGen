"""CSV History Data Export Router."""
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.tank_repo import TankRepository
from app.repositories.device_repo import DeviceRepository
from app.repositories.telemetry_repo import TelemetryRepository

router = APIRouter(prefix="/export", tags=["Export"])


def sanitize_csv_cell(value: Any) -> str:
    """Neutralize potential CSV formula injection in cell values."""
    if value is None:
        return ""
    s = str(value)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


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
            sanitize_csv_cell(device.train_number if device else "12002"),
            sanitize_csv_cell(device.coach_number if device else "B4"),
            sanitize_csv_cell(device.uid if device else ""),
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


@router.get("/telemetry-csv")
async def export_telemetry_table_csv(
    search: Optional[str] = Query(None, description="Search by Device ID"),
    device_id: Optional[str] = Query(None, description="Filter by Device ID"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    ai1_valid: Optional[str] = Query(None, description="Filter AI1 Valid: Valid, Invalid, or All"),
    gps_valid: Optional[str] = Query(None, description="Filter GPS Valid: Valid, Invalid, or All"),
    altitude_valid: Optional[str] = Query(None, description="Filter Altitude Valid: Valid, Invalid, or All"),
    sort_by: str = Query("receivedUtc", description="Sort column"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    db: AsyncSession = Depends(get_db)
):
    """Export historical telemetry data formatted strictly as the 13-column RFC 4180 CSV without IMEI/SIM."""
    telemetry_repo = TelemetryRepository(db)
    records = await telemetry_repo.get_all_telemetry_records_for_export(
        search=search,
        device_id=device_id,
        start_date=start_date,
        end_date=end_date,
        ai1_valid=ai1_valid,
        gps_valid=gps_valid,
        altitude_valid=altitude_valid,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    output = io.StringIO()
    writer = csv.writer(output)

    # Strictly 13 columns in exact order:
    writer.writerow([
        "Device ID",
        "Recorded At",
        "AI1 mA",
        "Level 1 %",
        "AI1 Valid",
        "Battery V",
        "Battery %",
        "Latitude",
        "Longitude",
        "Altitude m",
        "GPS Valid",
        "Altitude Valid",
        "Received UTC"
    ])

    for r in records:
        writer.writerow([
            sanitize_csv_cell(r.get("deviceId", "--")),
            sanitize_csv_cell(r.get("recordedAt", "--")),
            f"{r['ai1Ma']:.2f}" if r.get("ai1Ma") is not None else "--",
            sanitize_csv_cell(r.get("level1Percent", "--")),
            sanitize_csv_cell(r.get("ai1Valid", "--")),
            f"{r['batteryV']:.3f}" if r.get("batteryV") is not None else "--",
            sanitize_csv_cell(r.get("batteryPercent", "--")),
            f"{r['latitude']:.7f}" if r.get("latitude") is not None else "--",
            f"{r['longitude']:.7f}" if r.get("longitude") is not None else "--",
            f"{r['altitudeM']:.2f}" if r.get("altitudeM") is not None else "--",
            sanitize_csv_cell(r.get("gpsValid", "--")),
            sanitize_csv_cell(r.get("altitudeValid", "--")),
            sanitize_csv_cell(r.get("receivedUtc", "--")),
        ])

    output.seek(0)
    filename = f"telemetry_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


