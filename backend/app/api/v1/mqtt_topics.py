"""MQTT Topics & Persistent Telemetry Registry API Router."""
import json
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.repositories.mqtt_latest_repo import MqttLatestRepository
from app.api.v1.auth import get_current_user_optional
from app.models.user import User
from app.mqtt.client import mqtt_service


router = APIRouter(prefix="/mqtt", tags=["MQTT Topics"])


class IngestMqttMessageRequest(BaseModel):
    payload: Any = Field(..., description="JSON object, array, or raw string payload")
    qos: int = Field(0, ge=0, le=2, description="MQTT Quality of Service")
    retain: bool = Field(True, description="MQTT retain flag (persisted in backend registry)")


@router.get("/topics/latest")
async def get_all_latest_topics(
    limit: int = Query(500, ge=1, le=2000, description="Max topic records to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    """Retrieve the authoritative latest received payload for every known MQTT topic."""
    repo = MqttLatestRepository(db)
    records = await repo.list_all(limit=limit, offset=offset)
    total_count = await repo.count()

    return {
        "status": "success",
        "count": len(records),
        "total": total_count,
        "topics": [r.to_dict() for r in records]
    }


@router.get("/topics")
async def list_known_topics(
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    """List all known MQTT topics with reception metadata."""
    repo = MqttLatestRepository(db)
    records = await repo.list_all(limit=limit, offset=offset)
    total_count = await repo.count()

    return {
        "status": "success",
        "count": len(records),
        "total": total_count,
        "topics": [
            {
                "topic": r.topic,
                "payload_type": r.payload_type,
                "qos": r.qos,
                "retained": r.retained,
                "received_at": r.received_at.isoformat() if r.received_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                "message_sequence": r.message_sequence
            }
            for r in records
        ]
    }


@router.get("/topics/{topic:path}/latest")
async def get_latest_topic_payload(
    topic: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    """Retrieve the latest valid payload for one specific MQTT topic."""
    clean_topic = topic.strip()
    repo = MqttLatestRepository(db)
    record = await repo.get_by_topic(clean_topic)

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Topic '{clean_topic}' not found in latest message registry"
        )

    res = record.to_dict()
    res["status"] = "success"
    return res


@router.post("/topics/{topic:path}/message")
async def publish_or_ingest_topic_message(
    topic: str,
    body: IngestMqttMessageRequest,
    publish_to_broker: bool = Query(True, description="Publish to MQTT broker in addition to database persistence"),
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    """Ingest and persist a message for an MQTT topic, broadcasting to all connected clients."""
    clean_topic = topic.strip()
    if not clean_topic:
        raise HTTPException(status_code=400, detail="Topic cannot be blank")

    payload_str = json.dumps(body.payload, default=str) if isinstance(body.payload, (dict, list)) else str(body.payload)
    is_json = True
    try:
        json.loads(payload_str)
    except Exception:
        is_json = False

    payload_type = "JSON" if is_json else "TEXT"

    repo = MqttLatestRepository(db)
    record = await repo.upsert(
        topic=clean_topic,
        payload=payload_str,
        payload_type=payload_type,
        qos=body.qos,
        retained=body.retain
    )
    await db.commit()

    record_dict = record.to_dict()

    # Broadcast to WebSockets
    try:
        from app.websocket.manager import ws_manager
        await ws_manager.broadcast("MQTT_TOPIC_UPDATE", record_dict)
    except Exception:
        pass

    # Publish to MQTT broker if requested
    if publish_to_broker:
        mqtt_service.publish(
            topic=clean_topic,
            payload=payload_str,
            qos=body.qos,
            retain=body.retain
        )

    return {
        "status": "success",
        "message": f"Message persisted and broadcast for topic '{clean_topic}'",
        "topic": clean_topic,
        "record": record_dict
    }
