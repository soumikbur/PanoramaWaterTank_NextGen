"""Tanks API Router."""
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.repositories.tank_repo import TankRepository
from app.repositories.device_repo import DeviceRepository
from app.repositories.telemetry_repo import TelemetryRepository
from app.repositories.alarm_repo import AlarmRepository
from app.schemas.tank import TankLiveStatus, TankUpdate, TankOut
from app.services.calculator import VolumeCalculator
from app.services.alarm_service import AlarmService

router = APIRouter(prefix="/tanks", tags=["Tanks"])


def _calculate_tank_status(tank, device, latest, active_alarms) -> TankLiveStatus:
    has_telemetry = latest is not None
    is_stale = False
    if latest:
        raw_level = latest.raw_level_percent
        level = latest.level_percent
        vol = latest.volume_liters
        height = latest.height_cm
        voltage = latest.battery_v1
        ts = latest.timestamp
        # Check if telemetry is older than 30s
        age_seconds = (datetime.now(timezone.utc) - (ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc))).total_seconds()
        is_stale = age_seconds > 30.0
        rank = VolumeCalculator.determine_capacity_rank(level) if level is not None else "N/A"
    else:
        raw_level = None
        level = None
        vol = None
        height = None
        voltage = None
        ts = None
        rank = "N/A"

    alarm_descriptors = [
        {"severity": a.severity, "alarm_type": a.alarm_type}
        for a in active_alarms
    ]
    if active_alarms:
        status_str = AlarmService.determine_overall_status(alarm_descriptors)
    elif not has_telemetry:
        status_str = "AWAITING_TELEMETRY"
    elif is_stale:
        status_str = "STALE_DATA"
    else:
        status_str = "NORMAL"

    return TankLiveStatus(
        tankId=tank.id,
        deviceId=device.id if device else "UNKNOWN",
        deviceUid=device.uid if device else "UNKNOWN",
        trainNumber=device.train_number if device else "—",
        coachNumber=device.coach_number if device else "—",
        tankName=tank.name,
        levelPercent=level,
        rawLevelPercent=raw_level,
        volumeLiters=vol,
        heightCm=height,
        capacityLiters=tank.capacity_liters,
        maxHeightCm=tank.height_cm,
        crossSectionalAreaM2=tank.area_m2,
        rank=rank,
        alarmStatus=status_str,
        batteryVoltage=voltage,
        isOnline=device.is_online if device else False,
        hasTelemetry=has_telemetry,
        isStale=is_stale,
        lastUpdate=ts
    )


@router.get("", response_model=List[TankLiveStatus])
async def list_all_tanks(db: AsyncSession = Depends(get_db)):
    """Retrieve real-time telemetry, volume calculations, and statuses for all fleet tanks."""
    tank_repo = TankRepository(db)
    device_repo = DeviceRepository(db)
    telemetry_repo = TelemetryRepository(db)
    alarm_repo = AlarmRepository(db)

    tanks = await tank_repo.list_all()
    if not tanks:
        # Auto-provision default tank & device if fresh
        device = await device_repo.create_or_update(
            uid=settings.DEFAULT_DEVICE_UID,
            train_number=settings.DEFAULT_TRAIN_NUMBER,
            coach_number=settings.DEFAULT_COACH_NUMBER,
            name="Shatabdi Coach B4 Water System"
        )
        tank1 = await tank_repo.get_by_device_and_index(device.id, 1)
        tanks = [tank1] if tank1 else []

    results = []
    for tank in tanks:
        device = await device_repo.get_by_id(tank.device_id)
        latest = await telemetry_repo.get_latest_for_tank(tank.id)
        active_alarms = await alarm_repo.list_alarms(status="ACTIVE", device_id=tank.device_id) if device else []
        results.append(_calculate_tank_status(tank, device, latest, active_alarms))

    return results


@router.get("/live", response_model=TankLiveStatus)
async def get_live_tank_status(db: AsyncSession = Depends(get_db)):
    """Retrieve real-time telemetry, volume calculations, and status for the primary tank."""
    tank_repo = TankRepository(db)
    device_repo = DeviceRepository(db)
    telemetry_repo = TelemetryRepository(db)
    alarm_repo = AlarmRepository(db)

    tank = await tank_repo.get_first_primary()
    if not tank:
        device = await device_repo.create_or_update(
            uid=settings.DEFAULT_DEVICE_UID,
            train_number=settings.DEFAULT_TRAIN_NUMBER,
            coach_number=settings.DEFAULT_COACH_NUMBER,
            name="Shatabdi Coach B4 Water System"
        )
        tank = await tank_repo.get_by_device_and_index(device.id, 1)

    device = await device_repo.get_by_id(tank.device_id) if tank else None
    latest = await telemetry_repo.get_latest_for_tank(tank.id) if tank else None
    active_alarms = await alarm_repo.list_alarms(status="ACTIVE", device_id=device.id) if device else []

    return _calculate_tank_status(tank, device, latest, active_alarms)


@router.put("/{tank_id}", response_model=TankOut)
async def update_tank_geometry(
    tank_id: str,
    update_data: TankUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update tank physical dimensions and alarm thresholds."""
    tank_repo = TankRepository(db)
    tank = await tank_repo.get_by_id(tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")

    if update_data.name is not None:
        tank.name = update_data.name
    if update_data.capacityLiters is not None:
        tank.capacity_liters = update_data.capacityLiters
    if update_data.heightCm is not None:
        tank.height_cm = update_data.heightCm
    if update_data.areaM2 is not None:
        tank.area_m2 = update_data.areaM2
    if update_data.warningThresholdPercent is not None:
        tank.warning_threshold_percent = update_data.warningThresholdPercent
    if update_data.criticalThresholdPercent is not None:
        tank.critical_threshold_percent = update_data.criticalThresholdPercent
    if update_data.overflowThresholdPercent is not None:
        tank.overflow_threshold_percent = update_data.overflowThresholdPercent

    await db.commit()
    await db.refresh(tank)
    return TankOut.model_validate(tank)

