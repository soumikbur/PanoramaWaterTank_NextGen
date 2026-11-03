"""Integration tests for FastAPI REST Endpoints."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()


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
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == "admin"


@pytest.mark.asyncio
async def test_tank_live_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/tanks/live")
        assert response.status_code == 200
        data = response.json()
        assert data["trainNumber"] == "12002"
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
