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


# Authoritative Howrah to Asansol Corridor Stations & Verified Water Refill Facilities
CORRIDOR_HOWRAH_ASANSOL: List[CorridorStation] = [
    CorridorStation(
        id="hwh",
        name="Howrah Junction",
        code="HWH",
        latitude=22.5839,
        longitude=88.3426,
        route_order=0,
        water_refill_available=True,
        water_capacity_liters=50000.0,
        operational_status="Operational",
        last_verified="05 Sep 2026",
        is_source=True
    ),
    CorridorStation(
        id="kqu",
        name="Kamarkundu",
        code="KQU",
        latitude=22.8272,
        longitude=88.1969,
        route_order=1,
        water_refill_available=False,
        water_capacity_liters=0.0,
        operational_status="No Facility",
        last_verified="05 Sep 2026"
    ),
    CorridorStation(
        id="bwn",
        name="Bardhaman Junction",
        code="BWN",
        latitude=23.2324,
        longitude=87.8615,
        route_order=2,
        water_refill_available=True,
        water_capacity_liters=25000.0,
        operational_status="Operational",
        last_verified="05 Sep 2026"
    ),
    CorridorStation(
        id="pan",
        name="Panagarh",
        code="PAN",
        latitude=23.4518,
        longitude=87.4382,
        route_order=3,
        water_refill_available=False,
        water_capacity_liters=0.0,
        operational_status="No Facility",
        last_verified="05 Sep 2026"
    ),
    CorridorStation(
        id="dgr",
        name="Durgapur",
        code="DGR",
        latitude=23.5014,
        longitude=87.3119,
        route_order=4,
        water_refill_available=True,
        water_capacity_liters=20000.0,
        operational_status="Operational",
        last_verified="05 Sep 2026"
    ),
    CorridorStation(
        id="rng",
        name="Raniganj",
        code="RNG",
        latitude=23.6186,
        longitude=87.1358,
        route_order=5,
        water_refill_available=False,
        water_capacity_liters=0.0,
        operational_status="No Facility",
        last_verified="05 Sep 2026"
    ),
    CorridorStation(
        id="asn",
        name="Asansol Junction",
        code="ASN",
        latitude=23.6871,
        longitude=86.9746,
        route_order=6,
        water_refill_available=True,
        water_capacity_liters=30000.0,
        operational_status="Operational",
        last_verified="05 Sep 2026",
        is_destination=True
    )
]


@router.get("/corridor", response_model=List[CorridorStation])
async def get_route_corridor():
    """Retrieve the configured railway corridor stations and water refill facilities."""
    return CORRIDOR_HOWRAH_ASANSOL


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

