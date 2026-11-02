"""GPS Location & Tracking API Router."""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.models.device import Device
from app.models.telemetry import TelemetryReading

router = APIRouter(prefix="/location", tags=["Location"])


class GPSWaypoint(BaseModel):
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    speed_kmh: Optional[float] = None
    satellites: Optional[int] = None
    timestamp: str


class TrainLocation(BaseModel):
    train_number: str
    coach_number: str
    is_online: bool
    has_gps: bool = False
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_altitude: Optional[float] = None
    current_speed_kmh: Optional[float] = None
    satellites: Optional[int] = None
    last_update: Optional[str] = None
    waypoints: List[GPSWaypoint] = []


@router.get("", response_model=List[TrainLocation])
async def get_train_locations(
    train_number: Optional[str] = Query(None, description="Filter by train number"),
    limit_waypoints: int = Query(25, ge=5, le=100, description="Number of recent waypoints"),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve real-time GPS locations and recent track paths for trains."""
    # Query devices
    stmt = select(Device)
    if train_number:
        stmt = stmt.where(Device.train_number == train_number)
    devices_res = await db.execute(stmt)
    devices = devices_res.scalars().all()

    locations = []
    for d in devices:
        # Get recent telemetry with GPS
        t_stmt = (
            select(TelemetryReading)
            .where(TelemetryReading.device_id == d.id)
            .where(TelemetryReading.latitude.isnot(None))
            .where(TelemetryReading.longitude.isnot(None))
            .order_by(desc(TelemetryReading.timestamp))
            .limit(limit_waypoints)
        )
        t_res = await db.execute(t_stmt)
        readings = t_res.scalars().all()

        waypoints = []
        for r in readings:
            waypoints.append(GPSWaypoint(
                latitude=r.latitude,
                longitude=r.longitude,
                altitude=r.altitude,
                speed_kmh=r.speed_kmh,
                satellites=r.satellites,
                timestamp=r.timestamp.isoformat()
            ))

        has_gps = False
        curr_lat = None
        curr_lon = None
        curr_alt = None
        curr_spd = None
        sat_cnt = None
        last_upd = None

        if readings and readings[0].latitude is not None and readings[0].longitude is not None:
            if abs(readings[0].latitude) > 0.0001 or abs(readings[0].longitude) > 0.0001:
                has_gps = True
                curr_lat = readings[0].latitude
                curr_lon = readings[0].longitude
                curr_alt = readings[0].altitude
                curr_spd = readings[0].speed_kmh
                sat_cnt = readings[0].satellites
                last_upd = readings[0].timestamp.isoformat()
        elif readings:
            last_upd = readings[0].timestamp.isoformat()
        elif d.last_seen_at:
            last_upd = d.last_seen_at.isoformat()

        locations.append(TrainLocation(
            train_number=d.train_number,
            coach_number=d.coach_number,
            is_online=d.is_online,
            has_gps=has_gps,
            current_latitude=curr_lat,
            current_longitude=curr_lon,
            current_altitude=curr_alt,
            current_speed_kmh=curr_spd,
            satellites=sat_cnt,
            last_update=last_upd,
            waypoints=waypoints
        ))

    return locations

