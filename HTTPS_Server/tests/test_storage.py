"""Storage and retrieval test suite (Group E)."""
import concurrent.futures
import pytest
from httpx import AsyncClient
from backend.services.storage_service import InMemoryStorageService, storage_service


@pytest.mark.asyncio
async def test_get_latest_specific_device(async_client: AsyncClient, auth_headers: dict):
    """Verify latest telemetry retrieval for a specific device."""
    # Post telemetry for DEV_1
    await async_client.post(
        "/api/telemetry",
        json={"device_id": "DEV_1", "water_level_cm": 100.0},
        headers=auth_headers,
    )
    # Post updated telemetry for DEV_1
    await async_client.post(
        "/api/telemetry",
        json={"device_id": "DEV_1", "water_level_cm": 150.0},
        headers=auth_headers,
    )
    # Post telemetry for DEV_2
    await async_client.post(
        "/api/telemetry",
        json={"device_id": "DEV_2", "water_level_cm": 200.0},
        headers=auth_headers,
    )

    # Query latest DEV_1
    response = await async_client.get("/api/telemetry/latest?device_id=DEV_1", headers=auth_headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["device_id"] == "DEV_1"
    assert res_data["data"]["water_level_cm"] == 150.0


@pytest.mark.asyncio
async def test_get_latest_all_devices(async_client: AsyncClient, auth_headers: dict):
    """Verify retrieving latest telemetry across all registered devices."""
    await async_client.post("/api/telemetry", json={"device_id": "DEV_ALPHA", "water_level_cm": 80.0}, headers=auth_headers)
    await async_client.post("/api/telemetry", json={"device_id": "DEV_BETA", "water_level_cm": 120.0}, headers=auth_headers)

    response = await async_client.get("/api/telemetry/latest", headers=auth_headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["count"] == 2
    device_ids = [item["device_id"] for item in res_data["data"]]
    assert "DEV_ALPHA" in device_ids
    assert "DEV_BETA" in device_ids


@pytest.mark.asyncio
async def test_get_latest_nonexistent_device_returns_404(async_client: AsyncClient, auth_headers: dict):
    """Verify that querying a device with no recorded telemetry returns 404."""
    response = await async_client.get("/api/telemetry/latest?device_id=DOES_NOT_EXIST", headers=auth_headers)
    assert response.status_code == 404
    assert "No telemetry found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_history_ordering_and_filtering(async_client: AsyncClient, auth_headers: dict):
    """Verify historical telemetry is returned in reverse chronological order and properly filtered."""
    # Post 3 records for DEV_HIST
    for level in [10.0, 20.0, 30.0]:
        await async_client.post(
            "/api/telemetry",
            json={"device_id": "DEV_HIST", "water_level_cm": level},
            headers=auth_headers,
        )

    # Post 1 record for OTHER_DEV
    await async_client.post(
        "/api/telemetry",
        json={"device_id": "OTHER_DEV", "water_level_cm": 999.0},
        headers=auth_headers,
    )

    # Query history for DEV_HIST
    response = await async_client.get("/api/telemetry/history?device_id=DEV_HIST", headers=auth_headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["count"] == 3
    # Newest first: 30.0, 20.0, 10.0
    levels = [item["water_level_cm"] for item in res_data["data"]]
    assert levels == [30.0, 20.0, 10.0]


@pytest.mark.asyncio
async def test_history_limit_capping(async_client: AsyncClient, auth_headers: dict):
    """Verify limit parameter caps returned historical record count."""
    for i in range(10):
        await async_client.post(
            "/api/telemetry",
            json={"device_id": "DEV_LIMIT", "water_level_cm": float(i)},
            headers=auth_headers,
        )

    response = await async_client.get("/api/telemetry/history?device_id=DEV_LIMIT&limit=4", headers=auth_headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["count"] == 4
    assert len(res_data["data"]) == 4


def test_bounded_history_capacity():
    """Verify that circular buffer evicts oldest records when capacity is exceeded."""
    bounded_service = InMemoryStorageService(max_history=5)
    for i in range(10):
        bounded_service.store_record({"device_id": "BOUND_DEV", "idx": i})

    stats = bounded_service.get_stats()
    assert stats["total_records_ingested"] == 10
    assert stats["current_history_records"] == 5

    history = bounded_service.get_history("BOUND_DEV", limit=10)
    assert len(history) == 5
    # The remaining records should be the latest 5: [9, 8, 7, 6, 5]
    indices = [r["idx"] for r in history]
    assert indices == [9, 8, 7, 6, 5]


def test_thread_safe_concurrent_storage():
    """Verify thread-safety of InMemoryStorageService under concurrent writes."""
    custom_storage = InMemoryStorageService(max_history=1000)
    thread_count = 10
    records_per_thread = 20

    def insert_worker(worker_id: int):
        for seq in range(records_per_thread):
            custom_storage.store_record({
                "device_id": f"WORKER_{worker_id}",
                "seq": seq,
                "val": worker_id * 100 + seq,
            })

    with concurrent.futures.ThreadPoolExecutor(max_workers=thread_count) as executor:
        futures = [executor.submit(insert_worker, wid) for wid in range(thread_count)]
        concurrent.futures.wait(futures)

    stats = custom_storage.get_stats()
    expected_total = thread_count * records_per_thread
    assert stats["total_records_ingested"] == expected_total
    assert stats["current_history_records"] == expected_total
    assert stats["tracked_devices_count"] == thread_count
