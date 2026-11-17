"""Security, limits, and resilience test suite (Group F)."""
import io
import json
import pytest
from httpx import AsyncClient
from backend import config


@pytest.mark.asyncio
async def test_tokens_never_leaked_in_responses(async_client: AsyncClient, auth_headers: dict):
    """Verify that sensitive API tokens and credentials are never leaked in responses or error traces."""
    # 1. Health
    res = await async_client.get("/api/health")
    assert config.API_TOKEN.lower() not in res.text.lower()

    # 2. System info
    res = await async_client.get("/api/system/info")
    assert config.API_TOKEN.lower() not in res.text.lower()

    # 3. Telemetry response
    res = await async_client.post(
        "/api/telemetry",
        json={"device_id": "SEC_CHECK"},
        headers=auth_headers,
    )
    assert config.API_TOKEN.lower() not in res.text.lower()

    # 4. Error response
    res = await async_client.post(
        "/api/telemetry",
        json={"device_id": "SEC_CHECK"},
        headers={"Authorization": "Bearer bad_secret"},
    )
    assert config.API_TOKEN.lower() not in res.text.lower()


@pytest.mark.asyncio
async def test_gateway_size_limiter_middleware(async_client: AsyncClient, auth_headers: dict, monkeypatch):
    """Verify that requests with oversized Content-Length header are rejected at gateway level with 413."""
    monkeypatch.setattr(config, "MAX_UPLOAD_SIZE", 500)
    fake_large_body = json.dumps({"device_id": "OVERSIZE", "data": "a" * 600})
    response = await async_client.post(
        "/api/telemetry",
        content=fake_large_body,
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(fake_large_body)),
            **auth_headers,
        },
    )
    assert response.status_code == 413
    assert "Payload size exceeds limit" in response.json()["message"]


@pytest.mark.asyncio
async def test_path_traversal_filename_resilience(async_client: AsyncClient, auth_headers: dict):
    """Verify that path traversal attempts in uploaded filenames cannot breach the server."""
    payload = {"device_id": "TRAVERSAL_DEV", "water_level_cm": 110.0}
    file_bytes = json.dumps(payload).encode("utf-8")

    # Filename with path traversal sequences
    malicious_filenames = [
        "../../../../etc/passwd.json",
        "..\\..\\windows\\system32\\drivers.json",
        "/etc/shadow.json",
    ]

    for fname in malicious_filenames:
        files = {"file": (fname, io.BytesIO(file_bytes), "application/json")}
        response = await async_client.post("/api/telemetry/file", files=files, headers=auth_headers)
        assert response.status_code == 200
        # Telemetry must still be processed safely in memory
        assert response.json()["device_id"] == "TRAVERSAL_DEV"
