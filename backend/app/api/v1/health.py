"""Health and Diagnostics Router."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import settings
from app.core.database import get_db
from app.mqtt.client import mqtt_service
from app.websocket.manager import ws_manager

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check endpoint validating database, broker, and WebSocket status."""
    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    content = {
        "status": "HEALTHY" if db_ok else "DEGRADED",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": "CONNECTED" if db_ok else "DISCONNECTED",
        "mqttBroker": "CONNECTED" if mqtt_service.is_connected else "DISCONNECTED",
        "activeWebSockets": ws_manager.client_count
    }

    if not db_ok:
        return JSONResponse(status_code=503, content=content)

    return content

