"""WebSocket Live Stream Router."""
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.websocket.manager import ws_manager

logger = logging.getLogger("panorama.api.ws")
router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/live")
async def websocket_live_stream(websocket: WebSocket):
    """Real-time live WebSocket endpoint broadcasting telemetry and alarm events."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection open and receive optional client messages/subscriptions
            data = await websocket.receive_text()
            logger.debug(f"Received frame from WebSocket client: {data}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket client error: {e}")
        ws_manager.disconnect(websocket)

