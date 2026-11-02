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

    async def list_all(self) -> List[Tank]:
        stmt = select(Tank).order_by(Tank.tank_index, Tank.created_at)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(
        self,
        device_id: str,
        tank_index: int = 1,
        name: str = "Primary Water Tank",
        capacity_liters: float = 20.0,
        height_cm: float = 50.0,
        area_m2: float = 0.04
    ) -> Tank:
        tank = Tank(
            device_id=device_id,
            tank_index=tank_index,
            name=name,
            capacity_liters=capacity_liters,
            height_cm=height_cm,
            area_m2=area_m2,
        )
        self.session.add(tank)
        await self.session.flush()
        return tank

    async def get_first_primary(self) -> Optional[Tank]:
        """Fetch the first primary tank for the main dashboard view."""
        stmt = select(Tank).where(Tank.tank_index == 1).limit(1)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

