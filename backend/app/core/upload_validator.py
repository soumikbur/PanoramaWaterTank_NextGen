"""File and Document Upload Security Validator."""
import base64
import os
from typing import Optional
from fastapi import HTTPException, status

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB

# Magic byte signatures
MAGIC_SIGNATURES = {
    ".pdf": [b"%PDF-"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
}


def validate_document_upload(document_name: Optional[str], document_data: Optional[str]) -> None:
    """Validate uploaded document for extension whitelist, file size, and magic byte signatures."""
    if not document_data:
        return

    # 1. Filename & Path Traversal Validation
    if document_name:
        clean_name = os.path.basename(document_name.strip())
        if ".." in document_name or "/" in document_name or "\\" in document_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file name: path traversal characters detected."
            )
        _, ext = os.path.splitext(clean_name.lower())
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Disallowed file extension '{ext}'. Only {', '.join(sorted(ALLOWED_EXTENSIONS))} files are permitted."
            )
    else:
        ext = None

    # 2. Extract base64 payload
    payload = document_data.strip()
    if "," in payload and payload.startswith("data:"):
        # Strip data URL prefix (e.g. data:application/pdf;base64,...)
        header, payload = payload.split(",", 1)
        # Check header mime type if present
        mime_allowed = any(m in header for m in ["pdf", "image/png", "image/jpeg", "image/jpg"])
        if not mime_allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Disallowed MIME type in document payload header."
            )

    try:
        raw_bytes = base64.b64decode(payload)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Corrupted or malformed base64 document payload."
        )

    # 3. Size Validation
    if len(raw_bytes) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document exceeds maximum allowed size of {MAX_FILE_BYTES // (1024 * 1024)}MB."
        )

    # 4. Magic Bytes Signature Validation
    if ext and ext in MAGIC_SIGNATURES:
        signatures = MAGIC_SIGNATURES[ext]
        if not any(raw_bytes.startswith(sig) for sig in signatures):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File signature does not match claimed file type '{ext}'."
            )
    else:
        # If no extension was supplied, verify it matches at least one allowed signature
        matched = False
        for ex, signatures in MAGIC_SIGNATURES.items():
            if any(raw_bytes.startswith(sig) for sig in signatures):
                matched = True
                break
        if not matched:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unrecognized or unsafe document file signature."
            )

