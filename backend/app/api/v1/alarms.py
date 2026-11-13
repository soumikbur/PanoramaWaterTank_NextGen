"""Alarms API Router."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from datetime import datetime, timezone
from app.core.database import get_db
from app.repositories.alarm_repo import AlarmRepository
from app.repositories.device_repo import DeviceRepository
from app.schemas.alarm import AlarmOut, AlarmAcknowledge, AlarmStats
from app.models.alarm import Alarm, AlarmHistory
from app.models.train import Train
from app.models.user import User
from app.models.audit import AuditEvent
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/alarms", tags=["Alarms"])


@router.get("", response_model=List[AlarmOut])
async def list_alarms(
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE, ACKNOWLEDGED, RESOLVED"),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve system alarms with lifecycle validation against registered fleet entities."""
    alarm_repo = AlarmRepository(db)
    device_repo = DeviceRepository(db)
    alarms = await alarm_repo.list_alarms(status=status)

    registered_trains_res = await db.execute(select(Train.train_number))
    registered_train_set = {r[0].strip() for r in registered_trains_res.fetchall() if r[0]}

    now = datetime.now(timezone.utc)
    dirty = False
    out_list = []
    for a in alarms:
        device = await device_repo.get_by_id(a.device_id)
        # Check if device belongs to an authoritative registered train and coach
        is_valid_registered = (
            device is not None
            and bool(device.train_number)
            and device.train_number != "UNASSIGNED"
            and device.train_number.strip() in registered_train_set
            and bool(device.coach_number)
            and device.coach_number != "UNASSIGNED"
        )

        if not is_valid_registered and a.status in ("ACTIVE", "ACKNOWLEDGED"):
            # Automatically resolve active/acknowledged alarms for deleted or unregistered entities
            a.status = "RESOLVED"
            a.resolved_at = now
            db.add(
                AlarmHistory(
                    alarm_id=a.id,
                    previous_status="ACTIVE",
                    new_status="RESOLVED",
                    comment="Entity unregistered or train removed from fleet",
                )
            )
            dirty = True
            if status in ("ACTIVE", "ACKNOWLEDGED", "OPEN"):
                continue

        coach = (device.coach_number if device and device.coach_number != "UNASSIGNED" else "N/A")
        out = AlarmOut(
            id=a.id,
            device_id=a.device_id,
            tank_id=a.tank_id,
            coach_number=coach,
            alarm_type=a.alarm_type,
            severity=a.severity,
            trigger_value=a.trigger_value,
            threshold_value=a.threshold_value,
            message=a.message,
            status=a.status,
            triggered_at=a.triggered_at,
            acknowledged_at=a.acknowledged_at,
            acknowledged_by=a.acknowledged_by,
            resolved_at=a.resolved_at
        )
        out_list.append(out)

    if dirty:
        await db.commit()

    return out_list


@router.post("/{alarm_id}/acknowledge", response_model=AlarmOut)
async def acknowledge_alarm(
    alarm_id: str,
    ack_data: AlarmAcknowledge,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Acknowledge an active alarm (Authenticated Users)."""
    alarm_repo = AlarmRepository(db)
    alarm = await alarm_repo.acknowledge_alarm(
        alarm_id=alarm_id,
        user_id=current_user.id,
        comment=ack_data.comment
    )
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found or already acknowledged/resolved")

    # Audit log acknowledgment
    db.add(AuditEvent(
        user_id=current_user.id,
        action="ACKNOWLEDGE_ALARM",
        target_type="ALARM",
        target_id=alarm_id,
        details=f"Acknowledged by {current_user.username}: {ack_data.comment or 'No comment'}"
    ))
    await db.commit()
    return AlarmOut.model_validate(alarm)


@router.get("/stats", response_model=AlarmStats)
async def get_alarm_stats(db: AsyncSession = Depends(get_db)):
    """Retrieve summarized alarm counts, strictly reflecting valid registered fleet entities."""
    alarm_repo = AlarmRepository(db)
    device_repo = DeviceRepository(db)

    registered_trains_res = await db.execute(select(Train.train_number))
    registered_train_set = {r[0].strip() for r in registered_trains_res.fetchall() if r[0]}

    active = await alarm_repo.list_alarms(status="ACTIVE")
    valid_active = []
    for a in active:
        device = await device_repo.get_by_id(a.device_id)
        if (
            device is not None
            and bool(device.train_number)
            and device.train_number != "UNASSIGNED"
            and device.train_number.strip() in registered_train_set
            and bool(device.coach_number)
            and device.coach_number != "UNASSIGNED"
        ):
            valid_active.append(a)

    crit_count = sum(1 for a in valid_active if a.severity == "CRITICAL")
    warn_count = sum(1 for a in valid_active if a.severity == "WARNING")

    # Resolved count
    resolved = await alarm_repo.list_alarms(status="RESOLVED", limit=50)

    return AlarmStats(
        totalActive=len(valid_active),
        criticalCount=crit_count,
        warningCount=warn_count,
        resolvedToday=len(resolved)
    )


@router.post("/clear")
async def clear_alarms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clear alarm history and active/resolved alarms (Authenticated Users)."""
    from sqlalchemy import delete
    from app.models.alarm import AlarmHistory
    await db.execute(delete(AlarmHistory))
    res = await db.execute(delete(Alarm))
    await db.commit()
    return {"cleared": res.rowcount or 0, "message": "Alarm history cleared successfully"}


