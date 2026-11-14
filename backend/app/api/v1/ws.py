"""WebSocket Live Stream Router."""
import json
import logging
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.websocket.manager import ws_manager

logger = logging.getLogger("panorama.api.ws")
router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/live")
async def websocket_live_stream(websocket: WebSocket):
    """Real-time live WebSocket endpoint broadcasting telemetry and alarm events."""
    await ws_manager.connect(websocket)
    try:
        # Send immediate connection acknowledgment JSON frame
        await websocket.send_text(json.dumps({
            "event": "CONNECTED",
            "data": {
                "status": "CONNECTED",
                "timestamp": time.time(),
                "clientCount": ws_manager.client_count
            }
        }))
        while True:
            # Keep connection open and receive optional client messages/subscriptions
            data = await websocket.receive_text()
            logger.debug(f"Received frame from WebSocket client: {data}")
            try:
                msg = json.loads(data) if data.startswith("{") else {"type": data}
                if isinstance(msg, dict) and msg.get("type") in ("ping", "PING"):
                    await websocket.send_text(json.dumps({
                        "event": "PONG",
                        "data": {
                            "type": "pong",
                            "timestamp": time.time()
                        }
                    }))
            except Exception:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"WebSocket client disconnected: {e}")
        ws_manager.disconnect(websocket)

