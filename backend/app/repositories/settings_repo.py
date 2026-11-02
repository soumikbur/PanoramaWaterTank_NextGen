"""Settings repository for persisting system configurations."""
import json
from typing import Optional, List, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.setting import Setting


class SettingsRepository:
    """Async repository for Settings entity."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, key: str) -> Optional[Any]:
        stmt = select(Setting).where(Setting.key == key)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()
        if record:
            try:
                return json.loads(record.value)
            except Exception:
                return record.value
        return None

    async def set(self, key: str, value: Any, category: str = "SYSTEM", description: Optional[str] = None) -> Setting:
        stmt = select(Setting).where(Setting.key == key)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()
        val_str = json.dumps(value) if not isinstance(value, str) else value

        if not record:
            record = Setting(
                key=key,
                category=category,
                value=val_str,
                description=description
            )
            self.session.add(record)
        else:
            record.value = val_str
            if description:
                record.description = description
        
        await self.session.flush()
        return record

    async def list_all(self) -> List[Setting]:
        stmt = select(Setting).order_by(Setting.category, Setting.key)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

