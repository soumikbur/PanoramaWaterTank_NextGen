"""Pytest configuration and global fixtures."""
import pytest
from app.core.rate_limit import login_limiter, registration_limiter


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Reset in-memory rate limiters before each test run."""
    login_limiter.reset()
    registration_limiter.reset()
    yield
    login_limiter.reset()
    registration_limiter.reset()

