"""GPS Location & Tracking API Router."""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.models.device import Device
from app.models.telemetry import TelemetryReading
from app.models.train import Train

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
    is_simulated: bool = False
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_altitude: Optional[float] = None
    current_speed_kmh: Optional[float] = None
    satellites: Optional[int] = None
    last_update: Optional[str] = None
    waypoints: List[GPSWaypoint] = []


class CorridorStation(BaseModel):
    id: str
    name: str
    code: str
    latitude: float
    longitude: float
    route_order: int
    water_refill_available: bool
    water_capacity_liters: float
    operational_status: str
    last_verified: str
    is_source: bool = False
    is_destination: bool = False


# Do not seed or serve hardcoded demonstration corridors; return empty unless real route stops exist.
@router.get("/corridor", response_model=List[CorridorStation])
async def get_route_corridor(
    train_number: Optional[str] = Query(None, description="Configured train number"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve route stations only when verified route metadata exists for a configured train."""
    if not train_number:
        return []
    res = await db.execute(select(Train).where(Train.train_number == train_number.strip()))
    db_train = res.scalar_one_or_none()
    if not db_train or not db_train.route_json:
        return []
    try:
        import json
        raw_route = json.loads(db_train.route_json)
    except Exception:
        return []
    stations: List[CorridorStation] = []
    if isinstance(raw_route, list):
        for idx, stop in enumerate(raw_route):
            if not isinstance(stop, dict):
                continue
            lat = stop.get("latitude") or stop.get("lat")
            lon = stop.get("longitude") or stop.get("lng") or stop.get("lon")
            if lat is None or lon is None:
                continue
            try:
                lat_f, lon_f = float(lat), float(lon)
            except (TypeError, ValueError):
                continue
            if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0) or (lat_f == 0 and lon_f == 0):
                continue
            code = str(stop.get("station_code") or f"ST{idx+1}")
            stations.append(
                CorridorStation(
                    id=code.lower(),
                    name=str(stop.get("station_name") or code),
                    code=code,
                    latitude=lat_f,
                    longitude=lon_f,
                    route_order=idx,
                    water_refill_available=False,
                    water_capacity_liters=0.0,
                    operational_status="Route Halt",
                    last_verified=db_train.last_verified_at.isoformat() if db_train.last_verified_at else "",
                    is_source=(idx == 0),
                    is_destination=(idx == len(raw_route) - 1),
                )
            )
    return stations


@router.get("", response_model=List[TrainLocation])
async def get_train_locations(
    train_number: Optional[str] = Query(None, description="Filter by train number"),
    limit_waypoints: int = Query(25, ge=5, le=100, description="Number of recent waypoints"),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve real-time GPS locations and recent track paths for trains."""
    # Query active-train devices
    stmt = select(Device).where(Device.train_number.in_(select(Train.train_number)))
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
            r_lat = readings[0].latitude
            r_lon = readings[0].longitude
            if (
                -90.0 <= r_lat <= 90.0
                and -180.0 <= r_lon <= 180.0
                and (abs(r_lat) > 0.0001 or abs(r_lon) > 0.0001)
            ):
                has_gps = True
                curr_lat = r_lat
                curr_lon = r_lon
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
            is_simulated=False,
            current_latitude=curr_lat,
            current_longitude=curr_lon,
            current_altitude=curr_alt,
            current_speed_kmh=curr_spd,
            satellites=sat_cnt,
            last_update=last_upd,
            waypoints=waypoints
        ))

    return locations

