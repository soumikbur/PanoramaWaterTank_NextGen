"""Test MQTT ingestion, edge device auto-discovery, and persistence."""
import pytest
from sqlalchemy import delete, select
from app.core.database import AsyncSessionLocal
from app.mqtt.client import mqtt_service
from app.schemas.telemetry import MqttTelemetryPayload
from app.models.device import Device
from app.models.telemetry import TelemetryReading


@pytest.mark.asyncio
async def test_mqtt_unconfigured_train_auto_discovery():
    """Verify that edge devices publishing with default/unconfigured firmware strings

    (e.g. trno='abcd123', chno='pano123') are successfully discovered, marked online,
    and have their telemetry persisted without recreating phantom trains.
    """
    test_uid = "00AA00000000000000000099"
    payload = MqttTelemetryPayload(
        uid=test_uid,
        trno="abcd123",
        chno="pano123",
        lat=22.556969,
        long=88.352647,
        speed=0.9,
        bat=97.1,
        temp=25.7,
        wlp1=45.5,
        wlp2=0.0,
        wlvl=True,
        wlv2=False,
    )

    try:
        # Process telemetry
        await mqtt_service.process_telemetry(payload, topic=test_uid)

        # Verify device exists, is online, is DISCOVERED, and unassigned to phantom train
        async with AsyncSessionLocal() as session:
            res = await session.execute(select(Device).where(Device.uid == test_uid))
            device = res.scalar_one_or_none()
            assert device is not None
            assert device.is_online is True
            assert device.status in ["DISCOVERED", "AVAILABLE"]
            assert device.train_number == "UNASSIGNED"

            # Verify telemetry reading was persisted
            res_t = await session.execute(
                select(TelemetryReading)
                .where(TelemetryReading.device_id == device.id)
                .order_by(TelemetryReading.timestamp.desc())
            )
            reading = res_t.scalars().first()
            assert reading is not None
            assert reading.level_percent == 45.5
            assert reading.latitude == 22.556969
            assert reading.longitude == 88.352647
            assert reading.speed_kmh == 0.9
            assert reading.battery_v1 == 97.1
    finally:
        async with AsyncSessionLocal() as session:
            dev = (await session.execute(select(Device).where(Device.uid == test_uid))).scalar_one_or_none()
            if dev is not None:
                await session.execute(delete(TelemetryReading).where(TelemetryReading.device_id == dev.id))
                await session.execute(delete(Device).where(Device.id == dev.id))
                await session.commit()
