"""Alarms API Router."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.repositories.alarm_repo import AlarmRepository
from app.repositories.device_repo import DeviceRepository
from app.schemas.alarm import AlarmOut, AlarmAcknowledge, AlarmStats
from app.models.alarm import Alarm

router = APIRouter(prefix="/alarms", tags=["Alarms"])


@router.get("", response_model=List[AlarmOut])
async def list_alarms(
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE, ACKNOWLEDGED, RESOLVED"),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve system alarms with optional status filtering."""
    alarm_repo = AlarmRepository(db)
    device_repo = DeviceRepository(db)
    alarms = await alarm_repo.list_alarms(status=status)

    out_list = []
    for a in alarms:
        device = await device_repo.get_by_id(a.device_id)
        coach = device.coach_number if device else "B4"
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
            resolved_at=a.resolved_at
        )
        out_list.append(out)
    return out_list


@router.post("/{alarm_id}/acknowledge", response_model=AlarmOut)
async def acknowledge_alarm(
    alarm_id: str,
    ack_data: AlarmAcknowledge,
    db: AsyncSession = Depends(get_db)
):
    """Acknowledge an active alarm."""
    alarm_repo = AlarmRepository(db)
    alarm = await alarm_repo.acknowledge_alarm(
        alarm_id=alarm_id,
        comment=ack_data.comment
    )
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found or already acknowledged/resolved")

    await db.commit()
    return AlarmOut.model_validate(alarm)


@router.get("/stats", response_model=AlarmStats)
async def get_alarm_stats(db: AsyncSession = Depends(get_db)):
    """Retrieve summarized alarm counts."""
    alarm_repo = AlarmRepository(db)
    active = await alarm_repo.list_alarms(status="ACTIVE")
    
    crit_count = sum(1 for a in active if a.severity == "CRITICAL")
    warn_count = sum(1 for a in active if a.severity == "WARNING")

    # Resolved count
    resolved = await alarm_repo.list_alarms(status="RESOLVED", limit=50)

    return AlarmStats(
        totalActive=len(active),
        criticalCount=crit_count,
        warningCount=warn_count,
        resolvedToday=len(resolved)
    )

