"""Telemetry processing and dynamic variable ingestion service."""
import json
from datetime import datetime, timezone
from typing import Any, Dict, Tuple
from fastapi import HTTPException, status
from backend.schemas.telemetry import TelemetryPayload
from backend.services.storage_service import storage_service


class TelemetryService:
    """Service handling telemetry extraction, validation, and storage dispatch."""

    @staticmethod
    def process_payload(payload: TelemetryPayload) -> Dict[str, Any]:
        """Process validated TelemetryPayload, attach server timestamp and store."""
        received_at = datetime.now(timezone.utc).isoformat()
        full_record = payload.extract_full_record(received_at=received_at)
        stored_record = storage_service.store_record(full_record)
        return stored_record

    @staticmethod
    def process_raw_dict(raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate raw dictionary against TelemetryPayload and store."""
        try:
            payload = TelemetryPayload.model_validate(raw_data)
        except Exception as e:
            raise HTTPException(
                status_code=422,
                detail=f"Telemetry payload validation failed: {str(e)}",
            )
        return TelemetryService.process_payload(payload)

    @staticmethod
    def process_json_bytes(content: bytes) -> Tuple[Dict[str, Any], int]:
        """Safely decode and parse JSON bytes from uploaded file stream."""
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File encoding error: expected UTF-8 text.",
            )

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Malformed JSON: {err.msg} at line {err.lineno} column {err.colno}.",
            )

        if not isinstance(parsed, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="JSON root must be an object/dictionary containing telemetry fields.",
            )

        stored_record = TelemetryService.process_raw_dict(parsed)
        # Variable count is total keys stored minus device_id and received_at
        var_count = len(stored_record) - 2
        return stored_record, max(0, var_count)


telemetry_service = TelemetryService()
