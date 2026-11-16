"""Permanent Database Architecture & Data Retention Acceptance Tests.

Verifies:
TEST 1: Train metadata persistence across restart
TEST 2: 19 Coaches consist persistence
TEST 3: Device registry persistence
TEST 4: Tank configuration persistence
TEST 5: Historical telemetry retention without TTL
TEST 6: Multi-device sync outbox queue
TEST 7: Manual deletion audit record
TEST 8: Backup and restore recovery
"""
from datetime import datetime, timezone, timedelta
import json
import os
import pytest
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.train import Train
from app.models.coach import Coach
from app.models.device import Device
from app.models.tank import Tank
from app.models.telemetry import TelemetryReading
from app.models.deletion_audit import DeletionAuditRecord
from app.models.outbox import SyncOutboxEvent
from app.repositories.coach_repo import CoachRepository
from app.repositories.outbox_repo import OutboxRepository
from app.repositories.device_repo import DeviceRepository
from app.repositories.tank_repo import TankRepository
from app.services.outbox_service import flush_outbox_events
from scripts.backup_db import run_backup
from scripts.restore_db import run_restore


@pytest.mark.asyncio
async def test_1_train_metadata_persistence_across_restart():
    """TEST 1: Train metadata persistence across restart."""
    train_number = "12301"

    # Step 1: Create train
    async with AsyncSessionLocal() as session:
        # Clean any prior record
        await session.execute(delete(Coach).where(Coach.train_number == train_number))
        await session.execute(delete(Train).where(Train.train_number == train_number))
        await session.commit()

        train = Train(
            train_number=train_number,
            name="Howrah New Delhi Rajdhani Express",
            source_station="Howrah Junction",
            source_code="HWH",
            destination_station="New Delhi",
            destination_code="NDLS",
            region="EAST",
            railway_zone="ER",
            train_type="Rajdhani",
            tank_height_cm=65.0,
            tank_capacity_liters=45.0,
        )
        session.add(train)
        await session.commit()

    # Step 2: Simulate restart by opening a brand-new independent session
    async with AsyncSessionLocal() as session2:
        stmt = select(Train).where(Train.train_number == train_number)
        result = await session2.execute(stmt)
        persisted = result.scalar_one_or_none()

        assert persisted is not None, "Train record was not persisted across sessions"
        assert persisted.train_number == "12301"
        assert persisted.name == "Howrah New Delhi Rajdhani Express"
        assert persisted.region == "EAST"
        assert persisted.railway_zone == "ER"
        assert persisted.tank_height_cm == 65.0
        assert persisted.tank_capacity_liters == 45.0
        assert persisted.is_deleted is False


@pytest.mark.asyncio
async def test_2_19_coaches_consist_persistence():
    """TEST 2: 19 Coaches consist persistence."""
    train_number = "12302"
    coach_codes = [
        "EOG1", "H1", "A1", "A2", "A3", "B1", "B2", "B3", "B4", "B5",
        "B6", "B7", "B8", "B9", "B10", "B11", "PC", "B12", "EOG2"
    ]
    assert len(coach_codes) == 19

    # Step 1: Create train and all 19 coaches
    async with AsyncSessionLocal() as session:
        await session.execute(delete(Coach).where(Coach.train_number == train_number))
        await session.execute(delete(Train).where(Train.train_number == train_number))
        await session.commit()

        train = Train(
            train_number=train_number,
            name="New Delhi Howrah Rajdhani Express",
            region="NORTH",
            railway_zone="NR",
            total_coaches=19,
        )
        session.add(train)
        await session.flush()

        coach_repo = CoachRepository(session)
        for idx, code in enumerate(coach_codes, start=1):
            category = "PANTRY" if code == "PC" else ("LOCOMOTIVE" if "EOG" in code else "PASSENGER")
            await coach_repo.create(
                train_id=train.id,
                train_number=train_number,
                coach_number=code,
                coach_name=f"Coach {code}",
                coach_category=category,
                coach_type="AC_CHAIR_CAR",
                position=idx,
            )
        await session.commit()

    # Step 2: In a new session, verify all 19 coaches exist in exact order
    async with AsyncSessionLocal() as session2:
        coach_repo = CoachRepository(session2)
        coaches = await coach_repo.list_by_train(train_number)

        assert len(coaches) == 19, f"Expected 19 coaches, found {len(coaches)}"
        retrieved_codes = [c.coach_number for c in coaches]
        assert retrieved_codes == coach_codes, "Coaches not returned in exact sequence order"
        for idx, c in enumerate(coaches, start=1):
            assert c.position == idx, f"Coach {c.coach_number} position mismatch"
            assert c.is_deleted is False


@pytest.mark.asyncio
async def test_3_device_registry_persistence():
    """TEST 3: Device registry persistence."""
    device_uid = "WLI-NODE-PERM-TEST-001"

    async with AsyncSessionLocal() as session:
        # Clean any prior test telemetry for this device
        await session.execute(delete(TelemetryReading).where(TelemetryReading.device_uid == device_uid))
        await session.commit()

        device_repo = DeviceRepository(session)
        # Clean prior test device
        existing = await device_repo.get_by_uid(device_uid)
        if existing:
            await session.delete(existing)
            await session.commit()

        dev = await device_repo.create_or_update(
            uid=device_uid,
            train_number="12002",
            coach_number="C1",
            name="Bhopal Shatabdi C1 Monitor",
            hardware_version="v2.5-RevC",
            firmware_version="3.1.4",
            device_type="Quectel EC200U 4G LTE",
            protocol="MQTT over TLS/WSS",
            status="ENGAGED",
        )
        await session.commit()

    async with AsyncSessionLocal() as session2:
        device_repo = DeviceRepository(session2)
        dev_retrieved = await device_repo.get_by_uid(device_uid)

        assert dev_retrieved is not None
        assert dev_retrieved.uid == device_uid
        assert dev_retrieved.train_number == "12002"
        assert dev_retrieved.coach_number == "C1"
        assert dev_retrieved.hardware_version == "v2.5-RevC"
        assert dev_retrieved.firmware_version == "3.1.4"
        assert dev_retrieved.status == "ENGAGED"
        assert dev_retrieved.is_deleted is False


@pytest.mark.asyncio
async def test_4_tank_configuration_persistence():
    """TEST 4: Tank configuration persistence."""
    device_uid = "WLI-NODE-TANK-TEST-002"

    async with AsyncSessionLocal() as session:
        # Clean any prior test telemetry for this device
        await session.execute(delete(TelemetryReading).where(TelemetryReading.device_uid == device_uid))
        await session.commit()

        device_repo = DeviceRepository(session)
        existing = await device_repo.get_by_uid(device_uid)
        if existing:
            await session.delete(existing)
            await session.commit()

        dev = await device_repo.create_or_update(
            uid=device_uid,
            train_number="12004",
            coach_number="D1",
            name="Test Coach Monitor",
            status="ENGAGED",
        )
        await session.commit()

        tank_repo = TankRepository(session)
        t1 = await tank_repo.get_by_device_and_index(dev.id, 1)
        if not t1:
            t1 = await tank_repo.create(
                device_id=dev.id,
                tank_index=1,
                name="Arrival Reservoir Tank 1",
                capacity_liters=600.0,
                height_cm=55.0,
                tank_type="CYLINDRICAL",
            )
        else:
            t1.name = "Arrival Reservoir Tank 1"
            t1.capacity_liters = 600.0
            t1.height_cm = 55.0
            t1.tank_type = "CYLINDRICAL"
        t1.warning_threshold_percent = 25.0
        t1.critical_threshold_percent = 12.0
        t1.overflow_threshold_percent = 98.0

        t2 = await tank_repo.get_by_device_and_index(dev.id, 2)
        if not t2:
            t2 = await tank_repo.create(
                device_id=dev.id,
                tank_index=2,
                name="Departure Reservoir Tank 2",
                capacity_liters=450.0,
                height_cm=48.0,
                tank_type="RECTANGULAR",
            )
        else:
            t2.name = "Departure Reservoir Tank 2"
            t2.capacity_liters = 450.0
            t2.height_cm = 48.0
            t2.tank_type = "RECTANGULAR"
        t2.warning_threshold_percent = 20.0
        t2.critical_threshold_percent = 10.0
        t2.overflow_threshold_percent = 95.0
        await session.commit()

    # Reopen session to verify all thresholds and geometries
    async with AsyncSessionLocal() as session2:
        device_repo = DeviceRepository(session2)
        dev2 = await device_repo.get_by_uid(device_uid)
        assert dev2 is not None

        tank_repo = TankRepository(session2)
        t1_retrieved = await tank_repo.get_by_device_and_index(dev2.id, 1)
        t2_retrieved = await tank_repo.get_by_device_and_index(dev2.id, 2)

        assert t1_retrieved is not None
        assert t1_retrieved.name == "Arrival Reservoir Tank 1"
        assert t1_retrieved.capacity_liters == 600.0
        assert t1_retrieved.height_cm == 55.0
        assert t1_retrieved.tank_type == "CYLINDRICAL"
        assert t1_retrieved.warning_threshold_percent == 25.0
        assert t1_retrieved.critical_threshold_percent == 12.0

        assert t2_retrieved is not None
        assert t2_retrieved.name == "Departure Reservoir Tank 2"
        assert t2_retrieved.capacity_liters == 450.0
        assert t2_retrieved.height_cm == 48.0
        assert t2_retrieved.tank_type == "RECTANGULAR"


@pytest.mark.asyncio
async def test_5_historical_telemetry_retention_without_ttl():
    """TEST 5: Historical telemetry retention without TTL."""
    device_uid = "WLI-NODE-TELEM-TEST-003"
    reading_count = 10

    async with AsyncSessionLocal() as session:
        # Clean any prior test telemetry for this device
        await session.execute(delete(TelemetryReading).where(TelemetryReading.device_uid == device_uid))
        await session.commit()

        device_repo = DeviceRepository(session)
        dev = await device_repo.get_by_uid(device_uid)
        if not dev:
            dev = await device_repo.create_or_update(
                uid=device_uid,
                train_number="12006",
                coach_number="E1",
                name="Telemetry Retention Node",
            )
            await session.commit()

        # Insert 10 readings spaced 30 days into the past (historical retention)
        now = datetime.now(timezone.utc)
        for i in range(reading_count):
            reading_time = now - timedelta(days=i * 15, hours=i)
            reading = TelemetryReading(
                device_id=dev.id,
                device_uid=device_uid,
                train_number="12006",
                coach_number="E1",
                tank_index=1,
                timestamp=reading_time,
                raw_level_percent=50.0 + i,
                level_percent=50.0 + i,
                volume_liters=300.0 + (i * 10),
                height_cm=25.0 + (i * 0.5),
                sensor_valid=True,
            )
            session.add(reading)
        await session.commit()

    # Reopen session to verify all 10 historical readings remain intact
    async with AsyncSessionLocal() as session2:
        stmt = (
            select(TelemetryReading)
            .where(TelemetryReading.device_uid == device_uid)
            .order_by(TelemetryReading.timestamp.asc())
        )
        result = await session2.execute(stmt)
        readings = result.scalars().all()

        assert len(readings) == reading_count, f"Expected {reading_count} historical readings, found {len(readings)}"
        # Verify oldest reading is > 100 days old (no automatic TTL expiration)
        oldest = readings[0]
        oldest_ts = oldest.timestamp if oldest.timestamp.tzinfo else oldest.timestamp.replace(tzinfo=timezone.utc)
        assert oldest_ts < (datetime.now(timezone.utc) - timedelta(days=100))


@pytest.mark.asyncio
async def test_6_multi_device_sync_outbox_queue():
    """TEST 6: Multi-device sync outbox queue."""
    mutation_id = "test_mutation_outbox_999"

    async with AsyncSessionLocal() as session:
        outbox_repo = OutboxRepository(session)
        event = await outbox_repo.create_event(
            event_type="TRAIN_UPDATED",
            entity_type="TRAIN",
            entity_id="12301",
            operation="UPDATE",
            payload={"train_number": "12301", "name": "Updated Express", "mutation_id": mutation_id},
        )
        event_id = event.id
        await session.commit()

    # Verify event is queued as PENDING
    async with AsyncSessionLocal() as session2:
        res = await session2.execute(select(SyncOutboxEvent).where(SyncOutboxEvent.id == event_id))
        ev = res.scalar_one_or_none()
        assert ev is not None
        assert ev.status == "PENDING"
        assert ev.entity_id == "12301"

    # Flush outbox worker
    flushed = await flush_outbox_events(batch_size=500)
    assert flushed >= 1

    # Verify event transitioned to PUBLISHED
    async with AsyncSessionLocal() as session3:
        res3 = await session3.execute(select(SyncOutboxEvent).where(SyncOutboxEvent.id == event_id))
        ev3 = res3.scalar_one_or_none()
        assert ev3 is not None
        assert ev3.status == "PUBLISHED"
        assert ev3.published_at is not None


@pytest.mark.asyncio
async def test_7_manual_deletion_audit_record():
    """TEST 7: Manual deletion audit record."""
    train_number = "12999"

    async with AsyncSessionLocal() as session:
        await session.execute(delete(DeletionAuditRecord).where(DeletionAuditRecord.entity_identifier == train_number))
        await session.execute(delete(Train).where(Train.train_number == train_number))
        await session.commit()

        train = Train(
            train_number=train_number,
            name="Test Audit Deletion Express",
            region="WEST",
        )
        session.add(train)
        await session.commit()

        # Simulate explicit administrative deletion
        snapshot = {"train_number": train_number, "name": "Test Audit Deletion Express", "region": "WEST"}
        audit = DeletionAuditRecord(
            admin_username="admin@panorama.railways.gov",
            entity_type="TRAIN",
            entity_identifier=train_number,
            entity_id=train.id,
            snapshot_json=json.dumps(snapshot),
            reason="Train decommissioned per zonal railway notification 2026/A4",
            ip_address="192.168.1.100",
        )
        session.add(audit)
        await session.execute(delete(Train).where(Train.train_number == train_number))
        await session.commit()

    # Reopen session to verify deletion audit is permanently retained
    async with AsyncSessionLocal() as session2:
        train_check = (
            await session2.execute(select(Train).where(Train.train_number == train_number))
        ).scalar_one_or_none()
        assert train_check is None, "Train should have been deleted from active fleet"

        audit_check = (
            await session2.execute(
                select(DeletionAuditRecord).where(DeletionAuditRecord.entity_identifier == train_number)
            )
        ).scalar_one_or_none()
        assert audit_check is not None, "DeletionAuditRecord must be permanently retained"
        assert audit_check.admin_username == "admin@panorama.railways.gov"
        assert "2026/A4" in audit_check.reason
        data = json.loads(audit_check.snapshot_json)
        assert data["train_number"] == train_number


def test_8_backup_and_restore_recovery(tmp_path):
    """TEST 8: Backup and restore recovery."""
    backup_dir = str(tmp_path / "backups")
    restore_file = str(tmp_path / "restored.db")

    # Run backup to temporary directory
    gz_path = run_backup(output_dir=backup_dir)
    assert os.path.exists(gz_path), "Backup archive was not created"
    assert gz_path.endswith(".gz")

    # Run restore to temporary restore target
    success = run_restore(gz_path, target_path=restore_file)
    assert success is True, "Restore failed"
    assert os.path.exists(restore_file), "Restored database file does not exist"
