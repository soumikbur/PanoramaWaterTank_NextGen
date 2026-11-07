"""Application Configuration Settings using Pydantic Settings."""
import os
import shutil
import tempfile
from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

# In serverless environments (e.g. AWS Lambda), the deployment root is read-only.
# Direct SQLite database writes to the writable /tmp directory if running in serverless mode.
if os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or os.environ.get("LAMBDA_TASK_ROOT"):
    _tmp_dir = Path(tempfile.gettempdir())
    _target_db = _tmp_dir / "panorama_dev.db"
    _seed_db = _BACKEND_DIR / "panorama_dev.db"
    if not _target_db.exists() and _seed_db.exists():
        try:
            shutil.copyfile(_seed_db, _target_db)
        except Exception:
            pass
    _DEFAULT_DB_PATH = _target_db.as_posix()
else:
    _DEFAULT_DB_PATH = (_BACKEND_DIR / "panorama_dev.db").as_posix()


class Settings(BaseSettings):
    # Application Info
    APP_NAME: str = "Panorama Water Tank Monitor"
    APP_VERSION: str = "2.0.0"
    ENV: str = "development"
    DEBUG: bool = True

    # Security
    SECRET_KEY: str = "super_secret_jwt_key_panorama_water_tank_2026_default"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Database
    DATABASE_URL: str = Field(
        default=f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}",
        description="Async database connection string. Set to postgresql+asyncpg://... in production"
    )

    # MQTT Settings
    MQTT_BROKER_HOST: str = "broker.hivemq.com"
    MQTT_BROKER_PORT: int = 1883
    MQTT_TLS_PORT: int = 8883
    MQTT_USE_TLS: bool = False
    MQTT_USERNAME: Optional[str] = None
    MQTT_PASSWORD: Optional[str] = None
    MQTT_CLIENT_ID_PREFIX: str = "panorama-backend"
    MQTT_TELEMETRY_TOPIC: str = "panorama/telemetry/+"
    MQTT_COMMAND_TOPIC_PREFIX: str = "panorama/commands/"
    MQTT_STATUS_TOPIC: str = "panorama/status/+"

    # Default Fleet Information
    DEFAULT_DEVICE_UID: str = "0023004D4B42501120353332"
    DEFAULT_TRAIN_NUMBER: str = "225256"
    DEFAULT_COACH_NUMBER: str = "B4"

    # Default Cylindrical Tank Geometry (Exact Legacy Milestone 2 Values)
    DEFAULT_TANK_CAPACITY_LITERS: float = 20.0
    DEFAULT_TANK_HEIGHT_CM: float = 50.0
    DEFAULT_TANK_AREA_M2: float = 0.04

    # Default Alarm Thresholds
    DEFAULT_WARNING_THRESHOLD: float = 20.0
    DEFAULT_CRITICAL_THRESHOLD: float = 10.0
    DEFAULT_OVERFLOW_THRESHOLD: float = 100.0

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:8000",
        "*"
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def model_post_init(self, __context):
        if self.ENV.lower() == "production":
            self.DEBUG = False


settings = Settings()

