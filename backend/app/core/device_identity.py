"""Genuine device identity verification and deduplication logic."""
import re
from typing import Optional, Dict

HEX_24_RE = re.compile(r"^[0-9A-Fa-f]{24}$")
TEST_PATTERNS = re.compile(r"TEST|AUDIT|DUMMY|DEMO|SEED|PLACEHOLDER|ROGUE|MOCK", re.I)

# Consolidated canonical mappings for historical re-registrations or format variations
CANONICAL_UID_MAP: Dict[str, str] = {
    "0023004D4B42501120353332": "0026004D4B42501120353332",
}

VALID_STATUSES = {"AVAILABLE", "ENGAGED", "REGISTERED"}


def is_genuine_hardware_uid(uid: Optional[str]) -> bool:
    """Verify if a device UID represents a genuine physical Quectel EC200U/WLI hardware node."""
    if not uid or not isinstance(uid, str):
        return False
    clean = uid.strip()
    if TEST_PATTERNS.search(clean):
        return False
    return bool(HEX_24_RE.match(clean))


def get_canonical_uid(uid: Optional[str]) -> str:
    """Return the canonical UID for a given device UID, resolving variations and re-registrations."""
    if not uid:
        return ""
    clean = uid.strip()
    return CANONICAL_UID_MAP.get(clean, clean)
