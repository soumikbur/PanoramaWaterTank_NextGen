"""Tests for Railway Zone persistence during train registration and editing."""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.train import Train
from sqlalchemy import select


@pytest.mark.asyncio
async def test_add_train_with_explicit_railway_zone():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Authenticate as admin
        login_res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Clean up train if already present
        train_num = "88801"
        await client.delete(f"/api/v1/trains/{train_num}", headers=headers)

        # 2. Add train with explicit optional railway_zone="ECR"
        add_res = await client.post(
            "/api/v1/trains",
            headers=headers,
            json={
                "train_number": train_num,
                "name": "East Central Express",
                "region": "EAST",
                "railway_zone": "ECR",
                "train_type": "Superfast",
                "coach_number": "B1",
            },
        )
        assert add_res.status_code == 201, f"Failed to create train: {add_res.text}"
        data = add_res.json()
        assert data["train_number"] == train_num
        assert data["railway_zone"] == "ECR"

        # 3. Verify persisted in DB directly
        async with AsyncSessionLocal() as session:
            stmt = select(Train).where(Train.train_number == train_num)
            row = (await session.execute(stmt)).scalar_one_or_none()
            assert row is not None
            assert row.railway_zone == "ECR"
            assert row.name == "East Central Express"
            assert row.region == "EAST"

        # 4. Verify retrieved via GET /trains list
        list_res = await client.get("/api/v1/trains", headers=headers)
        assert list_res.status_code == 200
        train_in_list = next((t for t in list_res.json() if t["train_number"] == train_num), None)
        assert train_in_list is not None
        assert train_in_list["railway_zone"] == "ECR"

        # 5. Edit existing train: change railway_zone to "NCR"
        update_res = await client.put(
            f"/api/v1/trains/{train_num}",
            headers=headers,
            json={
                "name": "North Central Superfast Express",
                "region": "NORTH",
                "type": "Superfast AC",
                "railway_zone": "NCR",
            },
        )
        assert update_res.status_code == 200, f"Failed to update train: {update_res.text}"

        # 6. Verify updated in DB directly
        async with AsyncSessionLocal() as session:
            stmt = select(Train).where(Train.train_number == train_num)
            updated_row = (await session.execute(stmt)).scalar_one_or_none()
            assert updated_row is not None
            assert updated_row.railway_zone == "NCR"
            assert updated_row.name == "North Central Superfast Express"
            assert updated_row.region == "NORTH"

        # 7. Clean up
        del_res = await client.delete(f"/api/v1/trains/{train_num}", headers=headers)
        assert del_res.status_code == 200


@pytest.mark.asyncio
async def test_add_train_without_railway_zone_optional():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        train_num = "88802"
        await client.delete(f"/api/v1/trains/{train_num}", headers=headers)

        # Add train without railway_zone (None / omitted) -> optional, must succeed
        add_res = await client.post(
            "/api/v1/trains",
            headers=headers,
            json={
                "train_number": train_num,
                "name": "Standard Regional Express",
                "region": "WEST",
                "train_type": "Express",
                "coach_number": "A1",
            },
        )
        assert add_res.status_code == 201
        data = add_res.json()
        assert data["train_number"] == train_num
        # Defaults to region default "WR"
        assert data["railway_zone"] == "WR"

        # Clean up
        await client.delete(f"/api/v1/trains/{train_num}", headers=headers)
