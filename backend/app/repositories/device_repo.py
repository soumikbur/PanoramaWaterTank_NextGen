"""Device repository for database access."""
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.device import Device
from app.models.tank import Tank


class DeviceRepository:
    """Async repository for Device entity."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, device_id: str) -> Optional[Device]:
        stmt = select(Device).where(Device.id == device_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_uid(self, uid: str) -> Optional[Device]:
        stmt = select(Device).where(Device.uid == uid)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(
        self,
        search: Optional[str] = None,
        is_online: Optional[bool] = None
    ) -> List[Device]:
        stmt = select(Device)
        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Device.uid.ilike(search_pattern),
                    Device.train_number.ilike(search_pattern),
                    Device.coach_number.ilike(search_pattern),
                    Device.name.ilike(search_pattern)
                )
            )
        if is_online is not None:
            stmt = stmt.where(Device.is_online == is_online)

        stmt = stmt.order_by(Device.train_number, Device.coach_number)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_or_update(
        self,
        uid: str,
        train_number: str = "12002",
        coach_number: str = "B4",
        name: str = "Coach Water Monitor",
        hardware_version: str = "Standard WLI Node",
        firmware_version: str = "2.0.0",
        device_type: str = "Quectel EC200U 4G LTE",
        protocol: str = "MQTT over TLS/WSS",
        mqtt_client_id: Optional[str] = None,
        mqtt_topic: Optional[str] = None,
        tank_assignment: str = "BOTH",
        description: Optional[str] = None,
        status: str = "AVAILABLE",
    ) -> Device:
        device = await self.get_by_uid(uid)
        if not device:
            device = Device(
                uid=uid,
                train_number=train_number,
                coach_number=coach_number,
                name=name,
                hardware_version=hardware_version,
                firmware_version=firmware_version,
                device_type=device_type,
                protocol=protocol,
                mqtt_client_id=mqtt_client_id or f"panorama-wli-{uid}",
                mqtt_topic=mqtt_topic or f"panorama/telemetry/{uid}",
                tank_assignment=tank_assignment,
                description=description,
                status=status,
                is_online=True,
                last_seen_at=datetime.now(timezone.utc)
            )
            self.session.add(device)
            await self.session.flush()

            # Automatically create primary (tank 1) and auxiliary (tank 2) tanks
            tank1 = Tank(
                device_id=device.id,
                tank_index=1,
                name=f"Coach {coach_number} Primary Tank"
            )
            tank2 = Tank(
                device_id=device.id,
                tank_index=2,
                name=f"Coach {coach_number} Auxiliary Tank"
            )
            self.session.add_all([tank1, tank2])
            await self.session.flush()
        else:
            now = datetime.now(timezone.utc)
            last = device.last_seen_at
            if last and last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if not device.is_online or not last or (now - last).total_seconds() > 5:
                device.train_number = train_number
                device.coach_number = coach_number
                device.name = name
                device.hardware_version = hardware_version
                device.firmware_version = firmware_version
                device.device_type = device_type
                device.protocol = protocol
                if mqtt_client_id: device.mqtt_client_id = mqtt_client_id
                if mqtt_topic: device.mqtt_topic = mqtt_topic
                if tank_assignment: device.tank_assignment = tank_assignment
                if description: device.description = description
                if status: device.status = status
                device.is_online = True
                device.last_seen_at = now
                await self.session.flush()

        return device

    async def delete(self, device_id: str) -> bool:
        device = await self.get_by_id(device_id)
        if device:
            await self.session.delete(device)
            await self.session.flush()
            return True
        return False

