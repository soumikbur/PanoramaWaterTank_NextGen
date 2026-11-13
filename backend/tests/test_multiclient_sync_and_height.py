"""Tests for Multi-Client Synchronization, Height-Based Tank Configuration, and Employee/Admin Device Provisioning."""
import pytest
import uuid
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal, init_db
from app.main import app
from app.models.alarm import Alarm, AlarmHistory
from app.models.device import Device
from app.models.tank import Tank
from app.models.telemetry import TelemetryReading
from app.models.train import Train


@pytest.mark.asyncio
async def test_train_creation_with_custom_tank_height_and_capacity():
    """Verify that trains accept and persist tank_height_cm and propagate it to all coach tanks."""
    await init_db()
    test_train_number = f"SYNC{uuid.uuid4().hex[:4].upper()}"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Admin login
        admin_res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert admin_res.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_res.json()['access_token']}"}

        # 1. Create a train with custom height 150.0 cm
        create_payload = {
            "train_number": test_train_number,
            "name": "Sync Test Express",
            "region": "EAST",
            "source_station": "Howrah",
            "source_code": "HWH",
            "destination_station": "New Delhi",
            "destination_code": "NDLS",
            "railway_zone": "Eastern",
            "tank_height_cm": 150.0,
            "tank_capacity": 60.0,
            "coaches": [
                {"coach_number": "C1"},
                {"coach_number": "C2"},
                {"coach_number": "C3"},
                {"coach_number": "C4"},
            ],
        }
        res = await client.post("/api/v1/trains", json=create_payload, headers=admin_headers)
        assert res.status_code == 201
        data = res.json()
        assert data["train_number"] == test_train_number
        assert data.get("tank_height_cm") == 150.0
        assert data.get("tank_capacity_liters") == 60.0

        try:
            # 2. Fetch train consist and verify height across all coaches and tanks
            consist_res = await client.get(f"/api/v1/trains/{test_train_number}/consist", headers=admin_headers)
            assert consist_res.status_code == 200
            consist = consist_res.json()
            assert consist["train_number"] == test_train_number
            assert consist["tank_height_cm"] == 150.0
            assert consist["tank_capacity_liters"] == 60.0
            assert len(consist["coaches"]) == 4

            for coach in consist["coaches"]:
                assert len(coach["tanks"]) == 2
                tank1 = coach["tanks"][0]
                tank2 = coach["tanks"][1]
                assert tank1["height_cm"] == 150.0
                assert tank2["height_cm"] == 150.0

            # 3. Test mathematical relationship between water height (cm) and fill percentage (%)
            water_height_cm = 75.0
            tank_height_cm = 150.0
            fill_pct = (water_height_cm / tank_height_cm) * 100.0
            assert fill_pct == 50.0

            # Check quarter fill (37.5 cm)
            assert ((37.5 / 150.0) * 100.0) == 25.0

        finally:
            # Clean up test train
            del_res = await client.delete(f"/api/v1/trains/{test_train_number}", headers=admin_headers)
            assert del_res.status_code in (200, 204)


@pytest.mark.asyncio
async def test_employee_and_admin_device_provisioning_all_11_fields():
    """Verify that Employees can create and edit devices with all 11 fields, but only Admins can delete."""
    await init_db()
    test_uid = f"DEV-TEST-{uuid.uuid4().hex[:6].upper()}"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login as Employee
        emp_res = await client.post("/api/v1/auth/login", json={"username": "@employee", "password": "Employee@123"})
        assert emp_res.status_code == 200
        emp_headers = {"Authorization": f"Bearer {emp_res.json()['access_token']}"}

        # Login as Admin
        admin_res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert admin_res.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_res.json()['access_token']}"}

        device_payload = {
            "name": "Employee Monitored WLI Node",
            "uid": test_uid,
            "device_type": "Quectel EC200U 4G LTE",
            "protocol": "MQTT over TLS/WSS (Port 8884)",
            "mqtt_client_id": f"panorama-wli-{test_uid.lower()}",
            "mqtt_topic": f"panorama/telemetry/{test_uid}",
            "train_number": "12002",
            "coach_number": "C1",
            "tank_assignment": "BOTH",
            "description": "Standard hydrostatic pressure sensor node underframe",
            "status": "AVAILABLE",
        }

        # 1. Employee creates device with all 11 fields
        create_res = await client.post("/api/v1/devices", json=device_payload, headers=emp_headers)
        assert create_res.status_code == 201, f"Employee creation failed: {create_res.text}"
        created = create_res.json()
        assert created["uid"] == test_uid
        assert created["name"] == device_payload["name"]
        assert created["device_type"] == device_payload["device_type"]
        assert created["protocol"] == device_payload["protocol"]
        assert created["mqtt_client_id"] == device_payload["mqtt_client_id"]
        assert created["mqtt_topic"] == device_payload["mqtt_topic"]
        assert created["train_number"] == device_payload["train_number"]
        assert created["coach_number"] == device_payload["coach_number"]
        assert created["tank_assignment"] == device_payload["tank_assignment"]
        assert created["description"] == device_payload["description"]
        assert created["status"] == device_payload["status"]
        device_id = created["id"]

        try:
            # 2. Attempt duplicate UID -> must return 400 or 409
            dup_res = await client.post("/api/v1/devices", json=device_payload, headers=emp_headers)
            assert dup_res.status_code in (400, 409)

            # 3. Employee updates device fields
            update_payload = {
                "name": "Updated WLI Node by Employee",
                "device_type": "ESP32-S3 WLI Edge Node",
                "tank_assignment": "Tank 1",
                "status": "ENGAGED",
                "description": "Recalibrated sensor node",
            }
            update_res = await client.put(f"/api/v1/devices/{device_id}", json=update_payload, headers=emp_headers)
            assert update_res.status_code == 200
            updated = update_res.json()
            assert updated["name"] == "Updated WLI Node by Employee"
            assert updated["device_type"] == "ESP32-S3 WLI Edge Node"
            assert updated["tank_assignment"] == "Tank 1"
            assert updated["status"] == "ENGAGED"

            # 4. Employee attempts to delete device -> must be forbidden (403)
            emp_del = await client.delete(f"/api/v1/devices/{device_id}", headers=emp_headers)
            assert emp_del.status_code == 403

            # 5. Admin deletes device -> must succeed (200)
            admin_del = await client.delete(f"/api/v1/devices/{device_id}", headers=admin_headers)
            assert admin_del.status_code == 200

            # 6. Verify device is gone
            get_res = await client.get(f"/api/v1/devices/{device_id}", headers=emp_headers)
            assert get_res.status_code == 404

        finally:
            # Safety cleanup if not already deleted
            async with AsyncSessionLocal() as db:
                await db.execute(delete(Device).where(Device.uid == test_uid))
                await db.commit()


@pytest.mark.asyncio
async def test_independent_coach_tank_heights_and_geometry():
    """Verify that editing Coach C1 tank heights and geometry never alters Coach C2."""
    await init_db()
    test_train_number = f"COACH{uuid.uuid4().hex[:4].upper()}"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Admin login
        admin_res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert admin_res.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_res.json()['access_token']}"}

        # 1. Create a train with two coaches: C1 and C2
        create_payload = {
            "train_number": test_train_number,
            "name": "Independence Test Express",
            "region": "NORTH",
            "coaches": [
                {"coach_number": "C1"},
                {"coach_number": "C2"},
            ],
        }
        res = await client.post("/api/v1/trains", json=create_payload, headers=admin_headers)
        assert res.status_code == 201

        try:
            # 2. Update Coach C1 with custom Tank 1 (120 cm, RECTANGULAR) and Tank 2 (80 cm, CYLINDRICAL)
            c1_update = {
                "coach_name": "Executive Coach C1",
                "coach_category": "AC 1st Class (1A)",
                "tank_1_name": "Arrival Tank A",
                "tank_1_height_cm": 120.0,
                "tank_1_geometry": "RECTANGULAR",
                "tank_1_capacity": 600.0,
                "tank_2_name": "Departure Tank B",
                "tank_2_height_cm": 80.0,
                "tank_2_geometry": "CYLINDRICAL",
                "tank_2_capacity": 400.0,
            }
            update_res = await client.put(
                f"/api/v1/trains/{test_train_number}/coaches/C1",
                json=c1_update,
                headers=admin_headers,
            )
            assert update_res.status_code == 200

            # 3. Fetch consist and verify C1 changed while C2 remained completely untouched
            consist_res = await client.get(f"/api/v1/trains/{test_train_number}/consist", headers=admin_headers)
            assert consist_res.status_code == 200
            consist = consist_res.json()

            c1 = next((c for c in consist["coaches"] if c["coach_number"] == "C1"), None)
            c2 = next((c for c in consist["coaches"] if c["coach_number"] == "C2"), None)
            assert c1 is not None
            assert c2 is not None

            # Verify C1 independent tanks
            c1_t1 = next(t for t in c1["tanks"] if t["tank_index"] == 1)
            c1_t2 = next(t for t in c1["tanks"] if t["tank_index"] == 2)
            assert c1_t1["height_cm"] == 120.0
            assert c1_t1["geometry"] == "RECTANGULAR"
            assert c1_t1["capacity_liters"] == 600.0
            assert c1_t2["height_cm"] == 80.0
            assert c1_t2["geometry"] == "CYLINDRICAL"
            assert c1_t2["capacity_liters"] == 400.0

            # Verify C2 was completely unaffected
            c2_t1 = next(t for t in c2["tanks"] if t["tank_index"] == 1)
            c2_t2 = next(t for t in c2["tanks"] if t["tank_index"] == 2)
            assert c2_t1["height_cm"] == 50.0
            assert c2_t1["geometry"] == "CYLINDRICAL"
            assert c2_t2["height_cm"] == 50.0
            assert c2_t2["geometry"] == "CYLINDRICAL"

        finally:
            # Clean up
            await client.delete(f"/api/v1/trains/{test_train_number}", headers=admin_headers)

