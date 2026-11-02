"""Trains and Fleet Management API Router."""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db
from app.models.device import Device
from app.models.tank import Tank
from app.models.alarm import Alarm
from app.models.telemetry import TelemetryReading
from app.repositories.device_repo import DeviceRepository
from app.repositories.tank_repo import TankRepository
from app.repositories.telemetry_repo import TelemetryRepository

router = APIRouter(prefix="/trains", tags=["Trains"])

# Predefined railway region metadata
REGION_CONFIG = {
    "NORTH": {"name": "Northern Railway", "code": "NR"},
    "SOUTH": {"name": "Southern Railway", "code": "SR"},
    "EAST": {"name": "Eastern Railway", "code": "ER"},
    "WEST": {"name": "Western Railway", "code": "WR"},
}

# Known train assignments (extensible)
TRAIN_METADATA: Dict[str, Dict[str, Any]] = {
    "12002": {"name": "Shatabdi Express (NDLS - BPL)", "region": "NORTH", "type": "Shatabdi Express"},
    "12301": {"name": "Rajdhani Express (HWH - NDLS)", "region": "EAST", "type": "Rajdhani Express"},
    "12951": {"name": "Mumbai Rajdhani (MMCT - NDLS)", "region": "WEST", "type": "Superfast AC"},
    "12431": {"name": "Rajdhani Express (TVC - NZM)", "region": "SOUTH", "type": "Rajdhani Express"},
}


class TrainCreate(BaseModel):
    train_number: str
    name: str
    region: str
    coach_number: Optional[str] = "B1"
    tank_capacity: Optional[float] = 20.0


class TankConsistItem(BaseModel):
    id: str
    tank_index: int
    name: str
    capacity_liters: float
    current_level_percent: float
    current_volume_liters: float
    status: str


class CoachConsistItem(BaseModel):
    coach_number: str
    device_uid: str
    is_online: bool
    hardware_version: str
    tanks: List[TankConsistItem]


class TrainConsistResponse(BaseModel):
    train_number: str
    name: str
    region: str
    coaches_count: int
    tanks_count: int
    online_status: bool
    active_alarms_count: int
    coaches: List[CoachConsistItem]


@router.get("/regions")
async def get_regions_summary(db: AsyncSession = Depends(get_db)):
    """Retrieve operational summaries for all 4 railway regions."""
    # Query all devices and tanks
    devices_result = await db.execute(select(Device))
    devices = devices_result.scalars().all()

    # Query active alarms
    alarms_result = await db.execute(select(Alarm).where(Alarm.status == "ACTIVE"))
    active_alarms = alarms_result.scalars().all()
    device_alarms = {a.device_id: a.severity for a in active_alarms}

    # Group devices by train_number
    train_devices: Dict[str, List[Device]] = {}
    for d in devices:
        train_devices.setdefault(d.train_number, []).append(d)

    # Build region statistics strictly from registered database devices
    regions_data = []
    for reg_key, reg_info in REGION_CONFIG.items():
        trains_in_region = []
        reg_coaches = 0
        reg_tanks = 0
        reg_online_trains = 0
        has_critical = False
        has_warning = False

        for train_no, devs in train_devices.items():
            meta = TRAIN_METADATA.get(train_no, {
                "name": f"Train {train_no}",
                "region": "NORTH",
                "type": "Fleet Consist"
            })
            if meta.get("region", "NORTH") == reg_key:
                is_online = any(d.is_online for d in devs)
                tank_count = sum(len(d.tanks) for d in devs) if devs else 0
                coaches_count = len(devs)

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
                    "type": meta.get("type", "Express"),
                    "coaches_count": coaches_count,
                    "tanks_count": tank_count,
                    "is_online": is_online,
                    "status": train_status,
                    "active_alarms": train_alarm_count
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
        train_devices.setdefault(d.train_number, []).append(d)

    alarms_result = await db.execute(select(Alarm).where(Alarm.status == "ACTIVE"))
    active_alarms = alarms_result.scalars().all()
    device_alarms = {a.device_id: a.severity for a in active_alarms}

    trains = []
    # Strictly registered database trains
    all_train_keys = sorted(train_devices.keys())
    for train_no in all_train_keys:
        meta = TRAIN_METADATA.get(train_no, {
            "name": f"Train {train_no}",
            "region": "NORTH",
            "type": "Fleet Consist"
        })
        train_reg = meta.get("region", "NORTH")
        if region and train_reg != region.upper():
            continue

        devs = train_devices.get(train_no, [])
        is_online = any(d.is_online for d in devs)
        coaches_count = len(devs)
        tanks_count = sum(len(d.tanks) for d in devs) if devs else 0
        alarm_count = sum(1 for d in devs if d.id in device_alarms)

        train_item = {
            "train_number": train_no,
            "name": meta["name"],
            "region": train_reg,
            "type": meta.get("type", "Express"),
            "coaches_count": coaches_count,
            "tanks_count": tanks_count,
            "is_online": is_online,
            "active_alarms": alarm_count,
            "status": "All Normal" if alarm_count == 0 else f"{alarm_count} Active Alerts"
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
    meta = TRAIN_METADATA.get(train_number, {
        "name": f"Train {train_number}",
        "region": "NORTH",
        "type": "Fleet Consist"
    })

    devices_result = await db.execute(select(Device).where(Device.train_number == train_number))
    devices = devices_result.scalars().all()
    telemetry_repo = TelemetryRepository(db)

    coaches_list = []
    total_tanks = 0
    any_online = False
    active_alarms_count = 0

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

            coach_tanks.append(TankConsistItem(
                id=t.id,
                tank_index=t.tank_index,
                name=t.name,
                capacity_liters=t.capacity_liters,
                current_level_percent=round(level, 1),
                current_volume_liters=round(vol, 1),
                status=status
            ))

        alarms_res = await db.execute(select(Alarm).where(Alarm.device_id == d.id, Alarm.status == "ACTIVE"))
        dev_alarms = alarms_res.scalars().all()
        active_alarms_count += len(dev_alarms)

        coaches_list.append(CoachConsistItem(
            coach_number=d.coach_number,
            device_uid=d.uid,
            is_online=d.is_online,
            hardware_version=d.hardware_version or "ESP32S3-EC200U-V1",
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
        coaches=coaches_list
    )


@router.post("", status_code=201)
async def create_train(data: TrainCreate, db: AsyncSession = Depends(get_db)):
    """Add a new train to the fleet registry."""
    reg = data.region.upper()
    if reg not in REGION_CONFIG:
        raise HTTPException(status_code=400, detail=f"Invalid region. Choose from {list(REGION_CONFIG.keys())}")

    TRAIN_METADATA[data.train_number] = {
        "name": data.name,
        "region": reg,
        "type": "Custom Fleet"
    }

    # If coach number specified, ensure device and tank exist
    coach = data.coach_number or "B1"
    device_repo = DeviceRepository(db)
    tank_repo = TankRepository(db)

    # Generate UID if not provided
    uid = f"PANORAMA-{data.train_number}-{coach}"
    device = await device_repo.get_by_uid(uid)
    if not device:
        device = await device_repo.create_or_update(
            uid=uid,
            train_number=data.train_number,
            coach_number=coach,
            name=f"{data.name} Coach {coach}"
        )
        # Create primary tank
        await tank_repo.create(
            device_id=device.id,
            tank_index=1,
            name=f"Coach {coach} Primary Tank",
            capacity_liters=data.tank_capacity or 20.0
        )

    return {"message": "Train registered successfully", "train_number": data.train_number}


@router.delete("/{train_number}")
async def delete_train(train_number: str, db: AsyncSession = Depends(get_db)):
    """Remove a train from the fleet registry."""
    if train_number in TRAIN_METADATA:
        del TRAIN_METADATA[train_number]

    # Delete devices and associated tanks
    await db.execute(delete(Device).where(Device.train_number == train_number))
    await db.commit()

    return {"message": f"Train {train_number} deleted successfully"}

