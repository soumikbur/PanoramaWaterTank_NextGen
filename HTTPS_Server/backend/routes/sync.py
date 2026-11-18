"""Centralized Multi-User Synchronization REST & WebSocket Router.

Provides SQLite-persisted shared state endpoints (`/api/sync/state`) and
real-time WebSocket event fan-out (`/api/sync/ws`) so all connected browsers
immediately observe Train, Coach, Tank, Device, Settings, and User changes.
"""
import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from backend import config
from backend.services.shared_state_service import (
    VALID_NAMESPACES,
    VersionConflictError,
    shared_state_service,
)

router = APIRouter(prefix="/api/sync", tags=["Synchronization"])


class SyncStateUpsertRequest(BaseModel):
    event_type: str = Field(default="STATE_UPDATED", max_length=64)
    mutation_id: Optional[str] = Field(default=None, max_length=128)
    entity_id: Optional[str] = Field(default=None, max_length=128)
    expected_version: Optional[int] = Field(default=None, ge=0)
    data: Dict[str, Any]


class SyncConnectionManager:
    """Manages connected WebSocket clients and broadcasts committed DB mutations."""

    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> int:
        payload_text = json.dumps(message)
        async with self._lock:
            targets = list(self._connections)
        if not targets:
            return 0

        # Fan out concurrently with a per-socket timeout so one half-open offline client never blocks healthy browsers
        async def _send_one(ws: WebSocket) -> Optional[WebSocket]:
            try:
                await asyncio.wait_for(ws.send_text(payload_text), timeout=2.0)
                return None
            except Exception:
                return ws

        results = await asyncio.gather(*(_send_one(ws) for ws in targets))
        stale = [ws for ws in results if ws is not None]
        delivered = len(targets) - len(stale)

        if stale:
            async with self._lock:
                for ws in stale:
                    self._connections.discard(ws)

        return delivered

    @property
    def active_count(self) -> int:
        return len(self._connections)


sync_ws_manager = SyncConnectionManager()


@router.get(
    "/state",
    summary="Retrieve All Authoritative Shared State Namespaces",
)
async def get_all_shared_state():
    """Return latest persisted fleet, devices, settings, and users snapshots from SQLite."""
    return {
        "status": "ok",
        "server_time": datetime.now(timezone.utc).isoformat(),
        "connected_clients": sync_ws_manager.active_count,
        "namespaces": shared_state_service.get_all_namespaces(),
    }


@router.get(
    "/state/{namespace}",
    summary="Retrieve Shared State for a Specific Namespace",
)
async def get_namespace_state(namespace: str):
    ns = namespace.strip().lower()
    if ns not in VALID_NAMESPACES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid namespace '{namespace}'. Expected one of: {', '.join(VALID_NAMESPACES)}",
        )
    record = shared_state_service.get_namespace(ns)
    return {
        "status": "ok",
        "server_time": datetime.now(timezone.utc).isoformat(),
        "namespace": ns,
        "record": record,
    }


@router.put(
    "/state/{namespace}",
    summary="Persist Shared State Change and Broadcast to Connected Clients",
)
async def put_namespace_state(namespace: str, body: SyncStateUpsertRequest):
    ns = namespace.strip().lower()
    if ns not in VALID_NAMESPACES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid namespace '{namespace}'. Expected one of: {', '.join(VALID_NAMESPACES)}",
        )

    # Enforce payload size cap even for chunked transfer encoding
    serialized_len = len(json.dumps(body.data, separators=(",", ":")).encode("utf-8"))
    if serialized_len > config.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"State payload exceeds maximum size of {config.MAX_UPLOAD_SIZE} bytes.",
        )

    # 1. Persist atomically to SQLite FIRST (never broadcast before DB commit succeeds)
    try:
        committed = shared_state_service.upsert_namespace(
            namespace=ns,
            payload=body.data,
            event_type=body.event_type,
            mutation_id=body.mutation_id,
            expected_version=body.expected_version,
        )
    except VersionConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )

    # 2. Broadcast committed event + authoritative snapshot to all WebSocket clients
    envelope = {
        "event_id": committed["event_id"],
        "event_type": committed["event_type"],
        "namespace": ns,
        "entity_id": body.entity_id,
        "version": committed["version"],
        "updated_at": committed["updated_at"],
        "mutation_id": committed["mutation_id"],
        "timestamp": committed["timestamp"],
        "data": committed["data"],
    }
    broadcast_count = await sync_ws_manager.broadcast(envelope)

    return {
        "status": "ok",
        "broadcast_clients": broadcast_count,
        **envelope,
    }


@router.websocket("/ws")
async def sync_websocket_endpoint(websocket: WebSocket):
    """Real-time bidirectional WebSocket channel for multi-browser state synchronization."""
    origin = (websocket.headers.get("origin") or "").rstrip("/")
    if origin and origin not in config.CORS_ORIGINS:
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    await sync_ws_manager.connect(websocket)
    try:
        # Push initial authoritative state snapshot immediately upon connect/reconnect
        snapshot = {
            "event_type": "STATE_SNAPSHOT",
            "server_time": datetime.now(timezone.utc).isoformat(),
            "namespaces": shared_state_service.get_all_namespaces(),
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
                elif isinstance(msg, dict) and msg.get("type") == "request_snapshot":
                    await websocket.send_text(
                        json.dumps(
                            {
                                "event_type": "STATE_SNAPSHOT",
                                "server_time": datetime.now(timezone.utc).isoformat(),
                                "namespaces": shared_state_service.get_all_namespaces(),
                            }
                        )
                    )
            except Exception:
                # Ignore malformed client keepalive frames safely
                pass
    except WebSocketDisconnect:
        await sync_ws_manager.disconnect(websocket)
    except Exception:
        await sync_ws_manager.disconnect(websocket)
