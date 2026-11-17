"""System diagnostics and informational endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter
from backend import config
from backend.schemas.telemetry import SystemInfoResponse
from backend.services.storage_service import storage_service

router = APIRouter(prefix="/api/system", tags=["System"])


@router.get(
    "/info",
    response_model=SystemInfoResponse,
    summary="Get System Diagnostics and Storage Information",
    description="Public diagnostic endpoint providing uptime, version, and memory storage statistics.",
)
async def get_system_info():
    """Retrieve operational diagnostics and storage metrics."""
    stats = storage_service.get_stats()
    return SystemInfoResponse(
        status="online",
        application=config.APP_TITLE,
        version=config.APP_VERSION,
        environment=config.ENVIRONMENT,
        uptime_seconds=stats["uptime_seconds"],
        server_time=datetime.now(timezone.utc).isoformat(),
        storage=stats,
    )
