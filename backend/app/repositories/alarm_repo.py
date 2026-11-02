"""Alarm repository for managing alerts and state transitions."""
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.alarm import Alarm, AlarmHistory


class AlarmRepository:
    """Async repository for Alarm management."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, alarm_id: str) -> Optional[Alarm]:
        stmt = select(Alarm).where(Alarm.id == alarm_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_alarms(
        self,
        status: Optional[str] = None,
        device_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Alarm]:
        stmt = select(Alarm)
        if status:
            if status == "OPEN":
                stmt = stmt.where(Alarm.status.in_(["ACTIVE", "ACKNOWLEDGED"]))
            else:
                stmt = stmt.where(Alarm.status == status)
        if device_id:
            stmt = stmt.where(Alarm.device_id == device_id)
        stmt = stmt.order_by(desc(Alarm.triggered_at)).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_active_by_type(
        self,
        device_id: str,
        tank_id: Optional[str],
        alarm_type: str
    ) -> Optional[Alarm]:
        stmt = select(Alarm).where(
            Alarm.device_id == device_id,
            Alarm.tank_id == tank_id,
            Alarm.alarm_type == alarm_type,
            Alarm.status.in_(["ACTIVE", "ACKNOWLEDGED"])
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_alarm(
        self,
        device_id: str,
        tank_id: Optional[str],
        alarm_type: str,
        severity: str,
        trigger_value: float,
        threshold_value: float,
        message: str
    ) -> Alarm:
        alarm = Alarm(
            device_id=device_id,
            tank_id=tank_id,
            alarm_type=alarm_type,
            severity=severity,
            trigger_value=trigger_value,
            threshold_value=threshold_value,
            message=message,
            status="ACTIVE",
            triggered_at=datetime.now(timezone.utc)
        )
        self.session.add(alarm)
        await self.session.flush()

        # Add initial history event
        history = AlarmHistory(
            alarm_id=alarm.id,
            previous_status="NONE",
            new_status="ACTIVE",
            comment="Alarm triggered by system"
        )
        self.session.add(history)
        await self.session.flush()
        return alarm

    async def acknowledge_alarm(
        self,
        alarm_id: str,
        user_id: Optional[str] = None,
        comment: Optional[str] = None
    ) -> Optional[Alarm]:
        alarm = await self.get_by_id(alarm_id)
        if not alarm or alarm.status != "ACTIVE":
            return alarm

        prev_status = alarm.status
        alarm.status = "ACKNOWLEDGED"
        alarm.acknowledged_at = datetime.now(timezone.utc)
        alarm.acknowledged_by = user_id

        history = AlarmHistory(
            alarm_id=alarm.id,
            previous_status=prev_status,
            new_status="ACKNOWLEDGED",
            comment=comment or "Acknowledged by operator",
            changed_by=user_id
        )
        self.session.add(history)
        await self.session.flush()
        return alarm

    async def resolve_alarm(
        self,
        alarm: Alarm,
        comment: str = "Condition returned to normal"
    ) -> Alarm:
        if alarm.status == "RESOLVED":
            return alarm

        prev_status = alarm.status
        alarm.status = "RESOLVED"
        alarm.resolved_at = datetime.now(timezone.utc)

        history = AlarmHistory(
            alarm_id=alarm.id,
            previous_status=prev_status,
            new_status="RESOLVED",
            comment=comment
        )
        self.session.add(history)
        await self.session.flush()
        return alarm

