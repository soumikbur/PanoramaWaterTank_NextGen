"""Health check endpoints for HTTPS Receiver."""
from datetime import datetime, timezone
from fastapi import APIRouter
from backend import config

router = APIRouter(prefix="/api", tags=["Health"])


@router.get("/health")
async def health_check():
    """Verify backend availability and service health."""
    return {
        "status": "online",
        "application": "Panorama WLI HTTPS Receiver",
        "version": config.APP_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
