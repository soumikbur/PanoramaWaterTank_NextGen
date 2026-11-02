"""API v1 Router aggregation."""
from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.devices import router as devices_router
from app.api.v1.tanks import router as tanks_router
from app.api.v1.telemetry import router as telemetry_router
from app.api.v1.alarms import router as alarms_router
from app.api.v1.settings import router as settings_router
from app.api.v1.export import router as export_router
from app.api.v1.health import router as health_router
from app.api.v1.ws import router as ws_router
from app.api.v1.trains import router as trains_router
from app.api.v1.users import router as users_router
from app.api.v1.location import router as location_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(devices_router)
api_router.include_router(tanks_router)
api_router.include_router(telemetry_router)
api_router.include_router(alarms_router)
api_router.include_router(settings_router)
api_router.include_router(export_router)
api_router.include_router(health_router)
api_router.include_router(ws_router)
api_router.include_router(trains_router)
api_router.include_router(users_router)
api_router.include_router(location_router)
