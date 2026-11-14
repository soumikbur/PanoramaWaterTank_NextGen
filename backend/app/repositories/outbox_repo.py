"""Repository for managing Transactional Outbox synchronization events."""
import json
import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.outbox import SyncOutboxEvent
from app.models.base import utc_now


class OutboxRepository:
    """Async repository for SyncOutboxEvent entity."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_event(
        self,
        event_type: str,
        entity_type: str,
        entity_id: str,
        operation: str,
        payload: Dict[str, Any],
    ) -> SyncOutboxEvent:
        """Create and queue an outbox synchronization event within caller's transaction."""
        event = SyncOutboxEvent(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            operation=operation,
            payload_json=json.dumps(payload, default=str),
            status="PENDING",
            retry_count=0,
            created_at=utc_now(),
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def get_pending(self, limit: int = 100) -> List[SyncOutboxEvent]:
        """Fetch pending outbox events ordered by creation time."""
        stmt = (
            select(SyncOutboxEvent)
            .where(SyncOutboxEvent.status == "PENDING")
            .order_by(SyncOutboxEvent.created_at)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def mark_published(self, event_pk: int) -> None:
        """Mark outbox event as published."""
        stmt = (
            update(SyncOutboxEvent)
            .where(SyncOutboxEvent.id == event_pk)
            .values(status="PUBLISHED", published_at=utc_now())
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def increment_retry(self, event_pk: int, error_msg: Optional[str] = None) -> None:
        """Increment retry count and record error message."""
        stmt = (
            update(SyncOutboxEvent)
            .where(SyncOutboxEvent.id == event_pk)
            .values(
                retry_count=SyncOutboxEvent.retry_count + 1,
                last_error=error_msg,
                status="FAILED" if SyncOutboxEvent.retry_count >= 5 else "PENDING",
            )
        )
        await self.session.execute(stmt)
        await self.session.flush()
