"""FastAPI Main Application Entrypoint.

Initializes FastAPI, configures CORS, handles lifecycle startup/shutdown events,
and registers API routes and WebSockets.
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse

from app.core.config import settings
from app.core.database import init_db
from app.mqtt.client import mqtt_service
from app.api.v1 import api_router, trains as trains_v1

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

# CORS Configuration (Restricted strictly to local loopback and verified production domains)
_explicit_origins = [o for o in settings.CORS_ORIGINS if o != "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_explicit_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://soumikbur\.github\.io$|^https://[a-zA-Z0-9_-]+\.vercel\.app$|^https?://localhost$|^capacitor://localhost$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def normalize_api_trailing_slash(request: Request, call_next):
    # Prevent FastAPI 307/405 responses when clients call /api/... with a trailing slash
    path = request.scope.get("path", "")
    if path.startswith("/api/") and len(path) > 5 and path.endswith("/"):
        request.scope["path"] = path.rstrip("/")
        request.scope["raw_path"] = request.scope["path"].encode("ascii", errors="ignore")
    return await call_next(request)


# Mount API Routers
app.include_router(api_router)
app.include_router(trains_v1.router, prefix="/api", include_in_schema=False)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add defensive security headers to all HTTP responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: https:; "
        "connect-src 'self' ws: wss: https://broker.hivemq.com:8884 https://industrial.api.ubidots.com;"
    )
    return response

# Resolve static file directory with candidate fallbacks
_base_project_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_static_candidates = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static"),
    os.path.join(_base_project_dir, "backend", "static"),
    os.path.join(_base_project_dir, "dist"),
    os.path.join(_base_project_dir, "apps", "mobile", "dist"),
]
_static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
for _c in _static_candidates:
    if os.path.exists(_c) and os.path.exists(os.path.join(_c, "index.html")):
        _static_dir = _c
        break

# Mount static asset directories
_assets_dir = os.path.join(_static_dir, "assets")
if os.path.exists(_assets_dir):
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

if os.path.exists(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")


@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    """Serve the notification Service Worker with strict JavaScript MIME headers."""
    sw_file = os.path.join(_static_dir, "sw.js")
    if os.path.exists(sw_file):
        return FileResponse(
            sw_file,
            media_type="application/javascript",
            headers={
                "Service-Worker-Allowed": "/",
                "Cache-Control": "no-cache",
            },
        )
    return JSONResponse(status_code=404, content={"detail": "Service Worker not built"})


@app.get("/", tags=["Root"])
async def root(request: Request, format: Optional[str] = None):
    """Serve the React production application shell or API metadata."""
    accept = request.headers.get("accept", "")
    # Explicit JSON requests return system API metadata
    if format == "json" or ("application/json" in accept and "text/html" not in accept):
        return {
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "documentation": "/docs",
            "health": "/api/v1/health",
            "liveTank": "/api/v1/tanks/live"
        }

    # Serve the compiled React application
    index_file = os.path.join(_static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, media_type="text/html")

    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "documentation": "/docs",
        "health": "/api/v1/health",
        "liveTank": "/api/v1/tanks/live"
    }


@app.api_route(
    "/{full_path:path}",
    methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def spa_fallback(request: Request, full_path: str):
    """SPA fallback routing for React application direct URLs and refreshes."""
    if (
        full_path.startswith("api/")
        or full_path == "api"
        or full_path.startswith("docs")
        or full_path.startswith("redoc")
        or full_path.startswith("openapi.json")
        or full_path.startswith("assets/")
        or full_path.startswith("static/")
    ):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    if request.method not in ("GET", "HEAD"):
        return JSONResponse(status_code=405, content={"detail": "Method Not Allowed"})

    # Defensive path traversal and hidden file mitigation
    clean_path = os.path.normpath(full_path).lstrip("/\\")
    candidate = os.path.realpath(os.path.join(_static_dir, clean_path))
    static_real = os.path.realpath(_static_dir)

    try:
        common = os.path.commonpath([static_real, candidate])
    except ValueError:
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    if common == static_real and os.path.isfile(candidate):
        base_name = os.path.basename(candidate)
        if not base_name.startswith("."):
            return FileResponse(candidate)

    index_file = os.path.join(_static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, media_type="text/html")

    return JSONResponse(status_code=404, content={"detail": "Not Found"})

