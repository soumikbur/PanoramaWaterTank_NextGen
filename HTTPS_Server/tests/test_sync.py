"""Multi-user centralized synchronization (SQLite + REST + WebSocket) test suite."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import sync as sync_routes
from backend.services.shared_state_service import SharedStateService


def test_sqlite_shared_state_persistence_and_versioning(tmp_path):
    """Verify SQLite persists fleet state across service restarts with monotonic versioning."""
    db_file = tmp_path / "test_shared_state.db"
    svc1 = SharedStateService(db_path=db_file)

    assert svc1.get_namespace("fleet") is None

    c1 = svc1.upsert_namespace(
        "fleet",
        {"trains": {"22895": {"train": {"train_number": "22895", "name": "Vande Bharat"}}}},
        event_type="TRAIN_CREATED",
        mutation_id="m-create-1",
    )
    assert c1["version"] == 1
    assert c1["data"]["version"] == 1

    c2 = svc1.upsert_namespace(
        "fleet",
        {"trains": {"22895": {"train": {"train_number": "22895", "name": "Howrah - Puri Vande Bharat"}}}},
        event_type="TRAIN_UPDATED",
        mutation_id="m-update-2",
    )
    assert c2["version"] == 2
    assert c2["updated_at"] > c1["updated_at"]

    # Re-open SQLite from disk (simulating server restart / fresh browser session)
    svc2 = SharedStateService(db_path=db_file)
    reloaded = svc2.get_namespace("fleet")
    assert reloaded is not None
    assert reloaded["version"] == 2
    assert reloaded["data"]["trains"]["22895"]["train"]["name"] == "Howrah - Puri Vande Bharat"


def test_sync_rest_and_websocket_multi_client_broadcast(tmp_path, monkeypatch):
    """Verify PUT /api/sync/state/{ns} commits to SQLite and broadcasts to all WebSocket clients."""
    isolated_svc = SharedStateService(db_path=tmp_path / "ws_sync.db")
    monkeypatch.setattr(sync_routes, "shared_state_service", isolated_svc)

    client = TestClient(app)

    # Connect two independent WebSocket browsers
    with client.websocket_connect("/api/sync/ws") as ws1, client.websocket_connect("/api/sync/ws") as ws2:
        # Both receive initial STATE_SNAPSHOT
        snap1 = ws1.receive_json()
        snap2 = ws2.receive_json()
        assert snap1["event_type"] == "STATE_SNAPSHOT"
        assert snap2["event_type"] == "STATE_SNAPSHOT"

        # Ping/Pong keepalive check
        ws1.send_json({"type": "ping"})
        pong = ws1.receive_json()
        assert pong["type"] == "PONG"

        # Browser 1 creates a train via REST PUT
        put_res = client.put(
            "/api/sync/state/fleet",
            headers={"Origin": "https://soumikbur.github.io"},
            json={
                "event_type": "TRAIN_CREATED",
                "entity_id": "22895",
                "mutation_id": "mut-22895-add",
                "data": {
                    "trains": {
                        "22895": {"train": {"train_number": "22895", "name": "Vande Bharat Express", "region": "EAST"}}
                    },
                    "deletedTrainNumbers": {},
                },
            },
        )
        assert put_res.status_code == 200
        assert put_res.headers.get("access-control-allow-origin") == "https://soumikbur.github.io"
        body = put_res.json()
        assert body["version"] == 1
        assert body["broadcast_clients"] == 2

        # Both Browser 1 and Browser 2 receive real-time WebSocket broadcast
        evt1 = ws1.receive_json()
        evt2 = ws2.receive_json()
        assert evt1["event_type"] == "TRAIN_CREATED"
        assert evt2["event_type"] == "TRAIN_CREATED"
        assert evt2["data"]["trains"]["22895"]["train"]["name"] == "Vande Bharat Express"

    # Fresh incognito client fetches persisted state via REST GET
    get_res = client.get("/api/sync/state", headers={"Origin": "https://soumikbur.github.io"})
    assert get_res.status_code == 200
    assert get_res.headers.get("access-control-allow-origin") == "https://soumikbur.github.io"
    assert get_res.json()["namespaces"]["fleet"]["version"] == 1
    assert "22895" in get_res.json()["namespaces"]["fleet"]["data"]["trains"]


def test_broadcast_stalled_socket_does_not_block_healthy_clients():
    """A hung/half-open offline WebSocket must be pruned and never stall healthy clients."""
    import asyncio
    from backend.routes.sync import SyncConnectionManager

    class HungSocket:
        async def accept(self):
            pass

        async def send_text(self, _text: str):
            await asyncio.sleep(10)

    class HealthySocket:
        def __init__(self):
            self.received = []

        async def accept(self):
            pass

        async def send_text(self, text: str):
            self.received.append(text)

    async def _run():
        mgr = SyncConnectionManager()
        hung = HungSocket()
        healthy = HealthySocket()
        await mgr.connect(hung)
        await mgr.connect(healthy)
        delivered = await mgr.broadcast({"event_type": "TRAIN_DELETED", "entity_id": "22895"})
        assert delivered == 1
        assert len(healthy.received) == 1
        assert mgr.active_count == 1  # Hung socket pruned

    asyncio.run(_run())
