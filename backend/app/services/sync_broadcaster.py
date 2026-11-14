"""Centralized Authoritative Synchronization Broadcaster for Panorama Water Tank Monitor.

Dispatches structured, deduplicated synchronization events over both
FastAPI WebSocket connections and MQTT broker topics (e.g. HiveMQ)
whenever an authorized user mutates trains, coaches, tanks, or devices.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
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
MQTT_CENTRAL_SETTINGS_TOPIC = "panorama/central/settings/v2"
MQTT_CENTRAL_USERS_TOPIC = "panorama/central/users/v2"

# Global sequential sync version counter
_sync_version: int = int(datetime.now(timezone.utc).timestamp())


def get_next_sync_version() -> int:
    """Generate monotonically increasing sync version."""
    global _sync_version
    _sync_version += 1
    return _sync_version


def _infer_entity_metadata(event_type: str, payload: Dict[str, Any]) -> tuple[str, str, str]:
    """Infer (entity_type, entity_id, operation) from event_type and payload."""
    upper = event_type.upper()

    # Operations
    if "CREATED" in upper or "ADD" in upper or "REGISTER" in upper:
        op = "CREATE"
    elif "DELETED" in upper or "REMOVE" in upper:
        op = "DELETE"
    elif "REORDER" in upper:
        op = "REORDER"
    elif "ASSIGN" in upper:
        op = "ASSIGN"
    else:
        op = "UPDATE"

    # Entities and IDs
    if "TRAIN" in upper:
        etype = "TRAIN"
        eid = str(payload.get("train_number") or payload.get("train", {}).get("train_number") or "")
    elif "COACH" in upper:
        etype = "COACH"
        eid = str(
            payload.get("new_coach_number")
            or payload.get("coach_number")
            or payload.get("deleted_coach_number")
            or payload.get("coach", {}).get("coach_number")
            or ""
        )
    elif "DEVICE" in upper:
        etype = "DEVICE"
        eid = str(
            payload.get("uid")
            or payload.get("device", {}).get("uid")
            or payload.get("device_id")
            or ""
        )
    elif "TANK" in upper:
        etype = "TANK"
        eid = str(payload.get("tank_id") or payload.get("tank_number") or "TANK-1")
    elif "ALARM" in upper:
        etype = "ALARM"
        eid = str(payload.get("alarm_id") or "")
    elif "SETTING" in upper or "CONFIG" in upper:
        etype = "SETTING"
        eid = "system_config"
    elif "USER" in upper:
        etype = "USER"
        eid = str(payload.get("user_id") or payload.get("username") or "")
    elif "REGION" in upper:
        etype = "TRAIN"
        eid = str(payload.get("train_number") or payload.get("region") or "")
    else:
        etype = "SYSTEM"
        eid = str(payload.get("id") or "")

    return etype, eid, op


async def broadcast_sync_event(
    event_type: str,
    payload: Dict[str, Any],
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    operation: Optional[str] = None,
    mutation_id: Optional[str] = None,
    version: Optional[int] = None,
    retain_mqtt: bool = False,
    additional_topics: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Broadcast an authoritative synchronization event across WebSocket and MQTT.

    Standard Envelope Schema:
    {
        "event_id": str (UUID),
        "event_type": str (e.g. TRAIN_CREATED),
        "entity_type": str (TRAIN, COACH, DEVICE, TANK, ALARM, SETTING, USER),
        "entity_id": str,
        "operation": str (CREATE, UPDATE, DELETE, REORDER, ASSIGN),
        "payload": dict,
        "data": dict,
        "version": int,
        "timestamp": str (ISO 8601 UTC),
        "mutation_id": str
    }
    """
    event_id = str(uuid.uuid4())
    timestamp = utc_now().isoformat()
    current_version = version if version is not None else get_next_sync_version()

    # Determine entity metadata if omitted
    inf_etype, inf_eid, inf_op = _infer_entity_metadata(event_type, payload)
    final_etype = entity_type or inf_etype
    final_eid = entity_id or inf_eid
    final_op = operation or inf_op

    final_mut_id = (
        mutation_id
        or payload.get("mutation_id")
        or f"mut_{int(datetime.now(timezone.utc).timestamp() * 1000)}_{uuid.uuid4().hex[:6]}"
    )

    envelope: Dict[str, Any] = {
        "event_id": event_id,
        "event_type": event_type,
        "entity_type": final_etype,
        "entity_id": final_eid,
        "operation": final_op,
        "payload": payload,
        "data": payload,  # Backward compatibility
        "version": current_version,
        "timestamp": timestamp,
        "mutation_id": final_mut_id,
    }

    # 1. Broadcast over WebSocket to all connected clients
    try:
        await ws_manager.broadcast(event_type, envelope)
        if final_etype in ("TRAIN", "COACH"):
            await ws_manager.broadcast("FLEET_SYNC", envelope)
        elif final_etype == "DEVICE":
            await ws_manager.broadcast("DEVICE_SYNC", envelope)
    except Exception as e:
        logger.warning(f"WebSocket broadcast failed for {event_type}: {e}")

    # 2. Publish to primary MQTT event stream
    try:
        mqtt_service.publish(MQTT_SYNC_EVENTS_TOPIC, envelope, qos=1, retain=retain_mqtt)
        mqtt_service.publish(f"panorama/sync/{final_etype.lower()}", envelope, qos=1, retain=retain_mqtt)
        mqtt_service.publish(f"panorama/sync/{event_type.lower()}", envelope, qos=1, retain=retain_mqtt)
    except Exception as e:
        logger.warning(f"MQTT primary publish failed for {event_type}: {e}")

    # 3. Publish to backward-compatible and central delta topics
    target_topics = list(additional_topics or [])
    if final_etype in ("TRAIN", "COACH"):
        if MQTT_FLEET_SYNC_TOPIC not in target_topics:
            target_topics.append(MQTT_FLEET_SYNC_TOPIC)
        if MQTT_CENTRAL_DELTA_TOPIC not in target_topics:
            target_topics.append(MQTT_CENTRAL_DELTA_TOPIC)
    elif final_etype == "DEVICE":
        if MQTT_DEVICE_SYNC_TOPIC not in target_topics:
            target_topics.append(MQTT_DEVICE_SYNC_TOPIC)
        if MQTT_CENTRAL_DELTA_TOPIC not in target_topics:
            target_topics.append(MQTT_CENTRAL_DELTA_TOPIC)
    elif final_etype == "SETTING":
        if MQTT_CENTRAL_SETTINGS_TOPIC not in target_topics:
            target_topics.append(MQTT_CENTRAL_SETTINGS_TOPIC)
    elif final_etype == "USER":
        if MQTT_CENTRAL_USERS_TOPIC not in target_topics:
            target_topics.append(MQTT_CENTRAL_USERS_TOPIC)

    for topic in target_topics:
        try:
            mqtt_service.publish(topic, envelope, qos=1, retain=retain_mqtt)
        except Exception as e:
            logger.warning(f"MQTT publish failed for additional topic {topic}: {e}")

    logger.info(f"Broadcasted sync event {event_type} [{final_etype}:{final_eid}:{final_op}] [id={event_id[:8]}] [v={current_version}]")
    return envelope
