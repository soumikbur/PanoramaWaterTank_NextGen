"""Regression tests for hardware UID preservation, exclusive coach assignment, and MQTT mapping safety."""
import pytest
from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal, init_db
from app.core.device_identity import get_canonical_uid, is_genuine_hardware_uid
from app.models.coach import Coach
from app.models.device import Device
from app.models.tank import Tank
from app.models.telemetry import TelemetryReading
from app.models.train import Train
from app.mqtt.client import mqtt_service
from app.repositories.device_repo import DeviceRepository
from app.schemas.telemetry import MqttTelemetryPayload


def test_hardware_uids_are_distinct_without_aliasing():
    dev1 = "0023004D4B42501120353332"
    dev2 = "002F00654B42501320353332"
    assert is_genuine_hardware_uid(dev1) is True
    assert is_genuine_hardware_uid(dev2) is True
    assert get_canonical_uid(dev1) == dev1
    assert get_canonical_uid(dev2) == dev2
    assert get_canonical_uid(dev1) != get_canonical_uid(dev2)


@pytest.mark.asyncio
async def test_exclusive_assignment_and_telemetry_preserves_admin_mapping():
    await init_db()
    test_uid_1 = "00AA00000000000000000001"
    test_uid_2 = "00AA00000000000000000002"
    test_train = "99401"

    try:
        async with AsyncSessionLocal() as db:
            train = Train(train_number=test_train, name="Identity Regression", region="EAST", total_coaches=2)
            db.add(train)
            await db.flush()
            db.add(Coach(id=f"{test_train}-C1", train_id=train.id, train_number=test_train, coach_number="C1", device_uid=test_uid_1, position=1))
            db.add(Coach(id=f"{test_train}-C2", train_id=train.id, train_number=test_train, coach_number="C2", device_uid=None, position=2))
            repo = DeviceRepository(db)
            await repo.create_or_update(
                uid=test_uid_1,
                train_number=test_train,
                coach_number="C1",
                name="Unit Test WLI 1",
                status="ENGAGED",
            )
            await repo.create_or_update(
                uid=test_uid_2,
                train_number=test_train,
                coach_number="C1",
                name="Unit Test WLI 2",
                status="ENGAGED",
            )
            await repo.sync_exclusive_assignment(uid=test_uid_2, train_number=test_train, coach_number="C1")
            await db.commit()

            d1 = await repo.get_by_uid(test_uid_1)
            d2 = await repo.get_by_uid(test_uid_2)
            assert d1 is not None and d1.train_number == "UNASSIGNED" and d1.coach_number == "UNASSIGNED"
            assert d2 is not None and d2.train_number == test_train and d2.coach_number == "C1"

            # Re-bind test_uid_1 to C2 and confirm telemetry with stale trno cannot overwrite admin mapping
            d1.train_number = test_train
            d1.coach_number = "C2"
            d1.status = "ENGAGED"
            c2 = (await db.execute(select(Coach).where(Coach.id == f"{test_train}-C2"))).scalar_one()
            c2.device_uid = test_uid_1
            await db.commit()

        await mqtt_service.process_telemetry(
            MqttTelemetryPayload(uid=test_uid_1, trno="99999", chno="B9", wlp1=55.0, wlp2=60.0),
            topic=f"panorama/telemetry/{test_uid_1}",
        )
        # Non-hardware junk must still be ignored
        await mqtt_service.process_telemetry(
            MqttTelemetryPayload(uid="AUDIT-DEV-999", trno=test_train, chno="C1", wlp1=10.0),
            topic="panorama/telemetry/AUDIT-DEV-999",
        )

        async with AsyncSessionLocal() as db:
            d1_after = (await db.execute(select(Device).where(Device.uid == test_uid_1))).scalar_one()
            assert d1_after.train_number == test_train
            assert d1_after.coach_number == "C2"
            assert d1_after.is_online is True
            junk = (await db.execute(select(Device).where(Device.uid == "AUDIT-DEV-999"))).scalar_one_or_none()
            assert junk is None
    finally:
        async with AsyncSessionLocal() as db:
            devs = (await db.execute(select(Device).where(Device.uid.in_([test_uid_1, test_uid_2, "AUDIT-DEV-999"])))).scalars().all()
            dev_ids = [d.id for d in devs]
            if dev_ids:
                await db.execute(delete(TelemetryReading).where(TelemetryReading.device_id.in_(dev_ids)))
                await db.execute(delete(Tank).where(Tank.device_id.in_(dev_ids)))
                await db.execute(delete(Device).where(Device.id.in_(dev_ids)))
            await db.execute(delete(Coach).where(Coach.train_number == test_train))
            await db.execute(delete(Train).where(Train.train_number == test_train))
            await db.commit()
