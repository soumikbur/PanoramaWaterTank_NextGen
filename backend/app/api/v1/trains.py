"""Trains and Fleet Management API Router."""
import json
import re
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db
from app.models.device import Device
from app.models.tank import Tank
from app.models.alarm import Alarm, AlarmHistory
from app.models.audit import AuditEvent
from app.models.base import utc_now
from app.models.telemetry import TelemetryReading
from app.models.train import Train
from app.repositories.device_repo import DeviceRepository
from app.repositories.tank_repo import TankRepository
from app.repositories.telemetry_repo import TelemetryRepository
from app.api.v1.auth import get_current_user, get_current_admin_user
from app.models.user import User
from app.websocket.manager import ws_manager
from app.mqtt.client import mqtt_service
from app.services.sync_broadcaster import broadcast_sync_event
from app.services.train_lookup_service import (
    TrainLookupResponse,
    REGION_DEFAULT_ZONE,
    ZONE_TO_REGION,
    map_zone_to_region,
    train_lookup_service,
)

router = APIRouter(prefix="/trains", tags=["Trains"])

# Predefined railway region metadata
REGION_CONFIG = {
    "NORTH": {"name": "Northern Railway", "code": "NR"},
    "SOUTH": {"name": "Southern Railway", "code": "SR"},
    "EAST": {"name": "Eastern Railway", "code": "ER"},
    "WEST": {"name": "Western Railway", "code": "WR"},
}

# Runtime in-memory cache (never pre-seeded with hardcoded fallback trains)
TRAIN_METADATA: Dict[str, Dict[str, Any]] = {}


def _normalize_region_input(raw_region: str) -> str:
    """Validate and normalize region/zone label into canonical NORTH, SOUTH, EAST, or WEST."""
    cleaned = (raw_region or "").strip().upper()
    if cleaned in REGION_CONFIG:
        return cleaned
    if cleaned in ZONE_TO_REGION:
        return ZONE_TO_REGION[cleaned]
    # Check aliases and combined labels:
    if "EAST" in cleaned or "ER" in cleaned or "SER" in cleaned or "BENGAL" in cleaned or "ODISHA" in cleaned:
        return "EAST"
    if "NORTH" in cleaned or "NR" in cleaned or "DELHI" in cleaned:
        return "NORTH"
    if "SOUTH" in cleaned or "SR" in cleaned or "CHENNAI" in cleaned:
        return "SOUTH"
    if "WEST" in cleaned or "WR" in cleaned or "CENTRAL" in cleaned or "MUMBAI" in cleaned:
        return "WEST"
    return map_zone_to_region(cleaned, fallback="EAST")


def _safe_json_loads(raw: Optional[str], default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _parse_iso_dt(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _build_train_meta(train_no: str, db_train: Optional[Train]) -> Dict[str, Any]:
    """Merge persisted Train row over fallback metadata."""
    if db_train is not None:
        return {
            "name": db_train.name,
            "region": db_train.region,
            "type": db_train.train_type or "Express",
            "source_station": db_train.source_station,
            "source_code": db_train.source_code,
            "destination_station": db_train.destination_station,
            "destination_code": db_train.destination_code,
            "railway_zone": db_train.railway_zone,
            "running_days": _safe_json_loads(db_train.running_days_json, None),
            "coach_composition": _safe_json_loads(db_train.coach_configuration_json, []),
            "route": _safe_json_loads(db_train.route_json, []),
            "total_coaches": db_train.total_coaches,
            "has_official_composition": db_train.has_official_composition,
            "api_provider": db_train.api_provider,
            "last_verified_at": db_train.last_verified_at.isoformat() if db_train.last_verified_at else None,
            "tank_height_cm": getattr(db_train, "tank_height_cm", 50.0) or 50.0,
            "tank_capacity_liters": getattr(db_train, "tank_capacity_liters", 20.0) or 20.0,
        }
    return TRAIN_METADATA.get(
        train_no,
        {
            "name": f"Train {train_no}",
            "region": "NORTH",
            "type": "Fleet Consist",
            "tank_height_cm": 50.0,
            "tank_capacity_liters": 20.0,
        },
    )


class CoachCreateSpec(BaseModel):
    coach_number: str
    coach_category: Optional[str] = None
    coach_type: Optional[str] = None


class TrainCreate(BaseModel):
    train_number: str
    name: str
    region: str
    coach_number: Optional[str] = "B1"
    tank_height_cm: Optional[float] = 50.0
    tank_capacity: Optional[float] = 20.0
    source_station: Optional[str] = None
    source_code: Optional[str] = None
    destination_station: Optional[str] = None
    destination_code: Optional[str] = None
    railway_zone: Optional[str] = None
    train_type: Optional[str] = None
    running_days: Optional[List[str]] = None
    coaches: Optional[List[CoachCreateSpec]] = None
    route: Optional[List[Dict[str, Any]]] = None
    total_coaches: Optional[int] = None
    has_official_composition: bool = False
    api_provider: Optional[str] = None
    last_verified_at: Optional[str] = None


class TrainUpdate(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None
    type: Optional[str] = None
    source_station: Optional[str] = None
    destination_station: Optional[str] = None
    railway_zone: Optional[str] = None


class TankConsistItem(BaseModel):
    id: str
    tank_index: int
    name: str
    capacity_liters: float
    height_cm: float = 50.0
    tank_type: Optional[str] = "CYLINDRICAL"
    geometry: Optional[str] = "CYLINDRICAL"
    current_level_percent: float
    current_volume_liters: float
    current_height_cm: Optional[float] = None
    status: str


class CoachConsistItem(BaseModel):
    coach_number: str
    device_uid: Optional[str] = None
    is_online: bool = False
    hardware_version: Optional[str] = "Standard WLI Node"
    tanks: List[TankConsistItem] = Field(default_factory=list)


class TrainConsistResponse(BaseModel):
    train_number: str
    name: str
    region: str
    coaches_count: int
    tanks_count: int
    online_status: bool
    active_alarms_count: int
    tank_height_cm: Optional[float] = 50.0
    tank_capacity_liters: Optional[float] = 20.0
    coaches: List[CoachConsistItem]
    source_station: Optional[str] = None
    source_code: Optional[str] = None
    destination_station: Optional[str] = None
    destination_code: Optional[str] = None
    railway_zone: Optional[str] = None
    train_type: Optional[str] = None
    running_days: Optional[List[str]] = None
    total_coaches: Optional[int] = None
    has_official_composition: bool = False
    api_provider: Optional[str] = None
    last_verified_at: Optional[str] = None


@router.get("/lookup/{train_number}", response_model=TrainLookupResponse)
async def lookup_train(
    train_number: str,
    refresh: bool = Query(False, description="Bypass cache and force upstream lookup"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Look up official Indian Railways train details with multi-provider fallback."""
    cleaned = train_number.strip()
    existing_train = (
        await db.execute(select(Train.id).where(Train.train_number == cleaned))
    ).scalar_one_or_none()
    existing_dev = (
        await db.execute(select(Device.id).where(Device.train_number == cleaned).limit(1))
    ).scalar_one_or_none()
    already_exists = bool(existing_train or existing_dev)

    return await train_lookup_service.lookup(
        raw_train_number=cleaned,
        db=db,
        force_refresh=refresh,
        already_exists=already_exists,
    )


@router.get("/regions")
async def get_regions_summary(db: AsyncSession = Depends(get_db)):
    """Retrieve operational summaries for all 4 railway regions."""
    devices_result = await db.execute(select(Device))
    devices = devices_result.scalars().all()

    trains_result = await db.execute(select(Train))
    db_trains = {t.train_number: t for t in trains_result.scalars().all()}

    # Query active alarms
    alarms_result = await db.execute(select(Alarm).where(Alarm.status == "ACTIVE"))
    active_alarms = alarms_result.scalars().all()
    device_alarms = {a.device_id: a.severity for a in active_alarms}

    # Group active-train devices by train_number (exclude unassigned spare hardware pool)
    train_devices: Dict[str, List[Device]] = {}
    for d in devices:
        if d.train_number and d.train_number.upper() != "UNASSIGNED":
            train_devices.setdefault(d.train_number, []).append(d)

    all_train_keys = sorted(db_trains.keys())

    # Build region statistics from registered DB trains and devices
    regions_data = []
    for reg_key, reg_info in REGION_CONFIG.items():
        trains_in_region = []
        reg_coaches = 0
        reg_tanks = 0
        reg_online_trains = 0
        has_critical = False
        has_warning = False

        for train_no in all_train_keys:
            devs = train_devices.get(train_no, [])
            meta = _build_train_meta(train_no, db_trains.get(train_no))
            if meta.get("region", "NORTH") == reg_key:
                is_online = any(d.is_online for d in devs) if devs else False
                coaches_list = meta.get("coach_composition") or []
                if isinstance(coaches_list, list) and len(coaches_list) > 0:
                    coaches_count = len(coaches_list)
                else:
                    coaches_count = meta.get("total_coaches") or (len(devs) if devs else 1)
                device_tank_sum = sum(len(d.tanks) for d in devs) if devs else 0
                tank_count = max(coaches_count * 2, device_tank_sum)

                train_alarm_count = sum(1 for d in devs if d.id in device_alarms)
                for d in devs:
                    if d.id in device_alarms:
                        sev = device_alarms[d.id]
                        if sev == "CRITICAL":
                            has_critical = True
                        elif sev == "WARNING":
                            has_warning = True

                train_status = "All Normal"
                if train_alarm_count > 0:
                    train_status = f"{train_alarm_count} Active Alerts"

                if is_online:
                    reg_online_trains += 1
                reg_coaches += coaches_count
                reg_tanks += tank_count

                trains_in_region.append({
                    "train_number": train_no,
                    "name": meta["name"],
                    "region": reg_key,
                    "type": meta.get("type", "Express"),
                    "coaches_count": coaches_count,
                    "tanks_count": tank_count,
                    "is_online": is_online,
                    "connectivity_status": "ONLINE" if is_online else ("OFFLINE" if devs else "NEVER_CONNECTED"),
                    "status": train_status,
                    "active_alarms": train_alarm_count,
                    "source_station": meta.get("source_station"),
                    "source_code": meta.get("source_code"),
                    "destination_station": meta.get("destination_station"),
                    "destination_code": meta.get("destination_code"),
                    "railway_zone": meta.get("railway_zone"),
                    "api_provider": meta.get("api_provider"),
                })

        region_status = "All Normal"
        if has_critical:
            region_status = "Critical"
        elif has_warning:
            region_status = "Warning"

        regions_data.append({
            "region": reg_key,
            "name": reg_info["name"],
            "code": reg_info["code"],
            "configuredTrains": len(trains_in_region),
            "coaches": reg_coaches,
            "tanks": reg_tanks,
            "onlineTrains": reg_online_trains,
            "status": region_status,
            "trains": trains_in_region,
        })

    return regions_data


@router.get("")
async def list_trains(
    region: Optional[str] = Query(None, description="Filter by region (NORTH, SOUTH, EAST, WEST)"),
    search: Optional[str] = Query(None, description="Search by train number or name"),
    db: AsyncSession = Depends(get_db)
):
    """List all registered trains with consist summary."""
    devices_result = await db.execute(select(Device))
    devices = devices_result.scalars().all()
    train_devices: Dict[str, List[Device]] = {}
    for d in devices:
        if d.train_number and d.train_number.upper() != "UNASSIGNED":
            train_devices.setdefault(d.train_number, []).append(d)

    trains_result = await db.execute(select(Train))
    db_trains = {t.train_number: t for t in trains_result.scalars().all()}

    alarms_result = await db.execute(select(Alarm).where(Alarm.status == "ACTIVE"))
    active_alarms = alarms_result.scalars().all()
    device_alarms = {a.device_id: a.severity for a in active_alarms}

    norm_filter_region: Optional[str] = None
    if region and region.strip().upper() != "ALL":
        norm_filter_region = _normalize_region_input(region)

    trains = []
    all_train_keys = sorted(db_trains.keys())
    for train_no in all_train_keys:
        meta = _build_train_meta(train_no, db_trains.get(train_no))
        train_reg = meta.get("region", "NORTH")
        if norm_filter_region and train_reg != norm_filter_region:
            continue

        devs = train_devices.get(train_no, [])
        is_online = any(d.is_online for d in devs) if devs else False

        coaches_list = meta.get("coach_composition") or []
        if isinstance(coaches_list, list) and len(coaches_list) > 0:
            coaches_count = len(coaches_list)
        else:
            coaches_count = meta.get("total_coaches") or (len(devs) if devs else 0)
        device_tank_sum = sum(len(d.tanks) for d in devs) if devs else 0
        tanks_count = max(coaches_count * 2, device_tank_sum)

        if devs:
            connectivity_status = "ONLINE" if is_online else "OFFLINE"
        else:
            connectivity_status = "NEVER_CONNECTED"

        last_seen_dt = max((d.last_seen_at for d in devs if getattr(d, 'last_seen_at', None)), default=None)
        last_seen_iso = last_seen_dt.isoformat() if last_seen_dt else None
        alarm_count = sum(1 for d in devs if d.id in device_alarms)

        train_item = {
            "train_number": train_no,
            "name": meta["name"],
            "region": train_reg,
            "type": meta.get("type", "Express"),
            "coaches_count": coaches_count,
            "tanks_count": tanks_count,
            "is_online": is_online,
            "connectivity_status": connectivity_status,
            "last_seen_at": last_seen_iso,
            "active_alarms": alarm_count,
            "status": "All Normal" if alarm_count == 0 else f"{alarm_count} Active Alerts",
            "source_station": meta.get("source_station"),
            "source_code": meta.get("source_code"),
            "destination_station": meta.get("destination_station"),
            "destination_code": meta.get("destination_code"),
            "railway_zone": meta.get("railway_zone"),
            "running_days": meta.get("running_days"),
            "total_coaches": meta.get("total_coaches") or coaches_count,
            "has_official_composition": meta.get("has_official_composition", False),
            "api_provider": meta.get("api_provider"),
            "last_verified_at": meta.get("last_verified_at"),
        }

        if search:
            s = search.lower()
            if s not in train_no.lower() and s not in meta["name"].lower():
                continue

        trains.append(train_item)

    return trains


@router.get("/{train_number}/consist", response_model=TrainConsistResponse)
async def get_train_consist(train_number: str, db: AsyncSession = Depends(get_db)):
    """Retrieve full coach and tank consist hierarchy for a specific train."""
    db_train = (
        await db.execute(select(Train).where(Train.train_number == train_number))
    ).scalar_one_or_none()
    if db_train is None:
        raise HTTPException(status_code=404, detail=f"Train {train_number} not found.")
    meta = _build_train_meta(train_number, db_train)

    devices_result = await db.execute(select(Device).where(Device.train_number == train_number))
    devices = devices_result.scalars().all()
    telemetry_repo = TelemetryRepository(db)

    comp = _safe_json_loads(db_train.coach_configuration_json, [])
    devices_by_coach = {d.coach_number.strip().upper(): d for d in devices if d.coach_number}

    coaches_list = []
    total_tanks = 0
    any_online = False
    active_alarms_count = 0

    if comp:
        for c in comp:
            cn = (c.get("coach_number") or "").strip().upper()
            if not cn:
                continue
            d = devices_by_coach.get(cn)
            if d:
                if d.is_online:
                    any_online = True
                coach_tanks = []
                for t in d.tanks:
                    total_tanks += 1
                    latest = await telemetry_repo.get_latest_for_tank(t.id)
                    level = latest.level_percent if latest else 0.0
                    vol = latest.volume_liters if latest else 0.0
                    status = "NORMAL"
                    if level <= t.critical_threshold_percent:
                        status = "CRITICAL"
                    elif level <= t.warning_threshold_percent:
                        status = "WARNING"

                    geom = getattr(t, "tank_type", "CYLINDRICAL") or "CYLINDRICAL"
                    coach_tanks.append(TankConsistItem(
                        id=t.id,
                        tank_index=t.tank_index,
                        name=t.name,
                        capacity_liters=t.capacity_liters,
                        height_cm=getattr(t, "height_cm", 50.0) or 50.0,
                        tank_type=geom,
                        geometry=geom,
                        current_level_percent=round(level, 1),
                        current_volume_liters=round(vol, 1),
                        current_height_cm=round(latest.water_height_cm, 1) if (latest and latest.water_height_cm is not None) else round((level / 100.0) * (getattr(t, "height_cm", 50.0) or 50.0), 1),
                        status=status
                    ))

                alarms_res = await db.execute(select(Alarm).where(Alarm.device_id == d.id, Alarm.status == "ACTIVE"))
                dev_alarms = alarms_res.scalars().all()
                active_alarms_count += len(dev_alarms)

                coaches_list.append(CoachConsistItem(
                    coach_number=cn,
                    device_uid=d.uid,
                    is_online=d.is_online,
                    hardware_version=d.hardware_version or "Standard WLI Node",
                    tanks=coach_tanks
                ))
            else:
                total_tanks += 2
                h1 = c.get("arrival_tank_height_cm") or meta.get("tank_height_cm", 50.0) or 50.0
                h2 = c.get("departure_tank_height_cm") or meta.get("tank_height_cm", 50.0) or 50.0
                c1 = c.get("arrival_tank_capacity_liters") or meta.get("tank_capacity_liters", 20.0) or 20.0
                c2 = c.get("departure_tank_capacity_liters") or meta.get("tank_capacity_liters", 20.0) or 20.0
                geom1 = (c.get("tank_1_geometry") or c.get("geometry1") or "CYLINDRICAL").upper()
                geom2 = (c.get("tank_2_geometry") or c.get("geometry2") or "CYLINDRICAL").upper()
                name1 = c.get("tank_1_name") or "Arrival Side (Tank 1)"
                name2 = c.get("tank_2_name") or "Departure Side (Tank 2)"
                slot_tanks = [
                    TankConsistItem(
                        id=f"slot-{train_number}-{cn}-1",
                        tank_index=1,
                        name=name1,
                        capacity_liters=float(c1),
                        height_cm=float(h1),
                        tank_type=geom1,
                        geometry=geom1,
                        current_level_percent=0.0,
                        current_volume_liters=0.0,
                        current_height_cm=0.0,
                        status="NORMAL",
                    ),
                    TankConsistItem(
                        id=f"slot-{train_number}-{cn}-2",
                        tank_index=2,
                        name=name2,
                        capacity_liters=float(c2),
                        height_cm=float(h2),
                        tank_type=geom2,
                        geometry=geom2,
                        current_level_percent=0.0,
                        current_volume_liters=0.0,
                        current_height_cm=0.0,
                        status="NORMAL",
                    )
                ]
                coaches_list.append(CoachConsistItem(
                    coach_number=cn,
                    device_uid=None,
                    is_online=False,
                    hardware_version=None,
                    tanks=slot_tanks
                ))
    else:
        for d in devices:
            if d.is_online:
                any_online = True
            coach_tanks = []
            for t in d.tanks:
                total_tanks += 1
                latest = await telemetry_repo.get_latest_for_tank(t.id)
                level = latest.level_percent if latest else 0.0
                vol = latest.volume_liters if latest else 0.0
                status = "NORMAL"
                if level <= t.critical_threshold_percent:
                    status = "CRITICAL"
                elif level <= t.warning_threshold_percent:
                    status = "WARNING"

                geom = getattr(t, "tank_type", "CYLINDRICAL") or "CYLINDRICAL"
                coach_tanks.append(TankConsistItem(
                    id=t.id,
                    tank_index=t.tank_index,
                    name=t.name,
                    capacity_liters=t.capacity_liters,
                    height_cm=getattr(t, "height_cm", 50.0) or 50.0,
                    tank_type=geom,
                    geometry=geom,
                    current_level_percent=round(level, 1),
                    current_volume_liters=round(vol, 1),
                    current_height_cm=round(latest.water_height_cm, 1) if (latest and latest.water_height_cm is not None) else round((level / 100.0) * (getattr(t, "height_cm", 50.0) or 50.0), 1),
                    status=status
                ))

            alarms_res = await db.execute(select(Alarm).where(Alarm.device_id == d.id, Alarm.status == "ACTIVE"))
            dev_alarms = alarms_res.scalars().all()
            active_alarms_count += len(dev_alarms)

            coaches_list.append(CoachConsistItem(
                coach_number=d.coach_number,
                device_uid=d.uid,
                is_online=d.is_online,
                hardware_version=d.hardware_version or "Standard WLI Node",
                tanks=coach_tanks
            ))

    return TrainConsistResponse(
        train_number=train_number,
        name=meta["name"],
        region=meta.get("region", "NORTH"),
        coaches_count=len(coaches_list),
        tanks_count=total_tanks,
        online_status=any_online,
        active_alarms_count=active_alarms_count,
        tank_height_cm=meta.get("tank_height_cm", 50.0),
        tank_capacity_liters=meta.get("tank_capacity_liters", 20.0),
        coaches=coaches_list,
        source_station=meta.get("source_station"),
        source_code=meta.get("source_code"),
        destination_station=meta.get("destination_station"),
        destination_code=meta.get("destination_code"),
        railway_zone=meta.get("railway_zone"),
        train_type=meta.get("type"),
        running_days=meta.get("running_days"),
        total_coaches=meta.get("total_coaches"),
        has_official_composition=bool(meta.get("has_official_composition", False)),
        api_provider=meta.get("api_provider"),
        last_verified_at=meta.get("last_verified_at"),
    )


@router.post("", status_code=201)
async def create_train(
    data: TrainCreate,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a new train to the fleet registry (Admin Only)."""
    train_number = data.train_number.strip()
    if not train_number:
        raise HTTPException(status_code=400, detail="Train number is required.")

    reg = _normalize_region_input(data.region)

    # Prevent duplicate train entries (authoritative Train table)
    existing_train = (
        await db.execute(select(Train.id).where(Train.train_number == train_number))
    ).scalar_one_or_none()
    if existing_train:
        raise HTTPException(
            status_code=409,
            detail=f"Train {train_number} is already registered in the fleet.",
        )

    zone = (data.railway_zone or REGION_DEFAULT_ZONE.get(reg, "NR")).strip().upper()
    coaches_spec = data.coaches if data.coaches else []
    coaches_to_create: List[str] = []
    if coaches_spec:
        seen = set()
        for c in coaches_spec:
            cn = c.coach_number.strip().upper()
            if cn and cn not in seen:
                seen.add(cn)
                coaches_to_create.append(cn)
        coach_json = json.dumps([{"position": i + 1, "coach_number": cn, "coach_category": "Coach"} for i, cn in enumerate(coaches_to_create)])
    elif data.coach_number and data.coach_number.strip():
        cn = data.coach_number.strip().upper()
        coaches_to_create.append(cn)
        coach_json = json.dumps([{"position": 1, "coach_number": cn, "coach_category": "Coach"}])
    else:
        coach_json = None

    tank_h = float(data.tank_height_cm) if data.tank_height_cm is not None else 50.0
    tank_c = float(data.tank_capacity) if data.tank_capacity is not None else 20.0

    train_row = Train(
        train_number=train_number,
        name=data.name.strip(),
        source_station=data.source_station.strip() if data.source_station else None,
        source_code=data.source_code.strip().upper() if data.source_code else None,
        destination_station=data.destination_station.strip() if data.destination_station else None,
        destination_code=data.destination_code.strip().upper() if data.destination_code else None,
        region=reg,
        railway_zone=zone,
        train_type=(data.train_type or "Express").strip(),
        running_days_json=json.dumps(data.running_days) if data.running_days else None,
        coach_configuration_json=coach_json,
        route_json=json.dumps(data.route) if data.route else None,
        total_coaches=data.total_coaches or (len(coaches_spec) if coaches_spec else None),
        has_official_composition=data.has_official_composition,
        api_provider=data.api_provider,
        last_verified_at=_parse_iso_dt(data.last_verified_at),
        tank_height_cm=tank_h,
        tank_capacity_liters=tank_c,
    )
    db.add(train_row)

    TRAIN_METADATA[train_number] = {
        "name": data.name.strip(),
        "region": reg,
        "type": (data.train_type or "Custom Fleet").strip(),
        "tank_height_cm": tank_h,
        "tank_capacity_liters": tank_c,
    }

    # Provision initial coach devices (either explicit official/selected consist list or single initial coach)
    coaches_to_create: List[str] = []
    if coaches_spec:
        seen = set()
        for c in coaches_spec:
            cn = c.coach_number.strip().upper()
            if cn and cn not in seen:
                seen.add(cn)
                coaches_to_create.append(cn)
    elif data.coach_number and data.coach_number.strip():
        coaches_to_create.append(data.coach_number.strip().upper())

    # Train and coach structure registered cleanly without automatically synthesizing fake physical devices.
    # Genuine physical edge devices are discovered over MQTT or manually registered by an administrator.

    # Record persistent audit event
    db.add(
        AuditEvent(
            user_id=admin.id,
            action="CREATE_TRAIN",
            target_type="TRAIN",
            target_id=train_number,
            details=json.dumps({
                "created_by": admin.username,
                "name": data.name.strip(),
                "region": reg,
                "train_type": (data.train_type or "Express").strip(),
                "coaches_count": len(coaches_to_create),
                "tank_capacity_liters": tank_c,
                "tank_height_cm": tank_h,
            }),
        )
    )

    await db.commit()

    sync_event = {
        "action": "create_train",
        "train_number": train_number,
        "name": data.name.strip(),
        "region": reg,
        "tank_height_cm": tank_h,
        "tank_capacity_liters": tank_c,
        "coaches_count": len(coaches_to_create),
        "tanks_count": len(coaches_to_create) * 2,
    }
    await broadcast_sync_event("TRAIN_CREATED", sync_event)
    await broadcast_sync_event("REGION_UPDATED", {"region": reg, "train_number": train_number})

    return {
        "message": "Train registered successfully",
        "train_number": train_number,
        "region": reg,
        "coaches_created": len(coaches_to_create),
        "tank_height_cm": tank_h,
        "tank_capacity_liters": tank_c,
    }


@router.put("/{train_number}")
async def update_train(
    train_number: str,
    data: TrainUpdate,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update train metadata (Admin Only)."""
    if train_number not in TRAIN_METADATA:
        TRAIN_METADATA[train_number] = {
            "name": f"Train {train_number}",
            "region": "NORTH",
            "type": "Fleet Consist"
        }

    db_train = (
        await db.execute(select(Train).where(Train.train_number == train_number))
    ).scalar_one_or_none()

    if data.name is not None:
        cleaned_name = data.name.strip()
        TRAIN_METADATA[train_number]["name"] = cleaned_name
        if db_train:
            db_train.name = cleaned_name
    if data.region is not None:
        reg = _normalize_region_input(data.region)
        TRAIN_METADATA[train_number]["region"] = reg
        if db_train:
            db_train.region = reg
    if data.type is not None:
        cleaned_type = data.type.strip()
        TRAIN_METADATA[train_number]["type"] = cleaned_type
        if db_train:
            db_train.train_type = cleaned_type
    if db_train and data.source_station is not None:
        db_train.source_station = data.source_station.strip() or None
    if db_train and data.destination_station is not None:
        db_train.destination_station = data.destination_station.strip() or None
    if db_train and data.railway_zone is not None:
        db_train.railway_zone = data.railway_zone.strip().upper() or None

    db.add(
        AuditEvent(
            user_id=admin.id,
            action="UPDATE_TRAIN",
            target_type="TRAIN",
            target_id=train_number,
            details=json.dumps({
                "updated_by": admin.username,
                "name": data.name,
                "region": data.region,
                "train_type": data.type,
            }),
        )
    )

    await db.commit()

    sync_event = {
        "action": "update_train",
        "train_number": train_number,
        "name": data.name.strip() if data.name is not None else (db_train.name if db_train else None),
        "region": db_train.region if db_train else None,
    }
    await broadcast_sync_event("TRAIN_UPDATED", sync_event)
    await broadcast_sync_event("REGION_UPDATED", {"region": db_train.region if db_train else None, "train_number": train_number})

    return {
        "message": "Train updated successfully",
        "train_number": train_number,
        "metadata": _build_train_meta(train_number, db_train),
    }


@router.delete("/{train_number}")
async def delete_train(
    train_number: str,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a train from the fleet registry cleanly while preserving hardware inventory and audit history (Admin Only)."""
    cleaned = (train_number or "").strip()
    if not cleaned or cleaned.upper() == "UNASSIGNED" or not re.fullmatch(r"[A-Za-z0-9_-]{1,16}", cleaned):
        raise HTTPException(status_code=400, detail="Invalid train number format.")

    db_train = (
        await db.execute(select(Train).where(Train.train_number == cleaned))
    ).scalar_one_or_none()
    assigned_devices = (
        await db.execute(
            select(Device).where(
                Device.train_number == cleaned
            )
        )
    ).scalars().all()
    in_metadata = cleaned in TRAIN_METADATA

    if db_train is None and not assigned_devices and not in_metadata:
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "message": "Train not found",
                "code": "TRAIN_NOT_FOUND",
                "detail": f"Train {cleaned} was not found.",
            },
        )

    now = utc_now()
    device_ids = [d.id for d in assigned_devices]
    resolved_alarms = 0

    try:
        # Resolve open alarms for unassigned devices so alarm/history logs remain intact without stale active alerts
        if device_ids:
            open_alarms = (
                await db.execute(
                    select(Alarm).where(
                        Alarm.device_id.in_(device_ids),
                        Alarm.status != "RESOLVED",
                    )
                )
            ).scalars().all()
            for alarm in open_alarms:
                prev_status = alarm.status
                alarm.status = "RESOLVED"
                alarm.resolved_at = now
                db.add(
                    AlarmHistory(
                        alarm_id=alarm.id,
                        previous_status=prev_status,
                        new_status="RESOLVED",
                        changed_by=admin.id,
                        comment=f"Train {cleaned} removed from fleet",
                    )
                )
                resolved_alarms += 1

            # Release edge devices back to the unassigned hardware pool instead of cascade-destroying telemetry history
            for device in assigned_devices:
                device.train_number = "UNASSIGNED"
                device.coach_number = "UNASSIGNED"
                device.status = "AVAILABLE"
                device.is_online = False
                device.updated_at = now

        # Capture archival snapshot of train metadata prior to removal
        train_snapshot = {
            "name": db_train.name if db_train else TRAIN_METADATA.get(cleaned, {}).get("name"),
            "region": db_train.region if db_train else TRAIN_METADATA.get(cleaned, {}).get("region"),
            "train_type": db_train.train_type if db_train else TRAIN_METADATA.get(cleaned, {}).get("type"),
            "source_station": db_train.source_station if db_train else None,
            "destination_station": db_train.destination_station if db_train else None,
            "coaches_count": len(assigned_devices),
            "unassigned_devices": [d.uid for d in assigned_devices],
        }

        if db_train is not None:
            await db.execute(delete(Train).where(Train.train_number == cleaned))

        client_ip = request.client.host if request.client else "unknown"
        db.add(
            AuditEvent(
                user_id=admin.id,
                action="DELETE_TRAIN",
                target_type="TRAIN",
                target_id=cleaned,
                details=json.dumps(
                    {
                        "deleted_by": admin.username,
                        "snapshot": train_snapshot,
                        "unassigned_devices_count": len(assigned_devices),
                        "resolved_alarms": resolved_alarms,
                    }
                ),
                ip_address=client_ip,
            )
        )
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete train {cleaned}: {exc}",
        ) from exc

    TRAIN_METADATA.pop(cleaned, None)

    sync_event = {
        "action": "delete_train",
        "train_number": cleaned,
    }
    await broadcast_sync_event("TRAIN_DELETED", sync_event)
    await broadcast_sync_event("REGION_UPDATED", {"train_number": cleaned})

    return {
        "success": True,
        "message": f"Train {cleaned} deleted successfully",
        "trainId": cleaned,
        "train_number": cleaned,
        "unassigned_devices": len(assigned_devices),
        "resolved_alarms": resolved_alarms,
    }


class CoachAddRequest(BaseModel):
    coach_number: str
    coach_name: Optional[str] = None
    coach_category: Optional[str] = "AC 3-Tier"
    coach_type: Optional[str] = None
    tank_1_name: Optional[str] = "Arrival Side (Tank 1)"
    tank_2_name: Optional[str] = "Departure Side (Tank 2)"
    tank_1_capacity: Optional[float] = 500.0
    tank_2_capacity: Optional[float] = 500.0
    tank_1_height_cm: Optional[float] = 50.0
    tank_2_height_cm: Optional[float] = 50.0
    tank_1_geometry: Optional[str] = "CYLINDRICAL"
    tank_2_geometry: Optional[str] = "CYLINDRICAL"
    tank_height_cm: Optional[float] = None
    device_uid: Optional[str] = None


class CoachUpdateRequest(BaseModel):
    coach_name: Optional[str] = None
    coach_category: Optional[str] = None
    coach_type: Optional[str] = None
    tank_1_name: Optional[str] = None
    tank_2_name: Optional[str] = None
    tank_1_capacity: Optional[float] = Field(None, alias="arrival_tank_capacity_liters")
    tank_2_capacity: Optional[float] = Field(None, alias="departure_tank_capacity_liters")
    tank_1_height_cm: Optional[float] = Field(None, alias="arrival_tank_height_cm")
    tank_2_height_cm: Optional[float] = Field(None, alias="departure_tank_height_cm")
    tank_1_geometry: Optional[str] = None
    tank_2_geometry: Optional[str] = None
    tank_height_cm: Optional[float] = None
    device_uid: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class CoachRenameRequest(BaseModel):
    new_coach_number: str


class CoachReorderRequest(BaseModel):
    coach_numbers: List[str]


@router.post("/{train_number}/coaches", status_code=201)
async def add_coach_to_train(
    train_number: str,
    data: CoachAddRequest,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new coach to an existing train consist (Admin Only)."""
    tr_clean = train_number.strip()
    c_clean = data.coach_number.strip().upper()
    if not c_clean:
        raise HTTPException(status_code=400, detail="Coach identifier is required.")

    # Check train exists
    db_train = (
        await db.execute(select(Train).where(Train.train_number == tr_clean))
    ).scalar_one_or_none()
    if not db_train and tr_clean not in TRAIN_METADATA:
        raise HTTPException(status_code=404, detail=f"Train {tr_clean} not found.")

    # Check coach collision in both train composition and devices
    if db_train:
        comp = _safe_json_loads(db_train.coach_configuration_json, [])
        if any(c.get("coach_number", "").strip().upper() == c_clean for c in comp):
            raise HTTPException(
                status_code=409,
                detail=f"Coach {c_clean} is already configured on Train {tr_clean}.",
            )

    existing_dev = (
        await db.execute(
            select(Device).where(
                Device.train_number == tr_clean,
                Device.coach_number == c_clean,
            )
        )
    ).scalar_one_or_none()
    if existing_dev:
        raise HTTPException(
            status_code=409,
            detail=f"Coach {c_clean} is already configured on Train {tr_clean}.",
        )

    device_repo = DeviceRepository(db)
    tank_repo = TankRepository(db)
    uid = (data.device_uid or "").strip()
    device = None

    if uid:
        device = await device_repo.get_by_uid(uid)
        if not device:
            raise HTTPException(
                status_code=404,
                detail=f"Device '{uid}' not found in registry. Register the device before assigning it to a coach."
            )
        device.train_number = tr_clean
        device.coach_number = c_clean
        device.status = "ENGAGED"
        device.updated_at = utc_now()

        # Configure Dual Tanks for assigned device
        h1 = data.tank_1_height_cm or data.tank_height_cm or 50.0
        h2 = data.tank_2_height_cm or data.tank_height_cm or 50.0
        geom1 = (data.tank_1_geometry or "CYLINDRICAL").upper()
        geom2 = (data.tank_2_geometry or "CYLINDRICAL").upper()

        t1 = await tank_repo.get_by_device_and_index(device.id, 1)
        if not t1:
            t1 = await tank_repo.create(
                device_id=device.id,
                tank_index=1,
                name=data.tank_1_name or "Arrival Side (Tank 1)",
                capacity_liters=data.tank_1_capacity or 500.0,
                height_cm=h1,
                tank_type=geom1,
            )
        else:
            t1.name = data.tank_1_name or t1.name
            t1.capacity_liters = data.tank_1_capacity or t1.capacity_liters
            t1.height_cm = h1
            t1.tank_type = geom1

        t2 = await tank_repo.get_by_device_and_index(device.id, 2)
        if not t2:
            t2 = await tank_repo.create(
                device_id=device.id,
                tank_index=2,
                name=data.tank_2_name or "Departure Side (Tank 2)",
                capacity_liters=data.tank_2_capacity or 500.0,
                height_cm=h2,
                tank_type=geom2,
            )
        else:
            t2.name = data.tank_2_name or t2.name
            t2.capacity_liters = data.tank_2_capacity or t2.capacity_liters
            t2.height_cm = h2
            t2.tank_type = geom2

    # Update Train official composition JSON if present
    if db_train:
        comp = _safe_json_loads(db_train.coach_configuration_json, [])
        if not any(c.get("coach_number", "").upper() == c_clean for c in comp):
            comp.append({
                "position": len(comp) + 1,
                "coach_number": c_clean,
                "coach_category": data.coach_category or "Coach",
                "coach_type": data.coach_type or data.coach_category or "Coach",
            })
            db_train.coach_configuration_json = json.dumps(comp)
            db_train.total_coaches = len(comp)

    client_ip = request.client.host if request.client else "unknown"
    db.add(
        AuditEvent(
            user_id=admin.id,
            action="ADD_COACH",
            target_type="COACH",
            target_id=f"{tr_clean}:{c_clean}",
            details=json.dumps({"device_uid": uid, "added_by": admin.username}),
            ip_address=client_ip,
        )
    )
    await db.commit()

    sync_event = {
        "action": "coach_change",
        "train_number": tr_clean,
        "coach_number": c_clean,
    }
    await broadcast_sync_event("COACH_CREATED", sync_event)
    await broadcast_sync_event("REGION_UPDATED", {"train_number": tr_clean, "coach_number": c_clean})

    return {
        "success": True,
        "message": f"Coach {c_clean} added to Train {tr_clean} successfully.",
        "coach_number": c_clean,
        "device_uid": uid,
    }


@router.put("/{train_number}/coaches/reorder")
async def reorder_coaches(
    train_number: str,
    data: CoachReorderRequest,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Reorder coach sequence within train consist (Admin Only)."""
    tr_clean = train_number.strip()
    db_train = (
        await db.execute(select(Train).where(Train.train_number == tr_clean))
    ).scalar_one_or_none()

    if db_train:
        comp = _safe_json_loads(db_train.coach_configuration_json, [])
        comp_map = {c.get("coach_number", "").upper(): c for c in comp}
        reordered = []
        seen = set()
        for num in data.coach_numbers:
            clean_num = num.strip().upper()
            if clean_num in comp_map and clean_num not in seen:
                reordered.append(comp_map[clean_num])
                seen.add(clean_num)
        for c in comp:
            clean_num = c.get("coach_number", "").upper()
            if clean_num not in seen:
                reordered.append(c)
                seen.add(clean_num)
        for idx, c in enumerate(reordered, 1):
            c["position"] = idx
        db_train.coach_configuration_json = json.dumps(reordered)

    client_ip = request.client.host if request.client else "unknown"
    db.add(
        AuditEvent(
            user_id=admin.id,
            action="REORDER_COACHES",
            target_type="TRAIN",
            target_id=tr_clean,
            details=json.dumps({"reordered_by": admin.username}),
            ip_address=client_ip,
        )
    )
    await db.commit()

    sync_event = {
        "action": "coach_change",
        "train_number": tr_clean,
    }
    await broadcast_sync_event("COACH_REORDERED", sync_event)

    return {
        "success": True,
        "message": f"Coaches reordered successfully for Train {tr_clean}.",
        "coach_numbers": data.coach_numbers,
    }


@router.put("/{train_number}/coaches/{coach_number}")
async def update_coach_details(
    train_number: str,
    coach_number: str,
    data: CoachUpdateRequest,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update coach specifications and tank parameters (Admin Only)."""
    tr_clean = train_number.strip()
    c_clean = coach_number.strip().upper()

    db_train = (
        await db.execute(select(Train).where(Train.train_number == tr_clean))
    ).scalar_one_or_none()
    comp = _safe_json_loads(db_train.coach_configuration_json, []) if db_train else []
    coach_in_comp = any(c.get("coach_number", "").upper() == c_clean for c in comp)

    dev = (
        await db.execute(
            select(Device).where(
                Device.train_number == tr_clean,
                Device.coach_number == c_clean,
            ).order_by(Device.updated_at.desc())
        )
    ).scalars().first()

    if not dev and not coach_in_comp:
        raise HTTPException(
            status_code=404,
            detail=f"Coach {c_clean} not found on Train {tr_clean}.",
        )

    h1 = data.tank_1_height_cm or data.tank_height_cm or 50.0
    h2 = data.tank_2_height_cm or data.tank_height_cm or 50.0

    if dev:
        tank_repo = TankRepository(db)
        t1 = await tank_repo.get_by_device_and_index(dev.id, 1)
        if t1:
            if data.tank_1_name:
                t1.name = data.tank_1_name.strip()
            if data.tank_1_capacity and data.tank_1_capacity > 0:
                t1.capacity_liters = data.tank_1_capacity
            if h1 and h1 > 0:
                t1.height_cm = h1
            if data.tank_1_geometry:
                t1.tank_type = data.tank_1_geometry.strip().upper()
        else:
            t1 = await tank_repo.create(
                device_id=dev.id,
                tank_index=1,
                name=data.tank_1_name or "Arrival Side (Tank 1)",
                capacity_liters=data.tank_1_capacity or 500.0,
                height_cm=h1,
                tank_type=(data.tank_1_geometry or "CYLINDRICAL").upper(),
            )

        t2 = await tank_repo.get_by_device_and_index(dev.id, 2)
        if t2:
            if data.tank_2_name:
                t2.name = data.tank_2_name.strip()
            if data.tank_2_capacity and data.tank_2_capacity > 0:
                t2.capacity_liters = data.tank_2_capacity
            if h2 and h2 > 0:
                t2.height_cm = h2
            if data.tank_2_geometry:
                t2.tank_type = data.tank_2_geometry.strip().upper()
        else:
            t2 = await tank_repo.create(
                device_id=dev.id,
                tank_index=2,
                name=data.tank_2_name or "Departure Side (Tank 2)",
                capacity_liters=data.tank_2_capacity or 500.0,
                height_cm=h2,
                tank_type=(data.tank_2_geometry or "CYLINDRICAL").upper(),
            )

    # Update coach category, type and name in train configuration JSON if present
    db_train = (
        await db.execute(select(Train).where(Train.train_number == tr_clean))
    ).scalar_one_or_none()
    if db_train:
        comp = _safe_json_loads(db_train.coach_configuration_json, [])
        for c in comp:
            if c.get("coach_number", "").upper() == c_clean:
                if data.coach_category:
                    c["coach_category"] = data.coach_category
                if data.coach_type:
                    c["coach_type"] = data.coach_type
                if data.coach_name:
                    c["coach_name"] = data.coach_name
                if data.tank_1_name:
                    c["tank_1_name"] = data.tank_1_name
                if data.tank_2_name:
                    c["tank_2_name"] = data.tank_2_name
                if data.tank_1_geometry:
                    c["tank_1_geometry"] = data.tank_1_geometry
                if data.tank_2_geometry:
                    c["tank_2_geometry"] = data.tank_2_geometry
                if h1 and h1 > 0:
                    c["arrival_tank_height_cm"] = h1
                if h2 and h2 > 0:
                    c["departure_tank_height_cm"] = h2
                if data.tank_1_capacity and data.tank_1_capacity > 0:
                    c["arrival_tank_capacity_liters"] = data.tank_1_capacity
                if data.tank_2_capacity and data.tank_2_capacity > 0:
                    c["departure_tank_capacity_liters"] = data.tank_2_capacity
                if data.device_uid is not None:
                    c["device_uid"] = data.device_uid.strip()
        db_train.coach_configuration_json = json.dumps(comp)

    # Handle device reassignment if requested
    if data.device_uid is not None:
        new_uid = data.device_uid.strip()
        current_uid = dev.uid if dev else ""
        if new_uid != current_uid:
            # Unassign old device
            if dev:
                dev.train_number = "UNASSIGNED"
                dev.coach_number = "UNASSIGNED"
                dev.status = "AVAILABLE"
                dev.updated_at = utc_now()
            # Assign new device
            if new_uid:
                new_dev = (
                    await db.execute(select(Device).where(Device.uid == new_uid))
                ).scalar_one_or_none()
                if new_dev:
                    new_dev.train_number = tr_clean
                    new_dev.coach_number = c_clean
                    new_dev.status = "ENGAGED"
                    new_dev.updated_at = utc_now()

    client_ip = request.client.host if request.client else "unknown"
    db.add(
        AuditEvent(
            user_id=admin.id,
            action="UPDATE_COACH",
            target_type="COACH",
            target_id=f"{tr_clean}:{c_clean}",
            details=json.dumps({"updated_by": admin.username}),
            ip_address=client_ip,
        )
    )
    await db.commit()

    sync_event = {
        "action": "coach_change",
        "train_number": tr_clean,
        "coach_number": c_clean,
    }
    await broadcast_sync_event("COACH_UPDATED", sync_event)

    return {
        "success": True,
        "message": f"Coach {c_clean} updated successfully.",
        "coach_number": c_clean,
    }


@router.put("/{train_number}/coaches/{coach_number}/rename")
async def rename_coach(
    train_number: str,
    coach_number: str,
    data: CoachRenameRequest,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Rename a coach in the consist while preserving telemetry and hardware bindings (Admin Only)."""
    tr_clean = train_number.strip()
    old_c = coach_number.strip().upper()
    new_c = data.new_coach_number.strip().upper()

    if not new_c:
        raise HTTPException(status_code=400, detail="New coach identifier is required.")

    if old_c == new_c:
        return {"success": True, "old_coach_number": old_c, "new_coach_number": new_c}

    db_train = (
        await db.execute(select(Train).where(Train.train_number == tr_clean))
    ).scalar_one_or_none()
    comp = _safe_json_loads(db_train.coach_configuration_json, []) if db_train else []
    coach_in_comp = any(c.get("coach_number", "").upper() == old_c for c in comp)

    # Verify new coach number does not conflict
    if any(c.get("coach_number", "").upper() == new_c for c in comp):
        raise HTTPException(
            status_code=409,
            detail=f"Coach {new_c} already exists on Train {tr_clean}.",
        )

    conflict = (
        await db.execute(
            select(Device).where(
                Device.train_number == tr_clean,
                Device.coach_number == new_c,
            )
        )
    ).scalar_one_or_none()
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Coach {new_c} already exists on Train {tr_clean}.",
        )

    dev = (
        await db.execute(
            select(Device).where(
                Device.train_number == tr_clean,
                Device.coach_number == old_c,
            ).order_by(Device.updated_at.desc())
        )
    ).scalars().first()

    if not dev and not coach_in_comp:
        raise HTTPException(
            status_code=404,
            detail=f"Coach {old_c} not found on Train {tr_clean}.",
        )

    if dev:
        dev.coach_number = new_c
        dev.updated_at = utc_now()

    # Update Train configuration JSON if present
    if db_train:
        for item in comp:
            if item.get("coach_number", "").upper() == old_c:
                item["coach_number"] = new_c
        db_train.coach_configuration_json = json.dumps(comp)

    client_ip = request.client.host if request.client else "unknown"
    db.add(
        AuditEvent(
            user_id=admin.id,
            action="RENAME_COACH",
            target_type="COACH",
            target_id=f"{tr_clean}:{old_c}->{new_c}",
            details=json.dumps({"renamed_by": admin.username}),
            ip_address=client_ip,
        )
    )
    await db.commit()

    sync_event = {
        "action": "coach_change",
        "train_number": tr_clean,
        "old_coach_number": old_c,
        "new_coach_number": new_c,
    }
    await broadcast_sync_event("COACH_UPDATED", sync_event)

    return {
        "success": True,
        "message": f"Coach {old_c} renamed to {new_c} successfully.",
        "old_coach_number": old_c,
        "new_coach_number": new_c,
    }


@router.delete("/{train_number}/coaches/{coach_number}")
async def delete_coach(
    train_number: str,
    coach_number: str,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a coach from the train, releasing device to unassigned pool without destroying telemetry (Admin Only)."""
    tr_clean = train_number.strip()
    c_clean = coach_number.strip().upper()

    devs = (
        await db.execute(
            select(Device).where(
                (Device.train_number == tr_clean) & (Device.coach_number == c_clean)
            )
        )
    ).scalars().all()

    now = utc_now()
    for dev in devs:
        # Resolve active alarms for this device
        open_alarms = (
            await db.execute(
                select(Alarm).where(
                    Alarm.device_id == dev.id,
                    Alarm.status != "RESOLVED",
                )
            )
        ).scalars().all()
        for alarm in open_alarms:
            prev_status = alarm.status
            alarm.status = "RESOLVED"
            alarm.resolved_at = now
            db.add(
                AlarmHistory(
                    alarm_id=alarm.id,
                    previous_status=prev_status,
                    new_status="RESOLVED",
                    changed_by=admin.id,
                    comment=f"Coach {c_clean} deleted from Train {tr_clean}",
                )
            )

        # Release device to unassigned hardware pool
        dev.train_number = "UNASSIGNED"
        dev.coach_number = "UNASSIGNED"
        dev.status = "AVAILABLE"
        dev.is_online = False
        dev.updated_at = now

    # Update Train configuration JSON if present
    db_train = (
        await db.execute(select(Train).where(Train.train_number == tr_clean))
    ).scalar_one_or_none()
    if db_train:
        comp = _safe_json_loads(db_train.coach_configuration_json, [])
        comp = [c for c in comp if c.get("coach_number", "").upper() != c_clean]
        # Re-index positions
        for idx, c in enumerate(comp, 1):
            c["position"] = idx
        db_train.coach_configuration_json = json.dumps(comp)
        db_train.total_coaches = len(comp)

    client_ip = request.client.host if request.client else "unknown"
    db.add(
        AuditEvent(
            user_id=admin.id,
            action="DELETE_COACH",
            target_type="COACH",
            target_id=f"{tr_clean}:{c_clean}",
            details=json.dumps({"deleted_by": admin.username}),
            ip_address=client_ip,
        )
    )
    await db.commit()

    sync_event = {
        "action": "coach_change",
        "train_number": tr_clean,
        "deleted_coach_number": c_clean,
    }
    await broadcast_sync_event("COACH_DELETED", sync_event)
    await broadcast_sync_event("REGION_UPDATED", {"train_number": tr_clean, "deleted_coach_number": c_clean})

    return {
        "success": True,
        "message": f"Coach {c_clean} removed from Train {tr_clean} successfully.",
        "coach_number": c_clean,
    }



