"""Application Configuration Settings using Pydantic Settings."""
from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
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
    DEFAULT_DEVICE_UID: str = "0026004D4B42501120353332"
    DEFAULT_TRAIN_NUMBER: str = "12002"
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


settings = Settings()

