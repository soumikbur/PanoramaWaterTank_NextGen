"""FastAPI Main Application Entrypoint.

Initializes FastAPI, configures CORS, handles lifecycle startup/shutdown events,
and registers API routes and WebSockets.
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse

from app.core.config import settings
from app.core.database import init_db
from app.mqtt.client import mqtt_service
from app.api.v1 import api_router
from app.templates.landing import get_landing_html

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("panorama.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle management."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}...")
    
    # 1. Initialize Database Schema
    try:
        await init_db()
        logger.info("Database schema initialized successfully.")
    except Exception as e:
        logger.error(f"Error during database initialization: {e}")

    # 2. Initialize and Start MQTT Client
    try:
        loop = asyncio.get_running_loop()
        mqtt_service.initialize(loop)
        mqtt_service.start()
        logger.info("MQTT Client background thread started.")
    except Exception as e:
        logger.error(f"Failed to start MQTT service: {e}")

    yield

    # Shutdown
    logger.info("Shutting down Panorama Water Tank Monitor...")
    try:
        mqtt_service.stop()
        logger.info("MQTT Client stopped cleanly.")
    except Exception as e:
        logger.error(f"Error stopping MQTT client: {e}")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Next-Generation Railway Coach Water Tank SCADA & HMI Telemetry Backend.",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(api_router)

# Mount static file directory if present
_static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
if not os.path.exists(_static_dir):
    _static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "dist")

if os.path.exists(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")


@app.get("/", tags=["Root"])
async def root(request: Request, format: str = None):
    """Root metadata and interactive industrial landing page endpoint."""
    accept = request.headers.get("accept", "")
    if format == "html" or "text/html" in accept:
        return HTMLResponse(content=get_landing_html(settings.APP_NAME, settings.APP_VERSION))
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "documentation": "/docs",
        "health": "/api/v1/health",
        "liveTank": "/api/v1/tanks/live"
    }

