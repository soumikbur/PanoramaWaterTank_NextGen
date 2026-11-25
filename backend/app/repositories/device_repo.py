"""Device repository for database access."""
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy import select, or_, func, not_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.device import Device
from app.models.tank import Tank
from app.core.device_identity import is_genuine_hardware_uid, get_canonical_uid


class DeviceRepository:
    """Async repository for Device entity."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, device_id: str) -> Optional[Device]:
        stmt = select(Device).where(Device.id == device_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_uid(self, uid: str) -> Optional[Device]:
        canonical = get_canonical_uid(uid)
        stmt = select(Device).where(
            or_(Device.uid == uid, Device.uid == canonical),
            Device.is_deleted == False,
        )
        result = await self.session.execute(stmt)
        devs = list(result.scalars().all())
        if not devs:
            return None
        for d in devs:
            if d.uid == canonical:
                return d
        return devs[0]

    async def list_all(
        self,
        search: Optional[str] = None,
        is_online: Optional[bool] = None
    ) -> List[Device]:
        # Filter strictly for genuine registered physical devices
        stmt = select(Device).where(
            Device.is_deleted == False,
            Device.status.in_(["AVAILABLE", "ENGAGED", "REGISTERED"]),
            func.length(Device.uid) == 24,
            not_(Device.uid.ilike("%TEST%")),
            not_(Device.uid.ilike("%AUDIT%")),
            not_(Device.uid.ilike("%DUMMY%")),
            not_(Device.uid.ilike("%DEMO%")),
            not_(Device.uid.ilike("%SEED%")),
            not_(Device.uid.ilike("%PLACEHOLDER%")),
            not_(Device.uid.ilike("%ROGUE%")),
            not_(Device.uid.ilike("%MOCK%")),
        )
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
        raw_list = list(result.scalars().all())

        # Deduplicate multiple entries representing the same physical node
        seen_canonical = set()
        deduped = []
        for d in raw_list:
            if not is_genuine_hardware_uid(d.uid):
                continue
            canonical = get_canonical_uid(d.uid)
            if canonical in seen_canonical:
                continue
            seen_canonical.add(canonical)
            deduped.append(d)

        return deduped

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
        is_online: bool = False,
        last_seen_at: Optional[datetime] = None,
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
                is_online=is_online,
                last_seen_at=last_seen_at
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
            device.train_number = train_number
            device.coach_number = coach_number
            device.name = name
            device.hardware_version = hardware_version
            device.firmware_version = firmware_version
            device.device_type = device_type
            device.protocol = protocol
            if mqtt_client_id:
                device.mqtt_client_id = mqtt_client_id
            if mqtt_topic:
                device.mqtt_topic = mqtt_topic
            if tank_assignment:
                device.tank_assignment = tank_assignment
            if description:
                device.description = description
            if status:
                device.status = status
            if is_online:
                device.is_online = True
                device.last_seen_at = last_seen_at or datetime.now(timezone.utc)
            await self.session.flush()

        return device

    async def sync_exclusive_assignment(
        self,
        uid: str,
        train_number: Optional[str],
        coach_number: Optional[str],
    ) -> None:
        """Guarantee exclusive 1:1 mapping between device UID and (train_number, coach_number)."""
        import json
        from app.models.coach import Coach
        from app.models.train import Train

        clean_uid = (uid or "").strip()
        tr_clean = (train_number or "").strip()
        ch_clean = (coach_number or "").strip().upper()
        is_assigned = bool(
            clean_uid
            and tr_clean
            and tr_clean.upper() != "UNASSIGNED"
            and ch_clean
            and ch_clean != "UNASSIGNED"
        )

        # 1. Detach clean_uid from any other Coach rows (and clear their JSON cache)
        if clean_uid:
            other_coaches = (
                await self.session.execute(
                    select(Coach).where(Coach.device_uid == clean_uid, Coach.is_deleted == False)  # noqa: E712
                )
            ).scalars().all()
            affected_trains = set()
            for oc in other_coaches:
                if not is_assigned or oc.train_number != tr_clean or oc.coach_number.upper() != ch_clean:
                    oc.device_uid = None
                    oc.updated_at = datetime.now(timezone.utc)
                    affected_trains.add(oc.train_number)

            # Detach from other coaches in Train.coach_configuration_json
            if affected_trains:
                tr_rows = (
                    await self.session.execute(select(Train).where(Train.train_number.in_(affected_trains)))
                ).scalars().all()
                for tr_row in tr_rows:
                    try:
                        comp = json.loads(tr_row.coach_configuration_json or "[]")
                    except Exception:
                        comp = []
                    changed = False
                    for item in comp:
                        if (item.get("device_uid") or "").strip() == clean_uid and (
                            not is_assigned
                            or tr_row.train_number != tr_clean
                            or (item.get("coach_number") or "").strip().upper() != ch_clean
                        ):
                            item["device_uid"] = ""
                            changed = True
                    if changed:
                        tr_row.coach_configuration_json = json.dumps(comp)

        # 2. If assigning to (tr_clean, ch_clean), detach any OTHER device previously claiming that slot
        if is_assigned:
            other_devs = (
                await self.session.execute(
                    select(Device).where(
                        Device.train_number == tr_clean,
                        Device.coach_number == ch_clean,
                        Device.uid != clean_uid,
                        Device.is_deleted == False,  # noqa: E712
                    )
                )
            ).scalars().all()
            for od in other_devs:
                od.train_id = None
                od.train_number = "UNASSIGNED"
                od.coach_number = "UNASSIGNED"
                od.status = "AVAILABLE"
                od.updated_at = datetime.now(timezone.utc)

            # Keep target Coach & Train JSON in sync
            target_coach = (
                await self.session.execute(
                    select(Coach).where(
                        Coach.train_number == tr_clean,
                        Coach.coach_number == ch_clean,
                        Coach.is_deleted == False,  # noqa: E712
                    )
                )
            ).scalar_one_or_none()
            if target_coach:
                target_coach.device_uid = clean_uid
                target_coach.updated_at = datetime.now(timezone.utc)

            target_train = (
                await self.session.execute(select(Train).where(Train.train_number == tr_clean))
            ).scalar_one_or_none()
            if target_train:
                try:
                    comp = json.loads(target_train.coach_configuration_json or "[]")
                except Exception:
                    comp = []
                changed = False
                for item in comp:
                    if (item.get("coach_number") or "").strip().upper() == ch_clean and item.get("device_uid") != clean_uid:
                        item["device_uid"] = clean_uid
                        changed = True
                if changed:
                    target_train.coach_configuration_json = json.dumps(comp)

        await self.session.flush()

    async def delete(self, device_id: str) -> bool:
        device = await self.get_by_id(device_id)
        if device:
            await self.session.delete(device)
            await self.session.flush()
            return True
        return False

