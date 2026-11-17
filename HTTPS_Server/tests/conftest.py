"""Pytest fixtures and environment setup for HTTPS Receiver test suite."""
import os
import pytest
from httpx import ASGITransport, AsyncClient
from backend import config
from backend.main import app
from backend.services.storage_service import storage_service

TEST_TOKEN = "dev_secret_token_123"


@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch):
    """Ensure consistent test environment configuration and clean storage state."""
    monkeypatch.setattr(config, "API_TOKEN", TEST_TOKEN)
    monkeypatch.setattr(config, "ENVIRONMENT", "testing")
    monkeypatch.setattr(config, "MAX_UPLOAD_SIZE", 1048576)
    # Clear in-memory storage before each test
    storage_service.clear()
    yield
    # Clear after test as well
    storage_service.clear()


@pytest.fixture
async def async_client():
    """Asynchronous HTTP test client bound to FastAPI application."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def auth_headers():
    """Standard Bearer token authorization headers."""
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture
def device_token_headers():
    """Standard X-Device-Token authorization headers."""
    return {"X-Device-Token": TEST_TOKEN}
