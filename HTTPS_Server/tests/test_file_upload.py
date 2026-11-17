"""Multipart file upload test suite (Group D)."""
import io
import json
import pytest
from httpx import AsyncClient
from backend import config


@pytest.mark.asyncio
async def test_valid_json_file_upload(async_client: AsyncClient, auth_headers: dict):
    """Verify that uploading a valid telemetry JSON file succeeds with 200."""
    payload = {
        "device_id": "FILE_UPLOAD_TANK_01",
        "timestamp": 1740000100,
        "water_level_cm": 142.0,
        "water_level_percentage": 56.8,
        "sensor_status": "NORMAL",
    }
    file_bytes = json.dumps(payload).encode("utf-8")
    files = {"file": ("telemetry_data.json", io.BytesIO(file_bytes), "application/json")}

    response = await async_client.post("/api/telemetry/file", files=files, headers=auth_headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["message"] == "Telemetry file ingested"
    assert res_data["filename"] == "telemetry_data.json"
    assert res_data["device_id"] == "FILE_UPLOAD_TANK_01"
    assert res_data["data"]["water_level_cm"] == 142.0


@pytest.mark.asyncio
async def test_valid_json_file_upload_with_custom_vars(async_client: AsyncClient, auth_headers: dict):
    """Verify that custom arbitrary variables inside uploaded JSON file are preserved."""
    payload = {
        "device_id": "FILE_UPLOAD_CUSTOM_DEV",
        "water_level_cm": 95.0,
        "firmware_hash": "a1b2c3d4",
        "cell_tower_id": 48210,
        "nested_meta": {"boot_count": 14, "reset_reason": "POWER_ON"},
    }
    file_bytes = json.dumps(payload).encode("utf-8")
    files = {"file": ("custom_report.json", io.BytesIO(file_bytes), "application/json")}

    response = await async_client.post("/api/telemetry/file", files=files, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["firmware_hash"] == "a1b2c3d4"
    assert data["cell_tower_id"] == 48210
    assert data["nested_meta"]["boot_count"] == 14


@pytest.mark.asyncio
async def test_invalid_file_extension(async_client: AsyncClient, auth_headers: dict):
    """Verify that uploading non-JSON files (e.g. image, binary) returns 400."""
    dummy_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    files = {"file": ("firmware.bin", io.BytesIO(dummy_bytes), "application/octet-stream")}

    response = await async_client.post("/api/telemetry/file", files=files, headers=auth_headers)
    assert response.status_code == 400
    assert "Invalid file format" in response.json()["detail"]


@pytest.mark.asyncio
async def test_malformed_json_file(async_client: AsyncClient, auth_headers: dict):
    """Verify that uploading a corrupted or malformed JSON file returns 400."""
    corrupted_bytes = b'{"device_id": "CORRUPT", "water_level_cm": '
    files = {"file": ("bad_data.json", io.BytesIO(corrupted_bytes), "application/json")}

    response = await async_client.post("/api/telemetry/file", files=files, headers=auth_headers)
    assert response.status_code == 400
    assert "Malformed JSON" in response.json()["detail"]


@pytest.mark.asyncio
async def test_empty_file_upload(async_client: AsyncClient, auth_headers: dict):
    """Verify that uploading a 0-byte file returns 400."""
    empty_bytes = b""
    files = {"file": ("empty.json", io.BytesIO(empty_bytes), "application/json")}

    response = await async_client.post("/api/telemetry/file", files=files, headers=auth_headers)
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_file_missing_device_id(async_client: AsyncClient, auth_headers: dict):
    """Verify that uploading a JSON file missing device_id returns 422."""
    payload = {"water_level_cm": 120.0}
    file_bytes = json.dumps(payload).encode("utf-8")
    files = {"file": ("no_device.json", io.BytesIO(file_bytes), "application/json")}

    response = await async_client.post("/api/telemetry/file", files=files, headers=auth_headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_file_oversized_rejected(async_client: AsyncClient, auth_headers: dict, monkeypatch):
    """Verify that files exceeding MAX_UPLOAD_SIZE are rejected with 413."""
    # Temporarily set max upload size to 100 bytes for test
    monkeypatch.setattr(config, "MAX_UPLOAD_SIZE", 100)
    oversized_bytes = json.dumps({
        "device_id": "OVERSIZED_TEST",
        "long_text": "x" * 200,
    }).encode("utf-8")

    files = {"file": ("oversized.json", io.BytesIO(oversized_bytes), "application/json")}
    response = await async_client.post("/api/telemetry/file", files=files, headers=auth_headers)
    assert response.status_code == 413
