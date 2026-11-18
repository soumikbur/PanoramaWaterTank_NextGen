"""Security and authentication utilities for HTTPS Receiver."""
import secrets
from typing import Optional
from fastapi import HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from backend import config

bearer_scheme = HTTPBearer(auto_error=False)
device_token_scheme = APIKeyHeader(name="X-Device-Token", auto_error=False)

# Guard against misconfigured clients sending the header name itself as the credential value
_RESERVED_HEADER_NAMES = frozenset({
    "authorization",
    "bearer",
    "x-device-token",
    "x-api-key",
    "api-key",
})


def get_configured_token() -> str:
    """Retrieve the active API token from environment configuration."""
    return config.API_TOKEN.strip()


def _extract_bearer_token(raw_auth: str) -> str:
    """Strictly parse 'Authorization: Bearer <token>' with case-insensitive scheme."""
    parts = raw_auth.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Malformed Authorization header. Expected 'Bearer <token>'.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return parts[1].strip()


async def verify_api_token(
    request: Request,
    _bearer: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
    _device_key: Optional[str] = Security(device_token_scheme),
) -> str:
    """Validate incoming request authorization via Bearer token or X-Device-Token header.

    Uses case-insensitive HTTP header lookup and constant-time comparison to protect
    against timing attacks. Never logs token values.
    """
    configured_token = get_configured_token()
    if not configured_token:
        # If no token is configured on server, reject protected access for safety
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Server API token is not configured.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_auth = request.headers.get("authorization")
    raw_device = request.headers.get("x-device-token")

    provided_token: Optional[str] = None

    if raw_auth is not None:
        if raw_auth.strip():
            provided_token = _extract_bearer_token(raw_auth)
        elif raw_device and raw_device.strip():
            provided_token = raw_device.strip()
    elif raw_device is not None:
        provided_token = raw_device.strip()

    if not provided_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Missing API token in Authorization or X-Device-Token header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if provided_token.lower() in _RESERVED_HEADER_NAMES:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid API token provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not secrets.compare_digest(provided_token, configured_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid API token provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return provided_token
