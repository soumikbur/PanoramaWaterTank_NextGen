"""Devices API Router."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.device_repo import DeviceRepository
from app.repositories.telemetry_repo import TelemetryRepository
from app.schemas.device import DeviceOut, DeviceDiagnostics, DeviceCreate, DeviceUpdate
from app.api.v1.auth import get_current_admin_user, get_current_user
from app.models.train import Train
from app.services.train_lookup_service import TRAIN_NUMBER_RE
from app.models.user import User
from app.websocket.manager import ws_manager
from app.mqtt.client import mqtt_service
from app.services.sync_broadcaster import broadcast_sync_event
from sqlalchemy import select

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
            device_type=d.device_type,
            protocol=d.protocol,
            mqtt_client_id=d.mqtt_client_id,
            mqtt_topic=d.mqtt_topic,
            tank_assignment=d.tank_assignment,
            description=d.description,
            status=d.status,
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
    device = await repo.get_by_id(device_id) or await repo.get_by_uid(device_id)
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Register a new edge monitoring device and auto-provision associated tanks (Admin & Employee)."""
    repo = DeviceRepository(db)
    existing = await repo.get_by_uid(payload.uid)
    if existing:
        raise HTTPException(status_code=400, detail=f"Device with UID '{payload.uid}' already exists")

    train_no = (payload.trainNumber or "").strip()
    coach_no = (payload.coachNumber or "").strip()
    if train_no and train_no.upper() != "UNASSIGNED":
        train_exists = (
            await db.execute(select(Train).where(Train.train_number == train_no))
        ).scalar_one_or_none()
        if not train_exists and not TRAIN_NUMBER_RE.match(train_no):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot assign device: Train '{train_no}' is not registered. Devices can only be assigned to registered trains."
            )

    device = await repo.create_or_update(
        uid=payload.uid.strip(),
        train_number=train_no or "UNASSIGNED",
        coach_number=coach_no or "UNASSIGNED",
        name=payload.name.strip(),
        hardware_version=payload.hardwareVersion or "Standard WLI Node",
        firmware_version=payload.firmwareVersion or "2.0.0",
        device_type=payload.deviceType or "Quectel EC200U 4G LTE",
        protocol=payload.protocol or "MQTT over TLS/WSS",
        mqtt_client_id=payload.mqttClientId or f"panorama-wli-{payload.uid.strip()}",
        mqtt_topic=payload.mqttTopic or f"panorama/telemetry/{payload.uid.strip()}",
        tank_assignment=payload.tankAssignment or "BOTH",
        description=payload.description,
        status=payload.status or ("ENGAGED" if (train_no and train_no.upper() != "UNASSIGNED" and coach_no and coach_no.upper() != "UNASSIGNED") else "AVAILABLE"),
    )

    await db.commit()
    await db.refresh(device)

    out = DeviceOut(
        id=device.id,
        uid=device.uid,
        train_number=device.train_number,
        coach_number=device.coach_number,
        name=device.name,
        hardware_version=device.hardware_version,
        firmware_version=device.firmware_version,
        device_type=device.device_type,
        protocol=device.protocol,
        mqtt_client_id=device.mqtt_client_id,
        mqtt_topic=device.mqtt_topic,
        tank_assignment=device.tank_assignment,
        description=device.description,
        status=device.status,
        is_online=device.is_online,
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
        updated_at=device.updated_at,
        primary_level=None,
        secondary_level=None,
        has_active_alarm=False
    )

    sync_payload = {
        "action": "create_device",
        "device": out.model_dump(by_alias=True)
    }
    await broadcast_sync_event("DEVICE_CREATED", sync_payload)

    return out


@router.put("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: str,
    payload: DeviceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update device metadata, train/coach assignment, and parameters (Admin & Employee)."""
    repo = DeviceRepository(db)
    device = await repo.get_by_id(device_id) or await repo.get_by_uid(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if payload.name is not None:
        device.name = payload.name.strip()
    if payload.trainNumber is not None:
        tr_val = payload.trainNumber.strip()
        if tr_val and tr_val.upper() != "UNASSIGNED":
            train_exists = (
                await db.execute(select(Train).where(Train.train_number == tr_val))
            ).scalar_one_or_none()
            if not train_exists and not TRAIN_NUMBER_RE.match(tr_val):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot assign device: Train '{tr_val}' is not registered. Devices can only be assigned to registered trains."
                )
        device.train_number = tr_val or "UNASSIGNED"
    if payload.coachNumber is not None:
        device.coach_number = payload.coachNumber.strip() or "UNASSIGNED"

    # Update assignment status automatically
    if device.train_number != "UNASSIGNED" and device.coach_number != "UNASSIGNED":
        device.status = "ENGAGED"
    elif device.status == "ENGAGED":
        device.status = "AVAILABLE"
    if payload.firmwareVersion is not None:
        device.firmware_version = payload.firmwareVersion.strip()
    if payload.hardwareVersion is not None:
        device.hardware_version = payload.hardwareVersion.strip()
    if payload.deviceType is not None:
        device.device_type = payload.deviceType.strip()
    if payload.protocol is not None:
        device.protocol = payload.protocol.strip()
    if payload.mqttClientId is not None:
        device.mqtt_client_id = payload.mqttClientId.strip()
    if payload.mqttTopic is not None:
        device.mqtt_topic = payload.mqttTopic.strip()
    if payload.tankAssignment is not None:
        device.tank_assignment = payload.tankAssignment.strip()
    if payload.description is not None:
        device.description = payload.description.strip()
    if payload.status is not None:
        device.status = payload.status.strip()

    await db.commit()
    await db.refresh(device)

    telemetry_repo = TelemetryRepository(db)
    latest = await telemetry_repo.get_latest_for_device(device.id)

    out = DeviceOut(
        id=device.id,
        uid=device.uid,
        train_number=device.train_number,
        coach_number=device.coach_number,
        name=device.name,
        hardware_version=device.hardware_version,
        firmware_version=device.firmware_version,
        device_type=device.device_type,
        protocol=device.protocol,
        mqtt_client_id=device.mqtt_client_id,
        mqtt_topic=device.mqtt_topic,
        tank_assignment=device.tank_assignment,
        description=device.description,
        status=device.status,
        is_online=device.is_online,
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
        updated_at=device.updated_at,
        primary_level=latest.level_percent if latest else None,
        secondary_level=None,
        has_active_alarm=False
    )

    sync_payload = {
        "action": "update_device",
        "device": out.model_dump(by_alias=True)
    }
    await broadcast_sync_event("DEVICE_UPDATED", sync_payload)

    return out


@router.delete("/{device_id}", status_code=200)
async def delete_device(
    device_id: str,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a device and its associated tanks (Admin Only)."""
    repo = DeviceRepository(db)
    target = await repo.get_by_id(device_id) or await repo.get_by_uid(device_id)
    if not target:
        raise HTTPException(status_code=404, detail="Device not found")
    uid = target.uid
    success = await repo.delete(target.id)
    if not success:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.commit()

    sync_payload = {
        "action": "delete_device",
        "id": device_id,
        "uid": uid
    }
    await broadcast_sync_event("DEVICE_DELETED", sync_payload)

    return {"message": "Device deleted successfully", "id": target.id, "uid": uid}

