"""Dashboard client workflow and simulation test suite."""
import io
import json
import pytest
from httpx import ASGITransport, AsyncClient
from backend.main import app

DEV_TOKEN = "dev_secret_token_123"


@pytest.mark.asyncio
async def test_dashboard_full_lifecycle_simulation():
    """Simulate the complete browser dashboard interaction cycle from initial load to live telemetry."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. User opens dashboard root
        res_root = await client.get("/")
        assert res_root.status_code == 200
        assert "Panorama WLI — HTTPS Laboratory" in res_root.text

        # 2. Browser fetches frontend assets
        res_css = await client.get("/static/css/style.css")
        assert res_css.status_code == 200
        for js in ["/static/js/api.js", "/static/js/dashboard.js", "/static/js/telemetry.js", "/static/js/app.js"]:
            res_js = await client.get(js)
            assert res_js.status_code == 200

        # 3. Dashboard polls health (public)
        res_health = await client.get("/api/health")
        assert res_health.status_code == 200
        assert res_health.json()["status"] == "online"

        # 4. Dashboard polls system info (public)
        res_sys = await client.get("/api/system/info")
        assert res_sys.status_code == 200
        assert res_sys.json()["storage"]["total_records_ingested"] == 0

        # 5. Dashboard attempts to query latest without token -> 401
        res_unauth = await client.get("/api/telemetry/latest")
        assert res_unauth.status_code == 401

        # 6. User enters in-memory API token and manual telemetry payload
        auth_headers = {"Authorization": f"Bearer {DEV_TOKEN}"}
        payload = {
            "device_id": "SIM_TANK_01",
            "water_level_cm": 140.5,
            "water_level_percentage": 56.2,
            "raw_voltage": 2.21,
            "sensor_status": "NORMAL",
            "latitude": 28.6139,
            "longitude": 77.2090,
            "gps_valid": True,
            "battery_voltage": 12.6,
            "alarm_status": "NONE",
            "signal_csq": 27,
            "firmware_rev": "STM32_FW_V2.1",
        }
        res_post = await client.post("/api/telemetry", json=payload, headers=auth_headers)
        assert res_post.status_code == 200
        assert res_post.json()["status"] == "success"

        # 7. Dashboard polls latest with token
        res_latest = await client.get("/api/telemetry/latest?device_id=SIM_TANK_01", headers=auth_headers)
        assert res_latest.status_code == 200
        data = res_latest.json()["data"]
        assert data["water_level_cm"] == 140.5
        assert data["signal_csq"] == 27
        assert data["firmware_rev"] == "STM32_FW_V2.1"

        # 8. Dashboard polls history with token
        res_hist = await client.get("/api/telemetry/history?device_id=SIM_TANK_01&limit=10", headers=auth_headers)
        assert res_hist.status_code == 200
        assert res_hist.json()["count"] == 1

        # 9. User uploads batch telemetry file
        batch_payload = {"device_id": "SIM_TANK_02", "water_level_cm": 90.0, "batch_id": 44}
        file_bytes = json.dumps(batch_payload).encode("utf-8")
        files = {"file": ("batch.json", io.BytesIO(file_bytes), "application/json")}
        res_file = await client.post("/api/telemetry/file", files=files, headers=auth_headers)
        assert res_file.status_code == 200

        # 10. Dashboard polls latest for all devices
        res_all = await client.get("/api/telemetry/latest", headers=auth_headers)
        assert res_all.status_code == 200
        all_devices = [d["device_id"] for d in res_all.json()["data"]]
        assert "SIM_TANK_01" in all_devices
        assert "SIM_TANK_02" in all_devices
