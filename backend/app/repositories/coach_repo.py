"""Coach repository for persistent relational train consist access."""
from typing import Optional, List, Dict, Any
from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.coach import Coach
from app.models.base import utc_now


class CoachRepository:
    """Async repository for Coach entity."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, coach_id: str) -> Optional[Coach]:
        stmt = select(Coach).where(Coach.id == coach_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_train_and_coach_number(
        self, train_number: str, coach_number: str, include_deleted: bool = False
    ) -> Optional[Coach]:
        conditions = [
            Coach.train_number == train_number,
            Coach.coach_number == coach_number,
        ]
        if not include_deleted:
            conditions.append(Coach.is_deleted == False)  # noqa: E712
        stmt = select(Coach).where(and_(*conditions))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_device_uid(self, device_uid: str, include_deleted: bool = False) -> Optional[Coach]:
        conditions = [Coach.device_uid == device_uid]
        if not include_deleted:
            conditions.append(Coach.is_deleted == False)  # noqa: E712
        stmt = select(Coach).where(and_(*conditions))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_train(self, train_number: str, include_deleted: bool = False) -> List[Coach]:
        conditions = [Coach.train_number == train_number]
        if not include_deleted:
            conditions.append(Coach.is_deleted == False)  # noqa: E712
        stmt = select(Coach).where(and_(*conditions)).order_by(Coach.position, Coach.created_at)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(
        self,
        train_id: str,
        train_number: str,
        coach_number: str,
        coach_name: Optional[str] = None,
        coach_category: str = "PASSENGER",
        coach_type: str = "AC_CHAIR_CAR",
        position: int = 1,
        device_uid: Optional[str] = None,
    ) -> Coach:
        # Idempotently check if active or previously deleted coach exists
        existing = await self.get_by_train_and_coach_number(train_number, coach_number, include_deleted=True)
        if existing:
            existing.train_id = train_id
            existing.coach_name = coach_name or existing.coach_name
            existing.coach_category = coach_category
            existing.coach_type = coach_type
            existing.position = position
            if device_uid is not None:
                existing.device_uid = device_uid
            existing.is_deleted = False
            existing.updated_at = utc_now()
            await self.session.flush()
            return existing

        coach = Coach(
            train_id=train_id,
            train_number=train_number,
            coach_number=coach_number,
            coach_name=coach_name or f"Coach {coach_number}",
            coach_category=coach_category,
            coach_type=coach_type,
            position=position,
            device_uid=device_uid,
            is_deleted=False,
        )
        self.session.add(coach)
        await self.session.flush()
        return coach

    async def reorder_coaches(self, train_number: str, ordered_coach_numbers: List[str]) -> List[Coach]:
        """Update position for all coaches in a train according to given list."""
        for seq, c_num in enumerate(ordered_coach_numbers, start=1):
            stmt = (
                update(Coach)
                .where(Coach.train_number == train_number, Coach.coach_number == c_num, Coach.is_deleted == False)  # noqa: E712
                .values(position=seq, updated_at=utc_now())
            )
            await self.session.execute(stmt)
        await self.session.flush()
        return await self.list_by_train(train_number)

    async def delete_coach(self, coach: Coach, hard: bool = False) -> None:
        """Soft delete (default) or hard delete coach."""
        if hard:
            await self.session.delete(coach)
        else:
            coach.is_deleted = True
            coach.updated_at = utc_now()
        await self.session.flush()
