"""Tanks API Router."""
import json
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.models.base import utc_now
from app.repositories.tank_repo import TankRepository
from app.repositories.device_repo import DeviceRepository
from app.repositories.telemetry_repo import TelemetryRepository
from app.repositories.alarm_repo import AlarmRepository
from app.schemas.tank import TankLiveStatus, TankUpdate, TankOut
from app.services.calculator import VolumeCalculator
from app.services.alarm_service import AlarmService
from app.api.v1.auth import get_current_admin_user
from app.models.user import User
from app.models.train import Train
from app.services.sync_broadcaster import broadcast_sync_event

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

    trains = (await db.execute(select(Train))).scalars().all()
    configured_trains = {t.train_number for t in trains}
    if not configured_trains:
        return []

    results = []
    tanks = await tank_repo.list_all()
    for tank in tanks:
        device = await device_repo.get_by_id(tank.device_id)
        if (
            not device
            or not device.train_number
            or device.train_number.upper() == "UNASSIGNED"
            or device.train_number not in configured_trains
        ):
            continue
        latest = await telemetry_repo.get_latest_for_tank(tank.id)
        active_alarms = await alarm_repo.list_alarms(status="ACTIVE", device_id=tank.device_id) if device else []
        results.append(_calculate_tank_status(tank, device, latest, active_alarms))

    # Also include configured coach tank slots for configured trains without assigned devices
    for tr in trains:
        raw_comp = getattr(tr, "coach_configuration_json", None)
        try:
            comp = json.loads(raw_comp) if raw_comp else []
        except Exception:
            comp = []
        for c in comp:
            cn = (c.get("coach_number") or "").strip().upper()
            if not cn:
                continue
            if not any(r.trainNumber == tr.train_number and r.coachNumber == cn for r in results):
                h1 = float(c.get("arrival_tank_height_cm") or tr.tank_height_cm or 50.0)
                h2 = float(c.get("departure_tank_height_cm") or tr.tank_height_cm or 50.0)
                c1 = float(c.get("arrival_tank_capacity_liters") or tr.tank_capacity_liters or 20.0)
                c2 = float(c.get("departure_tank_capacity_liters") or tr.tank_capacity_liters or 20.0)
                results.append(TankLiveStatus(
                    tankId=f"slot-{tr.train_number}-{cn}-1",
                    deviceId="UNASSIGNED",
                    deviceUid="UNASSIGNED",
                    trainNumber=tr.train_number,
                    coachNumber=cn,
                    tankName=c.get("tank_1_name") or "Arrival Side (Tank 1)",
                    levelPercent=0.0,
                    rawLevelPercent=0.0,
                    volumeLiters=0.0,
                    heightCm=0.0,
                    capacityLiters=c1,
                    maxHeightCm=h1,
                    crossSectionalAreaM2=0.04,
                    rank="N/A",
                    alarmStatus="AWAITING_TELEMETRY",
                    batteryVoltage=None,
                    isOnline=False,
                    hasTelemetry=False,
                    isStale=False,
                    lastUpdate=None,
                ))
                results.append(TankLiveStatus(
                    tankId=f"slot-{tr.train_number}-{cn}-2",
                    deviceId="UNASSIGNED",
                    deviceUid="UNASSIGNED",
                    trainNumber=tr.train_number,
                    coachNumber=cn,
                    tankName=c.get("tank_2_name") or "Departure Side (Tank 2)",
                    levelPercent=0.0,
                    rawLevelPercent=0.0,
                    volumeLiters=0.0,
                    heightCm=0.0,
                    capacityLiters=c2,
                    maxHeightCm=h2,
                    crossSectionalAreaM2=0.04,
                    rank="N/A",
                    alarmStatus="AWAITING_TELEMETRY",
                    batteryVoltage=None,
                    isOnline=False,
                    hasTelemetry=False,
                    isStale=False,
                    lastUpdate=None,
                ))

    return results


@router.get("/live", response_model=Optional[TankLiveStatus])
async def get_live_tank_status(db: AsyncSession = Depends(get_db)):
    """Retrieve real-time telemetry, volume calculations, and status for the primary tank of an active configured train."""
    tank_repo = TankRepository(db)
    device_repo = DeviceRepository(db)
    telemetry_repo = TelemetryRepository(db)
    alarm_repo = AlarmRepository(db)

    configured_trains = set((await db.execute(select(Train.train_number))).scalars().all())
    if not configured_trains:
        return None

    tanks = await tank_repo.list_all()
    tank = None
    device = None
    for t in tanks:
        if t.tank_index != 1:
            continue
        dev = await device_repo.get_by_id(t.device_id)
        if dev and dev.train_number and dev.train_number.upper() != "UNASSIGNED" and dev.train_number in configured_trains:
            tank = t
            device = dev
            break

    if not tank or not device:
        all_tanks = await list_all_tanks(db)
        return all_tanks[0] if all_tanks else None

    latest = await telemetry_repo.get_latest_for_tank(tank.id)
    active_alarms = await alarm_repo.list_alarms(status="ACTIVE", device_id=device.id)

    return _calculate_tank_status(tank, device, latest, active_alarms)


@router.put("/{tank_id}", response_model=TankOut)
async def update_tank_geometry(
    tank_id: str,
    update_data: TankUpdate,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update tank physical dimensions and alarm thresholds (Admin Only)."""
    if update_data.capacityLiters is not None and update_data.capacityLiters <= 0:
        raise HTTPException(status_code=400, detail="Tank capacity must be a positive number.")
    if update_data.heightCm is not None and update_data.heightCm <= 0:
        raise HTTPException(status_code=400, detail="Tank height must be a positive number.")
    if update_data.areaM2 is not None and update_data.areaM2 <= 0:
        raise HTTPException(status_code=400, detail="Tank area must be a positive number.")

    if tank_id.startswith("slot-"):
        parts = tank_id.split("-")
        tr_no = parts[1]
        c_no = parts[2]
        t_idx = int(parts[3])
        db_train = (await db.execute(select(Train).where(Train.train_number == tr_no))).scalar_one_or_none()
        if not db_train:
            raise HTTPException(status_code=404, detail="Tank not found")
        try:
            comp = json.loads(db_train.coach_configuration_json) if db_train.coach_configuration_json else []
        except Exception:
            comp = []
        for c in comp:
            if c.get("coach_number", "").upper() == c_no.upper():
                if t_idx == 1:
                    if update_data.capacityLiters: c["arrival_tank_capacity_liters"] = update_data.capacityLiters
                    if update_data.heightCm: c["arrival_tank_height_cm"] = update_data.heightCm
                    if update_data.name: c["tank_1_name"] = update_data.name
                else:
                    if update_data.capacityLiters: c["departure_tank_capacity_liters"] = update_data.capacityLiters
                    if update_data.heightCm: c["departure_tank_height_cm"] = update_data.heightCm
                    if update_data.name: c["tank_2_name"] = update_data.name
        db_train.coach_configuration_json = json.dumps(comp)
        await db.commit()

        await broadcast_sync_event(
            event_type="TANK_UPDATED",
            payload={
                "tank_id": tank_id,
                "train_number": tr_no,
                "coach_number": c_no,
                "tank_index": t_idx,
                "name": update_data.name,
                "capacity_liters": update_data.capacityLiters,
                "height_cm": update_data.heightCm,
                "area_m2": update_data.areaM2,
            },
            entity_type="TANK",
            entity_id=tank_id,
            operation="UPDATE",
        )

        return TankOut(
            id=tank_id,
            device_id="UNASSIGNED",
            tank_index=t_idx,
            name=update_data.name or f"Tank {t_idx}",
            tank_type="CYLINDRICAL",
            capacity_liters=update_data.capacityLiters or 20.0,
            height_cm=update_data.heightCm or 50.0,
            area_m2=update_data.areaM2 or 0.04,
            warning_threshold_percent=20.0,
            critical_threshold_percent=10.0,
            overflow_threshold_percent=100.0,
            created_at=utc_now(),
            updated_at=utc_now(),
        )

    tank_repo = TankRepository(db)
    tank = await tank_repo.get_by_id(tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")

    crit = update_data.criticalThresholdPercent if update_data.criticalThresholdPercent is not None else tank.critical_threshold_percent
    warn = update_data.warningThresholdPercent if update_data.warningThresholdPercent is not None else tank.warning_threshold_percent
    over = update_data.overflowThresholdPercent if update_data.overflowThresholdPercent is not None else tank.overflow_threshold_percent

    if crit >= warn:
        raise HTTPException(status_code=400, detail="Critical threshold must be strictly lower than warning threshold.")
    if warn >= over:
        raise HTTPException(status_code=400, detail="Warning threshold must be strictly lower than overflow threshold.")

    if update_data.name is not None:
        tank.name = update_data.name.strip()
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

    await broadcast_sync_event(
        event_type="TANK_UPDATED",
        payload={
            "tank_id": tank.id,
            "device_id": tank.device_id,
            "tank_index": tank.tank_index,
            "name": tank.name,
            "capacity_liters": tank.capacity_liters,
            "height_cm": tank.height_cm,
            "area_m2": tank.area_m2,
        },
        entity_type="TANK",
        entity_id=tank.id,
        operation="UPDATE",
    )

    return TankOut.model_validate(tank)

