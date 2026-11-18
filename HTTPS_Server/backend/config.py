"""Configuration management for Panorama Water Tank HTTPS Receiver."""
import json
import os
from pathlib import Path
from typing import List, Optional, Tuple
from dotenv import load_dotenv

# Base paths
BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

# Load .env if present
ENV_PATH = PROJECT_DIR / ".env"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH)

# Environment and Application Settings
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
APP_TITLE = "Panorama Water Tank — HTTPS Receiver"
APP_DESCRIPTION = "Lightweight HTTPS IoT telemetry receiver for testing EC200U-based communication."
APP_VERSION = "0.1.0"

# Security Settings
API_TOKEN = os.getenv("API_TOKEN", "")

# Operational Limits
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 1048576))
MAX_HISTORY_RECORDS = int(os.getenv("MAX_HISTORY_RECORDS", 1000))
ENABLE_DOCS = os.getenv("ENABLE_DOCS", "true").lower() in ("true", "1", "yes")

# Network & Port Configuration
# In production (e.g. Render container), default host binds to 0.0.0.0
DEFAULT_HOST = "0.0.0.0" if ENVIRONMENT == "production" else "127.0.0.1"
HOST = os.getenv("HOST", DEFAULT_HOST)

# Render and cloud platforms inject the PORT environment variable
PORT = int(os.getenv("PORT", os.getenv("HTTP_PORT", 8000)))
HTTP_PORT = PORT
HTTPS_PORT = int(os.getenv("HTTPS_PORT", 8443))
HTTPS_ENABLED = os.getenv("HTTPS_ENABLED", "false").lower() in ("true", "1", "yes")

# TLS Certificate Paths (relative to PROJECT_DIR if not absolute)
TLS_CERT_FILE = os.getenv("TLS_CERT_FILE", "certificates/development/server.crt")
TLS_KEY_FILE = os.getenv("TLS_KEY_FILE", "certificates/development/server.key")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# CORS Allowed Origins (explicit allowlist — never wildcard '*' with credentials)
_DEFAULT_CORS_ORIGINS: List[str] = [
    "https://soumikbur.github.io",
    "http://localhost:8000",
    "https://localhost:8443",
    "http://127.0.0.1:8000",
    "https://127.0.0.1:8443",
]
_raw_cors = os.getenv("CORS_ORIGINS", "").strip()
if _raw_cors:
    try:
        _parsed_cors = json.loads(_raw_cors) if _raw_cors.startswith("[") else [o.strip() for o in _raw_cors.split(",") if o.strip()]
    except Exception:
        _parsed_cors = [o.strip() for o in _raw_cors.split(",") if o.strip()]
    # Strip wildcard '*' and guarantee the official GitHub Pages frontend origin is permitted
    _filtered_cors = [o.rstrip("/") for o in _parsed_cors if isinstance(o, str) and o.strip() and o.strip() != "*"]
    if "https://soumikbur.github.io" not in _filtered_cors:
        _filtered_cors.insert(0, "https://soumikbur.github.io")
    CORS_ORIGINS: List[str] = list(dict.fromkeys(_filtered_cors))
else:
    CORS_ORIGINS = list(_DEFAULT_CORS_ORIGINS)


def get_resolved_tls_paths() -> Tuple[Optional[Path], Optional[Path]]:
    """Resolve and validate TLS certificate and private key paths.
    
    Prevents production environments from accidentally loading development self-signed certs.
    """
    cert_path = Path(TLS_CERT_FILE)
    if not cert_path.is_absolute():
        cert_path = PROJECT_DIR / cert_path

    key_path = Path(TLS_KEY_FILE)
    if not key_path.is_absolute():
        key_path = PROJECT_DIR / key_path

    if ENVIRONMENT == "production" and "development" in str(cert_path).lower():
        # Safeguard: Do not permit development self-signed certificate in production
        return None, None

    if cert_path.is_file() and key_path.is_file():
        return cert_path, key_path

    return None, None
