"""Telemetry JSON ingestion test suite (Group B)."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_post_valid_telemetry_json(async_client: AsyncClient, auth_headers: dict):
    """Verify that a standard STM32 + EC200U telemetry payload is ingested successfully."""
    payload = {
        "device_id": "WLI_TANK_STM32_01",
        "timestamp": 1740000000,
        "water_level_cm": 185.5,
        "water_level_percentage": 74.2,
        "raw_voltage": 2.45,
        "sensor_status": "NORMAL",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "gps_valid": True,
        "battery_voltage": 12.6,
        "alarm_status": "NONE",
    }
    response = await async_client.post("/api/telemetry", json=payload, headers=auth_headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["device_id"] == "WLI_TANK_STM32_01"
    assert "received_at" in res_data
    assert res_data["data"]["water_level_cm"] == 185.5
    assert res_data["data"]["water_level_percentage"] == 74.2
    assert res_data["data"]["gps_valid"] is True
    assert res_data["data"]["device_id"] == "WLI_TANK_STM32_01"


@pytest.mark.asyncio
async def test_post_telemetry_missing_device_id(async_client: AsyncClient, auth_headers: dict):
    """Verify that omitting device_id returns 422 Unprocessable Entity."""
    payload = {
        "water_level_cm": 150.0,
        "sensor_status": "NORMAL",
    }
    response = await async_client.post("/api/telemetry", json=payload, headers=auth_headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_post_telemetry_empty_device_id(async_client: AsyncClient, auth_headers: dict):
    """Verify that an empty or whitespace device_id returns 422 Unprocessable Entity."""
    payload = {
        "device_id": "   ",
        "water_level_cm": 150.0,
    }
    response = await async_client.post("/api/telemetry", json=payload, headers=auth_headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_dynamic_variables_preservation(async_client: AsyncClient, auth_headers: dict):
    """Verify that unexpected, custom firmware variables are preserved dynamically."""
    payload = {
        "device_id": "EC200U_LAB_TEST",
        "water_level_cm": 210.0,
        # Dynamic arbitrary firmware variables
        "signal_csq": 28,
        "rat": "LTE-CAT1",
        "firmware_rev": "STM32_FW_V2.4",
        "ambient_temp_mcu": 32.5,
        "relay_states": {"pump_active": False, "solenoid_open": True},
        "diagnostic_codes": [101, 104, 200],
    }
    response = await async_client.post("/api/telemetry", json=payload, headers=auth_headers)
    assert response.status_code == 200
    res_data = response.json()
    data = res_data["data"]

    assert data["signal_csq"] == 28
    assert data["rat"] == "LTE-CAT1"
    assert data["firmware_rev"] == "STM32_FW_V2.4"
    assert data["ambient_temp_mcu"] == 32.5
    assert data["relay_states"]["solenoid_open"] is True
    assert data["diagnostic_codes"] == [101, 104, 200]
    assert res_data["variables_count"] >= 7


@pytest.mark.asyncio
async def test_native_data_types_preserved(async_client: AsyncClient, auth_headers: dict):
    """Verify that all JSON primitive and nested types retain their native Python types."""
    payload = {
        "device_id": "TYPE_CHECK_DEVICE",
        "int_val": 42,
        "float_val": 3.14159,
        "bool_true": True,
        "bool_false": False,
        "null_val": None,
        "str_val": "ec200u_test_stream",
        "nested_dict": {"sub_key": 99, "active": True},
        "nested_list": ["a", "b", "c"],
    }
    response = await async_client.post("/api/telemetry", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()["data"]

    assert isinstance(data["int_val"], int)
    assert data["int_val"] == 42
    assert isinstance(data["float_val"], float)
    assert data["float_val"] == 3.14159
    assert data["bool_true"] is True
    assert data["bool_false"] is False
    assert data["null_val"] is None
    assert data["str_val"] == "ec200u_test_stream"
    assert isinstance(data["nested_dict"], dict)
    assert isinstance(data["nested_list"], list)


@pytest.mark.asyncio
async def test_reception_timestamp_attached(async_client: AsyncClient, auth_headers: dict):
    """Verify that server UTC reception timestamp is attached and preserved alongside device timestamp."""
    payload = {
        "device_id": "TIMESTAMP_CHECK_DEVICE",
        "timestamp": "2026-11-17T08:00:00Z",
    }
    response = await async_client.post("/api/telemetry", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()["data"]

    assert data["timestamp"] == "2026-11-17T08:00:00Z"
    assert "received_at" in data
    # Server reception timestamp must be ISO 8601 string
    assert "T" in data["received_at"]


@pytest.mark.asyncio
async def test_invalid_json_body(async_client: AsyncClient, auth_headers: dict):
    """Verify that malformed JSON request body returns 422 Unprocessable Entity."""
    response = await async_client.post(
        "/api/telemetry",
        content="This is not JSON at all!",
        headers={"Content-Type": "application/json", **auth_headers},
    )
    assert response.status_code == 422
