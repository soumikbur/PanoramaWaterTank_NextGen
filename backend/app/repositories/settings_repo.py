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

    async def upsert(self, key: str, value: Any, category: str = "SYSTEM", description: Optional[str] = None) -> Setting:
        """Idempotent settings upsert handling concurrent initialization across SQLite and PostgreSQL."""
        val_str = json.dumps(value) if not isinstance(value, str) else value
        bind = self.session.bind
        dialect_name = bind.dialect.name if bind else "sqlite"

        if dialect_name == "sqlite":
            from sqlalchemy.dialects.sqlite import insert as sqlite_insert
            stmt = sqlite_insert(Setting).values(
                key=key,
                category=category,
                value=val_str,
                description=description
            ).on_conflict_do_update(
                index_elements=["key"],
                set_={
                    "value": val_str,
                    "category": category,
                    "description": description if description is not None else Setting.description
                }
            )
            await self.session.execute(stmt)
        elif dialect_name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(Setting).values(
                key=key,
                category=category,
                value=val_str,
                description=description
            ).on_conflict_do_update(
                index_elements=["key"],
                set_={
                    "value": val_str,
                    "category": category,
                    "description": description if description is not None else Setting.description
                }
            )
            await self.session.execute(stmt)
        else:
            stmt = select(Setting).where(Setting.key == key)
            result = await self.session.execute(stmt)
            record = result.scalar_one_or_none()
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
                record.category = category
                if description:
                    record.description = description

        await self.session.flush()
        stmt = select(Setting).where(Setting.key == key)
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def set(self, key: str, value: Any, category: str = "SYSTEM", description: Optional[str] = None) -> Setting:
        return await self.upsert(key=key, value=value, category=category, description=description)

    async def list_all(self) -> List[Setting]:
        stmt = select(Setting).order_by(Setting.category, Setting.key)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

