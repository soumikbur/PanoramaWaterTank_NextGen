"""Security and authentication utilities for HTTPS Receiver."""
import secrets
from typing import Optional
from fastapi import HTTPException, Security, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from backend import config

bearer_scheme = HTTPBearer(auto_error=False)


def get_configured_token() -> str:
    """Retrieve the active API token from environment configuration."""
    return config.API_TOKEN.strip()


async def verify_api_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
    x_device_token: Optional[str] = Header(default=None, alias="X-Device-Token"),
) -> str:
    """Validate incoming request authorization via Bearer token or X-Device-Token header.
    
    Uses constant-time comparison to protect against timing attacks.
    """
    configured_token = get_configured_token()
    if not configured_token:
        # If no token is configured on server, reject protected access for safety
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Server API token is not configured.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    provided_token: Optional[str] = None

    if credentials and credentials.credentials:
        provided_token = credentials.credentials.strip()
    elif x_device_token:
        provided_token = x_device_token.strip()

    if not provided_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Missing API token in Authorization or X-Device-Token header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not secrets.compare_digest(provided_token, configured_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid API token provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return provided_token
