"""Devices API Router."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.device_repo import DeviceRepository
from app.repositories.telemetry_repo import TelemetryRepository
from app.schemas.device import DeviceOut, DeviceDiagnostics, DeviceCreate, DeviceUpdate

router = APIRouter(prefix="/devices", tags=["Devices"])


@router.get("", response_model=List[DeviceOut])
async def list_devices(
    search: Optional[str] = Query(None, description="Search by UID, train or coach number"),
    is_online: Optional[bool] = Query(None, description="Filter by online status"),
    db: AsyncSession = Depends(get_db)
):
    """List all registered coach devices with operational parameters."""
    repo = DeviceRepository(db)
    devices = await repo.list_all(search=search, is_online=is_online)
    telemetry_repo = TelemetryRepository(db)

    results = []
    for d in devices:
        latest = await telemetry_repo.get_latest_for_device(d.id)
        has_alarm = len(d.alarms) > 0 if hasattr(d, "alarms") else False
        out = DeviceOut(
            id=d.id,
            uid=d.uid,
            train_number=d.train_number,
            coach_number=d.coach_number,
            name=d.name,
            hardware_version=d.hardware_version,
            firmware_version=d.firmware_version,
            is_online=d.is_online,
            last_seen_at=d.last_seen_at,
            created_at=d.created_at,
            updated_at=d.updated_at,
            primary_level=latest.level_percent if latest else None,
            secondary_level=None,
            has_active_alarm=has_alarm
        )
        results.append(out)
    return results


@router.get("/{device_id}/diagnostics", response_model=DeviceDiagnostics)
async def get_device_diagnostics(
    device_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Retrieve raw edge diagnostic parameters for a specific device."""
    repo = DeviceRepository(db)
    device = await repo.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    telemetry_repo = TelemetryRepository(db)
    latest = await telemetry_repo.get_latest_for_device(device.id)

    return DeviceDiagnostics(
        deviceId=device.id,
        uid=device.uid,
        batteryV1=latest.battery_v1 if latest else None,
        auxiliaryV2=latest.auxiliary_v2 if latest else None,
        latitude=latest.latitude if latest else None,
        longitude=latest.longitude if latest else None,
        altitudeMeters=latest.altitude if latest else None,
        speedKmh=latest.speed_kmh if latest else None,
        satellites=latest.satellites if latest else None,
        sensor1Valid=latest.sensor_valid if latest else None,
        sensor2Valid=None,
        lastPayloadAt=latest.timestamp if latest else device.last_seen_at
    )


@router.post("", response_model=DeviceOut, status_code=201)
async def create_device(
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new edge monitoring device and auto-provision associated tanks."""
    repo = DeviceRepository(db)
    existing = await repo.get_by_uid(payload.uid)
    if existing:
        raise HTTPException(status_code=400, detail=f"Device with UID '{payload.uid}' already exists")

    device = await repo.create_or_update(
        uid=payload.uid,
        train_number=payload.trainNumber,
        coach_number=payload.coachNumber,
        name=payload.name
    )
    if payload.hardwareVersion:
        device.hardware_version = payload.hardwareVersion
    if payload.firmwareVersion:
        device.firmware_version = payload.firmwareVersion

    await db.commit()
    await db.refresh(device)

    return DeviceOut(
        id=device.id,
        uid=device.uid,
        train_number=device.train_number,
        coach_number=device.coach_number,
        name=device.name,
        hardware_version=device.hardware_version,
        firmware_version=device.firmware_version,
        is_online=device.is_online,
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
        updated_at=device.updated_at,
        primary_level=None,
        secondary_level=None,
        has_active_alarm=False
    )


@router.put("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: str,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update device metadata, train/coach assignment, and firmware version."""
    repo = DeviceRepository(db)
    device = await repo.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if payload.name is not None:
        device.name = payload.name
    if payload.trainNumber is not None:
        device.train_number = payload.trainNumber
    if payload.coachNumber is not None:
        device.coach_number = payload.coachNumber
    if payload.firmwareVersion is not None:
        device.firmware_version = payload.firmwareVersion

    await db.commit()
    await db.refresh(device)

    telemetry_repo = TelemetryRepository(db)
    latest = await telemetry_repo.get_latest_for_device(device.id)

    return DeviceOut(
        id=device.id,
        uid=device.uid,
        train_number=device.train_number,
        coach_number=device.coach_number,
        name=device.name,
        hardware_version=device.hardware_version,
        firmware_version=device.firmware_version,
        is_online=device.is_online,
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
        updated_at=device.updated_at,
        primary_level=latest.level_percent if latest else None,
        secondary_level=None,
        has_active_alarm=False
    )


@router.delete("/{device_id}", status_code=200)
async def delete_device(
    device_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a device and its associated tanks."""
    repo = DeviceRepository(db)
    success = await repo.delete(device_id)
    if not success:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.commit()
    return {"message": "Device deleted successfully", "id": device_id}

