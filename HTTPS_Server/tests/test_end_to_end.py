"""Phase 09 End-to-End System Integration & Contract Verification Suite."""
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.storage_service import storage_service
from backend import config

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_and_teardown():
    """Ensure clean storage before and after each end-to-end test."""
    config.API_TOKEN = "e2e_integration_secret_token"
    storage_service.clear()
    yield
    storage_service.clear()


def test_e2e_valid_telemetry_acceptance():
    """Verify full end-to-end ingestion contract with STM32/EC200U telemetry payload."""
    payload = {
        "device_id": "COACH-E2E-01",
        "sequence_id": 1001,
        "water_level_cm": 182.50,
        "water_percentage": 91.25,
        "raw_voltage": 2.450,
        "pressure_bar": 1.250,
        "battery_v": 12.65,
        "signal_csq": 28,
        "gps_lat": 22.572645,
        "gps_lon": 88.363892,
        "gps_valid": True,
        "sensor_status": "NORMAL",
        "alarm_status": "NONE",
        "flow_rate_lpm": 12.5,
        "timestamp": 1731840000,
    }
    headers = {"Authorization": "Bearer e2e_integration_secret_token"}
    resp = client.post("/api/telemetry", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["device_id"] == "COACH-E2E-01"
    assert data["variables_count"] >= 13
    assert data["data"]["water_level_cm"] == 182.50
    assert data["data"]["water_percentage"] == 91.25
    assert data["data"]["sequence_id"] == 1001
    assert data["data"]["is_duplicate"] is False


def test_e2e_invalid_payload_rejection():
    """Verify that malformed or schema-violating payloads are rejected with 422."""
    headers = {"Authorization": "Bearer e2e_integration_secret_token"}
    
    # Missing required device_id
    resp = client.post("/api/telemetry", json={"water_level_cm": 150.0}, headers=headers)
    assert resp.status_code == 422

    # Blank whitespace device_id
    resp = client.post("/api/telemetry", json={"device_id": "   "}, headers=headers)
    assert resp.status_code == 422

    # Malformed non-JSON body
    resp = client.post(
        "/api/telemetry",
        content="NON_JSON_CORRUPTED_STREAM",
        headers={"Authorization": "Bearer e2e_integration_secret_token", "Content-Type": "application/json"},
    )
    assert resp.status_code == 422


def test_e2e_missing_authentication_rejected():
    """Verify that requests missing credentials return HTTP 401."""
    payload = {"device_id": "COACH-E2E-01", "water_level_cm": 150.0}
    resp = client.post("/api/telemetry", json=payload)
    assert resp.status_code == 401
    assert "Missing API token" in resp.json()["detail"]


def test_e2e_invalid_authentication_rejected():
    """Verify that requests with incorrect tokens return HTTP 401."""
    payload = {"device_id": "COACH-E2E-01", "water_level_cm": 150.0}
    headers = {"Authorization": "Bearer wrong_invalid_secret_token"}
    resp = client.post("/api/telemetry", json=payload, headers=headers)
    assert resp.status_code == 401
    assert "Invalid API token" in resp.json()["detail"]


def test_e2e_latest_telemetry_retrieval():
    """Verify query for latest telemetry per-device and fleet-wide."""
    headers = {"Authorization": "Bearer e2e_integration_secret_token"}
    
    # Ingest Device 1
    client.post(
        "/api/telemetry",
        json={"device_id": "TANK-WEST-01", "water_level_cm": 120.0, "sequence_id": 50},
        headers=headers,
    )
    # Ingest Device 2
    client.post(
        "/api/telemetry",
        json={"device_id": "TANK-EAST-02", "water_level_cm": 210.0, "sequence_id": 80},
        headers=headers,
    )

    # Query specific device with query param
    resp_west = client.get("/api/telemetry/latest?device_id=TANK-WEST-01", headers=headers)
    assert resp_west.status_code == 200
    assert resp_west.json()["device_id"] == "TANK-WEST-01"
    assert resp_west.json()["data"]["water_level_cm"] == 120.0

    # Query non-existent device
    resp_missing = client.get("/api/telemetry/latest?device_id=TANK-NONEXISTENT", headers=headers)
    assert resp_missing.status_code == 404

    # Query all latest
    resp_all = client.get("/api/telemetry/latest", headers=headers)
    assert resp_all.status_code == 200
    all_data = resp_all.json()["data"]
    assert len(all_data) == 2
    ids = {d["device_id"] for d in all_data}
    assert ids == {"TANK-WEST-01", "TANK-EAST-02"}


def test_e2e_telemetry_history_ordering():
    """Verify reverse-chronological retrieval and limit capping."""
    headers = {"Authorization": "Bearer e2e_integration_secret_token"}
    
    for i in range(1, 6):
        client.post(
            "/api/telemetry",
            json={"device_id": "TANK-HIST-01", "sequence_id": i, "water_level_cm": 100.0 + i},
            headers=headers,
        )

    resp_hist = client.get("/api/telemetry/history?device_id=TANK-HIST-01&limit=3", headers=headers)
    assert resp_hist.status_code == 200
    records = resp_hist.json()["data"]
    assert len(records) == 3
    # Newest first
    assert records[0]["sequence_id"] == 5
    assert records[1]["sequence_id"] == 4
    assert records[2]["sequence_id"] == 3


def test_e2e_duplicate_request_behavior():
    """Verify duplicate detection when sequence_id is retransmitted."""
    headers = {"Authorization": "Bearer e2e_integration_secret_token"}
    
    payload = {
        "device_id": "COACH-RETRY-01",
        "sequence_id": 300,
        "water_level_cm": 140.0,
        "water_percentage": 70.0,
    }
    
    # First transmit
    resp1 = client.post("/api/telemetry", json=payload, headers=headers)
    assert resp1.status_code == 200
    assert resp1.json()["data"]["is_duplicate"] is False

    # Retransmit identical packet (same device, same sequence_id)
    resp2 = client.post("/api/telemetry", json=payload, headers=headers)
    assert resp2.status_code == 200
    assert resp2.json()["data"]["is_duplicate"] is True

    # Next sequence increment
    payload_next = payload.copy()
    payload_next["sequence_id"] = 301
    resp3 = client.post("/api/telemetry", json=payload_next, headers=headers)
    assert resp3.status_code == 200
    assert resp3.json()["data"]["is_duplicate"] is False

    # Check stats
    stats = client.get("/api/system/info").json()["storage"]
    assert stats["duplicate_records_detected"] == 1
    assert stats["total_records_ingested"] == 3


def test_e2e_file_upload_validation():
    """Verify multipart file upload ingestion contract."""
    headers = {"Authorization": "Bearer e2e_integration_secret_token"}
    file_content = b'{"device_id": "COACH-FILE-01", "sequence_id": 999, "water_level_cm": 175.0}'
    
    files = {"file": ("snapshot.json", file_content, "application/json")}
    resp = client.post("/api/telemetry/file", files=files, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["device_id"] == "COACH-FILE-01"
    assert data["data"]["water_level_cm"] == 175.0
    assert data["data"]["sequence_id"] == 999
