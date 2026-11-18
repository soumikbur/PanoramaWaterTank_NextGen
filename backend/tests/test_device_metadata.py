"""Tests for device static hardware metadata endpoints."""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_device_metadata_get_put_and_secret_sanitization():
    """Verify GET/PUT /api/v1/devices/{uid}/metadata persists metadata and strips forbidden secret keys."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"username": "@admin", "password": "Admin@123"},
        )
        assert login_res.status_code == 200, login_res.text
        token = login_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {token}"}

        uid = "002F00654B42501320353332"
        create_res = await client.post(
            "/api/v1/devices?upsert=true",
            headers=admin_headers,
            json={
                "uid": uid,
                "name": "WLI Diagnostics Test Node",
                "train_number": "UNASSIGNED",
                "coach_number": "UNASSIGNED",
            },
        )
        assert create_res.status_code in (200, 201), create_res.text

        # Initial GET
        get_res = await client.get(f"/api/v1/devices/{uid}/metadata", headers=admin_headers)
        assert get_res.status_code == 200
        body = get_res.json()
        assert body["uid"] == uid

        # Update metadata including forbidden secret keys to verify stripping
        put_res = await client.put(
            f"/api/v1/devices/{uid}/metadata",
            headers=admin_headers,
            json={
                "deviceName": "Coach 01 WLI Node",
                "deviceType": "Water Level Sensor Node",
                "hardwareModel": "Rev 2.1 Verified",
                "hardware": {
                    "controller": {"model": "STM32F401RET6", "architecture": "ARM Cortex-M4"},
                    "password": "SHOULD_BE_STRIPPED",
                },
                "firmware": {"version": "2.2.0", "buildDate": "2026-11-18"},
                "broker": {"host": "broker.hivemq.com", "port": 8884, "token": "SHOULD_BE_STRIPPED"},
            },
        )
        assert put_res.status_code == 200, put_res.text
        updated = put_res.json()
        assert updated["deviceName"] == "Coach 01 WLI Node"
        assert updated["hardware"]["controller"]["model"] == "STM32F401RET6"
        assert "password" not in updated["hardware"]
        assert "token" not in updated["broker"]
        assert updated["firmware"]["version"] == "2.2.0"

        # Verify persisted via GET
        get_res2 = await client.get(f"/api/v1/devices/{uid}/metadata", headers=admin_headers)
        assert get_res2.status_code == 200
        persisted = get_res2.json()
        assert persisted["hardware"]["controller"]["model"] == "STM32F401RET6"
        assert "password" not in persisted["hardware"]
