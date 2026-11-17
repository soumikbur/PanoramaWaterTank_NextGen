"""System information and diagnostics test suite."""
import pytest
from httpx import AsyncClient
from backend import config


@pytest.mark.asyncio
async def test_system_info_endpoint(async_client: AsyncClient, auth_headers: dict):
    """Verify that GET /api/system/info returns accurate system diagnostics without leaking secrets."""
    # Post one record first
    await async_client.post(
        "/api/telemetry",
        json={"device_id": "SYS_INFO_TEST", "water_level_cm": 50.0},
        headers=auth_headers,
    )

    response = await async_client.get("/api/system/info")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "online"
    assert data["application"] == config.APP_TITLE
    assert data["version"] == config.APP_VERSION
    assert data["environment"] == "testing"
    assert "uptime_seconds" in data
    assert "server_time" in data

    storage = data["storage"]
    assert storage["total_records_ingested"] == 1
    assert storage["tracked_devices_count"] == 1
    assert "SYS_INFO_TEST" in storage["tracked_devices"]

    # Security verification: tokens must never be present
    text = response.text.lower()
    assert "dev_secret_token" not in text
    assert config.API_TOKEN.lower() not in text
