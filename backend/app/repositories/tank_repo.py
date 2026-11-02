"""Tank repository for database access."""
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.tank import Tank


class TankRepository:
    """Async repository for Tank entity."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, tank_id: str) -> Optional[Tank]:
        stmt = select(Tank).where(Tank.id == tank_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_device_and_index(self, device_id: str, tank_index: int = 1) -> Optional[Tank]:
        stmt = select(Tank).where(
            Tank.device_id == device_id,
            Tank.tank_index == tank_index
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_device(self, device_id: str) -> List[Tank]:
        stmt = select(Tank).where(Tank.device_id == device_id).order_by(Tank.tank_index)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_first_primary(self) -> Optional[Tank]:
        """Fetch the first primary tank for the main dashboard view."""
        stmt = select(Tank).where(Tank.tank_index == 1).limit(1)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

