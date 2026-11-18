"""Panorama Water Tank — HTTPS Receiver Main Application Entrypoint."""
from pathlib import Path
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from backend import config
from backend.routes import health, system, telemetry

app = FastAPI(
    title=config.APP_TITLE,
    description=config.APP_DESCRIPTION,
    version=config.APP_VERSION,
    docs_url="/docs" if config.ENABLE_DOCS else None,
    redoc_url="/redoc" if config.ENABLE_DOCS else None,
    openapi_url="/openapi.json" if config.ENABLE_DOCS else None,
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
