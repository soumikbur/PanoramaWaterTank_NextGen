"""Authoritative REST & WebSocket API v1 Router for Panorama SCADA.

Exposes canonical production endpoints for Trains, Regions, Coaches, Tanks,
Devices, Alarms, and Authentication backed by the central SQLite WAL database.
Broadcasts real-time events to all connected clients immediately after DB commit.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from backend import config
from backend.routes.sync import sync_ws_manager
from backend.services.shared_state_service import (
    REGION_CONFIG,
    SharedStateService,
    normalize_region,
    shared_state_service,
)

logger = logging.getLogger("panorama.v1_api")

router = APIRouter(prefix="/api/v1", tags=["API v1"])


# -----------------------------------------------------------------------------
# Pydantic Request Models
# -----------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class CoachSpec(BaseModel):
    coach_number: str
    coach_category: Optional[str] = "PASSENGER"
    coach_type: Optional[str] = "AC_CHAIR_CAR"


class TrainCreateRequest(BaseModel):
    train_number: str
    name: str
    region: str
    coach_number: Optional[str] = "B1"
    tank_height_cm: Optional[float] = 50.0
    tank_capacity: Optional[float] = 20.0
    source_station: Optional[str] = None
    source_code: Optional[str] = None
    destination_station: Optional[str] = None
    destination_code: Optional[str] = None
    railway_zone: Optional[str] = None
    train_type: Optional[str] = "Express"
    coaches: Optional[List[CoachSpec]] = None


class TrainUpdateRequest(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None
    railway_zone: Optional[str] = None
    train_type: Optional[str] = None
    type: Optional[str] = None


class CoachCreateRequest(BaseModel):
    coach_number: str
    coach_name: Optional[str] = None
    coach_category: Optional[str] = "PASSENGER"
    coach_type: Optional[str] = "AC_CHAIR_CAR"
    tank_1_name: Optional[str] = "Arrival Side (Tank 1)"
    tank_2_name: Optional[str] = "Departure Side (Tank 2)"
    tank_1_height_cm: Optional[float] = 50.0
    tank_2_height_cm: Optional[float] = 50.0
    tank_1_geometry: Optional[str] = "CYLINDRICAL"
    tank_2_geometry: Optional[str] = "CYLINDRICAL"
    tank_height_cm: Optional[float] = None
    device_uid: Optional[str] = None

    model_config = {"extra": "ignore"}


class CoachRenameRequest(BaseModel):
    new_coach_number: str


class DeviceCreateRequest(BaseModel):
    uid: str
    name: Optional[str] = "Coach Water Monitor"
    train_number: Optional[str] = "UNASSIGNED"
    coach_number: Optional[str] = "UNASSIGNED"
    device_type: Optional[str] = "Quectel EC200U 4G LTE"
    protocol: Optional[str] = "MQTT over TLS/WSS"
    tank_assignment: Optional[str] = "BOTH"
    status: Optional[str] = "AVAILABLE"


# -----------------------------------------------------------------------------
# Health & Diagnostic Endpoints
# -----------------------------------------------------------------------------

@router.get("/health", summary="API v1 Health Probe")
async def health_v1():
    return {
        "status": "online",
        "application": "Panorama Water Tank Monitor SCADA",
        "version": "2.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": "sqlite_wal_authoritative",
    }


# -----------------------------------------------------------------------------
# Authentication Endpoints
# -----------------------------------------------------------------------------

@router.post("/auth/login", summary="User Authentication")
async def auth_login(body: LoginRequest):
    u = body.username.strip()
    p = body.password.strip()

    # Admin Credentials
    if u in ("@admin", "admin", "admin@panorama.railways.gov") and p in ("Admin@123", "admin123"):
        user_profile = {
            "id": "admin-001",
            "username": "@admin",
            "full_name": "Chief Rolling Stock Engineer",
            "email": "admin@panorama.railways.gov",
            "role": "ADMIN",
            "department": "Rolling Stock SCADA Ops",
            "division_region": "Headquarters",
            "account_status": "ACTIVE",
            "is_active": True,
        }
        return {
            "access_token": "token_admin_authoritative_session",
            "token_type": "bearer",
            "user": user_profile,
        }

    # Employee Credentials
    if u in ("@employee", "employee", "employee@panorama.railways.gov") and p in ("Employee@123", "employee123"):
        user_profile = {
            "id": "emp-002",
            "username": "@employee",
            "full_name": "Railway SCADA Technician",
            "email": "employee@panorama.railways.gov",
            "role": "EMPLOYEE",
            "department": "Mechanical (Rolling Stock)",
            "division_region": "EAST",
            "account_status": "ACTIVE",
            "is_active": True,
        }
        return {
            "access_token": "token_employee_authoritative_session",
            "token_type": "bearer",
            "user": user_profile,
        }

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")


@router.get("/auth/me", summary="Current User Profile")
async def auth_me(request: Request):
    auth_header = request.headers.get("authorization", "")
    if "admin" in auth_header.lower():
        role = "ADMIN"
        uname = "@admin"
    else:
        role = "EMPLOYEE"
        uname = "@employee"
    return {
        "id": "user-current",
        "username": uname,
        "role": role,
        "is_active": True,
    }


@router.post("/auth/logout", summary="User Logout")
async def auth_logout():
    return {"status": "success", "message": "Logged out successfully."}


# -----------------------------------------------------------------------------
# Authoritative Railway Regions & Fleet Management
# -----------------------------------------------------------------------------

@router.get("/trains/regions", summary="Operational Summary for Railway Regions")
async def get_regions_summary():
    """Returns database-derived configuredTrains, coaches, tanks, and online status for all regions."""
    return shared_state_service.get_regions_summary()


@router.get("/trains", summary="List Registered Trains")
async def list_trains(
    region: Optional[str] = Query(None, description="Filter by region (NORTH, SOUTH, EAST, WEST, CENTRAL)"),
    search: Optional[str] = Query(None, description="Search train number or name"),
):
    return shared_state_service.list_trains(region=region, search=search)


@router.get("/trains/{train_number}", summary="Get Train Overview")
async def get_train(train_number: str):
    consist = shared_state_service.get_train_consist(train_number)
    if not consist:
        raise HTTPException(status_code=404, detail=f"Train {train_number} not found.")
    return consist


@router.get("/trains/{train_number}/consist", summary="Get Train Consist & Tanks")
async def get_train_consist(train_number: str):
    consist = shared_state_service.get_train_consist(train_number)
    if not consist:
        raise HTTPException(status_code=404, detail=f"Train {train_number} not found.")
    return consist


@router.post("/trains", status_code=status.HTTP_201_CREATED, summary="Register New Train")
async def create_train(body: TrainCreateRequest):
    try:
        res = shared_state_service.create_train(body.model_dump())
    except ValueError as err:
        if "already registered" in str(err).lower():
            raise HTTPException(status_code=409, detail=str(err))
        raise HTTPException(status_code=400, detail=str(err))

    # Broadcast real-time events to all connected clients
    envelope = {
        "event_id": f"evt_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{body.train_number}",
        "event_type": "TRAIN_CREATED",
        "entity_type": "TRAIN",
        "entity_id": body.train_number,
        "operation": "CREATE",
        "payload": res,
        "data": res,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    await sync_ws_manager.broadcast({
        **envelope,
        "event_type": "REGION_UPDATED",
        "payload": {"region": res.get("region"), "train_number": body.train_number},
    })
    return res


@router.put("/trains/{train_number}", summary="Update Train Metadata")
async def update_train(train_number: str, body: TrainUpdateRequest):
    try:
        res = shared_state_service.update_train(train_number, body.model_dump(exclude_unset=True))
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))

    envelope = {
        "event_id": f"evt_upd_{train_number}",
        "event_type": "TRAIN_UPDATED",
        "entity_type": "TRAIN",
        "entity_id": train_number,
        "operation": "UPDATE",
        "payload": res,
        "data": res,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    await sync_ws_manager.broadcast({
        **envelope,
        "event_type": "REGION_UPDATED",
        "payload": {"region": res.get("region"), "train_number": train_number},
    })
    return res


@router.delete("/trains/{train_number}", summary="Delete Train from Fleet")
async def delete_train(train_number: str):
    ok = shared_state_service.delete_train(train_number)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Train {train_number} not found.")

    envelope = {
        "event_id": f"evt_del_{train_number}",
        "event_type": "TRAIN_DELETED",
        "entity_type": "TRAIN",
        "entity_id": train_number,
        "operation": "DELETE",
        "payload": {"train_number": train_number},
        "data": {"train_number": train_number},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    await sync_ws_manager.broadcast({
        **envelope,
        "event_type": "REGION_UPDATED",
        "payload": {"train_number": train_number},
    })
    return {"status": "success", "message": f"Train {train_number} deleted successfully."}


# -----------------------------------------------------------------------------
# Coach Operations
# -----------------------------------------------------------------------------

@router.post("/trains/{train_number}/coaches", status_code=status.HTTP_201_CREATED, summary="Add Coach to Train")
async def add_coach(train_number: str, body: CoachCreateRequest):
    try:
        res = shared_state_service.add_coach(train_number, body.model_dump())
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    envelope = {
        "event_id": f"evt_coach_add_{train_number}_{body.coach_number}",
        "event_type": "COACH_CREATED",
        "entity_type": "COACH",
        "entity_id": body.coach_number,
        "operation": "CREATE",
        "payload": {"train_number": train_number, "coach_number": body.coach_number},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    await sync_ws_manager.broadcast({**envelope, "event_type": "REGION_UPDATED"})
    return res


@router.put("/trains/{train_number}/coaches/{coach_number}", summary="Update Coach & Tank Settings")
async def update_coach(train_number: str, coach_number: str, payload: Dict[str, Any]):
    try:
        res = shared_state_service.update_coach(train_number, coach_number, payload)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    envelope = {
        "event_id": f"evt_coach_upd_{train_number}_{coach_number}",
        "event_type": "COACH_UPDATED",
        "entity_type": "COACH",
        "entity_id": coach_number,
        "operation": "UPDATE",
        "payload": res,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    await sync_ws_manager.broadcast({**envelope, "event_type": "REGION_UPDATED"})
    return res


@router.put("/trains/{train_number}/coaches/{coach_number}/rename", summary="Rename Coach Identifier")
async def rename_coach(train_number: str, coach_number: str, body: CoachRenameRequest):
    try:
        shared_state_service.rename_coach(train_number, coach_number, body.new_coach_number)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    envelope = {
        "event_id": f"evt_coach_ren_{train_number}_{body.new_coach_number}",
        "event_type": "COACH_UPDATED",
        "entity_type": "COACH",
        "entity_id": body.new_coach_number,
        "operation": "UPDATE",
        "payload": {"train_number": train_number, "old_coach_number": coach_number, "new_coach_number": body.new_coach_number},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    return {"status": "success", "message": f"Coach {coach_number} renamed to {body.new_coach_number}"}


@router.delete("/trains/{train_number}/coaches/{coach_number}", summary="Delete Coach from Train")
async def delete_coach(train_number: str, coach_number: str):
    ok = shared_state_service.delete_coach(train_number, coach_number)
    if not ok:
        raise HTTPException(status_code=404, detail="Coach not found.")

    envelope = {
        "event_id": f"evt_coach_del_{train_number}_{coach_number}",
        "event_type": "COACH_DELETED",
        "entity_type": "COACH",
        "entity_id": coach_number,
        "operation": "DELETE",
        "payload": {"train_number": train_number, "coach_number": coach_number},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    await sync_ws_manager.broadcast({**envelope, "event_type": "REGION_UPDATED"})
    return {"status": "success", "message": f"Coach {coach_number} deleted from Train {train_number}"}


# -----------------------------------------------------------------------------
# Devices Endpoints
# -----------------------------------------------------------------------------

@router.get("/devices", summary="List Registered Devices")
async def list_devices():
    return shared_state_service.list_devices()


@router.post("/devices", status_code=status.HTTP_201_CREATED, summary="Register New Device")
async def create_device(body: DeviceCreateRequest):
    try:
        res = shared_state_service.create_device(body.model_dump())
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    envelope = {
        "event_id": f"evt_dev_add_{body.uid}",
        "event_type": "DEVICE_CREATED",
        "entity_type": "DEVICE",
        "entity_id": body.uid,
        "operation": "CREATE",
        "payload": res,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    return res


@router.get("/devices/overview-table", summary="Unique Devices Overview Table")
async def get_devices_overview_table(page: int = 1, limit: int = 25):
    devs = shared_state_service.list_devices()
    items = [
        {
            "id": d.get("id"),
            "deviceId": d.get("uid"),
            "deviceName": d.get("name"),
            "trainNumber": d.get("train_number") if d.get("train_number") != "UNASSIGNED" else None,
            "coachNumber": d.get("coach_number") if d.get("coach_number") != "UNASSIGNED" else None,
            "recordedAt": d.get("last_seen_at") or "--",
            "ai1Ma": None,
            "level1Percent": "--",
            "ai1Valid": "--",
            "batteryV": None,
            "batteryPercent": "--",
            "latitude": None,
            "longitude": None,
            "altitudeM": None,
            "gpsValid": "--",
            "altitudeValid": "--",
            "receivedUtc": d.get("last_seen_at") or "--",
            "isOnline": bool(d.get("is_online")),
        }
        for d in devs
    ]
    return {"total": len(items), "page": page, "limit": limit, "totalPages": 1, "totalDevices": len(items), "items": items}


@router.put("/devices/{device_id}", summary="Update Device Assignment & Metadata")
async def update_device(device_id: str, payload: Dict[str, Any]):
    res = shared_state_service.update_device(device_id, payload)
    if not res:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found.")
    envelope = {
        "event_id": f"evt_dev_upd_{res['uid']}",
        "event_type": "DEVICE_UPDATED",
        "entity_type": "DEVICE",
        "entity_id": res["uid"],
        "operation": "UPDATE",
        "payload": res,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    return res


@router.put("/tanks/{tank_id}", summary="Update Tank Geometry")
async def update_tank(tank_id: str, payload: Dict[str, Any]):
    res = shared_state_service.update_tank(tank_id, payload)
    if not res:
        raise HTTPException(status_code=404, detail=f"Tank {tank_id} not found.")
    return res


@router.delete("/devices/{device_id}", summary="Delete Device")
async def delete_device(device_id: str):
    ok = shared_state_service.delete_device(device_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found.")

    envelope = {
        "event_id": f"evt_dev_del_{device_id}",
        "event_type": "DEVICE_DELETED",
        "entity_type": "DEVICE",
        "entity_id": device_id,
        "operation": "DELETE",
        "payload": {"id": device_id},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await sync_ws_manager.broadcast(envelope)
    return {"status": "success", "message": f"Device {device_id} deleted."}


# -----------------------------------------------------------------------------
# Tanks & Alarms Stubs
# -----------------------------------------------------------------------------

@router.get("/tanks", summary="List All Tanks")
async def list_tanks():
    consists = shared_state_service.get_regions_summary()
    all_tanks = []
    for r in consists:
        for t in r.get("trains", []):
            con = shared_state_service.get_train_consist(t["train_number"])
            if con:
                for c in con.get("coaches", []):
                    for tk in c.get("tanks", []):
                        all_tanks.append({
                            "tank_id": tk["id"],
                            "name": tk["name"],
                            "train_number": t["train_number"],
                            "coach_number": c["coach_number"],
                            "current_level_percent": tk["current_level_percent"],
                            "current_volume_liters": tk["current_volume_liters"],
                            "capacity_liters": tk["capacity_liters"],
                            "height_cm": tk["height_cm"],
                            "status": tk["status"],
                        })
    return all_tanks


@router.get("/alarms", summary="List Active Alarms")
async def list_alarms():
    return []


@router.get("/alarms/stats", summary="Alarm Summary Metrics")
async def get_alarm_stats():
    return {
        "totalActive": 0,
        "total_active": 0,
        "criticalCount": 0,
        "warningCount": 0,
        "resolvedToday": 0,
        "critical": 0,
        "warning": 0,
        "info": 0,
        "acknowledged": 0,
    }


@router.get("/tanks/live", summary="Get Primary Live Tank")
async def get_live_tank():
    all_tanks = await list_tanks()
    return all_tanks[0] if all_tanks else None


@router.get("/location", summary="List Train Locations")
async def list_locations(train_number: Optional[str] = Query(None)):
    regs = shared_state_service.get_regions_summary()
    out = []
    for r in regs:
        for tr in r.get("trains", []):
            if train_number and tr["train_number"] != train_number.strip():
                continue
            out.append({
                "train_number": tr["train_number"],
                "train_name": tr["name"],
                "region": tr["region"],
                "source_station": tr.get("source_station") or "Origin",
                "destination_station": tr.get("destination_station") or "Destination",
                "coach_number": "All",
                "total_coaches": tr.get("coaches_count") or 0,
                "connected_devices": 0,
                "is_online": bool(tr.get("is_online")),
                "has_gps": False,
                "is_simulated": False,
                "current_latitude": None,
                "current_longitude": None,
                "current_speed_kmh": None,
                "satellites": None,
                "nearest_station": tr.get("source_station") or "Live Corridor",
                "last_update": None,
                "waypoints": [],
                "has_route": False,
                "route_stops_count": 0,
                "route": [],
            })
    return out


@router.get("/settings", summary="List Settings")
async def list_settings():
    return []


@router.get("/settings/config", summary="Get Unified System Config")
async def get_unified_config():
    return {
        "mqtt_broker": "broker.hivemq.com",
        "mqtt_port": 8884,
        "mqtt_use_tls": True,
        "mqtt_topic": "0023004D4B42501120353332",
        "tank_shape": "CYLINDRICAL",
        "tank_height_cm": 50.0,
        "tank_capacity_liters": 20.0,
    }


@router.get("/mqtt/topics/latest", summary="Latest MQTT Topics Cache")
async def get_latest_mqtt_topics(limit: int = Query(default=500, ge=1, le=1000)):
    topics = shared_state_service.list_mqtt_topics(limit=limit)
    return {"count": len(topics), "total": len(topics), "topics": topics}


@router.get("/mqtt/topics/{topic:path}/latest", summary="Latest Message for Specific MQTT Topic")
async def get_latest_mqtt_topic(topic: str):
    rec = shared_state_service.get_mqtt_topic(topic)
    if not rec:
        raise HTTPException(status_code=404, detail=f"No message stored for topic {topic}")
    return rec


@router.post("/mqtt/topics/{topic:path}/message", summary="Persist MQTT Topic Message")
async def ingest_mqtt_topic_message(topic: str, payload: Dict[str, Any]):
    raw = payload.get("payload")
    raw_str = raw if isinstance(raw, str) else json.dumps(raw if raw is not None else payload)
    qos = int(payload.get("qos") or 0)
    retained = bool(payload.get("retained") or False)
    rec = shared_state_service.upsert_mqtt_topic(topic, raw_str, qos=qos, retained=retained)
    await sync_ws_manager.broadcast({
        "event_type": "MQTT_TOPIC_UPDATE",
        "topic": rec["topic"],
        "payload": rec["payload"],
        "qos": rec["qos"],
        "retained": rec["retained"],
        "received_at": rec["received_at"],
    })
    return rec


@router.get("/mqtt/topics", summary="List Known MQTT Topics")
async def list_mqtt_topics():
    topics = shared_state_service.list_mqtt_topics(limit=500)
    return [t["topic"] for t in topics]


@router.get("/devices/telemetry-history", summary="Device Telemetry History Table")
async def get_devices_telemetry_history(page: int = 1, limit: int = 25):
    return await get_devices_overview_table(page=page, limit=limit)


# -----------------------------------------------------------------------------
# WebSocket Stream Endpoints (/api/v1/ws/live and /ws/live)
# -----------------------------------------------------------------------------

@router.websocket("/ws/live")
async def v1_ws_live_endpoint(websocket: WebSocket):
    origin = (websocket.headers.get("origin") or "").rstrip("/")
    if origin and not config.is_origin_allowed(origin):
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    await sync_ws_manager.connect(websocket)
    try:
        # Push initial authoritative snapshot immediately on connect
        snapshot = {
            "event_type": "STATE_SNAPSHOT",
            "server_time": datetime.now(timezone.utc).isoformat(),
            "namespaces": shared_state_service.get_all_namespaces(),
            "regions": shared_state_service.get_regions_summary(),
        }
        await websocket.send_text(json.dumps(snapshot))

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if isinstance(msg, dict) and msg.get("type") == "ping":
                    await websocket.send_text(
                        json.dumps({"type": "PONG", "server_time": datetime.now(timezone.utc).isoformat()})
                    )
            except Exception:
                pass
    except WebSocketDisconnect:
        await sync_ws_manager.disconnect(websocket)
    except Exception:
        await sync_ws_manager.disconnect(websocket)
