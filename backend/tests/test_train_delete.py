"""Comprehensive backend tests for Train Deletion, HTTP 405 prevention, and DB integrity."""
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal, init_db
from app.main import app
from app.models.alarm import Alarm, AlarmHistory
from app.models.audit import AuditEvent
from app.models.device import Device
from app.models.tank import Tank
from app.models.telemetry import TelemetryReading
from app.models.train import Train


@pytest.mark.asyncio
async def test_train_delete_lifecycle_and_database_integrity():
    """Verify full DELETE flow, RBAC, 404/400 handling, trailing slashes, /api alias, and DB integrity."""
    await init_db()
    test_train = "98765"
    other_train = "98766"

    async with AsyncSessionLocal() as db:
        for tno in (test_train, other_train):
            devs = (await db.execute(select(Device).where(Device.train_number == tno))).scalars().all()
            dev_ids = [d.id for d in devs]
            if dev_ids:
                alarms = (await db.execute(select(Alarm.id).where(Alarm.device_id.in_(dev_ids)))).scalars().all()
                if alarms:
                    await db.execute(delete(AlarmHistory).where(AlarmHistory.alarm_id.in_(alarms)))
                    await db.execute(delete(Alarm).where(Alarm.id.in_(alarms)))
                await db.execute(delete(TelemetryReading).where(TelemetryReading.device_id.in_(dev_ids)))
                await db.execute(delete(Tank).where(Tank.device_id.in_(dev_ids)))
                await db.execute(delete(Device).where(Device.id.in_(dev_ids)))
            await db.execute(delete(Train).where(Train.train_number == tno))
        await db.execute(delete(Device).where(Device.uid.like(f"PANORAMA-{test_train}-%")))
        await db.execute(delete(Device).where(Device.uid.like(f"PANORAMA-{other_train}-%")))
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        admin_res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert admin_res.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_res.json()['access_token']}"}

        emp_res = await client.post("/api/v1/auth/login", json={"username": "@employee", "password": "Employee@123"})
        assert emp_res.status_code == 200
        emp_headers = {"Authorization": f"Bearer {emp_res.json()['access_token']}"}

        # 1. Create two trains so we can prove deleting one never affects the other
        for tno, name in ((test_train, "Delete Target Express"), (other_train, "Preserve Express")):
            c_res = await client.post(
                "/api/v1/trains",
                headers=admin_headers,
                json={"train_number": tno, "name": name, "region": "EAST", "coach_number": "A1"},
            )
            assert c_res.status_code == 201

        # Add telemetry & an active alarm on target train device to verify history preservation
        dev_uid = f"PANORAMA-{test_train}-A1"
        ingest_res = await client.post(
            "/api/v1/telemetry/ingest",
            json={"uid": dev_uid, "trno": test_train, "chno": "A1", "wlp1": 8.0, "v1": 12.1},
        )
        assert ingest_res.status_code == 200

        # 2. CORS preflight must explicitly include DELETE
        opt_res = await client.options(
            f"/api/v1/trains/{test_train}",
            headers={"Origin": "https://soumikbur.github.io", "Access-Control-Request-Method": "DELETE"},
        )
        assert opt_res.status_code == 200
        assert "DELETE" in opt_res.headers.get("access-control-allow-methods", "")

        # 3. Unauthenticated / Employee forbidden
        assert (await client.delete(f"/api/v1/trains/{test_train}")).status_code == 401
        assert (await client.delete(f"/api/v1/trains/{test_train}", headers=emp_headers)).status_code == 403

        # 4. Invalid train number rejected cleanly with 400 (never 405)
        assert (await client.delete("/api/v1/trains/INVALID$$$", headers=admin_headers)).status_code == 400

        # 5. Nonexistent train returns structured 404 TRAIN_NOT_FOUND
        not_found = await client.delete("/api/v1/trains/77777", headers=admin_headers)
        assert not_found.status_code == 404
        assert not_found.json()["code"] == "TRAIN_NOT_FOUND"
        assert not_found.json()["success"] is False

        # 6. Unknown API route returns 404 (never 405 from SPA fallback)
        assert (await client.delete("/api/v1/nonexistent-endpoint/123", headers=admin_headers)).status_code == 404

        # 7. Delete target train with trailing slash works cleanly (no 405/307)
        del_res = await client.delete(f"/api/v1/trains/{test_train}/", headers=admin_headers)
        assert del_res.status_code == 200
        body = del_res.json()
        assert body["success"] is True
        assert body["trainId"] == test_train
        assert body["unassigned_devices"] >= 1

        # 8. Deleting same train again returns 404
        assert (await client.delete(f"/api/v1/trains/{test_train}", headers=admin_headers)).status_code == 404

        # 9. /api/trains/{trainId} non-v1 compatibility alias also works cleanly
        del_other = await client.delete(f"/api/trains/{other_train}", headers=admin_headers)
        assert del_other.status_code == 200
        assert del_other.json()["success"] is True

        # 10. Region/train lists must NOT include deleted trains or phantom UNASSIGNED trains
        trains_list = (await client.get("/api/v1/trains")).json()
        train_nos = {t["train_number"] for t in trains_list}
        assert test_train not in train_nos
        assert other_train not in train_nos
        assert "UNASSIGNED" not in train_nos

    # 11. Verify DB integrity: Train row removed, Device safely unassigned (not destroyed), telemetry & audit preserved
    async with AsyncSessionLocal() as db:
        t_row = (await db.execute(select(Train).where(Train.train_number == test_train))).scalar_one_or_none()
        assert t_row is None

        dev = (await db.execute(select(Device).where(Device.uid == dev_uid))).scalar_one_or_none()
        assert dev is not None
        assert dev.train_number == "UNASSIGNED"

        telemetry = (await db.execute(select(TelemetryReading).where(TelemetryReading.device_id == dev.id))).scalars().all()
        assert len(telemetry) >= 1

        open_alarms = (
            await db.execute(select(Alarm).where(Alarm.device_id == dev.id, Alarm.status != "RESOLVED"))
        ).scalars().all()
        assert len(open_alarms) == 0

        audit = (
            await db.execute(select(AuditEvent).where(AuditEvent.action == "DELETE_TRAIN", AuditEvent.target_id == test_train))
        ).scalars().all()
        assert len(audit) >= 1

        # Cleanup test artifacts
        alarms = (await db.execute(select(Alarm.id).where(Alarm.device_id == dev.id))).scalars().all()
        if alarms:
            await db.execute(delete(AlarmHistory).where(AlarmHistory.alarm_id.in_(alarms)))
            await db.execute(delete(Alarm).where(Alarm.id.in_(alarms)))
        await db.execute(delete(TelemetryReading).where(TelemetryReading.device_id == dev.id))
        await db.execute(delete(Tank).where(Tank.device_id == dev.id))
        await db.execute(delete(Device).where(Device.uid.in_([dev_uid, f"PANORAMA-{other_train}-A1"])))
        await db.execute(delete(AuditEvent).where(AuditEvent.action == "DELETE_TRAIN", AuditEvent.target_id.in_([test_train, other_train])))
        await db.commit()
