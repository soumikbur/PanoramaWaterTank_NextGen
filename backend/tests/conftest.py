"""Pytest configuration and global fixtures."""
import pytest
import pytest_asyncio
from app.core.rate_limit import login_limiter, registration_limiter
from app.core.database import init_db


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Reset in-memory rate limiters before each test run."""
    login_limiter.reset()
    registration_limiter.reset()
    yield
    login_limiter.reset()
    registration_limiter.reset()


@pytest_asyncio.fixture(autouse=True)
async def initialize_database():
    """Ensure database schema and baseline data are initialized."""
    await init_db()
    yield


