"""Telemetry repository for time series database access."""
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.telemetry import TelemetryReading


class TelemetryRepository:
    """Async repository for Telemetry readings."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def insert(self, reading: TelemetryReading) -> TelemetryReading:
        self.session.add(reading)
        await self.session.flush()
        return reading

    async def get_latest_for_device(self, device_id: str) -> Optional[TelemetryReading]:
        stmt = (
            select(TelemetryReading)
            .where(TelemetryReading.device_id == device_id)
            .order_by(desc(TelemetryReading.timestamp))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_latest_for_tank(self, tank_id: str) -> Optional[TelemetryReading]:
        stmt = (
            select(TelemetryReading)
            .where(TelemetryReading.tank_id == tank_id)
            .order_by(desc(TelemetryReading.timestamp))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_history_for_tank(
        self,
        tank_id: str,
        start_time: datetime,
        end_time: Optional[datetime] = None
    ) -> List[TelemetryReading]:
        if end_time is None:
            end_time = datetime.now(timezone.utc)

        stmt = (
            select(TelemetryReading)
            .where(
                TelemetryReading.tank_id == tank_id,
                TelemetryReading.timestamp >= start_time,
                TelemetryReading.timestamp <= end_time
            )
            .order_by(TelemetryReading.timestamp.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

