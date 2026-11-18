"""Async Database Engine and Session Management via SQLAlchemy 2.0."""
from typing import AsyncGenerator
import logging
from sqlalchemy import select, event
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

logger = logging.getLogger("panorama.database")

# SQLite concurrency & compatibility settings vs PostgreSQL connection pool
is_sqlite = settings.DATABASE_URL.startswith("sqlite")
engine_kwargs = {
    "echo": False,
    "future": True,
}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30.0}
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 3600

# Create async engine with pool configuration
engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

if is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, connection_record):
        """Configure SQLite WAL mode and busy timeout for high-concurrency throughput."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=10000")
        cursor.close()

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async database session with clean coroutine lifecycle."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


def _sync_schema_migration(sync_conn) -> None:
    """Sync callback to create tables and safely add missing columns in SQLite."""
    import app.models  # noqa: F401
    Base.metadata.create_all(sync_conn)

    # SQLite column check
    if sync_conn.dialect.name == "sqlite":
        try:
            res = sync_conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()
            existing_cols = {row[1] for row in res}
            new_columns = [
                ("phone", "VARCHAR(32)"),
                ("employee_id", "VARCHAR(32)"),
                ("designation", "VARCHAR(64) DEFAULT 'Station Operator'"),
                ("department", "VARCHAR(64) DEFAULT 'Rolling Stock Operations'"),
                ("division_region", "VARCHAR(64) DEFAULT 'Eastern Railway (Howrah)'"),
                ("joining_date", "DATETIME"),
                ("account_status", "VARCHAR(16) DEFAULT 'ACTIVE'"),
                ("must_change_password", "BOOLEAN DEFAULT 0"),
                ("last_login_at", "DATETIME"),
                ("last_activity_at", "DATETIME"),
                ("failed_login_attempts", "INTEGER DEFAULT 0"),
                ("date_of_birth", "DATETIME"),
                ("gender", "VARCHAR(16)"),
                ("residential_address", "VARCHAR(255)"),
                ("assigned_location", "VARCHAR(128)"),
                ("reporting_manager", "VARCHAR(128)"),
                ("document_name", "VARCHAR(255)"),
                ("document_url", "VARCHAR(255)"),
                ("registration_date", "DATETIME"),
                ("approved_at", "DATETIME"),
                ("approved_by", "VARCHAR(64)"),
                ("rejection_reason", "VARCHAR(255)"),
                ("token_version", "INTEGER DEFAULT 1"),
            ]
            for col_name, col_type in new_columns:
                if col_name not in existing_cols:
                    sync_conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")

            # Trains table migration
            res_trains = sync_conn.exec_driver_sql("PRAGMA table_info(trains)").fetchall()
            train_cols = {row[1] for row in res_trains}
            train_columns = [
                ("tank_height_cm", "REAL DEFAULT 50.0"),
                ("tank_capacity_liters", "REAL DEFAULT 20.0"),
                ("region_id", "VARCHAR(36)"),
                ("zone_id", "VARCHAR(36)"),
                ("is_deleted", "BOOLEAN DEFAULT 0"),
            ]
            for col_name, col_type in train_columns:
                if col_name not in train_cols:
                    sync_conn.exec_driver_sql(f"ALTER TABLE trains ADD COLUMN {col_name} {col_type}")

            # Devices table migration
            res_devs = sync_conn.exec_driver_sql("PRAGMA table_info(devices)").fetchall()
            dev_cols = {row[1] for row in res_devs}
            dev_columns = [
                ("device_type", "VARCHAR(64) DEFAULT 'Quectel EC200U 4G LTE'"),
                ("protocol", "VARCHAR(64) DEFAULT 'MQTT over TLS/WSS'"),
                ("mqtt_client_id", "VARCHAR(128)"),
                ("mqtt_topic", "VARCHAR(128)"),
                ("tank_assignment", "VARCHAR(32) DEFAULT 'BOTH'"),
                ("description", "VARCHAR(255)"),
                ("hardware_metadata", "TEXT"),
                ("status", "VARCHAR(32) DEFAULT 'AVAILABLE'"),
                ("train_id", "VARCHAR(36)"),
                ("is_deleted", "BOOLEAN DEFAULT 0"),
            ]
            for col_name, col_type in dev_columns:
                if col_name not in dev_cols:
                    sync_conn.exec_driver_sql(f"ALTER TABLE devices ADD COLUMN {col_name} {col_type}")

            # Tanks table migration
            res_tanks = sync_conn.exec_driver_sql("PRAGMA table_info(tanks)").fetchall()
            tank_cols = {row[1] for row in res_tanks}
            tank_columns = [
                ("coach_id", "VARCHAR(36)"),
                ("train_number", "VARCHAR(32)"),
                ("coach_number", "VARCHAR(32)"),
                ("is_deleted", "BOOLEAN DEFAULT 0"),
            ]
            for col_name, col_type in tank_columns:
                if col_name not in tank_cols:
                    sync_conn.exec_driver_sql(f"ALTER TABLE tanks ADD COLUMN {col_name} {col_type}")

            # Telemetry readings table migration
            res_telemetry = sync_conn.exec_driver_sql("PRAGMA table_info(telemetry_readings)").fetchall()
            telemetry_cols = {row[1] for row in res_telemetry}
            telemetry_columns = [
                ("device_uid", "VARCHAR(64)"),
                ("train_number", "VARCHAR(32)"),
                ("coach_number", "VARCHAR(32)"),
                ("tank_index", "INTEGER"),
            ]
            for col_name, col_type in telemetry_columns:
                if col_name not in telemetry_cols:
                    sync_conn.exec_driver_sql(f"ALTER TABLE telemetry_readings ADD COLUMN {col_name} {col_type}")

            # Railway regions table migration
            res_reg = sync_conn.exec_driver_sql("PRAGMA table_info(railway_regions)").fetchall()
            reg_cols = {row[1] for row in res_reg}
            reg_columns = [
                ("id", "VARCHAR(36)"),
                ("updated_at", "DATETIME"),
            ]
            for col_name, col_type in reg_columns:
                if col_name not in reg_cols:
                    sync_conn.exec_driver_sql(f"ALTER TABLE railway_regions ADD COLUMN {col_name} {col_type}")
            sync_conn.exec_driver_sql("UPDATE railway_regions SET id = code WHERE id IS NULL")

            # Railway zones table migration
            res_zone = sync_conn.exec_driver_sql("PRAGMA table_info(railway_zones)").fetchall()
            zone_cols = {row[1] for row in res_zone}
            zone_columns = [
                ("id", "VARCHAR(36)"),
                ("region_id", "VARCHAR(36)"),
                ("updated_at", "DATETIME"),
            ]
            for col_name, col_type in zone_columns:
                if col_name not in zone_cols:
                    sync_conn.exec_driver_sql(f"ALTER TABLE railway_zones ADD COLUMN {col_name} {col_type}")
            sync_conn.exec_driver_sql("UPDATE railway_zones SET id = code WHERE id IS NULL")
        except Exception as e:
            logger.warning(f"Column check notice: {e}")


async def seed_initial_accounts(session: AsyncSession) -> None:
    """Seed mandatory @admin and @employee accounts if not already present."""
    from app.models.user import User
    from app.core.security import get_password_hash

    # 1. Seed or sync @admin
    result_admin = await session.execute(select(User).where((User.username == "@admin") | (User.username == "admin")))
    admin_user = result_admin.scalar_one_or_none()
    if not admin_user:
        admin_user = User(
            username="@admin",
            hashed_password=get_password_hash("Admin@123"),
            full_name="System Administrator",
            email="admin@panorama.railways.gov",
            phone="+91-33-2641-0001",
            employee_id="EMP-001",
            designation="Chief SCADA Administrator",
            department="Signalling & Telecommunications",
            division_region="Eastern Railway HQ",
            role="ADMIN",
            account_status="ACTIVE",
            must_change_password=False,
            is_active=True,
        )
        session.add(admin_user)
        logger.info("Seeded initial @admin account.")
    else:
        # Upgrade existing record to canonical @admin specification
        admin_user.username = "@admin"
        admin_user.hashed_password = get_password_hash("Admin@123")
        admin_user.employee_id = admin_user.employee_id or "EMP-001"
        admin_user.role = "ADMIN"
        admin_user.designation = admin_user.designation or "Chief SCADA Administrator"
        admin_user.department = admin_user.department or "Signalling & Telecommunications"
        admin_user.account_status = "ACTIVE"
        admin_user.is_active = True
        admin_user.must_change_password = False

    # 2. Seed or sync @employee
    result_emp = await session.execute(select(User).where((User.username == "@employee") | (User.username == "operator")))
    emp_user = result_emp.scalar_one_or_none()
    if not emp_user:
        emp_user = User(
            username="@employee",
            hashed_password=get_password_hash("Employee@123"),
            full_name="Railway Yard Operator",
            email="employee@panorama.railways.gov",
            phone="+91-33-2641-0002",
            employee_id="EMP-002",
            designation="Lead Yard Controller",
            department="Rolling Stock Operations",
            division_region="Howrah Division (HWH)",
            role="EMPLOYEE",
            account_status="ACTIVE",
            must_change_password=False,
            is_active=True,
        )
        session.add(emp_user)
        logger.info("Seeded initial @employee account.")
    else:
        # Upgrade existing record to canonical @employee specification
        emp_user.username = "@employee"
        emp_user.hashed_password = get_password_hash("Employee@123")
        emp_user.employee_id = emp_user.employee_id or "EMP-002"
        emp_user.role = "EMPLOYEE"
        emp_user.designation = emp_user.designation or "Lead Yard Controller"
        emp_user.department = emp_user.department or "Rolling Stock Operations"
        emp_user.account_status = "ACTIVE"
        emp_user.is_active = True
        emp_user.must_change_password = False

    await session.commit()


async def seed_initial_settings(session: AsyncSession) -> None:
    """Seed baseline 5-section unified configuration idempotently."""
    from app.repositories.settings_repo import SettingsRepository
    from app.api.v1.settings import DEFAULT_CONFIG
    repo = SettingsRepository(session)
    for key, item in DEFAULT_CONFIG.items():
        await repo.upsert(key, item["value"], category=item["category"], description=item["desc"])
    await session.commit()


async def seed_initial_fleet(session: AsyncSession) -> None:
    """Seed baseline genuine hardware device idempotently in unassigned state without mock trains."""
    from app.repositories.device_repo import DeviceRepository
    device_repo = DeviceRepository(session)
    existing = await device_repo.get_by_uid(settings.DEFAULT_DEVICE_UID)
    if not existing:
        await device_repo.create_or_update(
            uid=settings.DEFAULT_DEVICE_UID,
            train_number="UNASSIGNED",
            coach_number="UNASSIGNED",
            name="Shatabdi Coach B4 Water System",
            status="AVAILABLE",
        )
        await session.commit()


async def seed_initial_regions(session: AsyncSession) -> None:
    """Seed baseline standard Railway Regions and Zones idempotently."""
    from app.models.railway import RailwayRegion, RailwayZone

    regions_data = [
        {"code": "NORTH", "name": "Northern Railway", "headquarters": "New Delhi"},
        {"code": "EAST", "name": "Eastern Railway", "headquarters": "Kolkata"},
        {"code": "SOUTH", "name": "Southern Railway", "headquarters": "Chennai"},
        {"code": "WEST", "name": "Western Railway", "headquarters": "Mumbai"},
        {"code": "CENTRAL", "name": "Central Railway", "headquarters": "Mumbai"},
    ]
    region_map = {}
    for r_data in regions_data:
        res = await session.execute(select(RailwayRegion).where(RailwayRegion.code == r_data["code"]))
        reg = res.scalar_one_or_none()
        if not reg:
            reg = RailwayRegion(**r_data)
            session.add(reg)
            await session.flush()
        region_map[r_data["code"]] = reg

    zones_data = [
        {"code": "NR", "name": "Northern Railway Zone", "headquarters": "New Delhi", "region_code": "NORTH"},
        {"code": "NCR", "name": "North Central Railway", "headquarters": "Prayagraj", "region_code": "NORTH"},
        {"code": "NER", "name": "North Eastern Railway", "headquarters": "Gorakhpur", "region_code": "NORTH"},
        {"code": "ER", "name": "Eastern Railway", "headquarters": "Kolkata", "region_code": "EAST"},
        {"code": "ECR", "name": "East Central Railway", "headquarters": "Hajipur", "region_code": "EAST"},
        {"code": "SER", "name": "South Eastern Railway", "headquarters": "Kolkata", "region_code": "EAST"},
        {"code": "SR", "name": "Southern Railway", "headquarters": "Chennai", "region_code": "SOUTH"},
        {"code": "SCR", "name": "South Central Railway", "headquarters": "Secunderabad", "region_code": "SOUTH"},
        {"code": "SWR", "name": "South Western Railway", "headquarters": "Hubballi", "region_code": "SOUTH"},
        {"code": "WR", "name": "Western Railway", "headquarters": "Mumbai", "region_code": "WEST"},
        {"code": "WCR", "name": "West Central Railway", "headquarters": "Jabalpur", "region_code": "WEST"},
        {"code": "CR", "name": "Central Railway", "headquarters": "Mumbai", "region_code": "CENTRAL"},
    ]
    for z_data in zones_data:
        res_z = await session.execute(select(RailwayZone).where(RailwayZone.code == z_data["code"]))
        zn = res_z.scalar_one_or_none()
        if not zn:
            zn = RailwayZone(
                code=z_data["code"],
                name=z_data["name"],
                headquarters=z_data["headquarters"],
                region_code=z_data["region_code"],
            )
            session.add(zn)
    await session.commit()


async def init_db() -> None:
    """Initialize database tables and seed baseline credentials and configurations."""
    async with engine.begin() as conn:
        await conn.run_sync(_sync_schema_migration)

    async with AsyncSessionLocal() as session:
        try:
            await seed_initial_accounts(session)
            await seed_initial_regions(session)
            await seed_initial_settings(session)
            await seed_initial_fleet(session)
        except Exception as e:
            logger.error(f"Error seeding baseline data: {e}")
