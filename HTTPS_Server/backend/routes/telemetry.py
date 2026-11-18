"""Telemetry REST API routes for JSON ingestion, file upload, and query."""
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from backend import config
from backend.schemas.telemetry import (
    FileIngestResponse,
    TelemetryHistoryResponse,
    TelemetryIngestResponse,
    TelemetryLatestResponse,
    TelemetryPayload,
)
from backend.services.storage_service import storage_service
from backend.services.telemetry_service import telemetry_service
from backend.utils.security import verify_api_token

router = APIRouter(prefix="/api/telemetry", tags=["Telemetry"])


@router.post(
    "",
    response_model=TelemetryIngestResponse,
    status_code=status.HTTP_200_OK,
    summary="Receive IoT Telemetry (JSON POST)",
    description="Primary endpoint for Quectel EC200U 4G LTE direct JSON telemetry transmission.",
)
async def receive_telemetry_json(
    payload: TelemetryPayload,
    _token: str = Depends(verify_api_token),
):
    """Receive and store telemetry via standard HTTP POST JSON body."""
    stored_record = telemetry_service.process_payload(payload)
    # Count non-None telemetry attributes excluding server metadata and device_id
    var_count = sum(
        1 for k, v in stored_record.items()
        if k not in ("device_id", "received_at", "is_duplicate") and v is not None
    )

    return TelemetryIngestResponse(
        status="success",
        message="Telemetry received",
        device_id=stored_record["device_id"],
        received_at=stored_record["received_at"],
        variables_count=max(0, var_count),
        data=stored_record,
    )


@router.post(
    "/upload",
    response_model=FileIngestResponse,
    status_code=status.HTTP_200_OK,
    summary="Receive IoT Telemetry via Multipart File Upload (Frontend Alias)",
    description="Laboratory test endpoint for uploading a telemetry JSON file via multipart/form-data.",
)
@router.post(
    "/file",
    response_model=FileIngestResponse,
    status_code=status.HTTP_200_OK,
    summary="Receive IoT Telemetry via Multipart File Upload",
    description="Laboratory test endpoint for uploading a telemetry JSON file via multipart/form-data.",
)
async def receive_telemetry_file(
    file: UploadFile = File(..., description="JSON file containing telemetry payload"),
    _token: str = Depends(verify_api_token),
):
    """Receive and ingest telemetry via multipart/form-data JSON file upload."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is missing.",
        )

    # Basic filename extension check (e.g. .json, .txt, or binary stream)
    lower_name = file.filename.lower()
    if not (lower_name.endswith(".json") or lower_name.endswith(".txt") or file.content_type == "application/json"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Uploaded file must be a JSON document (.json or text/json).",
        )

    # Read bytes with max size limit
    chunk_size = 65536  # 64 KB chunks
    total_bytes = bytearray()

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_bytes.extend(chunk)
        if len(total_bytes) > config.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"Uploaded file exceeds maximum permitted size of {config.MAX_UPLOAD_SIZE} bytes.",
            )

    stored_record, var_count = telemetry_service.process_json_bytes(bytes(total_bytes))

    return FileIngestResponse(
        status="success",
        message="Telemetry file ingested",
        filename=file.filename,
        device_id=stored_record["device_id"],
        received_at=stored_record["received_at"],
        variables_count=var_count,
        data=stored_record,
    )


@router.get(
    "/latest",
    response_model=TelemetryLatestResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Latest Telemetry Reading",
    description="Retrieve the most recent reading for a given device or all devices.",
)
async def get_latest_telemetry(
    device_id: Optional[str] = Query(default=None, description="Optional target device ID filter"),
    _token: str = Depends(verify_api_token),
):
    """Retrieve the latest telemetry for a specific device, or all devices."""
    result = storage_service.get_latest(device_id=device_id)

    if device_id is not None:
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No telemetry found for device: {device_id}",
            )
        return TelemetryLatestResponse(
            status="success",
            device_id=device_id,
            count=1,
            data=result,
        )

    # If no device_id was specified, result is a list of latest readings
    records_list = result if isinstance(result, list) else []
    return TelemetryLatestResponse(
        status="success",
        device_id=None,
        count=len(records_list),
        data=records_list,
    )


@router.get(
    "/history",
    response_model=TelemetryHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Historical Telemetry Readings",
    description="Retrieve historical readings in reverse chronological order.",
)
async def get_telemetry_history(
    device_id: Optional[str] = Query(default=None, description="Optional target device ID filter"),
    limit: int = Query(default=50, ge=1, le=1000, description="Maximum number of historical records to retrieve"),
    _token: str = Depends(verify_api_token),
):
    """Retrieve historical records, newest first."""
    records = storage_service.get_history(device_id=device_id, limit=limit)
    return TelemetryHistoryResponse(
        status="success",
        device_id=device_id,
        count=len(records),
        limit=limit,
        data=records,
    )
