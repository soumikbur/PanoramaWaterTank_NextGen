"""Panorama Water Tank — HTTPS Receiver Main Application Entrypoint."""
from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from backend import config
from backend.routes import health, sync, system, telemetry
from backend.services.shared_state_service import shared_state_service
from backend.services.storage_service import storage_service

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("panorama.https_receiver")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Manage graceful SQLite connection teardown on server shutdown."""
    yield
    storage_service.close()
    shared_state_service.close()


app = FastAPI(
    title=config.APP_TITLE,
    description=config.APP_DESCRIPTION,
    version=config.APP_VERSION,
    docs_url="/docs" if config.ENABLE_DOCS else None,
    redoc_url="/redoc" if config.ENABLE_DOCS else None,
    openapi_url="/openapi.json" if config.ENABLE_DOCS else None,
    lifespan=lifespan,
)

# Reverse proxy support: Handle X-Forwarded-Proto and X-Forwarded-For from Cloudflare/Render
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """Enforce maximum incoming payload size at the gateway level."""
    if request.method != "OPTIONS":
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > config.MAX_UPLOAD_SIZE:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "status": "error",
                            "message": f"Payload size exceeds limit of {config.MAX_UPLOAD_SIZE} bytes.",
                        },
                    )
            except ValueError:
                pass
    return await call_next(request)


# Register CORSMiddleware LAST so it executes FIRST (outermost in Starlette LIFO stack):
# ensures OPTIONS preflights bypass route/auth checks and all error responses (401/404/413) carry CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Device-Token", "X-Requested-With"],
    max_age=86400,
)


# Mount static assets directory
_STATIC_DIR = config.BASE_DIR / "static"
if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

# Register API Routers
app.include_router(health.router)
app.include_router(telemetry.router)
app.include_router(system.router)
app.include_router(sync.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log unhandled errors server-side and attach explicit CORS header if Origin is allowed."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    headers = {}
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin and origin in config.CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"status": "error", "message": "Internal server error"},
        headers=headers,
    )


@app.get("/", tags=["Dashboard"])
async def read_root():
    """Serve the laboratory testing dashboard."""
    index_path = _STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path, media_type="text/html")
    return {
        "title": config.APP_TITLE,
        "version": config.APP_VERSION,
        "status": "online",
        "documentation": "/docs",
    }
