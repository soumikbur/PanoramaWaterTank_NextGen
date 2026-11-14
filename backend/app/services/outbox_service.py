"""Background worker service to flush transactional outbox events to MQTT and WebSocket."""
import asyncio
import json
import logging
from typing import Optional
from app.core.database import AsyncSessionLocal
from app.repositories.outbox_repo import OutboxRepository
from app.services.sync_broadcaster import broadcast_sync_event

logger = logging.getLogger("panorama.outbox_service")


async def flush_outbox_events(batch_size: int = 50) -> int:
    """Read pending outbox events and broadcast them to MQTT and WebSocket."""
    count = 0
    async with AsyncSessionLocal() as session:
        try:
            repo = OutboxRepository(session)
            events = await repo.get_pending(limit=batch_size)
            if not events:
                return 0

            for ev in events:
                try:
                    payload = json.loads(ev.payload_json) if ev.payload_json else {}
                    await broadcast_sync_event(
                        event_type=ev.event_type,
                        payload=payload,
                        entity_type=ev.entity_type,
                        entity_id=ev.entity_id,
                        operation=ev.operation,
                    )
                    await repo.mark_published(ev.id)
                    count += 1
                except Exception as ex:
                    logger.warning(f"Error publishing outbox event {ev.event_id}: {ex}")
                    await repo.increment_retry(ev.id, error_msg=str(ex))

            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Outbox flush iteration failed: {e}")
    return count


async def outbox_worker_loop(interval_seconds: float = 3.0) -> None:
    """Continuously flush outbox events with resilient error backoff."""
    logger.info("Outbox worker loop started.")
    while True:
        try:
            flushed = await flush_outbox_events()
            if flushed > 0:
                logger.debug(f"Flushed {flushed} outbox event(s).")
        except asyncio.CancelledError:
            logger.info("Outbox worker loop cancelled.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in outbox worker loop: {e}")
        await asyncio.sleep(interval_seconds)
