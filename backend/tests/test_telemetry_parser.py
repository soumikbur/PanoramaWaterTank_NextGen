"""Unit tests for TelemetryParser."""
from app.mqtt.parser import TelemetryParser


def test_parse_valid_json():
    """Verify standard telemetry frame parsing."""
    raw = b"""{
        "uid": "0026004D4B42501120353332",
        "trno": "12002",
        "chno": "B4",
        "wlp1": 76.5,
        "wlp2": 74.8,
        "wlvl": true,
        "wlv2": true,
        "lat": 28.6139,
        "long": 77.2090,
        "alt": 216.5,
        "speed": 64.2,
        "sats": 8,
        "v1": 12.65,
        "v2": 12.58,
        "dt": "2026-10-28T12:00:00Z"
    }"""
    payload = TelemetryParser.parse_payload(raw)
    assert payload is not None
    assert payload.uid == "0026004D4B42501120353332"
    assert payload.trno == "12002"
    assert payload.chno == "B4"
    assert payload.wlp1 == 76.5
    assert payload.effective_longitude == 77.2090


def test_parse_legacy_keys():
    """Verify backwards-compatible mapping of legacy keys."""
    raw = b"""{
        "deviceId": "DEV-101",
        "trainNumber": "12001",
        "coachNumber": "A1",
        "wlp1": 55.0,
        "wlvl": true,
        "lon": 78.001,
        "time": "2026-10-28T11:30:00Z"
    }"""
    payload = TelemetryParser.parse_payload(raw)
    assert payload is not None
    assert payload.uid == "DEV-101"
    assert payload.trno == "12001"
    assert payload.chno == "A1"
    assert payload.effective_longitude == 78.001
    assert payload.dt == "2026-10-28T11:30:00Z"


def test_invalid_json():
    """Verify that corrupt JSON bytes are safely caught without throwing."""
    payload = TelemetryParser.parse_payload(b"CORRUPT_NOT_JSON")
    assert payload is None

