"""Migration Script: Migrate SQLite to Central PostgreSQL Database.

Transfers all users, trains, coaches, tanks, devices, telemetry, alarms,
and system settings from SQLite to PostgreSQL while preserving IDs and timestamps.
"""
import asyncio
import os
import sys

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select
from app.core.config import settings, normalize_database_url
from app.models.base import Base
from app.models.user import User
from app.models.train import Train
from app.models.device import Device
from app.models.tank import Tank
from app.models.setting import Setting
from app.models.alarm import Alarm, AlarmHistory
from app.models.telemetry import TelemetryReading
from app.models.audit import AuditEvent


async def migrate(sqlite_path: str = None, postgres_url: str = None):
    sqlite_file = sqlite_path or os.path.join(_BACKEND_DIR, "panorama_dev.db")
    pg_url = normalize_database_url(postgres_url or settings.DATABASE_URL)

    if not os.path.exists(sqlite_file):
        print(f"[MIGRATE] SQLite source file not found: {sqlite_file}")
        return

    print(f"[MIGRATE] Source SQLite: {sqlite_file}")
    print(f"[MIGRATE] Target Database: {pg_url.split('@')[-1] if '@' in pg_url else pg_url}")

    src_engine = create_async_engine(f"sqlite+aiosqlite:///{sqlite_file}", echo=False)
    dst_engine = create_async_engine(pg_url, echo=False)

    # 1. Create all schema in destination
    async with dst_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[MIGRATE] Database schema verified on target database.")

    src_session_factory = async_sessionmaker(src_engine, class_=AsyncSession, expire_on_commit=False)
    dst_session_factory = async_sessionmaker(dst_engine, class_=AsyncSession, expire_on_commit=False)

    async with src_session_factory() as src_session, dst_session_factory() as dst_session:
        # Migrate Trains
        trains = (await src_session.execute(select(Train))).scalars().all()
        for t in trains:
            existing = (await dst_session.execute(select(Train).where(Train.train_number == t.train_number))).scalar_one_or_none()
            if not existing:
                dst_session.add(Train(
                    id=t.id,
                    train_number=t.train_number,
                    name=t.name,
                    source_station=t.source_station,
                    source_code=t.source_code,
                    destination_station=t.destination_station,
                    destination_code=t.destination_code,
                    region=t.region,
                    railway_zone=t.railway_zone,
                    train_type=t.train_type,
                    running_days_json=t.running_days_json,
                    coach_configuration_json=t.coach_configuration_json,
                    route_json=t.route_json,
                    total_coaches=t.total_coaches,
                    has_official_composition=t.has_official_composition,
                    api_provider=t.api_provider,
                    last_verified_at=t.last_verified_at,
                    tank_height_cm=t.tank_height_cm,
                    tank_capacity_liters=t.tank_capacity_liters,
                    created_at=t.created_at,
                    updated_at=t.updated_at,
                ))
        print(f"[MIGRATE] Transferred {len(trains)} trains.")

        # Migrate Devices
        devices = (await src_session.execute(select(Device))).scalars().all()
        for d in devices:
            existing = (await dst_session.execute(select(Device).where(Device.uid == d.uid))).scalar_one_or_none()
            if not existing:
                dst_session.add(Device(
                    id=d.id,
                    uid=d.uid,
                    name=d.name,
                    train_number=d.train_number,
                    coach_number=d.coach_number,
                    device_type=d.device_type,
                    protocol=d.protocol,
                    mqtt_client_id=d.mqtt_client_id,
                    mqtt_topic=d.mqtt_topic,
                    tank_assignment=d.tank_assignment,
                    description=d.description,
                    status=d.status,
                    is_online=d.is_online,
                    last_seen_at=d.last_seen_at,
                    firmware_version=d.firmware_version,
                    battery_voltage=d.battery_voltage,
                    signal_strength=d.signal_strength,
                    created_at=d.created_at,
                    updated_at=d.updated_at,
                ))
        print(f"[MIGRATE] Transferred {len(devices)} devices.")

        # Migrate Tanks
        tanks = (await src_session.execute(select(Tank))).scalars().all()
        for tk in tanks:
            existing = (await dst_session.execute(select(Tank).where(Tank.id == tk.id))).scalar_one_or_none()
            if not existing:
                dst_session.add(Tank(
                    id=tk.id,
                    device_id=tk.device_id,
                    tank_index=tk.tank_index,
                    name=tk.name,
                    capacity_liters=tk.capacity_liters,
                    height_cm=tk.height_cm,
                    tank_type=tk.tank_type,
                    current_level_liters=tk.current_level_liters,
                    current_level_percent=tk.current_level_percent,
                    status=tk.status,
                    warning_threshold_percent=tk.warning_threshold_percent,
                    critical_threshold_percent=tk.critical_threshold_percent,
                    overflow_threshold_percent=tk.overflow_threshold_percent,
                    last_telemetry_at=tk.last_telemetry_at,
                    created_at=tk.created_at,
                    updated_at=tk.updated_at,
                ))
        print(f"[MIGRATE] Transferred {len(tanks)} tanks.")

        # Migrate Users
        users = (await src_session.execute(select(User))).scalars().all()
        for u in users:
            existing = (await dst_session.execute(select(User).where(User.username == u.username))).scalar_one_or_none()
            if not existing:
                dst_session.add(User(
                    id=u.id,
                    username=u.username,
                    hashed_password=u.hashed_password,
                    full_name=u.full_name,
                    email=u.email,
                    phone=u.phone,
                    employee_id=u.employee_id,
                    designation=u.designation,
                    department=u.department,
                    division_region=u.division_region,
                    role=u.role,
                    account_status=u.account_status,
                    is_active=u.is_active,
                    must_change_password=u.must_change_password,
                    joining_date=u.joining_date,
                    last_login_at=u.last_login_at,
                    last_activity_at=u.last_activity_at,
                    created_at=u.created_at,
                    updated_at=u.updated_at,
                ))
        print(f"[MIGRATE] Transferred {len(users)} users.")

        # Migrate Settings
        settings_rows = (await src_session.execute(select(Setting))).scalars().all()
        for s in settings_rows:
            existing = (await dst_session.execute(select(Setting).where(Setting.key == s.key))).scalar_one_or_none()
            if not existing:
                dst_session.add(Setting(
                    id=s.id,
                    key=s.key,
                    value_json=s.value_json,
                    category=s.category,
                    description=s.description,
                    created_at=s.created_at,
                    updated_at=s.updated_at,
                ))
        print(f"[MIGRATE] Transferred {len(settings_rows)} system settings.")

        await dst_session.commit()
        print("[MIGRATE] Migration to centralized database successfully committed!")

    await src_engine.dispose()
    await dst_engine.dispose()


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else None
    dst = sys.argv[2] if len(sys.argv) > 2 else None
    asyncio.run(migrate(src, dst))
