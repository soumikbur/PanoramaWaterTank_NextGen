"""Unit and integration tests for Coach Management REST API endpoints."""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete

from app.main import app
from app.core.database import AsyncSessionLocal, init_db
from app.models.device import Device
from app.models.tank import Tank
from app.models.train import Train


@pytest.mark.asyncio
async def test_coach_management_crud_lifecycle():
    await init_db()
    test_train = "88991"

    # Pre-clean
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Train).where(Train.train_number == test_train))
        devs = (await db.execute(select(Device).where(Device.train_number == test_train))).scalars().all()
        for d in devs:
            await db.execute(delete(Tank).where(Tank.device_id == d.id))
            await db.execute(delete(Device).where(Device.id == d.id))
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login Admin and Employee
        admin_login = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert admin_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        emp_login = await client.post("/api/v1/auth/login", json={"username": "@employee", "password": "Employee@123"})
        assert emp_login.status_code == 200
        emp_headers = {"Authorization": f"Bearer {emp_login.json()['access_token']}"}

        # 2. Register Train 88991
        c_res = await client.post(
            "/api/v1/trains",
            headers=admin_headers,
            json={"train_number": test_train, "name": "Vande Bharat Test", "region": "NORTH", "coach_number": "C1"},
        )
        assert c_res.status_code == 201

        # 3. Add Coach C2 (Employee forbidden, Admin allowed)
        emp_add = await client.post(
            f"/api/v1/trains/{test_train}/coaches",
            headers=emp_headers,
            json={"coach_number": "C2", "coach_category": "Executive Chair Car", "tank_1_capacity": 500.0},
        )
        assert emp_add.status_code == 403

        admin_add = await client.post(
            f"/api/v1/trains/{test_train}/coaches",
            headers=admin_headers,
            json={"coach_number": "C2", "coach_category": "Executive Chair Car", "tank_1_capacity": 550.0},
        )
        assert admin_add.status_code == 201
        assert admin_add.json()["coach_number"] == "C2"

        # 4. Duplicate coach rejected with 409
        dup_add = await client.post(
            f"/api/v1/trains/{test_train}/coaches",
            headers=admin_headers,
            json={"coach_number": "C2"},
        )
        assert dup_add.status_code == 409

        # 5. Update Coach C2
        up_res = await client.put(
            f"/api/v1/trains/{test_train}/coaches/C2",
            headers=admin_headers,
            json={"tank_1_name": "Updated Arrival Tank", "tank_1_capacity": 600.0},
        )
        assert up_res.status_code == 200

        # 6. Rename Coach C2 -> E1
        rename_res = await client.put(
            f"/api/v1/trains/{test_train}/coaches/C2/rename",
            headers=admin_headers,
            json={"new_coach_number": "E1"},
        )
        assert rename_res.status_code == 200
        assert rename_res.json()["new_coach_number"] == "E1"

        # 7. Reorder Coaches
        reorder_res = await client.put(
            f"/api/v1/trains/{test_train}/coaches/reorder",
            headers=admin_headers,
            json={"coach_numbers": ["E1", "C1"]},
        )
        assert reorder_res.status_code == 200

        # 8. Delete Coach E1 (Employee forbidden, Admin allowed)
        emp_del = await client.delete(f"/api/v1/trains/{test_train}/coaches/E1", headers=emp_headers)
        assert emp_del.status_code == 403

        admin_del = await client.delete(f"/api/v1/trains/{test_train}/coaches/E1", headers=admin_headers)
        assert admin_del.status_code == 200
        assert admin_del.json()["success"] is True

        # 9. Clean up test train
        await client.delete(f"/api/v1/trains/{test_train}", headers=admin_headers)


@pytest.mark.asyncio
async def test_coach_height_only_independent_tanks_and_settings():
    """Height-only coach add/edit persists independent per-tank heights without requiring capacity."""
    await init_db()
    test_train = "88992"

    async with AsyncSessionLocal() as db:
        await db.execute(delete(Train).where(Train.train_number == test_train))
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        try:
            c_res = await client.post(
                "/api/v1/trains",
                headers=headers,
                json={"train_number": test_train, "name": "Height Only Express", "region": "NORTH", "coach_number": "C1"},
            )
            assert c_res.status_code == 201

            # Add Coach C2 without capacity fields, with independent tank heights
            add_res = await client.post(
                f"/api/v1/trains/{test_train}/coaches",
                headers=headers,
                json={
                    "coach_number": "C2",
                    "tank_1_name": "Arrival Custom",
                    "tank_2_name": "Departure Tall",
                    "tank_1_height_cm": 50.0,
                    "tank_2_height_cm": 100.0,
                    "tank_1_geometry": "CYLINDRICAL",
                    "tank_2_geometry": "RECTANGULAR",
                },
            )
            assert add_res.status_code == 201

            # Partial update (name only) must NOT reset custom heights back to 50.0
            patch_res = await client.put(
                f"/api/v1/trains/{test_train}/coaches/C2",
                headers=headers,
                json={"tank_2_name": "Departure Tall Renamed"},
            )
            assert patch_res.status_code == 200

            consist_res = await client.get(f"/api/v1/trains/{test_train}/consist", headers=headers)
            assert consist_res.status_code == 200
            c2 = next(c for c in consist_res.json()["coaches"] if c["coach_number"] == "C2")
            assert c2["tanks"][0]["height_cm"] == 50.0
            assert c2["tanks"][1]["height_cm"] == 100.0
            assert c2["tanks"][1]["name"] == "Departure Tall Renamed"
            assert c2["tanks"][1]["geometry"] == "RECTANGULAR"

            # Settings endpoint accepts height-only updates without tank_capacity_liters
            cfg_res = await client.post(
                "/api/v1/settings/apply",
                headers=headers,
                json={"tank_height_cm": 50.0},
            )
            assert cfg_res.status_code == 200
        finally:
            await client.delete(f"/api/v1/trains/{test_train}", headers=headers)

