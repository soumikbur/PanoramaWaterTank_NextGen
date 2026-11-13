"""Centralized Authoritative Synchronization Broadcaster for Panorama Water Tank Monitor.

Dispatches structured, deduplicated synchronization events over both
FastAPI WebSocket connections and MQTT broker topics (e.g. HiveMQ)
whenever an authorized user mutates trains, coaches, tanks, or devices.
"""
import json
import logging
import uuid
from typing import Any, Dict, List, Optional
from app.models.base import utc_now
from app.websocket.manager import ws_manager
from app.mqtt.client import mqtt_service

logger = logging.getLogger("panorama.sync_broadcaster")

# Standard MQTT synchronization topics
MQTT_SYNC_EVENTS_TOPIC = "panorama/sync/events"
MQTT_FLEET_SYNC_TOPIC = "panorama/fleet/sync"
MQTT_DEVICE_SYNC_TOPIC = "panorama/devices/sync"
MQTT_CENTRAL_FLEET_TOPIC = "panorama/central/fleet/v2"
MQTT_CENTRAL_DEVICES_TOPIC = "panorama/central/devices/v2"
MQTT_CENTRAL_DELTA_TOPIC = "panorama/central/sync/v2"


async def broadcast_sync_event(
    event_type: str,
    payload: Dict[str, Any],
    retain_mqtt: bool = False,
    additional_topics: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Broadcast an authoritative synchronization event across WebSocket and MQTT.

    Standard Envelope Schema:
    {
        "event_id": str (UUID),
        "event_type": str (e.g. TRAIN_CREATED),
        "timestamp": str (ISO 8601 UTC),
        "data": dict
    }
    """
    event_id = str(uuid.uuid4())
    timestamp = utc_now().isoformat()
    envelope = {
        "event_id": event_id,
        "event_type": event_type,
        "timestamp": timestamp,
        "data": payload,
    }

    # 1. Broadcast over WebSocket to all connected clients
    try:
        await ws_manager.broadcast(event_type, envelope)
    except Exception as e:
        logger.warning(f"WebSocket broadcast failed for {event_type}: {e}")

    # 2. Publish to primary MQTT event stream
    try:
        mqtt_service.publish(MQTT_SYNC_EVENTS_TOPIC, envelope, qos=1, retain=retain_mqtt)
        mqtt_service.publish(f"panorama/sync/{event_type.lower()}", envelope, qos=1, retain=retain_mqtt)
    except Exception as e:
        logger.warning(f"MQTT primary publish failed for {event_type}: {e}")

    # 3. Publish to backward-compatible and central delta topics
    target_topics = list(additional_topics or [])
    if "TRAIN_" in event_type or "COACH_" in event_type or event_type == "REGION_UPDATED":
        if MQTT_FLEET_SYNC_TOPIC not in target_topics:
            target_topics.append(MQTT_FLEET_SYNC_TOPIC)
        if MQTT_CENTRAL_DELTA_TOPIC not in target_topics:
            target_topics.append(MQTT_CENTRAL_DELTA_TOPIC)
    elif "DEVICE_" in event_type:
        if MQTT_DEVICE_SYNC_TOPIC not in target_topics:
            target_topics.append(MQTT_DEVICE_SYNC_TOPIC)
        if MQTT_CENTRAL_DELTA_TOPIC not in target_topics:
            target_topics.append(MQTT_CENTRAL_DELTA_TOPIC)

    for topic in target_topics:
        try:
            mqtt_service.publish(topic, envelope, qos=1, retain=retain_mqtt)
        except Exception as e:
            logger.warning(f"MQTT publish failed for additional topic {topic}: {e}")

    logger.info(f"Broadcasted sync event {event_type} [id={event_id[:8]}]")
    return envelope
