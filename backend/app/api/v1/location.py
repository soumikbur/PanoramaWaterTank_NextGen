"""GPS Location & Tracking API Router."""
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.models.device import Device
from app.models.telemetry import TelemetryReading
from app.models.train import Train
from app.services.station_service import StationService

logger = logging.getLogger("panorama.location")

router = APIRouter(prefix="/location", tags=["Location"])


class GPSWaypoint(BaseModel):
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    speed_kmh: Optional[float] = None
    satellites: Optional[int] = None
    timestamp: str


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
    has_route: bool = False
    route_stops_count: int = 0
    route: List[CorridorStation] = Field(default_factory=list)


def build_corridor_stations_for_train(db_train: Train) -> List[CorridorStation]:
    """Build verified route stations for a train using its route_json or terminal station codes.
    
    Zero invented coordinates: only returns stations with verified geographic coordinates
    from the train record or the official DataMeet railway station repository.
    """
    stations: List[CorridorStation] = []
    tr_num = db_train.train_number.strip()

    # 1. Parse route_json if configured
    if db_train.route_json:
        try:
            raw_route = json.loads(db_train.route_json)
            if isinstance(raw_route, list) and len(raw_route) > 0:
                for idx, stop in enumerate(raw_route):
                    if not isinstance(stop, dict):
                        continue
                    st_code = str(stop.get("station_code") or stop.get("code") or f"ST{idx+1}").strip().upper()
                    st_name = str(stop.get("station_name") or stop.get("name") or st_code).strip()

                    lat = stop.get("latitude") or stop.get("lat")
                    lon = stop.get("longitude") or stop.get("lng") or stop.get("lon")

                    # Enrich missing coordinates via DataMeet StationService
                    if lat is None or lon is None:
                        coords = StationService.get_station_coords(st_code)
                        if coords:
                            lat, lon, res_name = coords
                            if not st_name or st_name == st_code:
                                st_name = res_name

                    if lat is not None and lon is not None:
                        try:
                            lat_f, lon_f = float(lat), float(lon)
                            if -90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0 and (lat_f != 0 or lon_f != 0):
                                is_refill = bool(stop.get("water_refill_available", False))
                                cap = float(stop.get("water_capacity_liters", 0.0) or 0.0)
                                st_info = StationService.get_station_info(st_code)
                                if st_info:
                                    if "water_refill" in st_info and not is_refill:
                                        is_refill = bool(st_info["water_refill"])
                                    if "capacity" in st_info and cap <= 0:
                                        cap = float(st_info["capacity"])

                                stations.append(
                                    CorridorStation(
                                        id=f"{tr_num}_{st_code.lower()}_{idx}",
                                        name=st_name,
                                        code=st_code,
                                        latitude=round(lat_f, 5),
                                        longitude=round(lon_f, 5),
                                        route_order=idx,
                                        water_refill_available=is_refill,
                                        water_capacity_liters=cap,
                                        operational_status="Operational" if is_refill else "Route Halt",
                                        last_verified=db_train.last_verified_at.isoformat() if db_train.last_verified_at else "",
                                        is_source=(idx == 0),
                                        is_destination=(idx == len(raw_route) - 1),
                                    )
                                )
                        except (ValueError, TypeError):
                            pass
        except Exception as e:
            logger.warning(f"Error parsing route_json for train {tr_num}: {e}")

    # 2. Fallback: If route_json produced fewer than 2 valid stations, attempt terminal station resolution
    src_code = db_train.source_code
    dst_code = db_train.destination_code
    src_name = db_train.source_station
    dst_name = db_train.destination_station

    if len(stations) < 2 and (not src_code or not dst_code):
        terminals = StationService.lookup_train_terminals(tr_num)
        if terminals:
            src_code, src_name, dst_code, dst_name = terminals

    if len(stations) < 2 and src_code and dst_code:
        src_coords = StationService.get_station_coords(src_code)
        dst_coords = StationService.get_station_coords(dst_code)
        if src_coords and dst_coords:
            src_lat, src_lon, res_src_name = src_coords
            dst_lat, dst_lon, res_dst_name = dst_coords
            src_info = StationService.get_station_info(src_code) or {}
            dst_info = StationService.get_station_info(dst_code) or {}
            stations = [
                CorridorStation(
                    id=f"{tr_num}_{src_code.lower()}_0",
                    name=src_name or res_src_name,
                    code=src_code.upper(),
                    latitude=round(src_lat, 5),
                    longitude=round(src_lon, 5),
                    route_order=0,
                    water_refill_available=bool(src_info.get("water_refill", True)),
                    water_capacity_liters=float(src_info.get("capacity", 50000.0)),
                    operational_status="Origin Station",
                    last_verified=db_train.last_verified_at.isoformat() if db_train.last_verified_at else "",
                    is_source=True,
                    is_destination=False,
                ),
                CorridorStation(
                    id=f"{tr_num}_{dst_code.lower()}_1",
                    name=dst_name or res_dst_name,
                    code=dst_code.upper(),
                    latitude=round(dst_lat, 5),
                    longitude=round(dst_lon, 5),
                    route_order=1,
                    water_refill_available=bool(dst_info.get("water_refill", True)),
                    water_capacity_liters=float(dst_info.get("capacity", 40000.0)),
                    operational_status="Terminus Station",
                    last_verified=db_train.last_verified_at.isoformat() if db_train.last_verified_at else "",
                    is_source=False,
                    is_destination=True,
                ),
            ]

    return stations


@router.get("/corridors", response_model=Dict[str, List[CorridorStation]])
async def get_all_route_corridors(db: AsyncSession = Depends(get_db)):
    """Retrieve verified route corridors indexed by train number for all registered trains."""
    trains_res = await db.execute(select(Train).where(Train.is_deleted == False))
    trains = list(trains_res.scalars().all())
    corridors: Dict[str, List[CorridorStation]] = {}
    for t in trains:
        tr_num = t.train_number.strip()
        corridors[tr_num] = build_corridor_stations_for_train(t)
    return corridors


@router.get("/corridor", response_model=List[CorridorStation])
async def get_route_corridor(
    train_number: Optional[str] = Query(None, description="Configured train number"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve route stations for a specific train, or all stations if train_number is omitted."""
    if train_number:
        res = await db.execute(select(Train).where(Train.train_number == train_number.strip()))
        db_train = res.scalar_one_or_none()
        if not db_train:
            return []
        return build_corridor_stations_for_train(db_train)

    # Return all corridor stations across all registered trains
    trains_res = await db.execute(select(Train).where(Train.is_deleted == False))
    trains = list(trains_res.scalars().all())
    all_stations: List[CorridorStation] = []
    for t in trains:
        all_stations.extend(build_corridor_stations_for_train(t))
    return all_stations


@router.get("", response_model=List[TrainLocation])
async def get_train_locations(
    train_number: Optional[str] = Query(None, description="Filter by train number"),
    limit_waypoints: int = Query(25, ge=5, le=100, description="Number of recent waypoints"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve real-time GPS locations, route corridors, and tracking metadata for all registered trains."""
    # 1. Fetch registered trains
    train_stmt = select(Train).where(Train.is_deleted == False)
    if train_number:
        train_stmt = train_stmt.where(Train.train_number == train_number.strip())
    trains_res = await db.execute(train_stmt)
    registered_trains = list(trains_res.scalars().all())

    # 2. Fetch all devices to map online status and telemetry
    dev_stmt = select(Device).where(Device.is_deleted == False)
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

        # Build verified route corridor for this train
        train_route = build_corridor_stations_for_train(t)
        has_route = len(train_route) >= 2

        # Find nearest route station if GPS coordinates and route are available
        if has_gps and curr_lat and curr_lon and train_route:
            min_dist = float("inf")
            for st in train_route:
                dist = ((st.latitude - curr_lat) ** 2 + (st.longitude - curr_lon) ** 2) ** 0.5
                if dist < min_dist:
                    min_dist = dist
                    nearest_st = st.name

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
                nearest_station=nearest_st or t.source_station or ("Live Corridor" if has_route else "No Route Configured"),
                last_update=last_upd or (t.updated_at.isoformat() if t.updated_at else None),
                waypoints=waypoints,
                has_route=has_route,
                route_stops_count=len(train_route),
                route=train_route,
            )
        )

    return locations
