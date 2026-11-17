"""Live verification script running real HTTP requests against live Uvicorn server."""
import io
import json
import socket
import sys
import time
from pathlib import Path

app_dir = Path(__file__).resolve().parent.parent
if str(app_dir) not in sys.path:
    sys.path.insert(0, str(app_dir))

import httpx
import uvicorn
from multiprocessing import Process

TEST_PORT = 8095
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"
TEST_TOKEN = "dev_secret_token_123"


def run_server():
    """Target function for child process running Uvicorn."""
    import os
    import sys
    from pathlib import Path
    app_dir = Path(__file__).resolve().parent.parent
    if str(app_dir) not in sys.path:
        sys.path.insert(0, str(app_dir))
    os.environ["API_TOKEN"] = TEST_TOKEN
    os.environ["ENVIRONMENT"] = "testing"
    uvicorn.run("backend.main:app", host="127.0.0.1", port=TEST_PORT, log_level="warning")


def wait_for_server(timeout=5.0):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("127.0.0.1", TEST_PORT), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def test_live_workflow():
    print(f"[*] Starting live Uvicorn server on port {TEST_PORT}...")
    proc = Process(target=run_server, daemon=True)
    proc.start()

    if not wait_for_server():
        print("[-] Server failed to start within timeout.")
        proc.terminate()
        sys.exit(1)

    print("[+] Server started successfully.")
    client = httpx.Client(base_url=BASE_URL, timeout=5.0)

    try:
        # 1. Health check
        r_health = client.get("/api/health")
        assert r_health.status_code == 200, f"Health check failed: {r_health.text}"
        print(f"[+] 1. GET /api/health -> 200 OK: {r_health.json()['application']}")

        # 2. Unauthorized attempt
        r_unauth = client.post("/api/telemetry", json={"device_id": "TEST_UNAUTH"})
        assert r_unauth.status_code == 401, f"Expected 401, got: {r_unauth.status_code}"
        print("[+] 2. Unauthorized request correctly rejected -> 401 Unauthorized")

        # 3. Authorized JSON POST with dynamic variables
        auth_headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        telemetry_payload = {
            "device_id": "EC200U_LIVE_NODE_01",
            "timestamp": int(time.time()),
            "water_level_cm": 172.5,
            "water_level_percentage": 69.0,
            "raw_voltage": 2.38,
            "sensor_status": "NORMAL",
            "latitude": 28.6139,
            "longitude": 77.2090,
            "gps_valid": True,
            "battery_voltage": 12.5,
            "alarm_status": "NONE",
            "signal_csq": 27,
            "firmware_rev": "STM32_2026_V1",
            "custom_metadata": {"cell_id": 9942, "roaming": False},
        }
        r_post = client.post("/api/telemetry", json=telemetry_payload, headers=auth_headers)
        assert r_post.status_code == 200, f"Telemetry POST failed: {r_post.text}"
        post_data = r_post.json()
        assert post_data["device_id"] == "EC200U_LIVE_NODE_01"
        assert post_data["data"]["signal_csq"] == 27
        assert post_data["data"]["custom_metadata"]["cell_id"] == 9942
        print(f"[+] 3. POST /api/telemetry -> 200 OK: Ingested {post_data['variables_count']} variables")

        # 4. Multipart File Upload
        file_payload = {
            "device_id": "EC200U_FILE_NODE_02",
            "water_level_cm": 115.0,
            "water_level_percentage": 46.0,
            "sensor_status": "NORMAL",
            "offline_batch_count": 5,
        }
        file_bytes = json.dumps(file_payload).encode("utf-8")
        files = {"file": ("batch_reading.json", io.BytesIO(file_bytes), "application/json")}
        r_file = client.post("/api/telemetry/file", files=files, headers=auth_headers)
        assert r_file.status_code == 200, f"File POST failed: {r_file.text}"
        file_data = r_file.json()
        assert file_data["filename"] == "batch_reading.json"
        assert file_data["data"]["offline_batch_count"] == 5
        print(f"[+] 4. POST /api/telemetry/file -> 200 OK: File ingested ({file_data['filename']})")

        # 5. Query Latest Reading
        r_latest = client.get("/api/telemetry/latest?device_id=EC200U_LIVE_NODE_01", headers=auth_headers)
        assert r_latest.status_code == 200, f"Latest query failed: {r_latest.text}"
        assert r_latest.json()["data"]["water_level_cm"] == 172.5
        print(f"[+] 5. GET /api/telemetry/latest -> 200 OK: Retrieved latest for EC200U_LIVE_NODE_01")

        # 6. Query History
        r_history = client.get("/api/telemetry/history?limit=10", headers=auth_headers)
        assert r_history.status_code == 200, f"History query failed: {r_history.text}"
        assert r_history.json()["count"] >= 2
        print(f"[+] 6. GET /api/telemetry/history -> 200 OK: Retrieved {r_history.json()['count']} historical records")

        # 7. System Diagnostics
        r_sys = client.get("/api/system/info")
        assert r_sys.status_code == 200, f"System info failed: {r_sys.text}"
        sys_data = r_sys.json()
        assert sys_data["status"] == "online"
        assert sys_data["storage"]["tracked_devices_count"] == 2
        print(f"[+] 7. GET /api/system/info -> 200 OK: Tracked devices: {sys_data['storage']['tracked_devices']}")

        print("\n[SUCCESS] All live verification assertions passed successfully!")
    finally:
        client.close()
        proc.terminate()
        proc.join()


if __name__ == "__main__":
    test_live_workflow()
