"""Authentication and security test suite (Group C)."""
import pytest
from httpx import AsyncClient
from backend import config


@pytest.mark.asyncio
async def test_missing_authorization_header(async_client: AsyncClient):
    """Verify that requests without an authorization header are rejected with 401."""
    response = await async_client.post(
        "/api/telemetry",
        json={"device_id": "AUTH_TEST"},
    )
    assert response.status_code == 401
    assert "detail" in response.json()


@pytest.mark.asyncio
async def test_invalid_bearer_token(async_client: AsyncClient):
    """Verify that requests with an incorrect Bearer token are rejected with 401."""
    response = await async_client.post(
        "/api/telemetry",
        json={"device_id": "AUTH_TEST"},
        headers={"Authorization": "Bearer wrong_token_xyz"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_valid_bearer_token(async_client: AsyncClient, auth_headers: dict):
    """Verify that requests with a valid Bearer token succeed with 200."""
    response = await async_client.post(
        "/api/telemetry",
        json={"device_id": "AUTH_TEST"},
        headers=auth_headers,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_valid_x_device_token(async_client: AsyncClient, device_token_headers: dict):
    """Verify that devices using X-Device-Token header authenticate successfully."""
    response = await async_client.post(
        "/api/telemetry",
        json={"device_id": "AUTH_TEST_DEVICE_HEADER"},
        headers=device_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


@pytest.mark.asyncio
async def test_malformed_authorization_header(async_client: AsyncClient):
    """Verify that malformed or non-Bearer authorization schemes are rejected with 401."""
    malformed_headers = [
        {"Authorization": "Basic dXNlcjpwYXNz"},
        {"Authorization": "Bearer "},
        {"Authorization": "Token 12345"},
        {"Authorization": ""},
    ]
    for headers in malformed_headers:
        response = await async_client.post(
            "/api/telemetry",
            json={"device_id": "AUTH_TEST"},
            headers=headers,
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_unconfigured_server_token_rejects(async_client: AsyncClient, monkeypatch):
    """Verify that if the server has no configured API token, requests are rejected safely."""
    monkeypatch.setattr(config, "API_TOKEN", "")
    response = await async_client.post(
        "/api/telemetry",
        json={"device_id": "AUTH_TEST"},
        headers={"Authorization": "Bearer dev_secret_token_123"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_incorrect_and_empty_device_token_rejected(async_client: AsyncClient):
    """Verify incorrect, empty, whitespace, and header-name-as-value X-Device-Token return 401."""
    bad_headers = [
        {"X-Device-Token": "wrong_device_token"},
        {"X-Device-Token": ""},
        {"X-Device-Token": "   "},
        {"X-Device-Token": "X-Device-Token"},
        {"x-device-token": "x-device-token"},
        {"Authorization": "Bearer Authorization"},
    ]
    for headers in bad_headers:
        response = await async_client.post(
            "/api/telemetry",
            json={"device_id": "AUTH_TEST"},
            headers=headers,
        )
        assert response.status_code == 401, f"Expected 401 for {headers}"


@pytest.mark.asyncio
async def test_case_insensitive_headers_and_bearer_scheme(async_client: AsyncClient):
    """Verify case-insensitive header names and Bearer scheme work reliably."""
    token = config.API_TOKEN
    valid_variants = [
        {"authorization": f"bearer {token}"},
        {"AUTHORIZATION": f"BEARER {token}"},
        {"x-device-token": token},
        {"X-DEVICE-TOKEN": token},
        {"X-Device-Token": f"  {token}  "},
    ]
    for idx, headers in enumerate(valid_variants):
        response = await async_client.post(
            "/api/telemetry",
            json={"device_id": f"CASE_DEV_{idx}", "water_level_cm": 50.0 + idx},
            headers=headers,
        )
        assert response.status_code == 200, f"Expected 200 for {headers}, got {response.status_code}"


@pytest.mark.asyncio
async def test_valid_token_with_invalid_json_returns_422(async_client: AsyncClient, device_token_headers: dict):
    """Verify valid X-Device-Token with invalid JSON body returns 422 (auth passes, validation fails)."""
    resp = await async_client.post(
        "/api/telemetry",
        content="{not valid json",
        headers={"Content-Type": "application/json", **device_token_headers},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_postman_wli_lab_node_02_payload_and_sqlite_persistence(
    async_client: AsyncClient, device_token_headers: dict
):
    """Verify the full 16-field Postman payload ingests via X-Device-Token and writes to SQLite."""
    from backend.services.storage_service import storage_service

    payload = {
        "device_id": "WLI_LAB_NODE_02",
        "sequence_id": 1001,
        "timestamp": 1794994114,
        "water_level_cm": 112.5,
        "water_level_percentage": 75,
        "raw_voltage": 3.5,
        "pressure_bar": 0.11,
        "sensor_status": "NORMAL",
        "latitude": 22.5726,
        "longitude": 88.3639,
        "gps_valid": True,
        "battery_voltage": 12.6,
        "alarm_status": "NONE",
        "signal_csq": 28,
        "coach_id": "pano123",
        "train_number": "12841",
    }

    assert storage_service.get_db_record_count("WLI_LAB_NODE_02") == 0

    post_resp = await async_client.post("/api/telemetry", json=payload, headers=device_token_headers)
    assert post_resp.status_code == 200
    body = post_resp.json()
    assert body["status"] == "success"
    assert body["device_id"] == "WLI_LAB_NODE_02"
    assert body["data"]["pressure_bar"] == 0.11
    assert body["data"]["signal_csq"] == 28
    assert body["data"]["coach_id"] == "pano123"
    assert body["data"]["train_number"] == "12841"

    # Confirm actual SQLite database row insertion
    assert storage_service.get_db_record_count("WLI_LAB_NODE_02") == 1

    # Confirm retrieval via GET /api/telemetry/latest and /history
    latest_resp = await async_client.get(
        "/api/telemetry/latest?device_id=WLI_LAB_NODE_02", headers=device_token_headers
    )
    assert latest_resp.status_code == 200
    assert latest_resp.json()["data"]["water_level_cm"] == 112.5

    hist_resp = await async_client.get(
        "/api/telemetry/history?device_id=WLI_LAB_NODE_02&limit=10", headers=device_token_headers
    )
    assert hist_resp.status_code == 200
    assert hist_resp.json()["count"] == 1
