"""Health and baseline endpoint test suite for HTTPS Receiver."""
import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    """Verify that /api/health responds with status online and correct version."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert data["application"] == "Panorama WLI HTTPS Receiver"
        assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_root_dashboard_html():
    """Verify that GET / returns the HTML dashboard shell."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Panorama WLI — HTTPS Laboratory" in response.text


@pytest.mark.asyncio
async def test_docs_and_openapi_endpoints():
    """Verify that /docs and /openapi.json are accessible."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        docs_res = await client.get("/docs")
        assert docs_res.status_code == 200
        assert "text/html" in docs_res.headers["content-type"]

        openapi_res = await client.get("/openapi.json")
        assert openapi_res.status_code == 200
        schema = openapi_res.json()
        assert schema["info"]["title"] == "Panorama Water Tank — HTTPS Receiver"
        assert "/api/health" in schema["paths"]


@pytest.mark.asyncio
async def test_static_assets_delivery():
    """Verify that CSS and JavaScript static assets are served properly."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        css_res = await client.get("/static/css/style.css")
        assert css_res.status_code == 200
        assert "text/css" in css_res.headers["content-type"]

        js_res = await client.get("/static/js/app.js")
        assert js_res.status_code == 200
        assert "javascript" in js_res.headers["content-type"]


@pytest.mark.asyncio
async def test_no_secrets_leaked():
    """Verify that no sensitive configuration or secret token is exposed."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        health_res = await client.get("/api/health")
        content = health_res.text.lower()
        assert "token" not in content
        assert "secret" not in content
        assert "password" not in content
