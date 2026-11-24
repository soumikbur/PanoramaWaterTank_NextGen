"""Repository for persistent latest MQTT message records per topic."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import select, func, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.mqtt_message import MqttLatestMessage
from app.models.base import utc_now

logger = logging.getLogger("panorama.repository.mqtt_latest")


class MqttLatestRepository:
    """Async repository managing persistent per-topic latest telemetry registry."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert(
        self,
        topic: str,
        payload: Any,
        payload_type: str = "JSON",
        qos: int = 0,
        retained: bool = False,
        received_at: Optional[datetime] = None
    ) -> MqttLatestMessage:
        """Atomic upsert of the latest valid payload for the specified MQTT topic."""
        clean_topic = topic.strip()
        if not clean_topic:
            raise ValueError("MQTT topic cannot be blank")

        # Normalize payload to text representation for persistent storage
        if isinstance(payload, (dict, list)):
            payload_str = json.dumps(payload, default=str)
            payload_type = "JSON"
        elif isinstance(payload, bytes):
            payload_str = payload.decode("utf-8", errors="replace")
        else:
            payload_str = str(payload)

        # Autodetect JSON if payload_type is default
        if payload_type == "JSON":
            try:
                json.loads(payload_str)
            except Exception:
                payload_type = "TEXT"

        effective_received_at = received_at if received_at is not None else utc_now()
        # Guarantee timezone awareness
        if effective_received_at.tzinfo is None:
            effective_received_at = effective_received_at.replace(tzinfo=timezone.utc)

        for attempt in range(2):
            try:
                async with self.session.begin_nested():
                    stmt = select(MqttLatestMessage).where(MqttLatestMessage.topic == clean_topic)
                    result = await self.session.execute(stmt)
                    existing = result.scalar_one_or_none()

                    if existing:
                        # Out-of-order check: do not overwrite newer message with older timestamp
                        existing_ts = existing.received_at
                        if existing_ts and existing_ts.tzinfo is None:
                            existing_ts = existing_ts.replace(tzinfo=timezone.utc)

                        if existing_ts and effective_received_at < existing_ts:
                            logger.info(
                                "Ignored out-of-order MQTT message for topic %s (incoming: %s < current: %s)",
                                clean_topic,
                                effective_received_at.isoformat(),
                                existing_ts.isoformat(),
                            )
                            return existing

                        existing.payload = payload_str
                        existing.payload_type = payload_type
                        existing.qos = qos
                        existing.retained = bool(retained)
                        existing.received_at = effective_received_at
                        existing.updated_at = utc_now()
                        existing.message_sequence = (existing.message_sequence or 0) + 1
                        await self.session.flush()
                        return existing
                    else:
                        new_record = MqttLatestMessage(
                            topic=clean_topic,
                            payload=payload_str,
                            payload_type=payload_type,
                            qos=qos,
                            retained=bool(retained),
                            received_at=effective_received_at,
                            updated_at=utc_now(),
                            message_sequence=1,
                        )
                        self.session.add(new_record)
                        await self.session.flush()
                        return new_record
            except IntegrityError:
                if attempt == 0:
                    continue
                raise

        raise RuntimeError(f"Failed to upsert MQTT latest record for topic {clean_topic}")

    async def get_by_topic(self, topic: str) -> Optional[MqttLatestMessage]:
        """Fetch the latest record for one specific topic."""
        clean_topic = topic.strip()
        stmt = select(MqttLatestMessage).where(MqttLatestMessage.topic == clean_topic)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 500, offset: int = 0) -> List[MqttLatestMessage]:
        """Fetch all latest topic records, ordered by latest update."""
        stmt = (
            select(MqttLatestMessage)
            .order_by(desc(MqttLatestMessage.updated_at))
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count(self) -> int:
        """Count total known unique topics in the registry."""
        stmt = select(func.count(MqttLatestMessage.id))
        result = await self.session.execute(stmt)
        return result.scalar_one() or 0
