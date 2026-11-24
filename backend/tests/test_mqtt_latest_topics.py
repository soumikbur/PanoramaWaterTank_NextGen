"""Tests for MQTT Latest Message Persistence and Topic Endpoints."""
import json
import uuid
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.mqtt_message import MqttLatestMessage
from app.repositories.mqtt_latest_repo import MqttLatestRepository
from app.mqtt.client import mqtt_service


@pytest.mark.asyncio
async def test_mqtt_latest_repo_upsert_and_retrieve():
    """Verify that MqttLatestRepository accurately upserts and retrieves per-topic records."""
    unique_suffix = uuid.uuid4().hex[:8]
    topic = f"panoramatank/test/device_{unique_suffix}"
    payload_data = {"device_id": "DEV01", "level": 78.5, "status": "ONLINE"}
    payload_str = json.dumps(payload_data)

    async with AsyncSessionLocal() as session:
        repo = MqttLatestRepository(session)
        
        # 1. First upsert (insert)
        rec1 = await repo.upsert(
            topic=topic,
            payload=payload_str,
            payload_type="JSON",
            qos=1,
            retained=True
        )
        await session.commit()
        assert rec1.topic == topic
        assert rec1.message_sequence == 1
        assert rec1.to_dict()["payload"] == payload_data

        # 2. Second upsert on same topic (update)
        updated_data = {"device_id": "DEV01", "level": 82.0, "status": "PUMPING"}
        updated_str = json.dumps(updated_data)
        rec2 = await repo.upsert(
            topic=topic,
            payload=updated_str,
            payload_type="JSON",
            qos=0,
            retained=False
        )
        await session.commit()
        assert rec2.topic == topic
        assert rec2.id == rec1.id
        assert rec2.message_sequence == 2
        assert rec2.qos == 0
        assert rec2.to_dict()["payload"] == updated_data

        # 3. Verify exactly one row in DB for this topic
        all_topic_rows = (await session.execute(
            select(MqttLatestMessage).where(MqttLatestMessage.topic == topic)
        )).scalars().all()
        assert len(all_topic_rows) == 1


@pytest.mark.asyncio
async def test_topic_independence():
    """Verify that multiple topics maintain their independent latest records."""
    uid = uuid.uuid4().hex[:8]
    t1 = f"panoramatank/train123/coach01_{uid}"
    t2 = f"panoramatank/train123/coach02_{uid}"
    t3 = f"panoramatank/telemetry/station01_{uid}"

    async with AsyncSessionLocal() as session:
        repo = MqttLatestRepository(session)
        await repo.upsert(topic=t1, payload=json.dumps({"tank": 1, "pct": 40}))
        await repo.upsert(topic=t2, payload=json.dumps({"tank": 2, "pct": 75}))
        await repo.upsert(topic=t3, payload="RAW_PULSE_SIGNAL_OK", payload_type="TEXT")
        await session.commit()

        r1 = await repo.get_by_topic(t1)
        r2 = await repo.get_by_topic(t2)
        r3 = await repo.get_by_topic(t3)

        assert r1 is not None and r1.to_dict()["payload"]["pct"] == 40
        assert r2 is not None and r2.to_dict()["payload"]["pct"] == 75
        assert r3 is not None and r3.payload == "RAW_PULSE_SIGNAL_OK"


@pytest.mark.asyncio
async def test_out_of_order_protection():
    """Verify out-of-order older messages do not overwrite newer retained messages."""
    uid = uuid.uuid4().hex[:8]
    topic = f"panoramatank/sensor/ooo_{uid}"
    now = datetime.now(timezone.utc)
    earlier = now - timedelta(minutes=10)

    async with AsyncSessionLocal() as session:
        repo = MqttLatestRepository(session)
        
        # Insert newer message first
        await repo.upsert(topic=topic, payload="NEWER_MESSAGE", received_at=now)
        await session.commit()

        # Attempt to insert older message with earlier timestamp
        updated_rec = await repo.upsert(topic=topic, payload="OLDER_MESSAGE", received_at=earlier)
        await session.commit()

        # Content must remain the newer message
        current = await repo.get_by_topic(topic)
        assert current.payload == "NEWER_MESSAGE"


@pytest.mark.asyncio
async def test_mqtt_topic_endpoints():
    """Verify HTTP API endpoints for MQTT latest message retrieval and ingestion."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Ingest message via POST /api/mqtt/topics/{topic}/message
        uid = uuid.uuid4().hex[:8]
        topic_name = f"test/railway/water-monitor_{uid}"
        post_resp = await client.post(
            f"/api/mqtt/topics/{topic_name}/message?publish_to_broker=false",
            json={
                "payload": {"status": "ACTIVE", "level_cm": 95},
                "qos": 1,
                "retain": True
            }
        )
        assert post_resp.status_code == 200
        post_json = post_resp.json()
        assert post_json["status"] == "success"
        assert post_json["topic"] == topic_name

        # Query single topic via GET /api/mqtt/topics/{topic}/latest
        single_resp = await client.get(f"/api/mqtt/topics/{topic_name}/latest")
        assert single_resp.status_code == 200
        single_json = single_resp.json()
        assert single_json["topic"] == topic_name
        assert single_json["payload"]["level_cm"] == 95

        # Query all topics via GET /api/mqtt/topics/latest
        all_resp = await client.get("/api/mqtt/topics/latest")
        assert all_resp.status_code == 200
        all_json = all_resp.json()
        assert all_json["status"] == "success"
        matching = [t for t in all_json["topics"] if t["topic"] == topic_name]
        assert len(matching) == 1

        # Query topic metadata list via GET /api/mqtt/topics
        meta_resp = await client.get("/api/mqtt/topics")
        assert meta_resp.status_code == 200
        meta_json = meta_resp.json()
        assert any(t["topic"] == topic_name for t in meta_json["topics"])

