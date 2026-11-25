"""Centralized /api/sync/* compatibility endpoints backed by authoritative SQLAlchemy DB."""
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.coach import Coach
from app.models.device import Device
from app.models.train import Train
from app.repositories.device_repo import DeviceRepository
from app.websocket.manager import ws_manager

router = APIRouter(prefix="/api/sync", tags=["Sync"])


async def _build_fleet_snapshot(db: AsyncSession) -> dict:
    trains = (
        await db.execute(select(Train).where(Train.is_deleted == False).order_by(Train.train_number))  # noqa: E712
    ).scalars().all()
    coaches = (
        await db.execute(select(Coach).where(Coach.is_deleted == False).order_by(Coach.position))  # noqa: E712
    ).scalars().all()
    devices = await DeviceRepository(db).list_all()
    dev_by_uid = {d.uid: d for d in devices}

    coaches_by_train: dict[str, list] = {}
    for c in coaches:
        coaches_by_train.setdefault(c.train_number, []).append(c)

    trains_map = {}
    for tr in trains:
        rel_coaches = coaches_by_train.get(tr.train_number, [])
        coaches_list = []
        any_online = False
        for rc in rel_coaches:
            dev = dev_by_uid.get(rc.device_uid) if rc.device_uid else None
            c_online = bool(dev and dev.is_online)
            if c_online:
                any_online = True
            coaches_list.append({
                "coach_number": rc.coach_number,
                "coach_name": rc.coach_name or f"Coach {rc.coach_number}",
                "coach_category": rc.coach_category,
                "coach_type": rc.coach_type,
                "device_uid": rc.device_uid or "",
                "is_online": c_online,
                "hardware_version": dev.hardware_version if dev else "Standard WLI Node",
                "tanks": [
                    {
                        "id": f"tank-{tr.train_number}-{rc.coach_number}-{idx}",
                        "tank_index": idx,
                        "name": "Arrival Side (Tank 1)" if idx == 1 else "Departure Side (Tank 2)",
                        "capacity_liters": tr.tank_capacity_liters or 500.0,
                        "height_cm": tr.tank_height_cm or 50.0,
                        "current_level_percent": 0.0,
                        "current_volume_liters": 0.0,
                        "status": "NORMAL",
                    }
                    for idx in (1, 2)
                ],
            })
        c_count = len(coaches_list)
        t_count = c_count * 2
        trains_map[tr.train_number] = {
            "train": {
                "train_number": tr.train_number,
                "name": tr.name,
                "type": tr.train_type or "Express",
                "coaches_count": c_count,
                "tanks_count": t_count,
                "is_online": any_online,
                "status": "All Normal",
                "active_alarms": 0,
                "region": tr.region,
                "source_station": tr.source_station,
                "source_code": tr.source_code,
                "destination_station": tr.destination_station,
                "destination_code": tr.destination_code,
                "railway_zone": tr.railway_zone,
                "total_coaches": c_count,
                "has_official_composition": bool(tr.has_official_composition),
                "tank_height_cm": tr.tank_height_cm,
                "tank_capacity_liters": tr.tank_capacity_liters,
            },
            "consist": {
                "train_number": tr.train_number,
                "name": tr.name,
                "region": tr.region,
                "coaches_count": c_count,
                "tanks_count": t_count,
                "online_status": any_online,
                "active_alarms_count": 0,
                "coaches": coaches_list,
                "source_station": tr.source_station,
                "source_code": tr.source_code,
                "destination_station": tr.destination_station,
                "destination_code": tr.destination_code,
                "railway_zone": tr.railway_zone,
                "train_type": tr.train_type or "Express",
                "total_coaches": c_count,
                "has_official_composition": bool(tr.has_official_composition),
                "tank_height_cm": tr.tank_height_cm,
                "tank_capacity_liters": tr.tank_capacity_liters,
            },
        }

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    return {
        "namespace": "fleet",
        "version": now_ms,
        "updated_at": now_ms,
        "mutation_id": f"db-fleet-{now_ms}",
        "updated_iso": datetime.now(timezone.utc).isoformat(),
        "data": {
            "version": now_ms,
            "updatedAt": now_ms,
            "trains": trains_map,
            "deletedTrainNumbers": {},
        },
    }


async def _build_devices_snapshot(db: AsyncSession) -> dict:
    devices = await DeviceRepository(db).list_all()
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    dev_list = [
        {
            "uid": d.uid,
            "name": d.name,
            "trainNumber": d.train_number if d.train_number != "UNASSIGNED" else None,
            "coachNumber": d.coach_number if d.coach_number != "UNASSIGNED" else None,
            "registrationStatus": "REGISTERED",
            "assignmentStatus": "ENGAGED" if (d.train_number != "UNASSIGNED" and d.coach_number != "UNASSIGNED") else "AVAILABLE",
            "isOnline": bool(d.is_online),
            "lastSeen": d.last_seen_at.isoformat() if d.last_seen_at else "Awaiting Telemetry",
            "lastSeenTimestamp": int(d.last_seen_at.timestamp() * 1000) if d.last_seen_at else 0,
            "hardwareModel": d.hardware_version or "Cellular WLI Unit",
        }
        for d in devices
    ]
    return {
        "namespace": "devices",
        "version": now_ms,
        "updated_at": now_ms,
        "mutation_id": f"db-devices-{now_ms}",
        "updated_iso": datetime.now(timezone.utc).isoformat(),
        "data": {"version": now_ms, "updatedAt": now_ms, "devices": dev_list, "deletedUids": []},
    }


@router.get("/state")
async def get_sync_state(db: AsyncSession = Depends(get_db)):
    return {
        "status": "ok",
        "server_time": datetime.now(timezone.utc).isoformat(),
        "connected_clients": ws_manager.client_count,
        "namespaces": {
            "fleet": await _build_fleet_snapshot(db),
            "devices": await _build_devices_snapshot(db),
            "settings": None,
            "users": None,
        },
    }


@router.get("/state/{namespace}")
async def get_sync_namespace(namespace: str, db: AsyncSession = Depends(get_db)):
    if namespace == "fleet":
        return await _build_fleet_snapshot(db)
    if namespace == "devices":
        return await _build_devices_snapshot(db)
    if namespace in ("settings", "users"):
        return {"namespace": namespace, "version": 1, "updated_at": 0, "data": None}
    raise HTTPException(status_code=404, detail=f"Unsupported namespace: {namespace}")


@router.websocket("/ws")
async def sync_ws_compat(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            if "ping" in raw.lower():
                await websocket.send_text(json.dumps({"type": "PONG", "server_time": datetime.now(timezone.utc).isoformat()}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)
