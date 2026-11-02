"""WebSocket Hub Connection Manager.

Manages active HMI client connections and broadcasts real-time telemetry frames,
alarm transitions, and device statuses.
"""
import json
import logging
from typing import Set, Dict, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger("panorama.websocket")


class ConnectionManager:
    """Singleton connection manager for real-time WebSockets."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register an incoming WebSocket connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        """Unregister a disconnected WebSocket client."""
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total active: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, data: Dict[str, Any]) -> None:
        """Broadcast a structured JSON event to all connected clients."""
        if not self.active_connections:
            return

        payload = json.dumps({
            "event": event_type,
            "data": data
        }, default=str)

        disconnected: Set[WebSocket] = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected.add(connection)

        for dead in disconnected:
            self.disconnect(dead)

    @property
    def client_count(self) -> int:
        return len(self.active_connections)


ws_manager = ConnectionManager()

