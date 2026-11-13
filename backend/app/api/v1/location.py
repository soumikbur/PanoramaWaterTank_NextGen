"""GPS Location & Tracking API Router."""
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
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
    train_name: Optional[str] = None
    region: Optional[str] = None
    source_station: Optional[str] = None
    destination_station: Optional[str] = None
    coach_number: Optional[str] = "All"
    total_coaches: int = 0
    connected_devices: int = 0
    is_online: bool = False
    has_gps: bool = False
    is_simulated: bool = False
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_altitude: Optional[float] = None
    current_speed_kmh: Optional[float] = None
    satellites: Optional[int] = None
    nearest_station: Optional[str] = None
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
    db: AsyncSession = Depends(get_db),
):
    """Retrieve real-time GPS locations and tracking metadata for all registered trains."""
    # 1. Fetch registered trains
    train_stmt = select(Train)
    if train_number:
        train_stmt = train_stmt.where(Train.train_number == train_number.strip())
    trains_res = await db.execute(train_stmt)
    registered_trains = list(trains_res.scalars().all())

    # 2. Fetch all devices to map online status and telemetry
    dev_stmt = select(Device)
    if train_number:
        dev_stmt = dev_stmt.where(Device.train_number == train_number.strip())
    devices_res = await db.execute(dev_stmt)
    all_devices = devices_res.scalars().all()

    # Index devices by train_number
    devices_by_train: Dict[str, List[Device]] = {}
    for d in all_devices:
        tr = (d.train_number or "").strip()
        if tr:
            devices_by_train.setdefault(tr, []).append(d)

    existing_train_nums = {t.train_number.strip() for t in registered_trains}
    locations: List[TrainLocation] = []

    # Process all registered trains
    for t in registered_trains:
        tr_num = t.train_number.strip()
        train_devs = devices_by_train.get(tr_num, [])
        is_online = any(d.is_online for d in train_devs)
        connected_devs = len([d for d in train_devs if d.is_online])
        total_coaches = t.total_coaches or len(train_devs) or 1

        waypoints: List[GPSWaypoint] = []
        has_gps = False
        curr_lat = None
        curr_lon = None
        curr_alt = None
        curr_spd = None
        sat_cnt = None
        last_upd = None
        nearest_st = None

        if train_devs:
            dev_ids = [d.id for d in train_devs]
            t_stmt = (
                select(TelemetryReading)
                .where(TelemetryReading.device_id.in_(dev_ids))
                .where(TelemetryReading.latitude.isnot(None))
                .where(TelemetryReading.longitude.isnot(None))
                .order_by(desc(TelemetryReading.timestamp))
                .limit(limit_waypoints)
            )
            t_res = await db.execute(t_stmt)
            readings = t_res.scalars().all()

            for r in readings:
                waypoints.append(
                    GPSWaypoint(
                        latitude=r.latitude,
                        longitude=r.longitude,
                        altitude=r.altitude,
                        speed_kmh=r.speed_kmh,
                        satellites=r.satellites,
                        timestamp=r.timestamp.isoformat(),
                    )
                )

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
            else:
                last_seens = [d.last_seen_at for d in train_devs if d.last_seen_at]
                if last_seens:
                    last_upd = max(last_seens).isoformat()

        # Find nearest route station if GPS coordinates and route_json are available
        if has_gps and curr_lat and curr_lon and t.route_json:
            try:
                raw_route = json.loads(t.route_json)
                if isinstance(raw_route, list):
                    min_dist = float("inf")
                    for st in raw_route:
                        s_lat = st.get("latitude") or st.get("lat")
                        s_lon = st.get("longitude") or st.get("lon")
                        if s_lat is not None and s_lon is not None:
                            dist = ((float(s_lat) - curr_lat) ** 2 + (float(s_lon) - curr_lon) ** 2) ** 0.5
                            if dist < min_dist:
                                min_dist = dist
                                nearest_st = str(st.get("station_name") or st.get("station_code"))
            except Exception:
                pass

        locations.append(
            TrainLocation(
                train_number=tr_num,
                train_name=t.name,
                region=t.region,
                source_station=t.source_station,
                destination_station=t.destination_station,
                coach_number=train_devs[0].coach_number if len(train_devs) == 1 else "All",
                total_coaches=total_coaches,
                connected_devices=connected_devs,
                is_online=is_online,
                has_gps=has_gps,
                is_simulated=False,
                current_latitude=curr_lat,
                current_longitude=curr_lon,
                current_altitude=curr_alt,
                current_speed_kmh=curr_spd,
                satellites=sat_cnt,
                nearest_station=nearest_st or t.source_station or "Live Corridor",
                last_update=last_upd or (t.updated_at.isoformat() if t.updated_at else None),
                waypoints=waypoints,
            )
        )

    # Process any devices mapped to train numbers not yet registered in Train table
    for tr_num, devs in devices_by_train.items():
        if tr_num not in existing_train_nums and tr_num != "UNASSIGNED":
            is_online = any(d.is_online for d in devs)
            connected_devs = len([d for d in devs if d.is_online])
            dev_ids = [d.id for d in devs]

            waypoints = []
            has_gps = False
            curr_lat = None
            curr_lon = None
            curr_alt = None
            curr_spd = None
            sat_cnt = None
            last_upd = None

            t_stmt = (
                select(TelemetryReading)
                .where(TelemetryReading.device_id.in_(dev_ids))
                .where(TelemetryReading.latitude.isnot(None))
                .where(TelemetryReading.longitude.isnot(None))
                .order_by(desc(TelemetryReading.timestamp))
                .limit(limit_waypoints)
            )
            t_res = await db.execute(t_stmt)
            readings = t_res.scalars().all()

            for r in readings:
                waypoints.append(
                    GPSWaypoint(
                        latitude=r.latitude,
                        longitude=r.longitude,
                        altitude=r.altitude,
                        speed_kmh=r.speed_kmh,
                        satellites=r.satellites,
                        timestamp=r.timestamp.isoformat(),
                    )
                )

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

            locations.append(
                TrainLocation(
                    train_number=tr_num,
                    train_name=f"Special Express ({tr_num})",
                    region="EAST",
                    source_station="In Service",
                    destination_station="Active Corridor",
                    coach_number=devs[0].coach_number if len(devs) == 1 else "All",
                    total_coaches=len(devs),
                    connected_devices=connected_devs,
                    is_online=is_online,
                    has_gps=has_gps,
                    is_simulated=False,
                    current_latitude=curr_lat,
                    current_longitude=curr_lon,
                    current_altitude=curr_alt,
                    current_speed_kmh=curr_spd,
                    satellites=sat_cnt,
                    nearest_station="Active Corridor",
                    last_update=last_upd,
                    waypoints=waypoints,
                )
            )

    return locations
