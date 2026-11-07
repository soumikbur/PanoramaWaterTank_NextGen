"""Integration tests for FastAPI REST Endpoints."""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_root_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/?format=json")
        assert response.status_code == 200
        data = response.json()
        assert "app" in data
        assert data["version"] == "2.0.0"


@pytest.mark.asyncio
async def test_root_html_react_application():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/", headers={"Accept": "text/html,application/xhtml+xml"})
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert "Panorama Water Tank Monitor" in response.text
        assert 'id="root"' in response.text


@pytest.mark.asyncio
async def test_spa_fallback_route():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/trains")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert 'id="root"' in response.text


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["HEALTHY", "DEGRADED"]


@pytest.mark.asyncio
async def test_auth_login():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test Admin login
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "@admin", "password": "Admin@123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["role"] == "ADMIN"

        # Test Employee login
        response_emp = await client.post(
            "/api/v1/auth/login",
            json={"username": "@employee", "password": "Employee@123"}
        )
        assert response_emp.status_code == 200
        data_emp = response_emp.json()
        assert "access_token" in data_emp
        assert data_emp["user"]["role"] == "EMPLOYEE"


@pytest.mark.asyncio
async def test_tank_live_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/tanks/live")
        assert response.status_code == 200
        data = response.json()
        assert data["trainNumber"] in ["12002", "225256"]
        assert data["coachNumber"] == "B4"
        assert "capacityLiters" in data
        assert "rank" in data


@pytest.mark.asyncio
async def test_telemetry_history():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/telemetry/history?range=24h")
        assert response.status_code == 200
        data = response.json()
        assert "stats" in data
        assert "dataPoints" in data


@pytest.mark.asyncio
async def test_csv_export():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/export/csv?range=24h")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "Timestamp,Train_Number,Coach_Number" in response.text


@pytest.mark.asyncio
async def test_device_connection_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Unauthenticated request should be rejected with 401
        unauth_resp = await client.post("/api/v1/settings/test-device")
        assert unauth_resp.status_code == 401

        # Authenticated user succeeds
        login_res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.post("/api/v1/settings/test-device", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "target" in data
        assert "status" in data
        assert "reachable" in data


@pytest.mark.asyncio
async def test_cors_preflight():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/api/v1/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
        assert response.headers.get("access-control-allow-credentials") == "true"
