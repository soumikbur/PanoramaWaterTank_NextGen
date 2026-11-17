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
