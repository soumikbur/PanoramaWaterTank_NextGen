"""Health and Diagnostics Router providing granular subsystem health endpoints."""
import time
import os
import sys
import platform
from datetime import datetime, timezone
from typing import Dict, Any
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import settings
from app.core.database import get_db, engine
from app.mqtt.client import mqtt_service
from app.websocket.manager import ws_manager

router = APIRouter(tags=["Health"])

START_TIME = datetime.now(timezone.utc)
START_MONOTONIC = time.monotonic()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Primary health check endpoint validating overall system readiness.
    
    Returns 200 OK when database is connected, or 503 Service Unavailable
    when the authoritative database is unreachable.
    """
    start_ping = time.perf_counter()
    db_ok = False
    db_latency_ms: float = 0.0
    try:
        await db.execute(text("SELECT 1"))
        db_latency_ms = round((time.perf_counter() - start_ping) * 1000, 2)
        db_ok = True
    except Exception:
        db_ok = False

    uptime_seconds = int(time.monotonic() - START_MONOTONIC)
    status_str = "HEALTHY" if db_ok else "UNHEALTHY"

    content: Dict[str, Any] = {
        "status": status_str,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENV,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptimeSeconds": uptime_seconds,
        "database": {
            "status": "CONNECTED" if db_ok else "DISCONNECTED",
            "responseTimeMs": db_latency_ms,
            "engine": "postgresql" if "postgresql" in settings.DATABASE_URL else "sqlite",
        },
        "mqtt": {
            "status": "CONNECTED" if mqtt_service.is_connected else "DISCONNECTED",
            "broker": settings.MQTT_BROKER_HOST,
            "port": settings.MQTT_TLS_PORT if settings.MQTT_USE_TLS else settings.MQTT_BROKER_PORT,
        },
        "websockets": {
            "activeClients": ws_manager.client_count,
        },
    }

    if not db_ok:
        return JSONResponse(status_code=503, content=content)

    return content


@router.get("/health/database")
async def database_health_check(db: AsyncSession = Depends(get_db)):
    """Granular database connection and performance diagnostic check."""
    start_ping = time.perf_counter()
    db_ok = False
    error_msg = None
    try:
        res = await db.execute(text("SELECT 1"))
        _ = res.scalar()
        latency_ms = round((time.perf_counter() - start_ping) * 1000, 2)
        db_ok = True
    except Exception as e:
        latency_ms = round((time.perf_counter() - start_ping) * 1000, 2)
        error_msg = str(e)

    is_pg = "postgresql" in settings.DATABASE_URL
    dialect_name = "postgresql" if is_pg else "sqlite"
    
    pool_info = {
        "dialect": dialect_name,
        "isPostgreSQL": is_pg,
    }
    if is_pg and hasattr(engine, "pool"):
        pool = engine.pool
        pool_info["poolSize"] = getattr(pool, "size", lambda: None)()
        pool_info["checkedIn"] = getattr(pool, "checkedin", lambda: None)()
        pool_info["checkedOut"] = getattr(pool, "checkedout", lambda: None)()
        pool_info["overflow"] = getattr(pool, "overflow", lambda: None)()

    content = {
        "status": "HEALTHY" if db_ok else "UNHEALTHY",
        "connected": db_ok,
        "responseTimeMs": latency_ms,
        "databaseEngine": dialect_name,
        "pool": pool_info,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "error": error_msg,
    }

    if not db_ok:
        return JSONResponse(status_code=503, content=content)

    return content


@router.get("/health/mqtt")
async def mqtt_health_check():
    """Granular MQTT Broker connection and telemetry ingestion check."""
    port = settings.MQTT_TLS_PORT if settings.MQTT_USE_TLS else settings.MQTT_BROKER_PORT
    connected = mqtt_service.is_connected
    content = {
        "status": "HEALTHY" if connected else "DEGRADED",
        "connected": connected,
        "broker": {
            "host": settings.MQTT_BROKER_HOST,
            "port": port,
            "tls": settings.MQTT_USE_TLS,
            "clientIdPrefix": settings.MQTT_CLIENT_ID_PREFIX,
        },
        "topics": {
            "telemetryFilter": settings.MQTT_TELEMETRY_TOPIC,
            "statusFilter": settings.MQTT_STATUS_TOPIC,
            "commandPrefix": settings.MQTT_COMMAND_TOPIC_PREFIX,
            "syncPrefix": "panorama/sync/#",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return content


@router.get("/health/system")
async def system_health_check():
    """System runtime metrics, process uptime, and platform architecture."""
    uptime_seconds = int(time.monotonic() - START_MONOTONIC)
    
    # Process memory metrics
    mem_info = {}
    try:
        import psutil
        process = psutil.Process(os.getpid())
        mem = process.memory_info()
        mem_info["rssBytes"] = mem.rss
        mem_info["rssMb"] = round(mem.rss / (1024 * 1024), 2)
        mem_info["cpuPercent"] = process.cpu_percent(interval=0.0)
    except Exception:
        mem_info["rssMb"] = "unavailable"

    content = {
        "status": "HEALTHY",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENV,
        "startedAt": START_TIME.isoformat(),
        "uptimeSeconds": uptime_seconds,
        "runtime": {
            "pythonVersion": sys.version.split()[0],
            "platform": platform.platform(),
            "architecture": platform.machine(),
            "processId": os.getpid(),
        },
        "memory": mem_info,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return content
