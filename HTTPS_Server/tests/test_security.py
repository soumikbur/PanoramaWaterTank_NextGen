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


@pytest.mark.asyncio
async def test_cors_preflight_and_explicit_github_pages_origin(async_client: AsyncClient, auth_headers: dict):
    """Verify CORS allows GitHub Pages origin (including OPTIONS preflight without token) and rejects unknown origins."""
    gh_origin = "https://soumikbur.github.io"

    # 1. OPTIONS preflight on protected endpoint must succeed without Bearer token
    preflight = await async_client.options(
        "/api/telemetry/latest",
        headers={
            "Origin": gh_origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == gh_origin
    assert "authorization" in (preflight.headers.get("access-control-allow-headers") or "").lower()

    # 2. Public health & protected telemetry endpoints return explicit ACAO header
    health_res = await async_client.get("/api/health", headers={"Origin": gh_origin})
    assert health_res.status_code == 200
    assert health_res.headers.get("access-control-allow-origin") == gh_origin

    latest_res = await async_client.get("/api/telemetry/latest", headers={"Origin": gh_origin, **auth_headers})
    assert latest_res.status_code == 200
    assert latest_res.headers.get("access-control-allow-origin") == gh_origin

    # 3. Unknown origin is NOT granted Access-Control-Allow-Origin
    evil_res = await async_client.get("/api/health", headers={"Origin": "https://untrusted.example.com"})
    assert evil_res.status_code == 200
    assert evil_res.headers.get("access-control-allow-origin") is None


@pytest.mark.asyncio
async def test_telemetry_upload_endpoint_alias(async_client: AsyncClient, auth_headers: dict):
    """Verify POST /api/telemetry/upload works alongside /api/telemetry/file for the HTTPS Laboratory frontend."""
    payload = {"device_id": "UPLOAD_ALIAS_01", "water_level_cm": 88.5, "water_level_percentage": 59.0}
    files = {"file": ("batch.json", io.BytesIO(json.dumps(payload).encode("utf-8")), "application/json")}
    res = await async_client.post(
        "/api/telemetry/upload",
        files=files,
        headers={"Origin": "https://soumikbur.github.io", **auth_headers},
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "https://soumikbur.github.io"
    assert res.json()["device_id"] == "UPLOAD_ALIAS_01"


@pytest.mark.asyncio
async def test_cors_headers_on_401_404_and_413_error_responses(async_client: AsyncClient, monkeypatch):
    """Verify 401, 404, and 413 error responses all retain explicit Access-Control-Allow-Origin."""
    gh_origin = "https://soumikbur.github.io"

    # 401 Unauthorized
    r401 = await async_client.get("/api/telemetry/latest", headers={"Origin": gh_origin})
    assert r401.status_code == 401
    assert r401.headers.get("access-control-allow-origin") == gh_origin

    # 404 Not Found
    r404 = await async_client.get("/api/nonexistent-route", headers={"Origin": gh_origin})
    assert r404.status_code == 404
    assert r404.headers.get("access-control-allow-origin") == gh_origin

    # 413 Payload Too Large (gateway middleware)
    monkeypatch.setattr(config, "MAX_UPLOAD_SIZE", 100)
    r413 = await async_client.post(
        "/api/telemetry",
        content='{"device_id":"BIG","pad":"' + ("x" * 200) + '"}',
        headers={"Origin": gh_origin, "Content-Type": "application/json", "Content-Length": "250"},
    )
    assert r413.status_code == 413
    assert r413.headers.get("access-control-allow-origin") == gh_origin
